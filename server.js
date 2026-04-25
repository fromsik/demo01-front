const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 8787;

const db = {
  users: new Map(),
  templates: new Map(),
  dailyPlans: new Map()
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
  });
}

function auth(req) {
  const userId = req.headers['x-user-id'];
  const providerType = req.headers['x-provider'] || 'GOOGLE';
  if (!userId) return null;
  if (!db.users.has(userId)) {
    db.users.set(userId, {
      id: userId,
      providerType,
      providerUserId: `${providerType}:${userId}`,
      email: `${userId}@example.com`,
      nickname: `user-${userId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return db.users.get(userId);
}

function id() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureTenMinute(time) {
  const parts = (time || '').split(':');
  if (parts.length !== 2) return false;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && mm % 10 === 0;
}

function validateBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (!ensureTenMinute(b.startTime) || !ensureTenMinute(b.endTime)) {
      return '시간은 10분 단위여야 합니다.';
    }
    if (b.startTime >= b.endTime) {
      return '시작 시간은 종료 시간보다 빨라야 합니다.';
    }
    if (i > 0 && sorted[i].startTime < sorted[i - 1].endTime) {
      return '이미 사용 중인 시간대가 있습니다. 시간을 다시 선택해주세요.';
    }
  }
  return null;
}

function userTemplates(userId) {
  return [...db.templates.values()].filter((t) => t.userId === userId);
}

function userPlans(userId) {
  return [...db.dailyPlans.values()].filter((p) => p.userId === userId);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const user = auth(req);

  if (u.pathname.startsWith('/api') && !u.pathname.startsWith('/api/auth') && !user) {
    return json(res, 401, { message: '로그인이 필요한 기능입니다.' });
  }

  try {
    if (u.pathname === '/api/auth/google' || u.pathname === '/api/auth/kakao' || u.pathname === '/api/auth/naver') {
      return json(res, 200, { message: 'OAuth redirect placeholder' });
    }

    if (u.pathname === '/api/auth/me') {
      return json(res, 200, { user: user || null });
    }

    if (u.pathname === '/api/auth/logout' && req.method === 'POST') {
      return json(res, 200, { ok: true });
    }

    if (u.pathname === '/api/templates' && req.method === 'GET') {
      return json(res, 200, userTemplates(user.id));
    }

    if (u.pathname === '/api/templates' && req.method === 'POST') {
      const body = await parseBody(req);
      const blockError = validateBlocks(body.blocks || []);
      if (!body.name) return json(res, 400, { message: '양식 이름은 필수입니다.' });
      if (blockError) return json(res, 400, { message: blockError });

      const templates = userTemplates(user.id);
      const t = {
        id: id(),
        userId: user.id,
        name: body.name,
        description: body.description || '',
        isDefault: templates.length === 0,
        blocks: (body.blocks || []).map((b, idx) => ({ ...b, id: id(), sortOrder: idx })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.templates.set(t.id, t);
      return json(res, 201, t);
    }

    const templateIdMatch = u.pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (templateIdMatch) {
      const templateId = templateIdMatch[1];
      const template = db.templates.get(templateId);
      if (!template || template.userId !== user.id) return json(res, 404, { message: 'Not found' });

      if (req.method === 'GET') return json(res, 200, template);

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const blockError = validateBlocks(body.blocks || []);
        if (!body.name) return json(res, 400, { message: '양식 이름은 필수입니다.' });
        if (blockError) return json(res, 400, { message: blockError });

        Object.assign(template, {
          name: body.name,
          description: body.description || '',
          blocks: (body.blocks || []).map((b, idx) => ({ ...b, sortOrder: idx })),
          updatedAt: new Date().toISOString()
        });
        return json(res, 200, template);
      }

      if (req.method === 'DELETE') {
        db.templates.delete(templateId);
        return json(res, 204, {});
      }
    }

    const copyMatch = u.pathname.match(/^\/api\/templates\/([^/]+)\/copy$/);
    if (copyMatch && req.method === 'POST') {
      const original = db.templates.get(copyMatch[1]);
      if (!original || original.userId !== user.id) return json(res, 404, { message: 'Not found' });
      const copy = {
        ...structuredClone(original),
        id: id(),
        isDefault: false,
        name: `${original.name} (복사본)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.templates.set(copy.id, copy);
      return json(res, 201, copy);
    }

    const defaultMatch = u.pathname.match(/^\/api\/templates\/([^/]+)\/default$/);
    if (defaultMatch && req.method === 'PUT') {
      const selected = db.templates.get(defaultMatch[1]);
      if (!selected || selected.userId !== user.id) return json(res, 404, { message: 'Not found' });
      userTemplates(user.id).forEach((t) => {
        t.isDefault = t.id === selected.id;
        t.updatedAt = new Date().toISOString();
      });
      return json(res, 200, selected);
    }

    if (u.pathname === '/api/daily-plans' && req.method === 'GET') {
      const date = u.searchParams.get('date');
      const plans = userPlans(user.id);
      if (!date) return json(res, 200, plans);
      return json(res, 200, plans.filter((p) => p.planDate === date));
    }

    if (u.pathname === '/api/daily-plans' && req.method === 'POST') {
      const body = await parseBody(req);
      const goals = (body.goals || []).filter((g) => (g.content || '').trim()).slice(0, 5);
      if (goals.length < 1) return json(res, 400, { message: '핵심 목표를 최소 1개 입력해주세요.' });
      const blockError = validateBlocks(body.timeBlocks || []);
      if (blockError) return json(res, 400, { message: blockError });

      const plan = {
        id: id(),
        userId: user.id,
        planDate: body.planDate,
        templateId: body.templateId || null,
        goals: goals.map((g, idx) => ({ ...g, id: id(), sortOrder: idx })),
        timeBlocks: (body.timeBlocks || []).map((b, idx) => ({ ...b, id: id(), sortOrder: idx })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.dailyPlans.set(plan.id, plan);
      return json(res, 201, plan);
    }

    const planIdMatch = u.pathname.match(/^\/api\/daily-plans\/([^/]+)$/);
    if (planIdMatch) {
      const plan = db.dailyPlans.get(planIdMatch[1]);
      if (!plan || plan.userId !== user.id) return json(res, 404, { message: 'Not found' });

      if (req.method === 'GET') return json(res, 200, plan);

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const goals = (body.goals || []).filter((g) => (g.content || '').trim()).slice(0, 5);
        if (goals.length < 1) return json(res, 400, { message: '핵심 목표를 최소 1개 입력해주세요.' });
        const blockError = validateBlocks(body.timeBlocks || []);
        if (blockError) return json(res, 400, { message: blockError });

        Object.assign(plan, {
          planDate: body.planDate,
          templateId: body.templateId || null,
          goals: goals,
          timeBlocks: body.timeBlocks,
          updatedAt: new Date().toISOString()
        });
        return json(res, 200, plan);
      }

      if (req.method === 'DELETE') {
        db.dailyPlans.delete(plan.id);
        return json(res, 204, {});
      }
    }

    const fromTemplateMatch = u.pathname.match(/^\/api\/daily-plans\/from-template\/([^/]+)$/);
    if (fromTemplateMatch && req.method === 'POST') {
      const template = db.templates.get(fromTemplateMatch[1]);
      if (!template || template.userId !== user.id) return json(res, 404, { message: 'Not found' });
      const body = await parseBody(req);
      const planDate = body.planDate;

      const plan = {
        id: id(),
        userId: user.id,
        planDate,
        templateId: template.id,
        goals: [{ id: id(), content: '', isCompleted: false, sortOrder: 0 }],
        timeBlocks: template.blocks.map((b, idx) => ({ ...b, id: id(), isCompleted: false, sortOrder: idx })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.dailyPlans.set(plan.id, plan);
      return json(res, 201, plan);
    }

    if (u.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('TimeBox Planner API server is running');
    }

    return json(res, 404, { message: 'Not found' });
  } catch (error) {
    if (error.message === 'invalid_json') {
      return json(res, 400, { message: '잘못된 JSON 본문입니다.' });
    }
    return json(res, 500, { message: 'Internal Server Error', detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`TimeBox Planner API listening on :${PORT}`);
});
