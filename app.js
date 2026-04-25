const STORAGE_KEY = 'timebox_planner_v1';

const initialState = {
  webAuth: null,
  mode: 'landing',
  currentDate: new Date().toISOString().slice(0, 10),
  web: { templates: [], dailyPlans: [] },
  local: { templates: [], dailyPlans: [] }
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(initialState);
  try {
    return { ...structuredClone(initialState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dataBucket() {
  return state.mode === 'local' ? state.local : state.web;
}

function isAuthenticated() {
  return state.mode === 'local' || !!state.webAuth;
}

function render() {
  const app = document.querySelector('#app');
  const authStatus = document.querySelector('#authStatus');

  if (state.mode === 'local') {
    authStatus.textContent = '앱 로컬 모드';
  } else if (state.webAuth) {
    authStatus.textContent = `웹 로그인: ${state.webAuth}`;
  } else {
    authStatus.textContent = '로그인 필요';
  }

  app.innerHTML = '';

  if (!isAuthenticated()) {
    const landing = document.querySelector('#landingTemplate').content.cloneNode(true);
    app.appendChild(landing);
    bindLandingEvents();
    return;
  }

  const planner = document.querySelector('#plannerTemplate').content.cloneNode(true);
  app.appendChild(planner);
  bindPlannerEvents();
  renderTodayTab();
  renderTemplatesTab();
  renderHistoryTab();

  const modeNotice = document.querySelector('#modeNotice');
  if (state.mode === 'local') {
    modeNotice.classList.remove('hidden');
    modeNotice.textContent =
      '로컬 모드: 데이터는 현재 브라우저(기기) 저장소에만 저장되며 서버로 전송되지 않습니다.';
  } else {
    modeNotice.classList.add('hidden');
  }
}

function bindLandingEvents() {
  document.querySelectorAll('[data-login]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.webAuth = btn.dataset.login;
      state.mode = 'web';
      saveState();
      render();
    });
  });

  document.querySelector('#enterLocalMode').addEventListener('click', () => {
    state.mode = 'local';
    state.webAuth = null;
    saveState();
    render();
  });
}

function bindPlannerEvents() {
  document.querySelectorAll('.tabs button').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      tab.classList.add('active');
      ['today', 'templates', 'history'].forEach((id) => {
        document.querySelector(`#${id}Tab`).classList.toggle('hidden', id !== target);
      });
    });
  });
}

function ensureTodayPlan() {
  const bucket = dataBucket();
  let plan = bucket.dailyPlans.find((p) => p.planDate === state.currentDate);
  if (!plan) {
    plan = { id: crypto.randomUUID(), planDate: state.currentDate, goals: [], timeBlocks: [], templateId: null };
    bucket.dailyPlans.push(plan);
  }
  return plan;
}

function renderTodayTab() {
  const container = document.querySelector('#todayTab');
  const plan = ensureTodayPlan();

  container.innerHTML = `
    <div class="card">
      <h2>오늘의 타임박싱 (${state.currentDate})</h2>
      <label>날짜 선택</label>
      <input id="planDateInput" type="date" value="${state.currentDate}" />
      <div class="actions">
        <button id="loadTemplateBtn">양식 불러오기</button>
        <button id="savePlanBtn" class="primary">저장</button>
        <button id="logoutBtn" class="danger">${state.mode === 'local' ? '로컬 모드 종료' : '로그아웃'}</button>
      </div>
      <p class="muted">핵심 목표는 1~5개, 시간 블록은 10분 단위 및 겹침 없이 저장됩니다.</p>
      <p id="saveError" class="error"></p>
    </div>

    <div class="grid">
      <div class="card">
        <h3>오늘의 핵심 목표</h3>
        <div id="goalsList"></div>
        <button id="addGoalBtn">목표 추가</button>
      </div>

      <div class="card">
        <h3>시간 블록</h3>
        <div id="blocksList"></div>
        <button id="addBlockBtn">시간 블록 추가</button>
      </div>
    </div>
  `;

  renderGoalsList(plan);
  renderBlocksList(plan);

  document.querySelector('#planDateInput').addEventListener('change', (e) => {
    state.currentDate = e.target.value;
    saveState();
    render();
  });

  document.querySelector('#addGoalBtn').addEventListener('click', () => {
    if (plan.goals.length >= 5) {
      showSaveError('오늘의 핵심 목표는 최대 5개까지 작성할 수 있습니다.');
      return;
    }
    plan.goals.push({ id: crypto.randomUUID(), content: '', isCompleted: false });
    saveState();
    renderTodayTab();
  });

  document.querySelector('#addBlockBtn').addEventListener('click', () => {
    plan.timeBlocks.push({
      id: crypto.randomUUID(),
      startTime: '09:00',
      endTime: '09:30',
      title: '',
      memo: '',
      isCompleted: false
    });
    saveState();
    renderTodayTab();
  });

  document.querySelector('#loadTemplateBtn').addEventListener('click', () => {
    const bucket = dataBucket();
    if (!bucket.templates.length) {
      showSaveError('저장된 양식이 없습니다. 양식 관리에서 먼저 생성해주세요.');
      return;
    }

    const base = bucket.templates.find((t) => t.isDefault) || bucket.templates[0];
    const ok = confirm(`양식 '${base.name}'을(를) 불러오면 현재 작성 내용이 덮어쓰기 됩니다. 계속할까요?`);
    if (!ok) return;

    plan.templateId = base.id;
    plan.goals = [{ id: crypto.randomUUID(), content: '', isCompleted: false }];
    plan.timeBlocks = base.blocks.map((block) => ({ ...block, id: crypto.randomUUID(), isCompleted: false }));
    saveState();
    renderTodayTab();
  });

  document.querySelector('#savePlanBtn').addEventListener('click', () => {
    if (validatePlan(plan)) {
      saveState();
      showSaveError('저장되었습니다.', false);
      renderHistoryTab();
    }
  });

  document.querySelector('#logoutBtn').addEventListener('click', () => {
    state.webAuth = null;
    state.mode = 'landing';
    saveState();
    render();
  });
}

function renderGoalsList(plan) {
  const list = document.querySelector('#goalsList');
  list.innerHTML = '';

  plan.goals.forEach((goal) => {
    const node = document.createElement('div');
    node.className = 'goal-item';
    node.innerHTML = `
      <div class="row">
        <input type="checkbox" ${goal.isCompleted ? 'checked' : ''} data-goal-complete="${goal.id}" />
        <input type="text" placeholder="핵심 목표 입력" value="${escapeHtml(goal.content)}" data-goal-content="${goal.id}" />
      </div>
      <div class="actions">
        <button data-goal-up="${goal.id}">위로</button>
        <button data-goal-down="${goal.id}">아래로</button>
        <button data-goal-delete="${goal.id}" class="danger">삭제</button>
      </div>
    `;
    list.appendChild(node);
  });

  list.querySelectorAll('[data-goal-content]').forEach((el) => {
    el.addEventListener('input', () => {
      const goal = plan.goals.find((g) => g.id === el.dataset.goalContent);
      goal.content = el.value;
      saveState();
    });
  });

  list.querySelectorAll('[data-goal-complete]').forEach((el) => {
    el.addEventListener('change', () => {
      const goal = plan.goals.find((g) => g.id === el.dataset.goalComplete);
      goal.isCompleted = el.checked;
      saveState();
    });
  });

  bindReorderAndDelete(plan.goals, 'goal', () => {
    saveState();
    renderTodayTab();
  });
}

function renderBlocksList(plan) {
  const list = document.querySelector('#blocksList');
  list.innerHTML = '';

  plan.timeBlocks.forEach((block) => {
    const node = document.createElement('div');
    node.className = 'block-item';
    node.innerHTML = `
      <div class="row">
        <div><label>시작</label><input type="time" step="600" value="${block.startTime}" data-block-start="${block.id}" /></div>
        <div><label>종료</label><input type="time" step="600" value="${block.endTime}" data-block-end="${block.id}" /></div>
      </div>
      <label>할 일</label><input type="text" value="${escapeHtml(block.title)}" data-block-title="${block.id}" />
      <label>메모</label><textarea data-block-memo="${block.id}">${escapeHtml(block.memo)}</textarea>
      <label><input type="checkbox" ${block.isCompleted ? 'checked' : ''} data-block-complete="${block.id}" /> 완료</label>
      <div class="actions">
        <button data-block-delete="${block.id}" class="danger">삭제</button>
      </div>
    `;
    list.appendChild(node);
  });

  const mapAndSave = (selector, field) => {
    list.querySelectorAll(selector).forEach((el) => {
      el.addEventListener('input', () => {
        const id = Object.values(el.dataset)[0];
        const block = plan.timeBlocks.find((b) => b.id === id);
        block[field] = el.type === 'checkbox' ? el.checked : el.value;
        saveState();
      });
      el.addEventListener('change', () => {
        const id = Object.values(el.dataset)[0];
        const block = plan.timeBlocks.find((b) => b.id === id);
        block[field] = el.type === 'checkbox' ? el.checked : el.value;
        saveState();
      });
    });
  };

  mapAndSave('[data-block-start]', 'startTime');
  mapAndSave('[data-block-end]', 'endTime');
  mapAndSave('[data-block-title]', 'title');
  mapAndSave('[data-block-memo]', 'memo');
  mapAndSave('[data-block-complete]', 'isCompleted');

  list.querySelectorAll('[data-block-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      plan.timeBlocks = plan.timeBlocks.filter((b) => b.id !== btn.dataset.blockDelete);
      saveState();
      renderTodayTab();
    });
  });
}

function bindReorderAndDelete(items, prefix, onChange) {
  const move = (id, dir) => {
    const idx = items.findIndex((it) => it.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= items.length) return;
    [items[idx], items[next]] = [items[next], items[idx]];
    onChange();
  };

  document.querySelectorAll(`[data-${prefix}-up]`).forEach((btn) => {
    btn.addEventListener('click', () => move(btn.dataset[`${prefix}Up`], -1));
  });
  document.querySelectorAll(`[data-${prefix}-down]`).forEach((btn) => {
    btn.addEventListener('click', () => move(btn.dataset[`${prefix}Down`], 1));
  });
  document.querySelectorAll(`[data-${prefix}-delete]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = items.findIndex((it) => it.id === btn.dataset[`${prefix}Delete`]);
      items.splice(index, 1);
      onChange();
    });
  });
}

function validatePlan(plan) {
  const goals = plan.goals.map((g) => ({ ...g, content: g.content.trim() })).filter((g) => g.content);
  if (goals.length < 1) {
    showSaveError('핵심 목표를 최소 1개 입력해주세요.');
    return false;
  }
  if (goals.length > 5) {
    showSaveError('오늘의 핵심 목표는 최대 5개까지 작성할 수 있습니다.');
    return false;
  }
  plan.goals = goals;

  const blocks = [...plan.timeBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.title.trim()) {
      showSaveError('시간 블록 제목(할 일)을 입력해주세요.');
      return false;
    }
    if (!isTenMinuteStep(block.startTime) || !isTenMinuteStep(block.endTime)) {
      showSaveError('시간은 10분 단위로만 입력할 수 있습니다.');
      return false;
    }
    if (block.startTime >= block.endTime) {
      showSaveError('시작 시간은 종료 시간보다 빨라야 합니다.');
      return false;
    }

    if (i > 0) {
      const prev = blocks[i - 1];
      if (block.startTime < prev.endTime) {
        showSaveError('이미 사용 중인 시간대가 있습니다. 시간을 다시 선택해주세요.');
        return false;
      }
    }
  }

  plan.timeBlocks = blocks;
  return true;
}

function isTenMinuteStep(time) {
  const [, minute] = time.split(':').map(Number);
  return minute % 10 === 0;
}

function showSaveError(msg, isError = true) {
  const target = document.querySelector('#saveError');
  if (!target) return;
  target.textContent = msg;
  target.style.color = isError ? 'var(--danger)' : 'var(--success)';
}

function renderTemplatesTab() {
  const container = document.querySelector('#templatesTab');
  const bucket = dataBucket();

  container.innerHTML = `
    <div class="card">
      <h2>양식 관리</h2>
      <label>양식 이름</label>
      <input id="templateName" type="text" placeholder="예: 평일 업무 루틴" />
      <label>설명</label>
      <input id="templateDescription" type="text" placeholder="선택 입력" />
      <button id="createTemplateBtn" class="primary">현재 오늘 계획으로 양식 생성</button>
    </div>
    <div class="card">
      <h3>저장된 양식</h3>
      <div id="templateList"></div>
    </div>
  `;

  const list = document.querySelector('#templateList');
  list.innerHTML = '';

  if (!bucket.templates.length) {
    list.innerHTML = '<p class="muted">저장된 양식이 없습니다.</p>';
  } else {
    bucket.templates.forEach((template) => {
      const node = document.createElement('div');
      node.className = 'template-item';
      node.innerHTML = `
        <strong>${escapeHtml(template.name)}</strong> ${template.isDefault ? '<span>⭐ 기본</span>' : ''}
        <p class="muted">${escapeHtml(template.description || '-')}</p>
        <p class="muted">블록 ${template.blocks.length}개</p>
        <div class="actions">
          <button data-template-default="${template.id}">기본 설정</button>
          <button data-template-copy="${template.id}">복사</button>
          <button data-template-delete="${template.id}" class="danger">삭제</button>
        </div>
      `;
      list.appendChild(node);
    });
  }

  document.querySelector('#createTemplateBtn').addEventListener('click', () => {
    const name = document.querySelector('#templateName').value.trim();
    const description = document.querySelector('#templateDescription').value.trim();
    const plan = ensureTodayPlan();
    if (!name) {
      alert('양식 이름은 필수입니다.');
      return;
    }

    if (!validatePlan(plan)) return;

    bucket.templates.push({
      id: crypto.randomUUID(),
      name,
      description,
      isDefault: bucket.templates.length === 0,
      blocks: plan.timeBlocks.map((block) => ({
        id: crypto.randomUUID(),
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        memo: block.memo
      }))
    });
    saveState();
    renderTemplatesTab();
  });

  container.querySelectorAll('[data-template-default]').forEach((btn) => {
    btn.addEventListener('click', () => {
      bucket.templates.forEach((t) => {
        t.isDefault = t.id === btn.dataset.templateDefault;
      });
      saveState();
      renderTemplatesTab();
    });
  });

  container.querySelectorAll('[data-template-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const original = bucket.templates.find((t) => t.id === btn.dataset.templateCopy);
      bucket.templates.push({
        ...structuredClone(original),
        id: crypto.randomUUID(),
        name: `${original.name} (복사본)`,
        isDefault: false
      });
      saveState();
      renderTemplatesTab();
    });
  });

  container.querySelectorAll('[data-template-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.templateDelete;
      bucket.templates = bucket.templates.filter((t) => t.id !== id);
      if (!bucket.templates.some((t) => t.isDefault) && bucket.templates[0]) {
        bucket.templates[0].isDefault = true;
      }
      saveState();
      renderTemplatesTab();
    });
  });
}

function renderHistoryTab() {
  const container = document.querySelector('#historyTab');
  const bucket = dataBucket();
  const plans = [...bucket.dailyPlans].sort((a, b) => b.planDate.localeCompare(a.planDate));

  container.innerHTML = `
    <div class="card">
      <h2>기록 조회</h2>
      <p class="muted">날짜별 계획을 확인하고 오늘로 복사할 수 있습니다.</p>
      <div id="historyList"></div>
    </div>
  `;

  const list = document.querySelector('#historyList');
  if (!plans.length) {
    list.innerHTML = '<p class="muted">기록이 없습니다.</p>';
    return;
  }

  plans.forEach((plan) => {
    const doneGoals = plan.goals.filter((g) => g.isCompleted).length;
    const doneBlocks = plan.timeBlocks.filter((b) => b.isCompleted).length;
    const node = document.createElement('div');
    node.className = 'history-item';
    node.innerHTML = `
      <strong>${plan.planDate}</strong>
      <p class="muted">목표 ${doneGoals}/${plan.goals.length}, 블록 ${doneBlocks}/${plan.timeBlocks.length}</p>
      <div class="actions">
        <button data-copy-plan="${plan.id}">오늘 계획으로 복사</button>
      </div>
    `;
    list.appendChild(node);
  });

  container.querySelectorAll('[data-copy-plan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const original = plans.find((p) => p.id === btn.dataset.copyPlan);
      const today = ensureTodayPlan();
      today.goals = original.goals.map((g) => ({ ...structuredClone(g), id: crypto.randomUUID(), isCompleted: false }));
      today.timeBlocks = original.timeBlocks.map((b) => ({ ...structuredClone(b), id: crypto.randomUUID(), isCompleted: false }));
      saveState();
      alert('오늘 계획으로 복사되었습니다.');
      document.querySelector('[data-tab="today"]').click();
      renderTodayTab();
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

render();
