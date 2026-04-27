"use client";

import { useEffect, useState } from "react";

const providerOptions = ["GOOGLE", "KAKAO", "NAVER"];

const defaultGoals = [
  { content: "오늘 가장 중요한 일 정리", isCompleted: false },
  { content: "", isCompleted: false },
  { content: "", isCompleted: false },
];

const defaultBlocks = [
  {
    startTime: "09:00",
    endTime: "10:30",
    title: "집중 업무",
    memo: "가장 중요한 일 먼저 처리",
    isCompleted: false,
  },
  {
    startTime: "10:30",
    endTime: "10:40",
    title: "휴식",
    memo: "",
    isCompleted: false,
  },
  {
    startTime: "10:40",
    endTime: "12:00",
    title: "두 번째 업무",
    memo: "",
    isCompleted: false,
  },
];

const defaultTemplateBlocks = [
  { startTime: "07:00", endTime: "07:30", title: "아침 루틴", memo: "" },
  { startTime: "09:00", endTime: "11:00", title: "집중 업무 1", memo: "" },
  { startTime: "13:00", endTime: "15:00", title: "집중 업무 2", memo: "" },
  { startTime: "15:00", endTime: "15:20", title: "휴식", memo: "" },
];

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyBlock() {
  return {
    startTime: "09:00",
    endTime: "09:30",
    title: "",
    memo: "",
    isCompleted: false,
  };
}

function normalizeBlock(block) {
  return {
    startTime: block.startTime,
    endTime: block.endTime,
    title: block.title,
    memo: block.memo || "",
    isCompleted: Boolean(block.isCompleted),
  };
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isTenMinuteTime(time) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) && toMinutes(time) % 10 === 0;
}

function validateGoals(goals) {
  const filled = goals
    .map((goal) => ({ ...goal, content: goal.content.trim() }))
    .filter((goal) => goal.content.length > 0);

  if (filled.length < 1) return "오늘의 핵심 목표를 1개 이상 입력해주세요.";
  if (filled.length > 5) return "오늘의 핵심 목표는 최대 5개까지 작성할 수 있습니다.";
  return "";
}

function validateBlocks(blocks) {
  const filled = blocks
    .map((block) => ({ ...block, title: block.title.trim() }))
    .filter((block) => block.title.length > 0);

  for (const [index, block] of filled.entries()) {
    if (!isTenMinuteTime(block.startTime) || !isTenMinuteTime(block.endTime)) {
      return `${index + 1}번째 시간 블록은 10분 단위의 HH:MM 형식이어야 합니다.`;
    }
    if (toMinutes(block.startTime) >= toMinutes(block.endTime)) {
      return `${index + 1}번째 시간 블록의 종료 시간은 시작 시간보다 늦어야 합니다.`;
    }
  }

  const sorted = [...filled].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  for (let index = 1; index < sorted.length; index += 1) {
    if (toMinutes(sorted[index - 1].endTime) > toMinutes(sorted[index].startTime)) {
      return "이미 사용 중인 시간대가 있습니다. 시간을 다시 선택해주세요.";
    }
  }

  return "";
}

function serializeGoals(goals) {
  return goals
    .map((goal) => ({ content: goal.content.trim(), isCompleted: Boolean(goal.isCompleted) }))
    .filter((goal) => goal.content.length > 0);
}

function serializeBlocks(blocks) {
  return blocks
    .map((block) => ({
      startTime: block.startTime,
      endTime: block.endTime,
      title: block.title.trim(),
      memo: block.memo.trim(),
      isCompleted: Boolean(block.isCompleted),
    }))
    .filter((block) => block.title.length > 0)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

function formatError(error) {
  return error?.message || "요청을 처리하지 못했습니다.";
}

function goalsFromPlan(plan) {
  if (!plan.goals || plan.goals.length === 0) return defaultGoals;
  return plan.goals.map((goal) => ({ content: goal.content, isCompleted: goal.isCompleted }));
}

function blocksFromPlan(plan) {
  if (!plan.timeBlocks || plan.timeBlocks.length === 0) return defaultBlocks;
  return plan.timeBlocks.map(normalizeBlock);
}

export default function Home() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [providerType, setProviderType] = useState("GOOGLE");
  const [loginForm, setLoginForm] = useState({
    providerUserId: "demo-user",
    email: "demo@timebox.local",
    nickname: "TimeBox User",
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "평일 업무 루틴",
    description: "업무일에 반복해서 쓰는 기본 타임박싱 양식",
    blocks: defaultTemplateBlocks,
  });
  const [planDate, setPlanDate] = useState(todayText());
  const [plan, setPlan] = useState(null);
  const [goals, setGoals] = useState(defaultGoals);
  const [timeBlocks, setTimeBlocks] = useState(defaultBlocks);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("plan");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (response.status === 204) return null;

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "요청을 처리하지 못했습니다.");
    return payload;
  }

  async function refreshTemplates() {
    const items = await request("/api/templates");
    setTemplates(items);
    if (!selectedTemplateId && items.length > 0) {
      const defaultTemplate = items.find((item) => item.isDefault) || items[0];
      setSelectedTemplateId(String(defaultTemplate.id));
    }
  }

  async function loadPlans(date = planDate) {
    const items = await request(`/api/daily-plans${date ? `?date=${date}` : ""}`);
    setHistory(items);
    const current = items.find((item) => item.planDate === date) || null;
    setPlan(current);
    if (current) {
      setGoals(goalsFromPlan(current));
      setTimeBlocks(blocksFromPlan(current));
    }
  }

  async function bootstrap(savedToken) {
    setLoading(true);
    setError("");
    try {
      const me = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (!me.ok) throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
      const payload = await me.json();
      setToken(savedToken);
      setUser(payload.user);
    } catch (err) {
      localStorage.removeItem("timebox-token");
      setToken("");
      setUser(null);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const savedToken = localStorage.getItem("timebox-token");
    if (savedToken) bootstrap(savedToken);
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    Promise.all([refreshTemplates(), loadPlans(planDate)]).catch((err) => setError(formatError(err)));
  }, [token, user]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const payload = await request("/api/auth/login/dev", {
        method: "POST",
        body: JSON.stringify({ providerType, ...loginForm }),
      });
      localStorage.setItem("timebox-token", payload.accessToken);
      setToken(payload.accessToken);
      setUser(payload.user);
      setStatus("개발 로그인으로 세션을 만들었습니다.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch {
      // Local cleanup should still happen even when the dev server session was already gone.
    }
    localStorage.removeItem("timebox-token");
    setToken("");
    setUser(null);
    setTemplates([]);
    setPlan(null);
    setStatus("로그아웃했습니다.");
  }

  async function handleDateChange(value) {
    setPlanDate(value);
    setError("");
    try {
      const items = await request(`/api/daily-plans?date=${value}`);
      setHistory(items);
      const current = items[0] || null;
      setPlan(current);
      if (current) {
        setGoals(goalsFromPlan(current));
        setTimeBlocks(blocksFromPlan(current));
      } else {
        setGoals(defaultGoals);
        setTimeBlocks(defaultBlocks);
      }
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function savePlan() {
    const goalError = validateGoals(goals);
    const blockError = validateBlocks(timeBlocks);
    if (goalError || blockError) {
      setError(goalError || blockError);
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      const body = {
        planDate,
        templateId: selectedTemplateId ? Number(selectedTemplateId) : null,
        goals: serializeGoals(goals),
        timeBlocks: serializeBlocks(timeBlocks),
      };
      const saved = await request(plan ? `/api/daily-plans/${plan.id}` : "/api/daily-plans", {
        method: plan ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setPlan(saved);
      setGoals(saved.goals.map((goal) => ({ content: goal.content, isCompleted: goal.isCompleted })));
      setTimeBlocks(saved.timeBlocks.map(normalizeBlock));
      setStatus("오늘 계획을 저장했습니다.");
      await loadPlans(planDate);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function createPlanFromTemplate() {
    if (!selectedTemplateId) {
      setError("먼저 사용할 양식을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const created = await request(`/api/daily-plans/from-template/${selectedTemplateId}`, {
        method: "POST",
        body: JSON.stringify({ planDate }),
      });
      setPlan(created);
      setGoals(defaultGoals);
      setTimeBlocks(created.timeBlocks.map(normalizeBlock));
      setStatus("선택한 양식으로 계획을 만들었습니다. 목표를 추가하고 저장해주세요.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!templateForm.name.trim()) {
      setError("양식 이름을 입력해주세요.");
      return;
    }
    const blockError = validateBlocks(templateForm.blocks);
    if (blockError) {
      setError(blockError);
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      const selected = templates.find((item) => String(item.id) === selectedTemplateId);
      const body = {
        name: templateForm.name,
        description: templateForm.description,
        blocks: serializeBlocks(templateForm.blocks),
      };
      const saved = await request(selected ? `/api/templates/${selected.id}` : "/api/templates", {
        method: selected ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setSelectedTemplateId(String(saved.id));
      setStatus(selected ? "양식을 수정했습니다." : "새 양식을 저장했습니다.");
      await refreshTemplates();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyTemplate(id) {
    setError("");
    try {
      const copied = await request(`/api/templates/${id}/copy`, { method: "POST" });
      setSelectedTemplateId(String(copied.id));
      setStatus("양식을 복사했습니다.");
      await refreshTemplates();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function setDefaultTemplate(id) {
    setError("");
    try {
      await request(`/api/templates/${id}/default`, { method: "PUT" });
      setStatus("기본 양식을 변경했습니다.");
      await refreshTemplates();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function deleteTemplate(id) {
    setError("");
    try {
      await request(`/api/templates/${id}`, { method: "DELETE" });
      setSelectedTemplateId("");
      setTemplateForm({
        name: "새 양식",
        description: "",
        blocks: [createEmptyBlock()],
      });
      setStatus("양식을 삭제했습니다.");
      await refreshTemplates();
    } catch (err) {
      setError(formatError(err));
    }
  }

  function selectTemplate(id) {
    setSelectedTemplateId(String(id));
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      blocks: template.blocks.map((block) => ({
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        memo: block.memo || "",
      })),
    });
  }

  function updateGoal(index, patch) {
    setGoals((current) => current.map((goal, goalIndex) => (goalIndex === index ? { ...goal, ...patch } : goal)));
  }

  function updateBlock(index, patch, target = "plan") {
    const setter = target === "template" ? setTemplateForm : setTimeBlocks;
    if (target === "template") {
      setter((current) => ({
        ...current,
        blocks: current.blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, ...patch } : block)),
      }));
      return;
    }
    setter((current) => current.map((block, blockIndex) => (blockIndex === index ? { ...block, ...patch } : block)));
  }

  if (!user) {
    return (
      <main className="min-h-screen">
        <section className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="badge">TimeBox Planner MVP</span>
            <h1 className="mt-5 max-w-2xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
              오늘의 목표와 시간 블록을 한 번에 계획하세요.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              백엔드 정책에 맞춰 웹에서는 로그인 후 작성 화면에 접근합니다. 현재 화면은 개발용
              로그인으로 Google, Kakao, Naver 계정 흐름을 대체합니다.
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
              {["목표 1~5개", "10분 단위", "겹침 검증"].map((item) => (
                <div key={item} className="border-l-4 border-teal-700 bg-white px-4 py-3 text-sm font-bold text-slate-800">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleLogin} className="panel p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950">로그인</h2>
                <p className="mt-1 text-sm text-slate-500">개발용 세션을 생성합니다.</p>
              </div>
              <span className="badge">Required</span>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Provider</span>
                <select className="field" value={providerType} onChange={(event) => setProviderType(event.target.value)}>
                  {providerOptions.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Provider User ID</span>
                <input
                  className="field"
                  value={loginForm.providerUserId}
                  onChange={(event) => setLoginForm((current) => ({ ...current, providerUserId: event.target.value }))}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Email</span>
                <input
                  className="field"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Nickname</span>
                <input
                  className="field"
                  value={loginForm.nickname}
                  onChange={(event) => setLoginForm((current) => ({ ...current, nickname: event.target.value }))}
                />
              </label>
            </div>

            {error ? <p className="mt-4 text-sm font-bold text-red-700">{error}</p> : null}
            <button className="btn btn-primary mt-6 w-full" disabled={loading}>
              로그인하고 작성 시작
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/86">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-teal-700">TimeBox Planner</p>
            <h1 className="text-2xl font-black text-slate-950">하루 계획 작성</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">{user.nickname || user.email || user.providerUserId}</span>
            <button className="btn btn-secondary" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6">
        <div className="flex flex-wrap gap-2">
          {[
            ["plan", "오늘 계획"],
            ["templates", "양식 관리"],
            ["history", "기록 조회"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`btn ${activeTab === key ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {status ? <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{status}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}

        {activeTab === "plan" ? (
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.78fr_1.22fr]">
            <aside className="panel p-5">
              <h2 className="text-xl font-black text-slate-950">계획 설정</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">날짜</span>
                  <input className="field" type="date" value={planDate} onChange={(event) => handleDateChange(event.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">양식</span>
                  <select className="field" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    <option value="">선택 안 함</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.isDefault ? "[기본] " : ""}
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-secondary w-full" onClick={createPlanFromTemplate} disabled={loading || !selectedTemplateId}>
                  양식으로 계획 생성
                </button>
                <button className="btn btn-primary w-full" onClick={savePlan} disabled={loading}>
                  {plan ? "계획 수정 저장" : "새 계획 저장"}
                </button>
              </div>
            </aside>

            <section className="space-y-5">
              <div className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-slate-950">오늘의 핵심 목표</h2>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setGoals((current) => (current.length < 5 ? [...current, { content: "", isCompleted: false }] : current))}
                    disabled={goals.length >= 5}
                  >
                    목표 추가
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {goals.map((goal, index) => (
                    <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                      <input
                        type="checkbox"
                        checked={goal.isCompleted}
                        onChange={(event) => updateGoal(index, { isCompleted: event.target.checked })}
                        aria-label={`${index + 1}번째 목표 완료`}
                      />
                      <input
                        className="field"
                        value={goal.content}
                        onChange={(event) => updateGoal(index, { content: event.target.value })}
                        placeholder={`${index + 1}번째 핵심 목표`}
                      />
                      <button className="btn btn-danger" onClick={() => setGoals((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <BlockEditor
                title="시간 블록"
                blocks={timeBlocks}
                onChange={(index, patch) => updateBlock(index, patch)}
                onAdd={() => setTimeBlocks((current) => [...current, createEmptyBlock()])}
                onDelete={(index) => setTimeBlocks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                showCompletion
              />
            </section>
          </div>
        ) : null}

        {activeTab === "templates" ? (
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.72fr_1.28fr]">
            <aside className="panel p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-slate-950">저장된 양식</h2>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSelectedTemplateId("");
                    setTemplateForm({ name: "새 양식", description: "", blocks: [createEmptyBlock()] });
                  }}
                >
                  새 양식
                </button>
              </div>
              <div className="quiet-scroll mt-4 max-h-[520px] space-y-3 overflow-auto pr-1">
                {templates.length === 0 ? <p className="text-sm text-slate-500">저장된 양식이 없습니다.</p> : null}
                {templates.map((template) => (
                  <article key={template.id} className="rounded-md border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button className="text-left font-black text-slate-900" onClick={() => selectTemplate(template.id)}>
                        {template.name}
                      </button>
                      {template.isDefault ? <span className="badge">기본</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{template.description || "설명 없음"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn btn-secondary" onClick={() => setDefaultTemplate(template.id)}>
                        기본 설정
                      </button>
                      <button className="btn btn-secondary" onClick={() => copyTemplate(template.id)}>
                        복사
                      </button>
                      <button className="btn btn-danger" onClick={() => deleteTemplate(template.id)}>
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </aside>

            <section className="space-y-5">
              <div className="panel p-5">
                <h2 className="text-xl font-black text-slate-950">양식 편집</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">양식 이름</span>
                    <input
                      className="field"
                      value={templateForm.name}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">설명</span>
                    <input
                      className="field"
                      value={templateForm.description}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </label>
                </div>
              </div>

              <BlockEditor
                title="양식 시간 블록"
                blocks={templateForm.blocks}
                onChange={(index, patch) => updateBlock(index, patch, "template")}
                onAdd={() => setTemplateForm((current) => ({ ...current, blocks: [...current.blocks, createEmptyBlock()] }))}
                onDelete={(index) =>
                  setTemplateForm((current) => ({ ...current, blocks: current.blocks.filter((_, itemIndex) => itemIndex !== index) }))
                }
              />
              <button className="btn btn-primary w-full sm:w-auto" onClick={saveTemplate} disabled={loading}>
                양식 저장
              </button>
            </section>
          </div>
        ) : null}

        {activeTab === "history" ? (
          <section className="panel mt-5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">기록 조회</h2>
                <p className="mt-1 text-sm text-slate-500">날짜별 저장된 계획을 확인하고 현재 편집 화면으로 불러옵니다.</p>
              </div>
              <button className="btn btn-secondary" onClick={() => loadPlans("")}>
                전체 기록 불러오기
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {history.length === 0 ? <p className="text-sm text-slate-500">조회된 기록이 없습니다.</p> : null}
              {history.map((item) => (
                <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">{item.planDate}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        목표 {item.goals.length}개 · 시간 블록 {item.timeBlocks.length}개
                      </p>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setPlanDate(item.planDate);
                        setPlan(item);
                        setGoals(goalsFromPlan(item));
                        setTimeBlocks(blocksFromPlan(item));
                        setActiveTab("plan");
                      }}
                    >
                      불러오기
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {item.goals.slice(0, 3).map((goal) => (
                      <p key={goal.id}>{goal.isCompleted ? "완료" : "진행"} · {goal.content}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function BlockEditor({ title, blocks, onChange, onAdd, onDelete, showCompletion = false }) {
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-950">{title}</h2>
        <button className="btn btn-secondary" onClick={onAdd}>
          블록 추가
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {blocks.map((block, index) => (
          <div key={index} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[120px_120px_1fr_auto]">
              <label>
                <span className="mb-2 block text-xs font-bold text-slate-500">시작</span>
                <input className="field" type="time" step="600" value={block.startTime} onChange={(event) => onChange(index, { startTime: event.target.value })} />
              </label>
              <label>
                <span className="mb-2 block text-xs font-bold text-slate-500">종료</span>
                <input className="field" type="time" step="600" value={block.endTime} onChange={(event) => onChange(index, { endTime: event.target.value })} />
              </label>
              <label>
                <span className="mb-2 block text-xs font-bold text-slate-500">할 일</span>
                <input className="field" value={block.title} onChange={(event) => onChange(index, { title: event.target.value })} placeholder="할 일을 입력하세요" />
              </label>
              <button className="btn btn-danger self-end" onClick={() => onDelete(index)}>
                삭제
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
              <textarea
                className="field min-h-[82px] resize-y"
                value={block.memo}
                onChange={(event) => onChange(index, { memo: event.target.value })}
                placeholder="메모"
              />
              {showCompletion ? (
                <label className="flex items-center gap-2 self-start rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(block.isCompleted)}
                    onChange={(event) => onChange(index, { isCompleted: event.target.checked })}
                  />
                  완료
                </label>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
