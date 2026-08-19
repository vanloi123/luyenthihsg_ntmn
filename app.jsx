import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Home, BookOpen, Code2, Trophy, MessageSquare, Clock, Users, Plus,
  Send, CheckCircle2, XCircle, Loader2, Flame, ChevronRight, ChevronLeft,
  Award, TrendingUp, AlertCircle, X, Play, Lock, GraduationCap, ListChecks,
  RefreshCw, Eye, EyeOff, LogOut, Pencil, Trash2, Save,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* ---------------------------------------------------------------------- */
/*  SUPABASE DATA LAYER                                                     */
/* ---------------------------------------------------------------------- */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}
function hashPassword(pw) {
  return hashStr("ntsalt_v1::" + pw).toString(36);
}

function normalizeTestCases(raw) {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch (e) { value = []; }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((test, index) => ({
      id: test?.id || `test-${index + 1}`,
      input: String(test?.input ?? ""),
      output: String(test?.output ?? ""),
    }))
    .filter((test) => test.output.trim() && test.output.trim() !== "—");
}

function createEmptyTestCase() {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, input: "", output: "" };
}

function createProblemForm(topicId) {
  return {
    title: "", topic: topicId, difficulty: "Dễ", points: 100, statement: "",
    sampleInput: "", sampleOutput: "", testCases: [createEmptyTestCase()], isPython: false,
  };
}

function parseTestCasesJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return { tests: [], error: "" };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { tests: [], error: "Test case phải là một mảng JSON." };
    const tests = normalizeTestCases(parsed);
    if (tests.length !== parsed.length) {
      return { tests: [], error: "Mỗi test case phải có cả input và output khác rỗng." };
    }
    return { tests, error: "" };
  } catch (error) {
    return { tests: [], error: "JSON test case không hợp lệ. Hãy kiểm tra dấu ngoặc kép và dấu phẩy." };
  }
}

function mapAccount(row) {
  return {
    id: row.id, name: row.name, role: row.role, username: row.username,
    passwordHash: row.password_hash, passwordChanged: row.password_changed,
    plainInitial: row.plain_initial, className: row.class_name, streak: row.streak || 0,
  };
}
function mapTopic(row) {
  return { id: row.id, code: row.code, title: row.title, weeks: row.weeks, summary: row.summary, content: row.content };
}
function mapProblem(row) {
  return {
    id: row.id, title: row.title, topic: row.topic, difficulty: row.difficulty, points: row.points,
    isPython: row.is_python, statement: row.statement,
    sample: { input: row.sample_input, output: row.sample_output },
    testCases: normalizeTestCases(row.test_cases),
  };
}
function mapContest(row) {
  return { id: row.id, title: row.title, status: row.status, date: row.date, duration: row.duration, problemIds: row.problem_ids || [] };
}
function mapSubmission(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    problemId: row.problem_id,
    verdict: row.verdict,
    score: Number(row.score ?? (row.verdict === "AC" ? row.problem_points : 0)),
    passedTests: row.passed_tests ?? null,
    totalTests: row.total_tests ?? null,
    problemTitle: row.problem_title,
    problemPoints: row.problem_points,
  };
}

async function fetchLessonProgress(studentId) {
  const { data, error } = await supabase.from("lesson_progress").select("*").eq("student_id", studentId);
  if (error) throw error;
  return (data || []).reduce((result, row) => {
    result[row.topic_id] = { isRead: Boolean(row.is_read), isCompleted: Boolean(row.is_completed) };
    return result;
  }, {});
}

async function dbSetLessonProgress(studentId, topicId, progress) {
  const { error } = await supabase.from("lesson_progress").upsert({
    student_id: studentId,
    topic_id: topicId,
    is_read: Boolean(progress.isRead),
    is_completed: Boolean(progress.isCompleted),
    completed_at: progress.isCompleted ? new Date().toISOString() : null,
  }, { onConflict: "student_id,topic_id" });
  if (error) throw error;
}

async function fetchAll() {
  const [topicsR, problemsR, contestsR, submissionsR, discussionsR, repliesR, accountsR] = await Promise.all([
    supabase.from("topics").select("*"),
    supabase.from("problems").select("*"),
    supabase.from("contests").select("*"),
    supabase.from("submissions").select("*"),
    supabase.from("discussions").select("*").order("created_at", { ascending: false }),
    supabase.from("discussion_replies").select("*").order("created_at", { ascending: true }),
    supabase.from("accounts").select("*"),
  ]);
  const results = [topicsR, problemsR, contestsR, submissionsR, discussionsR, repliesR, accountsR];
  const firstError = results.find((r) => r.error);
  if (firstError) throw firstError.error;

  const repliesByThread = {};
  (repliesR.data || []).forEach((r) => {
    if (!repliesByThread[r.thread_id]) repliesByThread[r.thread_id] = [];
    repliesByThread[r.thread_id].push({ author: r.author, role: r.role, content: r.content });
  });
  const discussions = (discussionsR.data || []).map((d) => ({
    id: d.id, author: d.author, role: d.role, topicRef: d.topic_ref, content: d.content,
    replies: repliesByThread[d.id] || [],
  }));

  return {
    topics: (topicsR.data || []).map(mapTopic),
    problems: (problemsR.data || []).map(mapProblem),
    contests: (contestsR.data || []).map(mapContest),
    submissions: (submissionsR.data || []).map(mapSubmission),
    discussions,
    accounts: (accountsR.data || []).map(mapAccount),
  };
}

async function dbAddTopic(t) {
  const { error } = await supabase.from("topics").insert({ id: t.id, code: t.code, title: t.title, weeks: t.weeks, summary: t.summary, content: t.content });
  if (error) throw error;
}
async function dbUpdateTopic(t) {
  const { error } = await supabase.from("topics").update({ code: t.code, title: t.title, weeks: t.weeks, summary: t.summary, content: t.content }).eq("id", t.id);
  if (error) throw error;
}
async function dbRemoveTopic(id) {
  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw error;
}
async function dbAddProblem(p) {
  const { error } = await supabase.from("problems").insert({
    id: p.id, title: p.title, topic: p.topic, difficulty: p.difficulty, points: p.points,
    is_python: p.isPython, statement: p.statement, sample_input: p.sample.input, sample_output: p.sample.output,
    test_cases: normalizeTestCases(p.testCases),
  });
  if (error) throw error;
}
async function dbUpdateProblem(p) {
  const { error } = await supabase.from("problems").update({
    title: p.title, topic: p.topic, difficulty: p.difficulty, points: p.points,
    is_python: p.isPython, statement: p.statement, sample_input: p.sample.input, sample_output: p.sample.output,
    test_cases: normalizeTestCases(p.testCases),
  }).eq("id", p.id);
  if (error) throw error;
}
async function dbRemoveProblem(id) {
  const { error } = await supabase.from("problems").delete().eq("id", id);
  if (error) throw error;
}
async function dbAddContest(c) {
  const { error } = await supabase.from("contests").insert({ id: c.id, title: c.title, status: c.status, date: c.date, duration: c.duration, problem_ids: c.problemIds });
  if (error) throw error;
}
async function dbSetContestStatus(id, status) {
  const { error } = await supabase.from("contests").update({ status }).eq("id", id);
  if (error) throw error;
}
async function dbAddSubmission(sub) {
  const { error } = await supabase.from("submissions").insert({
    id: sub.id, student_id: sub.studentId, problem_id: sub.problemId, verdict: sub.verdict,
    score: sub.score, passed_tests: sub.passedTests, total_tests: sub.totalTests,
    problem_title: sub.problemTitle, problem_points: sub.problemPoints,
  });
  if (error) throw error;
}
async function dbAddThread(t) {
  const { error } = await supabase.from("discussions").insert({ id: t.id, author: t.author, role: t.role, topic_ref: t.topicRef, content: t.content });
  if (error) throw error;
}
async function dbAddReply(threadId, reply) {
  const { error } = await supabase.from("discussion_replies").insert({ thread_id: threadId, author: reply.author, role: reply.role, content: reply.content });
  if (error) throw error;
}
async function dbUpdatePassword(id, newHash) {
  const { error } = await supabase.from("accounts").update({ password_hash: newHash, password_changed: true, plain_initial: null }).eq("id", id);
  if (error) throw error;
}
async function dbAddAccount(a) {
  const { error } = await supabase.from("accounts").insert({
    id: a.id, name: a.name, role: "student", username: a.username,
    password_hash: a.passwordHash, password_changed: false, plain_initial: a.plainInitial,
    class_name: "11 Tin", streak: 0,
  });
  if (error) throw error;
}
async function dbRemoveAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------------- */
/*  HELPERS                                                                 */
/* ---------------------------------------------------------------------- */

const DIFFICULTIES = ["Dễ", "Trung bình", "Khó"];

const JUDGE0_ENDPOINT = "https://ce.judge0.com";
const JUDGE0_LANGUAGE_IDS = {
  python: 71, // Python 3.8.1
  cpp: 54, // GNU C++17
};

const JUDGE_STATUS_TO_VERDICT = {
  3: "AC",
  4: "WA",
  5: "TLE",
  6: "CE",
  7: "RE",
  8: "RE",
  9: "RE",
  10: "RE",
  11: "RE",
  12: "RE",
  13: "SE",
  14: "SE",
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function judgeOneTest({ sourceCode, languageId, input, expectedOutput }) {
  const createResponse = await fetchWithTimeout(
    `${JUDGE0_ENDPOINT}/submissions?base64_encoded=false&wait=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin: input,
        expected_output: expectedOutput,
        cpu_time_limit: 2,
        wall_time_limit: 5,
        memory_limit: 128000,
      }),
    }
  );

  if (!createResponse.ok) {
    throw new Error(`Không thể tạo lượt chấm (HTTP ${createResponse.status}).`);
  }

  const created = await createResponse.json();
  if (!created.token) throw new Error("Dịch vụ chấm không trả về mã lượt chấm.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(500);
    const resultResponse = await fetchWithTimeout(
      `${JUDGE0_ENDPOINT}/submissions/${encodeURIComponent(created.token)}?base64_encoded=false`,
      {},
      10000
    );
    if (!resultResponse.ok) {
      throw new Error(`Không thể lấy kết quả chấm (HTTP ${resultResponse.status}).`);
    }

    const result = await resultResponse.json();
    const statusId = result.status?.id;
    if (statusId !== 1 && statusId !== 2) return result;
  }

  throw new Error("Dịch vụ chấm phản hồi quá lâu. Em hãy thử nộp lại sau ít giây.");
}

function getProblemTestCases(problem) {
  const configured = normalizeTestCases(problem.testCases);
  if (configured.length > 0) return configured;

  const sampleInput = String(problem.sample?.input ?? "");
  const sampleOutput = String(problem.sample?.output ?? "");
  return [{
    input: sampleInput.trim() === "—" ? "" : sampleInput,
    output: sampleOutput,
  }];
}

async function judgeSourceCode(problem, code) {
  const sourceCode = String(code || "").trim();
  if (sourceCode.length < 8) {
    return { verdict: "CE", tests: [], message: "Chưa có code hợp lệ để biên dịch." };
  }

  const testCases = getProblemTestCases(problem);
  const incompleteCase = testCases.find((test) => !test.output.trim() || test.output.trim() === "—");
  if (incompleteCase) {
    return {
      verdict: "SE",
      tests: [],
      passedTests: 0,
      totalTests: testCases.length,
      score: 0,
      message: "Bài này chưa có output mẫu hoặc test case hợp lệ để chấm.",
    };
  }

  const languageId = problem.isPython ? JUDGE0_LANGUAGE_IDS.python : JUDGE0_LANGUAGE_IDS.cpp;
  const results = [];
  for (const test of testCases) {
    // Chấm tuần tự để không tạo nhiều tiến trình chạy đồng thời cho cùng một bài.
    results.push(await judgeOneTest({
      sourceCode,
      languageId,
      input: test.input,
      expectedOutput: test.output,
    }));
  }

  const verdicts = results.map((result) => JUDGE_STATUS_TO_VERDICT[result.status?.id] || "SE");
  const tests = verdicts.map((verdict) => verdict === "AC");
  const passedTests = tests.filter(Boolean).length;
  const totalTests = testCases.length;
  const firstNonAccepted = verdicts.find((verdict) => verdict !== "AC");
  const firstResult = results[verdicts.indexOf(firstNonAccepted || verdicts[0])];
  const output = firstResult?.compile_output || firstResult?.stderr || firstResult?.message || firstResult?.stdout || "";
  const statusDescription = firstResult?.status?.description || "Đã có kết quả.";
  const score = Math.round((Number(problem.points) || 0) * passedTests / totalTests);

  return {
    verdict: firstNonAccepted || "AC",
    tests,
    passedTests,
    totalTests,
    score,
    message: firstNonAccepted ? `${statusDescription} · ${passedTests}/${totalTests} test đạt.` : `Accepted · ${passedTests}/${totalTests} test đạt.`,
    output: output.trim(),
  };
}

const DIFF_COLOR = { "Dễ": "var(--ac-green)", "Trung bình": "var(--gold)", "Khó": "var(--red-pen)" };

function initials(name) {
  const parts = name.trim().split(" ");
  return (parts[parts.length - 2]?.[0] || "") + (parts[parts.length - 1]?.[0] || "");
}

/* ---------------------------------------------------------------------- */
/*  SMALL UI PIECES                                                        */
/* ---------------------------------------------------------------------- */

function VerdictPill({ verdict }) {
  const map = {
    AC: { label: "AC · Chấp nhận", cls: "nb-pill-ac" },
    WA: { label: "WA · Sai kết quả", cls: "nb-pill-wa" },
    CE: { label: "CE · Lỗi biên dịch", cls: "nb-pill-wa" },
    TLE: { label: "TLE · Quá thời gian", cls: "nb-pill-wa" },
    RE: { label: "RE · Lỗi khi chạy", cls: "nb-pill-wa" },
    SE: { label: "SE · Lỗi dịch vụ chấm", cls: "nb-pill-wa" },
    PENDING: { label: "Đang chấm…", cls: "nb-pill-pending" },
  };
  const m = map[verdict] || map.PENDING;
  return <span className={"nb-pill " + m.cls}>{m.label}</span>;
}

function DifficultyTag({ level }) {
  return (
    <span className="nb-tag" style={{ color: DIFF_COLOR[level], borderColor: DIFF_COLOR[level] }}>
      {level}
    </span>
  );
}

function Avatar({ name, size = 34, className = "" }) {
  return (
    <div className={"nb-avatar " + className} style={{ width: size, height: size, fontSize: size * 0.38 }} title={name}>
      {initials(name).toUpperCase()}
    </div>
  );
}

function SectionHeading({ eyebrow, title, sub }) {
  return (
    <div className="mb-5">
      {eyebrow && <div className="nb-eyebrow">{eyebrow}</div>}
      <h2 className="nb-h2">{title}</h2>
      {sub && <p className="nb-sub">{sub}</p>}
    </div>
  );
}

function StorageBanner({ visible, onDismiss }) {
  if (!visible) return null;
  return (
    <div className="nb-storage-banner">
      <AlertCircle size={15} />
      <span>Không đồng bộ được dữ liệu lúc này — thay đổi có thể chưa được lưu cho cả lớp. Thử bấm làm mới.</span>
      <button className="nb-icon-btn" onClick={onDismiss} aria-label="Đóng"><X size={14} /></button>
    </div>
  );
}

function SimpleBarChart({ data, highlightName }) {
  const max = Math.max(1, ...data.map((d) => d.pts));
  return (
    <div className="nb-barchart">
      {data.map((d, i) => (
        <div key={i} className="nb-bar-col">
          <div className="nb-bar-track">
            <div
              className={"nb-bar-fill " + (d.full === highlightName ? "me" : "")}
              style={{ height: (max ? (d.pts / max) * 100 : 0) + "%" }}
              title={d.full + ": " + d.pts + " điểm"}
            />
          </div>
          <div className="nb-bar-value nb-mono">{d.pts}</div>
          <div className="nb-bar-label">{d.name}</div>
        </div>
      ))}
      {data.length === 0 && <p className="nb-sub">Chưa có dữ liệu.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  LOGIN                                                                    */
/* ---------------------------------------------------------------------- */

function LoginScreen({ onLogin, error, busy }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    onLogin(username.trim(), password);
  }

  return (
    <div className="nb-login-wrap">
      <form className="nb-login-card" onSubmit={submit}>
        <div className="nb-brand-mark" style={{ width: 44, height: 44, margin: "0 auto 14px" }}><GraduationCap size={22} /></div>
        <h2 className="nb-h2" style={{ textAlign: "center" }}>Đội tuyển Tin học</h2>
        <p className="nb-sub" style={{ textAlign: "center", marginBottom: 22 }}>Đăng nhập bằng tài khoản được giáo viên cấp</p>

        <label className="nb-field-label">Tên đăng nhập</label>
        <input className="nb-input" value={username} onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none" autoCorrect="off" placeholder="vd: hs01" />

        <label className="nb-field-label" style={{ marginTop: 10 }}>Mật khẩu</label>
        <div className="nb-password-row">
          <input className="nb-input" type={showPw ? "text" : "password"} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
          <button type="button" className="nb-icon-btn" onClick={() => setShowPw((v) => !v)} aria-label="Hiện mật khẩu">
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <div className="nb-login-error"><AlertCircle size={14} /> {error}</div>}

        <button className="nb-btn nb-btn-primary" type="submit" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} disabled={busy}>
          {busy ? <Loader2 size={16} className="nb-spin" /> : "Đăng nhập"}
        </button>
        <p className="nb-sub" style={{ textAlign: "center", marginTop: 14 }}>Quên mật khẩu? Liên hệ giáo viên phụ trách để được cấp lại.</p>
      </form>
    </div>
  );
}

function SetupErrorScreen({ onRetry }) {
  return (
    <div className="nb-login-wrap">
      <div className="nb-login-card" style={{ maxWidth: 420, textAlign: "center" }}>
        <div className="nb-brand-mark" style={{ width: 44, height: 44, margin: "0 auto 14px", background: "var(--red-pen)" }}>
          <AlertCircle size={22} />
        </div>
        <h2 className="nb-h2">Chưa kết nối được cơ sở dữ liệu</h2>
        <p className="nb-para" style={{ marginTop: 10 }}>
          Kiểm tra lại: đã dán đúng <strong>SUPABASE_URL</strong> và <strong>SUPABASE_ANON_KEY</strong> vào file <code>config.js</code> chưa,
          và đã chạy file <code>schema.sql</code> trong Supabase SQL Editor chưa (xem <code>huong-dan-trien-khai.md</code>).
        </p>
        <button className="nb-btn nb-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={onRetry}>Thử lại</button>
      </div>
    </div>
  );
}

function ChangePasswordModal({ currentUser, onClose, onChange }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (hashPassword(oldPw) !== currentUser.passwordHash) { setErr("Mật khẩu hiện tại không đúng."); return; }
    if (newPw.length < 4) { setErr("Mật khẩu mới cần ít nhất 4 ký tự."); return; }
    if (newPw !== confirmPw) { setErr("Mật khẩu xác nhận không khớp."); return; }
    setErr("");
    onChange(newPw);
    setOk(true);
    setTimeout(onClose, 900);
  }

  return (
    <div className="nb-modal-overlay" onClick={onClose}>
      <div className="nb-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <h3 className="nb-h3">Đổi mật khẩu</h3>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="nb-form" style={{ padding: "0 22px 22px" }}>
          <input className="nb-input" type="password" placeholder="Mật khẩu hiện tại" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
          <input className="nb-input" type="password" placeholder="Mật khẩu mới" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <input className="nb-input" type="password" placeholder="Xác nhận mật khẩu mới" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          {err && <div className="nb-login-error"><AlertCircle size={14} /> {err}</div>}
          {ok && <div className="nb-login-error" style={{ color: "var(--ac-green)", background: "rgba(46,158,109,0.1)" }}><CheckCircle2 size={14} /> Đã đổi mật khẩu.</div>}
          <button className="nb-btn nb-btn-primary" type="submit">Lưu mật khẩu mới</button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  PROBLEM SOLVER MODAL                                                    */
/* ---------------------------------------------------------------------- */

function ProblemSolverModal({ problem, onClose, onVerdict, readOnly, disabledLabel, alreadySolved, bestScore = 0, attemptCount = 0 }) {
  const [code, setCode] = useState(
    problem.isPython ? "# Viết code Python của bạn tại đây\n\n" : "// Viết code của bạn tại đây\n\n"
  );
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit() {
    if (readOnly || judging) return;
    setJudging(true);
    setResult(null);
    try {
      const r = await judgeSourceCode(problem, code);
      setResult(r);
      onVerdict && onVerdict(problem.id, r.verdict);
    } catch (error) {
      setResult({
        verdict: "SE",
        tests: [],
        message: error?.name === "AbortError"
          ? "Dịch vụ chấm phản hồi quá lâu. Em hãy thử nộp lại sau ít giây."
          : (error?.message || "Không kết nối được dịch vụ chấm."),
      });
    } finally {
      setJudging(false);
    }
  }

  return (
    <div className="nb-modal-overlay" onClick={onClose}>
      <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div>
            <div className="nb-eyebrow">{problem.id} · {problem.points} điểm</div>
            <h3 className="nb-h3">{problem.title}</h3>
          </div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="nb-modal-body">
          <div className="nb-modal-col">
            <DifficultyTag level={problem.difficulty} />
            {alreadySolved && <span className="nb-pill nb-pill-ac" style={{ marginLeft: 8 }}>Đã hoàn thành</span>}
            <p className="nb-para" style={{ marginTop: 12 }}>{problem.statement}</p>
            <div className="nb-sample">
              <div className="nb-sample-row"><span>Input mẫu</span><code>{problem.sample.input}</code></div>
              <div className="nb-sample-row"><span>Output mẫu</span><code>{problem.sample.output}</code></div>
            </div>
            {!readOnly && <div className="nb-solver-meta"><span>Điểm tốt nhất: <strong>{bestScore}/{problem.points}</strong></span><span>Đã nộp: <strong>{attemptCount}</strong> lần</span><span>{getProblemTestCases(problem).length} test case</span></div>}
          </div>

          <div className="nb-modal-col">
            <textarea
              className="nb-code-editor"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              readOnly={readOnly}
            />
            <p className="nb-sub" style={{ marginTop: 6 }}>
              Mã được biên dịch và chạy trong môi trường cô lập; kết quả được đối chiếu với test case của bài.
            </p>
            <div className="nb-modal-actions">
              <button className="nb-btn nb-btn-primary" onClick={handleSubmit} disabled={judging || readOnly}>
                {judging ? <Loader2 size={16} className="nb-spin" /> : <Play size={16} />}
                {judging ? "Đang chấm…" : readOnly ? (disabledLabel || "Không thể nộp bài") : "Nộp bài & Chấm"}
              </button>
            </div>

            {result && (
              <div className="nb-result">
                <div className="nb-result-head">
                  <VerdictPill verdict={result.verdict} />
                  {typeof result.score === "number" && <strong className="nb-result-score">+{result.score}/{problem.points} điểm</strong>}
                </div>
                {result.tests.length > 0 && (
                  <div className="nb-testrow">
                    {result.tests.map((ok, i) => (
                      <span key={i} className={"nb-testdot " + (ok ? "ok" : "fail")} title={"Test " + (i + 1)}>
                        {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      </span>
                    ))}
                  </div>
                )}
                {result.message && <p className="nb-sub" style={{ marginTop: 6 }}>{result.message}</p>}
                {result.output && <pre className="nb-result-output">{result.output}</pre>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  VIEWS                                                                   */
/* ---------------------------------------------------------------------- */

function OverviewView({ currentUser, students, submissions, points, solvedCount, contests, discussions, problemsCount }) {
  const isTeacher = currentUser.role === "teacher";

  if (!isTeacher) {
    const rankSorted = [...students].sort((a, b) => points(b.id) - points(a.id));
    const rank = rankSorted.findIndex((s) => s.id === currentUser.id) + 1;
    const activeContest = contests.find((c) => c.status === "active");
    const recentAC = submissions.filter((s) => s.studentId === currentUser.id && s.verdict === "AC").slice(-4).reverse();

    return (
      <div>
        <SectionHeading eyebrow="Trang cá nhân" title={"Chào " + currentUser.name.split(" ").slice(-1)[0] + " 👋"}
          sub="Đây là tiến độ ôn luyện của em trong đội tuyển Tin học." />
        <div className="nb-stat-grid">
          <div className="nb-stat-card"><TrendingUp size={18} /><div className="nb-stat-num">{points(currentUser.id)}</div><div className="nb-stat-label">Tổng điểm</div></div>
          <div className="nb-stat-card"><Award size={18} /><div className="nb-stat-num">#{rank}</div><div className="nb-stat-label">Xếp hạng lớp</div></div>
          <div className="nb-stat-card"><ListChecks size={18} /><div className="nb-stat-num">{solvedCount(currentUser.id)}/{problemsCount}</div><div className="nb-stat-label">Bài đã giải</div></div>
          <div className="nb-stat-card"><Flame size={18} /><div className="nb-stat-num">{currentUser.streak || 0}</div><div className="nb-stat-label">Ngày luyện liên tục</div></div>
        </div>

        <div className="nb-two-col">
          <div className="nb-panel">
            <h3 className="nb-h3" style={{ marginBottom: 10 }}>Hoạt động gần đây</h3>
            {recentAC.length === 0 ? (
              <p className="nb-sub">Chưa có bài nào được giải — bắt đầu từ tab "Luyện tập &amp; Python" nhé.</p>
            ) : (
              <ul className="nb-activity-list">
                {recentAC.map((s, i) => (
                  <li key={i}>
                    <CheckCircle2 size={15} style={{ color: "var(--ac-green)" }} />
                    <span>Đã giải <strong>{s.problemTitle}</strong></span>
                    <span className="nb-sub" style={{ marginLeft: "auto" }}>+{s.problemPoints}đ</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="nb-panel">
            <h3 className="nb-h3" style={{ marginBottom: 10 }}>Đề thi thử</h3>
            {activeContest ? (
              <div>
                <p className="nb-para">Đang mở: <strong>{activeContest.title}</strong></p>
                <p className="nb-sub">Thời gian làm bài {activeContest.duration} phút — vào tab "Đề thi thử" để bắt đầu.</p>
              </div>
            ) : (
              <p className="nb-sub">Hiện không có đề thi nào đang mở. Xem lịch ở tab "Đề thi thử".</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const avgPoints = students.length ? Math.round(students.reduce((sum, s) => sum + points(s.id), 0) / students.length) : 0;
  const topThree = [...students].sort((a, b) => points(b.id) - points(a.id)).slice(0, 3);
  const behind = [...students].sort((a, b) => solvedCount(a.id) - solvedCount(b.id)).slice(0, 3);
  const openThreads = discussions.filter((d) => d.replies.length === 0);

  return (
    <div>
      <SectionHeading eyebrow="Bảng điều khiển giáo viên" title="Tổng quan đội tuyển"
        sub={"Theo dõi tiến độ ôn luyện của " + students.length + " học sinh."} />
      <div className="nb-stat-grid">
        <div className="nb-stat-card"><Users size={18} /><div className="nb-stat-num">{students.length}</div><div className="nb-stat-label">Học sinh</div></div>
        <div className="nb-stat-card"><TrendingUp size={18} /><div className="nb-stat-num">{avgPoints}</div><div className="nb-stat-label">Điểm trung bình</div></div>
        <div className="nb-stat-card"><Code2 size={18} /><div className="nb-stat-num">{problemsCount}</div><div className="nb-stat-label">Bài tập trong ngân hàng</div></div>
        <div className="nb-stat-card"><AlertCircle size={18} /><div className="nb-stat-num">{openThreads.length}</div><div className="nb-stat-label">Câu hỏi chưa trả lời</div></div>
      </div>

      <div className="nb-two-col">
        <div className="nb-panel">
          <h3 className="nb-h3" style={{ marginBottom: 10 }}>Học sinh nổi bật</h3>
          <ul className="nb-activity-list">
            {topThree.map((s) => (
              <li key={s.id}><Avatar name={s.name} size={26} /><span>{s.name}</span>
                <span className="nb-sub" style={{ marginLeft: "auto" }}>{points(s.id)}đ</span></li>
            ))}
            {topThree.length === 0 && <p className="nb-sub">Chưa có dữ liệu.</p>}
          </ul>
        </div>
        <div className="nb-panel">
          <h3 className="nb-h3" style={{ marginBottom: 10 }}>Cần quan tâm thêm</h3>
          <ul className="nb-activity-list">
            {behind.map((s) => (
              <li key={s.id}><Avatar name={s.name} size={26} /><span>{s.name}</span>
                <span className="nb-sub" style={{ marginLeft: "auto" }}>{solvedCount(s.id)} bài đã giải</span></li>
            ))}
            {behind.length === 0 && <p className="nb-sub">Chưa có dữ liệu.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LessonDiscussion({ topic, discussions, currentUser, addThread, addReply }) {
  const [question, setQuestion] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const related = discussions.filter((discussion) => [topic.id, topic.code, topic.title].includes(discussion.topicRef));

  function submitQuestion(e) {
    e.preventDefault();
    const content = question.trim();
    if (!content) return;
    addThread({
      id: `d${Date.now()}`,
      author: currentUser.name,
      role: currentUser.role,
      topicRef: topic.id,
      content,
      replies: [],
    });
    setQuestion("");
  }

  function submitReply(threadId) {
    const content = String(replyDrafts[threadId] || "").trim();
    if (!content) return;
    addReply(threadId, { author: currentUser.name, role: currentUser.role, content });
    setReplyDrafts((current) => ({ ...current, [threadId]: "" }));
  }

  return (
    <section className="nb-lesson-discussion">
      <div className="nb-lesson-discussion-head">
        <div><div className="nb-eyebrow">Trao đổi bài học</div><h3 className="nb-h3">Hỏi đáp về chuyên đề này</h3></div>
        <span className="nb-sub">{related.length} câu hỏi</span>
      </div>
      <form className="nb-lesson-question-form" onSubmit={submitQuestion}>
        <textarea className="nb-input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Đặt câu hỏi hoặc chia sẻ điều em chưa hiểu…" />
        <button className="nb-btn nb-btn-primary" type="submit"><Send size={14} /> Đăng câu hỏi</button>
      </form>
      <div className="nb-lesson-thread-list">
        {related.map((discussion) => (
          <div className="nb-lesson-thread" key={discussion.id}>
            <div className="nb-thread-head">
              <Avatar name={discussion.author} size={28} />
              <div><strong>{discussion.author}</strong>{discussion.role === "teacher" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 6 }}>Giáo viên</span>}<div className="nb-sub">Câu hỏi về {topic.title}</div></div>
            </div>
            <p className="nb-para" style={{ margin: "9px 0" }}>{discussion.content}</p>
            {(discussion.replies || []).length > 0 && <div className="nb-reply-list">{discussion.replies.map((reply, index) => <div className="nb-reply" key={index}><Avatar name={reply.author} size={22} /><div><strong style={{ fontSize: 12 }}>{reply.author}</strong>{reply.role === "teacher" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 5 }}>GV</span>}<div className="nb-sub" style={{ color: "var(--ink)" }}>{reply.content}</div></div></div>)}</div>}
            <div className="nb-reply-form"><input className="nb-input" value={replyDrafts[discussion.id] || ""} onChange={(e) => setReplyDrafts((current) => ({ ...current, [discussion.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(discussion.id); } }} placeholder="Viết phản hồi…" /><button type="button" className="nb-icon-btn" onClick={() => submitReply(discussion.id)} aria-label="Gửi phản hồi"><Send size={15} /></button></div>
          </div>
        ))}
        {related.length === 0 && <p className="nb-sub">Chưa có câu hỏi nào. Hãy là người đầu tiên đặt câu hỏi cho chuyên đề này.</p>}
      </div>
    </section>
  );
}

function LessonsView({ isTeacher, currentUser, topics, progress, onProgressChange, discussions, addThread, addReply, addTopic, updateTopic, removeTopic }) {
  const [selectedId, setSelectedId] = useState(topics[0]?.id || null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ code: "", title: "", weeks: "", summary: "", content: "" });
  const safeProgress = progress || {};

  useEffect(() => {
    if (!topics.some((topic) => topic.id === selectedId)) setSelectedId(topics[0]?.id || null);
  }, [topics, selectedId]);

  const filteredTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    return topics.filter((topic) => {
      const matchesSearch = !query || [topic.code, topic.title, topic.summary, topic.content].some((value) => String(value || "").toLowerCase().includes(query));
      const isCompleted = Boolean(safeProgress[topic.id]?.isCompleted);
      const matchesStatus = statusFilter === "all" || (statusFilter === "completed" ? isCompleted : !isCompleted);
      return matchesSearch && matchesStatus;
    });
  }, [topics, search, statusFilter, safeProgress]);

  const selectedTopic = topics.find((topic) => topic.id === selectedId) || filteredTopics[0] || topics[0] || null;
  const completedCount = topics.filter((topic) => safeProgress[topic.id]?.isCompleted).length;
  const readCount = topics.filter((topic) => safeProgress[topic.id]?.isRead).length;
  const progressPercent = topics.length ? Math.round((completedCount / topics.length) * 100) : 0;

  function resetForm() {
    setForm({ code: "", title: "", weeks: "", summary: "", content: "" });
    setEditingId(null);
    setFormError("");
  }

  function beginAdd() { resetForm(); setShowForm(true); }
  function beginEdit(topic) {
    setEditingId(topic.id);
    setForm({ code: topic.code || "", title: topic.title || "", weeks: topic.weeks || "", summary: topic.summary || "", content: topic.content || "" });
    setFormError("");
    setShowForm(true);
  }

  function changeProgress(topicId, patch) {
    onProgressChange(topicId, { ...(safeProgress[topicId] || {}), ...patch });
  }

  function markRead(topicId) {
    const current = safeProgress[topicId] || {};
    changeProgress(topicId, { isRead: !current.isRead });
  }

  function markCompleted(topicId) {
    const current = safeProgress[topicId] || {};
    changeProgress(topicId, { isCompleted: !current.isCompleted, isRead: current.isCompleted ? current.isRead : true });
  }

  function submit(e) {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim() || !form.content.trim()) { setFormError("Cần nhập tên bài giảng và nội dung bài học."); return; }
    const topic = { id: editingId || `t${Date.now()}`, code: form.code.trim() || `CD${topics.length + (editingId ? 0 : 1)}`, title: form.title.trim(), weeks: form.weeks.trim() || "Tự học", summary: form.summary.trim() || "Chưa có mô tả ngắn.", content: form.content.trim() };
    if (editingId) updateTopic(topic); else addTopic(topic);
    setSelectedId(topic.id);
    resetForm();
    setShowForm(false);
  }

  function handleDelete(topic) {
    if (!window.confirm(`Xóa bài giảng “${topic.title}”? Không thể hoàn tác.`)) return;
    removeTopic(topic.id);
    if (selectedId === topic.id) setSelectedId(topics.find((item) => item.id !== topic.id)?.id || null);
  }

  return (
    <div>
      <SectionHeading eyebrow="Không gian học tập" title="Bài giảng & tài liệu" sub="Học theo lộ trình, đọc tài liệu tập trung và lưu lại tiến độ ôn luyện của em." />
      <div className="nb-lesson-overview">
        <div className="nb-lesson-progress-card"><div className="nb-lesson-progress-head"><span>Tiến độ hoàn thành</span><strong>{progressPercent}%</strong></div><div className="nb-progress-track"><div className="nb-progress-fill" style={{ width: `${progressPercent}%` }} /></div><p className="nb-sub">Đã hoàn thành {completedCount}/{topics.length} chuyên đề · Đã đọc {readCount}/{topics.length}</p></div>
        <div className="nb-lesson-stat-card"><BookOpen size={18} /><strong>{topics.length}</strong><span>Chuyên đề</span></div>
        <div className="nb-lesson-stat-card"><CheckCircle2 size={18} /><strong>{completedCount}</strong><span>Đã hoàn thành</span></div>
      </div>
      <div className="nb-lesson-toolbar">
        <div className="nb-lesson-search"><input className="nb-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm bài giảng, chuyên đề hoặc nội dung…" /></div>
        <div className="nb-filter-row" style={{ margin: 0 }}>{[['all', 'Tất cả'], ['todo', 'Chưa học'], ['completed', 'Đã học']].map(([key, label]) => <button key={key} className={"nb-chip " + (statusFilter === key ? "active" : "")} onClick={() => setStatusFilter(key)}>{label}</button>)}</div>
        {isTeacher && <button className="nb-btn nb-btn-primary" onClick={beginAdd}><Plus size={16} /> Thêm bài giảng</button>}
      </div>
      {isTeacher && showForm && <form onSubmit={submit} className="nb-panel nb-form nb-lesson-editor" style={{ marginBottom: 18 }}><div className="nb-editor-head"><div><div className="nb-eyebrow">{editingId ? "Chỉnh sửa" : "Tạo mới"}</div><h3 className="nb-h3">{editingId ? "Cập nhật bài giảng" : "Thêm bài giảng"}</h3></div><button type="button" className="nb-icon-btn" onClick={() => { resetForm(); setShowForm(false); }} aria-label="Đóng"><X size={18} /></button></div><div className="nb-lesson-form-grid"><input className="nb-input" placeholder="Mã chuyên đề" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><input className="nb-input" placeholder="Tên bài giảng" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input className="nb-input" placeholder="Lịch học" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} /></div><input className="nb-input" placeholder="Mô tả ngắn / mục tiêu bài học" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /><textarea className="nb-input" rows={10} placeholder="Nội dung bài giảng" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />{formError && <div className="nb-login-error"><AlertCircle size={14} /> {formError}</div>}<div className="nb-editor-actions"><button className="nb-btn nb-btn-primary" type="submit"><Save size={15} /> {editingId ? "Lưu thay đổi" : "Tạo bài giảng"}</button><button className="nb-btn nb-btn-ghost" type="button" onClick={() => { resetForm(); setShowForm(false); }}>Hủy</button></div></form>}
      <div className="nb-lesson-layout">
        <aside className="nb-lesson-catalog"><div className="nb-lesson-catalog-head"><div><div className="nb-eyebrow">Lộ trình</div><h3 className="nb-h3">Danh mục bài học</h3></div><span className="nb-sub">{filteredTopics.length}/{topics.length}</span></div><div className="nb-lesson-catalog-list">{filteredTopics.map((topic, index) => <div key={topic.id} className={"nb-lesson-catalog-item " + (selectedTopic?.id === topic.id ? "active" : "")}><button className="nb-lesson-catalog-main" onClick={() => setSelectedId(topic.id)}><span className="nb-lesson-index">{String(index + 1).padStart(2, "0")}</span><span className="nb-lesson-catalog-text"><strong>{topic.title}</strong><small>{topic.code} · {topic.weeks}</small></span>{safeProgress[topic.id]?.isCompleted && <CheckCircle2 size={15} style={{ color: "var(--ac-green)" }} />}</button>{isTeacher && <div className="nb-lesson-item-actions"><button className="nb-icon-btn" onClick={() => beginEdit(topic)} title="Sửa bài giảng" aria-label="Sửa bài giảng"><Pencil size={14} /></button><button className="nb-icon-btn" onClick={() => handleDelete(topic)} title="Xóa bài giảng" aria-label="Xóa bài giảng"><Trash2 size={14} /></button></div>}</div>)}{filteredTopics.length === 0 && <p className="nb-sub" style={{ padding: 14 }}>Không tìm thấy bài giảng phù hợp.</p>}</div></aside>
        <article className="nb-lesson-reader">{selectedTopic ? <><div className="nb-lesson-reader-top"><span className="nb-eyebrow">{selectedTopic.code} · {selectedTopic.weeks}</span><div className="nb-lesson-status-badges">{safeProgress[selectedTopic.id]?.isRead && <span className="nb-pill nb-pill-pending">Đã đọc</span>}{safeProgress[selectedTopic.id]?.isCompleted && <span className="nb-pill nb-pill-ac">Đã hoàn thành</span>}</div></div><h1 className="nb-lesson-reader-title">{selectedTopic.title}</h1><div className="nb-lesson-callout"><BookOpen size={17} /><p>{selectedTopic.summary}</p></div><div className="nb-lesson-content">{String(selectedTopic.content || "").split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{!isTeacher && <div className="nb-lesson-progress-actions"><button className={"nb-btn " + (safeProgress[selectedTopic.id]?.isRead ? "nb-btn-ghost" : "nb-btn-primary")} onClick={() => markRead(selectedTopic.id)}>{safeProgress[selectedTopic.id]?.isRead ? <><RefreshCw size={15} /> Bỏ đánh dấu đã đọc</> : <><Eye size={15} /> Đánh dấu đã đọc</>}</button><button className={"nb-btn " + (safeProgress[selectedTopic.id]?.isCompleted ? "nb-btn-ghost" : "nb-btn-primary")} onClick={() => markCompleted(selectedTopic.id)}>{safeProgress[selectedTopic.id]?.isCompleted ? <><RefreshCw size={15} /> Bỏ hoàn thành</> : <><CheckCircle2 size={15} /> Đánh dấu hoàn thành</>}</button></div>}<LessonDiscussion topic={selectedTopic} discussions={discussions} currentUser={currentUser} addThread={addThread} addReply={addReply} /></> : <div className="nb-lesson-empty"><BookOpen size={30} /><h3 className="nb-h3">Chưa có bài giảng</h3><p className="nb-sub">Hãy chọn một bài trong danh mục hoặc tạo bài giảng mới.</p></div>}</article>
      </div>
    </div>
  );
}

function ProblemsView({ isTeacher, currentUser, problems, submissions, points, addProblem, updateProblem, removeProblem, solvedByCurrent, onVerdict, topics }) {
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(() => createProblemForm(topics[0]?.id));

  const filtered = problems.filter((p) => {
    if (filter === "python") return p.isPython;
    if (filter === "algo") return !p.isPython;
    return true;
  });

  const completedCount = problems.filter((p) => solvedByCurrent(p.id)).length;
  const currentSubmissions = submissions.filter((s) => s.studentId === currentUser?.id);
  const attemptsCount = currentSubmissions.length;

  function problemStats(problemId) {
    const attempts = currentSubmissions.filter((s) => s.problemId === problemId);
    return {
      attempts: attempts.length,
      bestScore: attempts.reduce((best, s) => Math.max(best, Number(s.score ?? (s.verdict === "AC" ? s.problemPoints : 0))), 0),
    };
  }

  function resetForm() {
    setForm(createProblemForm(topics[0]?.id));
    setEditingId(null);
    setFormError("");
  }

  function beginAdd() {
    resetForm();
    setShowForm(true);
  }

  function beginEdit(problem) {
    setEditingId(problem.id);
    setForm({
      title: problem.title || "",
      topic: problem.topic || topics[0]?.id,
      difficulty: problem.difficulty || "Dễ",
      points: problem.points || 100,
      statement: problem.statement || "",
      sampleInput: problem.sample?.input === "—" ? "" : (problem.sample?.input || ""),
      sampleOutput: problem.sample?.output === "—" ? "" : (problem.sample?.output || ""),
      testCases: normalizeTestCases(problem.testCases).length > 0 ? normalizeTestCases(problem.testCases) : [createEmptyTestCase()],
      isPython: Boolean(problem.isPython),
    });
    setFormError("");
    setShowForm(true);
  }

  function updateTestCase(id, field, value) {
    setForm((current) => ({
      ...current,
      testCases: current.testCases.map((test) => test.id === id ? { ...test, [field]: value } : test),
    }));
  }

  function addTestCase() {
    setForm((current) => ({ ...current, testCases: [...current.testCases, createEmptyTestCase()] }));
  }

  function removeTestCase(id) {
    setForm((current) => ({
      ...current,
      testCases: current.testCases.length > 1 ? current.testCases.filter((test) => test.id !== id) : [createEmptyTestCase()],
    }));
  }

  function submit(e) {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim() || !form.statement.trim()) {
      setFormError("Cần nhập tên bài và đề bài.");
      return;
    }
    const pointsValue = Math.max(1, Number(form.points) || 100);
    const testCases = form.testCases
      .map((test) => ({ ...test, input: String(test.input || ""), output: String(test.output || "") }))
      .filter((test) => test.input.trim() || test.output.trim());
    if (testCases.some((test) => !test.output.trim())) {
      setFormError("Mỗi test case đã nhập phải có output kỳ vọng. Nếu bài không cần test đó, hãy xóa dòng.");
      return;
    }
    if (testCases.length === 0 && !form.sampleOutput.trim()) {
      setFormError("Hãy thêm ít nhất một test case hoặc nhập output mẫu.");
      return;
    }

    const problem = {
      id: editingId || ("PX" + Date.now()),
      title: form.title.trim(),
      topic: form.topic || topics[0]?.id || "",
      difficulty: form.difficulty,
      points: pointsValue,
      isPython: form.isPython,
      statement: form.statement.trim(),
      sample: { input: form.sampleInput.trim() || "—", output: form.sampleOutput.trim() || "—" },
      testCases,
    };
    if (editingId) updateProblem(problem);
    else addProblem(problem);
    resetForm();
    setShowForm(false);
  }

  function handleDelete(problem) {
    if (!window.confirm(`Xóa bài “${problem.title}”? Các submission cũ có thể không còn hiển thị đúng.`)) return;
    removeProblem(problem.id);
    if (active?.id === problem.id) setActive(null);
    if (editingId === problem.id) {
      resetForm();
      setShowForm(false);
    }
  }

  return (
    <div>
      <SectionHeading eyebrow="Ngân hàng bài tập" title="Luyện tập & Python"
        sub="Mỗi lần nộp được chấm qua test case; điểm tổng chỉ giữ thành tích tốt nhất của từng bài." />

      {!isTeacher && (
        <div className="nb-practice-summary">
          <div className="nb-practice-summary-card"><Code2 size={17} /><strong>{completedCount}/{problems.length}</strong><span>Bài đã hoàn thành</span></div>
          <div className="nb-practice-summary-card"><Award size={17} /><strong>{points(currentUser.id)}</strong><span>Điểm tích lũy</span></div>
          <div className="nb-practice-summary-card"><TrendingUp size={17} /><strong>{attemptsCount}</strong><span>Lượt nộp</span></div>
        </div>
      )}

      <div className="nb-filter-row">
        {[['all', 'Tất cả'], ['algo', 'Thuật toán'], ['python', 'Python cơ bản']].map(([key, label]) => (
          <button key={key} className={"nb-chip " + (filter === key ? "active" : "")} onClick={() => setFilter(key)}>{label}</button>
        ))}
        {isTeacher && (
          <button className="nb-btn nb-btn-primary" style={{ marginLeft: "auto" }} onClick={beginAdd}>
            <Plus size={16} /> Thêm bài tập
          </button>
        )}
      </div>

      {isTeacher && (
        <div className="nb-panel nb-management-panel">
          <div className="nb-management-head">
            <div>
              <div className="nb-eyebrow">Khu vực giáo viên</div>
              <h3 className="nb-h3">Quản lý bài tập</h3>
            </div>
            <span className="nb-sub">{problems.length} bài · {problems.reduce((sum, p) => sum + getProblemTestCases(p).length, 0)} test case</span>
          </div>
          <div className="nb-management-list">
            {problems.map((problem) => (
              <div key={problem.id} className="nb-management-row">
                <div className="nb-management-info">
                  <span className="nb-eyebrow">{problem.id}</span>
                  <strong>{problem.title}</strong>
                  <span className="nb-sub">{problem.isPython ? "Python" : "Thuật toán"} · {problem.points} điểm · {getProblemTestCases(problem).length} test</span>
                </div>
                <div className="nb-management-actions">
                  <button type="button" className="nb-btn nb-btn-ghost" onClick={() => beginEdit(problem)}><Pencil size={14} /> Sửa</button>
                  <button type="button" className="nb-btn nb-btn-danger" onClick={() => handleDelete(problem)}><Trash2 size={14} /> Xóa</button>
                </div>
              </div>
            ))}
            {problems.length === 0 && <p className="nb-sub">Chưa có bài tập nào.</p>}
          </div>
        </div>
      )}

      {isTeacher && showForm && (
        <form onSubmit={submit} className="nb-form nb-panel nb-problem-editor" style={{ marginBottom: 16 }}>
          <div className="nb-editor-head">
            <div>
              <div className="nb-eyebrow">{editingId ? "Chỉnh sửa" : "Tạo mới"}</div>
              <h3 className="nb-h3">{editingId ? "Cập nhật bài tập" : "Thêm bài tập"}</h3>
            </div>
            <button type="button" className="nb-icon-btn" onClick={() => { resetForm(); setShowForm(false); }} aria-label="Đóng"><X size={18} /></button>
          </div>
          <input className="nb-input" placeholder="Tên bài tập" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select className="nb-input" value={form.topic || ""} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
              <option value="">Chọn chuyên đề</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <select className="nb-input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input className="nb-input" type="number" min="1" placeholder="Điểm" value={form.points}
              onChange={(e) => setForm({ ...form, points: e.target.value })} />
          </div>
          <textarea className="nb-input" placeholder="Đề bài" rows={4} value={form.statement}
            onChange={(e) => setForm({ ...form, statement: e.target.value })} />
          <div className="nb-form-section-label">Ví dụ hiển thị cho học sinh</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <textarea className="nb-input" rows={3} placeholder="Input mẫu" value={form.sampleInput}
              onChange={(e) => setForm({ ...form, sampleInput: e.target.value })} />
            <textarea className="nb-input" rows={3} placeholder="Output mẫu" value={form.sampleOutput}
              onChange={(e) => setForm({ ...form, sampleOutput: e.target.value })} />
          </div>
          <div className="nb-form-section-label">Test case chấm điểm</div>
          <p className="nb-sub">Mỗi dòng là một test case. Input có thể để trống nếu bài không cần dữ liệu đầu vào. Output là kết quả kỳ vọng bắt buộc.</p>
          <div className="nb-testcase-editor">
            {form.testCases.map((test, index) => (
              <div className="nb-testcase-card" key={test.id}>
                <div className="nb-testcase-head">
                  <strong>Test {index + 1}</strong>
                  <button type="button" className="nb-icon-btn" onClick={() => removeTestCase(test.id)} title="Xóa test case" aria-label={`Xóa test ${index + 1}`}><Trash2 size={15} /></button>
                </div>
                <div className="nb-testcase-grid">
                  <textarea className="nb-input nb-mono" rows={3} placeholder="Input chạy thử" value={test.input}
                    onChange={(e) => updateTestCase(test.id, "input", e.target.value)} />
                  <textarea className="nb-input nb-mono" rows={3} placeholder="Output kỳ vọng" value={test.output}
                    onChange={(e) => updateTestCase(test.id, "output", e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="nb-btn nb-btn-ghost" onClick={addTestCase}><Plus size={15} /> Thêm test case</button>
          <p className="nb-sub">Lưu ý: trong kiến trúc frontend hiện tại, test case có thể bị xem qua Network. Muốn ẩn tuyệt đối, cần chuyển bộ chấm sang server.</p>
          {formError && <div className="nb-login-error"><AlertCircle size={14} /> {formError}</div>}
          <label className="nb-checkbox-label">
            <input type="checkbox" checked={form.isPython} onChange={(e) => setForm({ ...form, isPython: e.target.checked })} />
            Gắn nhãn “Python cơ bản”
          </label>
          <div className="nb-editor-actions">
            <button className="nb-btn nb-btn-primary" type="submit"><Save size={15} /> {editingId ? "Lưu thay đổi" : "Tạo bài tập"}</button>
            <button className="nb-btn nb-btn-ghost" type="button" onClick={() => { resetForm(); setShowForm(false); }}>Hủy</button>
          </div>
        </form>
      )}

      <div className="nb-problem-grid">
        {filtered.map((p) => {
          const solved = solvedByCurrent(p.id);
          const stats = problemStats(p.id);
          return (
            <button key={p.id} className="nb-problem-card" onClick={() => setActive(p)}>
              <div className="nb-problem-top">
                <span className="nb-eyebrow">{p.id}</span>
                {solved && <CheckCircle2 size={16} style={{ color: "var(--ac-green)" }} />}
              </div>
              <div className="nb-problem-title">{p.title}</div>
              <div className="nb-problem-bottom">
                <DifficultyTag level={p.difficulty} />
                <span className="nb-sub">{p.points}đ · {getProblemTestCases(p).length} test</span>
              </div>
              <div className="nb-problem-meta">
                <span>{stats.attempts} lượt nộp</span>
                <strong>{stats.bestScore}/{p.points}đ</strong>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="nb-sub">Chưa có bài tập nào trong mục này.</p>}
      </div>

      {active && (
        <ProblemSolverModal
          problem={active}
          onClose={() => setActive(null)}
          readOnly={isTeacher}
          disabledLabel={isTeacher ? "Chỉ xem trước (GV)" : undefined}
          alreadySolved={solvedByCurrent(active.id)}
          bestScore={problemStats(active.id).bestScore}
          attemptCount={problemStats(active.id).attempts}
          onVerdict={(problemId, result) => onVerdict(problemId, result)}
        />
      )}
    </div>
  );
}

function ContestRunner({ contest, onExit, isTeacher, solvedByCurrent, onVerdict, problems }) {
  const [remaining, setRemaining] = useState(0);
  const [ready, setReady] = useState(isTeacher);
  const [locked, setLocked] = useState(isTeacher);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (isTeacher) return;
    const key = "contest-start:" + contest.id;
    let startTs = lsGet(key);
    if (!startTs) {
      startTs = Date.now();
      lsSet(key, startTs);
    }
    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    const left = Math.max(0, contest.duration * 60 - elapsed);
    setRemaining(left);
    setLocked(left <= 0);
    setReady(true);
  }, [contest.id, isTeacher, contest.duration]);

  useEffect(() => {
    if (isTeacher || !ready || locked) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { setLocked(true); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isTeacher, ready, locked]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const contestProblems = problems.filter((p) => contest.problemIds.includes(p.id));
  const doneCount = contestProblems.filter((p) => solvedByCurrent(p.id)).length;

  return (
    <div>
      <div className="nb-contest-bar">
        <button className="nb-btn nb-btn-ghost" onClick={onExit}><ChevronLeft size={16} /> Rời khỏi đề thi</button>
        <div className="nb-contest-timer">
          {isTeacher ? "Chế độ xem trước (GV)" : !ready ? "Đang tải…" : locked ? "Đã hết giờ" : <><Clock size={15} /> {mm}:{ss}</>}
        </div>
        <div className="nb-sub">{doneCount}/{contestProblems.length} bài đã hoàn thành</div>
      </div>
      {locked && !isTeacher && (
        <div className="nb-locked-banner">
          <AlertCircle size={15} /> Đã hết giờ làm bài. Em vẫn có thể xem lại đề nhưng không thể nộp bài mới.
        </div>
      )}
      <div className="nb-problem-grid">
        {contestProblems.map((p) => {
          const solved = solvedByCurrent(p.id);
          return (
            <button key={p.id} className="nb-problem-card" onClick={() => setActive(p)}>
              <div className="nb-problem-top">
                <span className="nb-eyebrow">{p.id}</span>
                {solved && <CheckCircle2 size={16} style={{ color: "var(--ac-green)" }} />}
              </div>
              <div className="nb-problem-title">{p.title}</div>
              <div className="nb-problem-bottom">
                <DifficultyTag level={p.difficulty} />
                <span className="nb-sub">{p.points}đ</span>
              </div>
            </button>
          );
        })}
      </div>
      {active && (
        <ProblemSolverModal
          problem={active}
          onClose={() => setActive(null)}
          readOnly={isTeacher || locked}
          disabledLabel={isTeacher ? "Chỉ xem trước (GV)" : locked ? "Đã hết giờ" : undefined}
          alreadySolved={solvedByCurrent(active.id)}
          onVerdict={(problemId, verdict) => onVerdict(problemId, verdict)}
        />
      )}
    </div>
  );
}

function ContestsView({ contests, isTeacher, students, points, problems, addContest, setContestStatus, solvedByCurrent, onVerdict }) {
  const [running, setRunning] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", duration: 90, problemIds: [] });

  const statusMeta = {
    active: { label: "Đang mở", cls: "nb-pill-ac" },
    upcoming: { label: "Sắp diễn ra", cls: "nb-pill-pending" },
    completed: { label: "Đã kết thúc", cls: "nb-pill-wa" },
  };

  function toggleProblem(id) {
    setForm((f) => ({ ...f, problemIds: f.problemIds.includes(id) ? f.problemIds.filter((x) => x !== id) : [...f.problemIds, id] }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.title.trim() || form.problemIds.length === 0) return;
    addContest({
      id: "kt" + Date.now(), title: form.title, status: "upcoming",
      date: form.date || "Chưa xếp lịch", duration: Number(form.duration) || 60, problemIds: form.problemIds,
    });
    setForm({ title: "", date: "", duration: 90, problemIds: [] });
    setShowForm(false);
  }

  if (running) {
    return (
      <ContestRunner
        contest={running} onExit={() => setRunning(null)} isTeacher={isTeacher}
        problems={problems} solvedByCurrent={solvedByCurrent} onVerdict={onVerdict}
      />
    );
  }

  return (
    <div>
      <SectionHeading eyebrow="Kiểm tra định kỳ" title="Đề thi thử có tính giờ"
        sub="Mô phỏng áp lực phòng thi thật — đồng hồ đếm ngược, chấm tự động." />

      {isTeacher && (
        <div className="nb-panel" style={{ marginBottom: 16 }}>
          <button className="nb-btn nb-btn-ghost" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> {showForm ? "Đóng" : "Tạo đề thi mới"}
          </button>
          {showForm && (
            <form onSubmit={submit} className="nb-form">
              <input className="nb-input" placeholder="Tên đề thi" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input className="nb-input" placeholder="Ngày thi (vd: 20/08/2026)" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <input className="nb-input" type="number" placeholder="Số phút" value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })} />
              </div>
              <div className="nb-sub">Chọn bài tập đưa vào đề:</div>
              <div className="nb-checklist">
                {problems.map((p) => (
                  <label key={p.id} className="nb-checkbox-label">
                    <input type="checkbox" checked={form.problemIds.includes(p.id)} onChange={() => toggleProblem(p.id)} />
                    {p.id} · {p.title}
                  </label>
                ))}
              </div>
              <button className="nb-btn nb-btn-primary" type="submit">Tạo đề thi</button>
            </form>
          )}
        </div>
      )}

      <div className="nb-contest-list">
        {contests.map((c) => {
          const meta = statusMeta[c.status] || statusMeta.upcoming;
          return (
            <div key={c.id} className="nb-panel nb-contest-card">
              <div>
                <div className="nb-eyebrow">{c.date} · {c.duration} phút · {c.problemIds.length} bài</div>
                <h3 className="nb-h3">{c.title}</h3>
              </div>
              <div className="nb-contest-actions">
                <span className={"nb-pill " + meta.cls}>{meta.label}</span>
                {!isTeacher && c.status === "upcoming" && (
                  <span className="nb-sub"><Lock size={13} style={{ marginRight: 4 }} />Chưa mở</span>
                )}
                {(isTeacher || c.status !== "upcoming") && (
                  <button className="nb-btn nb-btn-primary" onClick={() => setRunning(c)}>
                    {c.status === "completed" ? "Xem lại đề" : isTeacher ? "Xem trước đề" : "Vào thi"}
                  </button>
                )}
                {isTeacher && c.status === "upcoming" && (
                  <button className="nb-btn nb-btn-ghost" onClick={() => setContestStatus(c.id, "active")}>Mở đề thi</button>
                )}
                {isTeacher && c.status === "active" && (
                  <button className="nb-btn nb-btn-ghost" onClick={() => setContestStatus(c.id, "completed")}>Đóng đề thi</button>
                )}
              </div>
              {c.status === "completed" && (
                <div className="nb-mini-leaderboard">
                  {[...students]
                    .sort((a, b) => points(b.id) - points(a.id))
                    .slice(0, 5)
                    .map((s, i) => (
                      <div key={s.id} className="nb-mini-row">
                        <span className="nb-eyebrow">#{i + 1}</span>
                        <Avatar name={s.name} size={22} />
                        <span>{s.name}</span>
                        <span className="nb-sub" style={{ marginLeft: "auto" }}>{points(s.id)}đ</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
        {contests.length === 0 && <p className="nb-sub">Chưa có đề thi nào được tạo.</p>}
      </div>
    </div>
  );
}

function LeaderboardView({ students, points, solvedCount, currentUser, problemsCount }) {
  const sorted = useMemo(() => [...students].sort((a, b) => points(b.id) - points(a.id)), [students, points]);
  const chartData = sorted.slice(0, 10).map((s) => ({ name: s.name.split(" ").slice(-1)[0], full: s.name, pts: points(s.id) }));

  return (
    <div>
      <SectionHeading eyebrow="Thi đua" title="Bảng xếp hạng đội tuyển" sub="Cập nhật theo thời gian thực dựa trên số bài đã giải." />
      <div className="nb-panel" style={{ marginBottom: 20 }}>
        <SimpleBarChart data={chartData} highlightName={currentUser.name} />
      </div>

      <div className="nb-panel nb-table-wrap">
        <table className="nb-table">
          <thead>
            <tr><th>#</th><th>Học sinh</th><th>Bài đã giải</th><th>Điểm</th></tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.id} className={s.id === currentUser.id ? "me" : ""}>
                <td className="nb-eyebrow">{i + 1}</td>
                <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={s.name} size={24} />{s.name}</div></td>
                <td>{solvedCount(s.id)}/{problemsCount}</td>
                <td><strong>{points(s.id)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiscussionView({ discussions, addThread, addReply, currentUser }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ topicRef: "", content: "" });
  const [replyDraft, setReplyDraft] = useState({});

  function submitThread(e) {
    e.preventDefault();
    if (!form.content.trim()) return;
    addThread({
      id: "d" + Date.now(), author: currentUser.name, role: currentUser.role,
      topicRef: form.topicRef || "Câu hỏi chung", content: form.content, replies: [],
    });
    setForm({ topicRef: "", content: "" });
    setShowForm(false);
  }

  function submitReply(threadId) {
    const text = (replyDraft[threadId] || "").trim();
    if (!text) return;
    addReply(threadId, { author: currentUser.name, role: currentUser.role, content: text });
    setReplyDraft({ ...replyDraft, [threadId]: "" });
  }

  return (
    <div>
      <SectionHeading eyebrow="Hỏi đáp" title="Thảo luận học sinh — giáo viên" sub="Đặt câu hỏi về bài tập hoặc chuyên đề, nhận phản hồi trực tiếp." />

      <div className="nb-panel" style={{ marginBottom: 18 }}>
        <button className="nb-btn nb-btn-ghost" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {showForm ? "Đóng" : "Đặt câu hỏi mới"}
        </button>
        {showForm && (
          <form onSubmit={submitThread} className="nb-form">
            <input className="nb-input" placeholder="Liên quan đến bài / chuyên đề nào? (không bắt buộc)"
              value={form.topicRef} onChange={(e) => setForm({ ...form, topicRef: e.target.value })} />
            <textarea className="nb-input" placeholder="Nội dung câu hỏi" rows={3}
              value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <button className="nb-btn nb-btn-primary" type="submit"><Send size={14} /> Đăng câu hỏi</button>
          </form>
        )}
      </div>

      <div className="nb-thread-list">
        {discussions.map((d) => (
          <div key={d.id} className="nb-panel nb-thread">
            <div className="nb-thread-head">
              <Avatar name={d.author} size={30} />
              <div>
                <div style={{ fontWeight: 600 }}>{d.author} {d.role === "teacher" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 6 }}>Giáo viên</span>}</div>
                <div className="nb-eyebrow">{d.topicRef}</div>
              </div>
            </div>
            <p className="nb-para" style={{ margin: "10px 0" }}>{d.content}</p>
            {d.replies.length > 0 && (
              <div className="nb-reply-list">
                {d.replies.map((r, i) => (
                  <div key={i} className="nb-reply">
                    <Avatar name={r.author} size={22} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.author} {r.role === "teacher" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 6 }}>Giáo viên</span>}</div>
                      <div className="nb-sub" style={{ color: "var(--ink)" }}>{r.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="nb-reply-form">
              <input className="nb-input" placeholder="Viết phản hồi…" value={replyDraft[d.id] || ""}
                onChange={(e) => setReplyDraft({ ...replyDraft, [d.id]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && submitReply(d.id)} />
              <button className="nb-icon-btn" onClick={() => submitReply(d.id)} aria-label="Gửi"><Send size={15} /></button>
            </div>
          </div>
        ))}
        {discussions.length === 0 && <p className="nb-sub">Chưa có câu hỏi nào.</p>}
      </div>
    </div>
  );
}

function AccountsView({ accounts, resetPassword, addAccount, removeAccount, currentUser }) {
  const [resetDrafts, setResetDrafts] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "" });

  function doReset(id) {
    const val = (resetDrafts[id] || "").trim();
    if (val.length < 4) return;
    resetPassword(id, val);
    setResetDrafts({ ...resetDrafts, [id]: "" });
  }

  function submitAdd(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) return;
    if (accounts.some((a) => a.username.toLowerCase() === form.username.trim().toLowerCase())) {
      alert("Tên đăng nhập này đã tồn tại, hãy chọn tên khác.");
      return;
    }
    addAccount({ name: form.name.trim(), username: form.username.trim(), password: form.password.trim() });
    setForm({ name: "", username: "", password: "" });
    setShowAdd(false);
  }

  return (
    <div>
      <SectionHeading eyebrow="Quản trị" title="Quản lý tài khoản" sub="Cấp phát và đặt lại mật khẩu cho các thành viên trong lớp." />

      <div className="nb-panel" style={{ marginBottom: 16 }}>
        <button className="nb-btn nb-btn-ghost" onClick={() => setShowAdd((v) => !v)}>
          <Plus size={16} /> {showAdd ? "Đóng" : "Thêm học sinh mới"}
        </button>
        {showAdd && (
          <form onSubmit={submitAdd} className="nb-form">
            <input className="nb-input" placeholder="Họ tên học sinh" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="nb-input" placeholder="Tên đăng nhập (vd: hs21)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input className="nb-input" placeholder="Mật khẩu ban đầu" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button className="nb-btn nb-btn-primary" type="submit">Tạo tài khoản</button>
          </form>
        )}
      </div>

      <div className="nb-panel nb-table-wrap">
        <table className="nb-table">
          <thead>
            <tr><th>Họ tên</th><th>Vai trò</th><th>Tên đăng nhập</th><th>Trạng thái mật khẩu</th><th>Đặt lại mật khẩu</th><th></th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}{a.id === currentUser.id && <span className="nb-sub"> (bạn)</span>}</td>
                <td>{a.role === "teacher" ? "Giáo viên" : "Học sinh"}</td>
                <td className="nb-mono">{a.username}</td>
                <td>
                  {a.passwordChanged
                    ? <span className="nb-pill nb-pill-ac">Đã đổi</span>
                    : <span className="nb-pill nb-pill-pending">Mặc định: {a.plainInitial}</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="nb-input" style={{ width: 110 }} placeholder="Mật khẩu mới"
                      value={resetDrafts[a.id] || ""} onChange={(e) => setResetDrafts({ ...resetDrafts, [a.id]: e.target.value })} />
                    <button className="nb-btn nb-btn-ghost" type="button" onClick={() => doReset(a.id)}>Đặt lại</button>
                  </div>
                </td>
                <td>
                  {a.role === "student" && (
                    <button className="nb-icon-btn" title="Xoá tài khoản"
                      onClick={() => { if (window.confirm("Xoá tài khoản " + a.name + "? Không thể hoàn tác.")) removeAccount(a.id); }}>
                      <X size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  APP SHELL                                                               */
/* ---------------------------------------------------------------------- */

const BASE_NAV = [
  { key: "overview", label: "Tổng quan", shortLabel: "Tổng quan", icon: Home },
  { key: "lessons", label: "Bài giảng", shortLabel: "Bài giảng", icon: BookOpen },
  { key: "problems", label: "Luyện tập & Python", shortLabel: "Luyện tập", icon: Code2 },
  { key: "contests", label: "Đề thi thử", shortLabel: "Đề thi", icon: Clock },
  { key: "leaderboard", label: "Bảng xếp hạng", shortLabel: "Xếp hạng", icon: Trophy },
  { key: "discussion", label: "Thảo luận", shortLabel: "Thảo luận", icon: MessageSquare },
];
const ACCOUNTS_NAV = { key: "accounts", label: "Quản lý tài khoản", shortLabel: "Tài khoản", icon: Users };

function App() {
  const [tab, setTab] = useState("overview");
  const [topics, setTopics] = useState([]);
  const [problems, setProblems] = useState([]);
  const [contests, setContests] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [lessonProgress, setLessonProgress] = useState({});
  const [authUserId, setAuthUserId] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [storageError, setStorageError] = useState(false);

  const currentUser = accounts.find((a) => a.id === authUserId) || null;
  const isTeacher = currentUser?.role === "teacher";
  const students = accounts.filter((a) => a.role === "student");

  const runInitialLoad = useCallback(async () => {
    setLoading(true);
    setSetupError(false);
    try {
      const data = await fetchAll();
      setTopics(data.topics);
      setProblems(data.problems);
      setContests(data.contests);
      setSubmissions(data.submissions);
      setDiscussions(data.discussions);
      setAccounts(data.accounts);
      const sessionUserId = lsGet("session-user");
      if (sessionUserId && data.accounts.some((a) => a.id === sessionUserId)) setAuthUserId(sessionUserId);
    } catch (e) {
      setSetupError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { runInitialLoad(); }, [runInitialLoad]);

  useEffect(() => {
    if (!currentUser || isTeacher) {
      setLessonProgress({});
      return undefined;
    }
    let cancelled = false;
    fetchLessonProgress(currentUser.id)
      .then((data) => { if (!cancelled) setLessonProgress(data); })
      .catch(() => { if (!cancelled) setLessonProgress({}); });
    return () => { cancelled = true; };
  }, [currentUser?.id, isTeacher]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchAll();
        setTopics(data.topics);
        setProblems(data.problems);
        setContests(data.contests);
        setSubmissions(data.submissions);
        setDiscussions(data.discussions);
        setAccounts(data.accounts);
        setStorageError(false);
      } catch (e) { /* transient network hiccup, ignore silently */ }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  async function refreshNow() {
    setRefreshing(true);
    try {
      const data = await fetchAll();
      setTopics(data.topics);
      setProblems(data.problems);
      setContests(data.contests);
      setSubmissions(data.submissions);
      setDiscussions(data.discussions);
      setAccounts(data.accounts);
      setStorageError(false);
    } catch (e) {
      setStorageError(true);
    }
    setRefreshing(false);
  }

  async function handleLogin(username, password) {
    setLoginError("");
    setLoginBusy(true);
    await new Promise((r) => setTimeout(r, 250));
    const uname = username.toLowerCase();
    const acc = accounts.find((a) => a.username.toLowerCase() === uname);
    if (!acc || acc.passwordHash !== hashPassword(password)) {
      setLoginError("Sai tên đăng nhập hoặc mật khẩu.");
      setLoginBusy(false);
      return;
    }
    setAuthUserId(acc.id);
    setLoginBusy(false);
    lsSet("session-user", acc.id);
  }

  function handleLogout() {
    setAuthUserId(null);
    lsSet("session-user", null);
  }

  const points = (studentId) => {
    const bestByProblem = new Map();
    submissions
      .filter((s) => s.studentId === studentId)
      .forEach((s) => {
        const score = Math.max(0, Number(s.score ?? (s.verdict === "AC" ? s.problemPoints : 0)));
        bestByProblem.set(s.problemId, Math.max(bestByProblem.get(s.problemId) || 0, score));
      });
    return [...bestByProblem.values()].reduce((sum, score) => sum + score, 0);
  };

  const solvedCount = (studentId) =>
    new Set(submissions.filter((s) => s.studentId === studentId && s.verdict === "AC").map((s) => s.problemId)).size;

  const solvedByCurrent = (problemId) =>
    !!currentUser && !isTeacher && submissions.some((s) => s.studentId === currentUser.id && s.problemId === problemId && s.verdict === "AC");

  function registerVerdict(problemId, result) {
    if (!currentUser || isTeacher) return;
    const p = problems.find((pp) => pp.id === problemId);
    const verdict = typeof result === "string" ? result : result?.verdict;
    if (!verdict) return;
    const score = typeof result === "object"
      ? Math.max(0, Math.min(Number(p?.points) || 0, Number(result.score) || 0))
      : (verdict === "AC" ? (p?.points || 0) : 0);
    const sub = {
      id: "sub" + Date.now() + Math.random().toString(36).slice(2, 6),
      studentId: currentUser.id,
      problemId,
      verdict,
      score,
      passedTests: typeof result === "object" ? result.passedTests ?? null : null,
      totalTests: typeof result === "object" ? result.totalTests ?? null : null,
      problemTitle: p ? p.title : problemId,
      problemPoints: p ? p.points : 0,
    };
    setSubmissions((prev) => [...prev, sub]);
    dbAddSubmission(sub).catch(() => setStorageError(true));
  }

  function handleLessonProgress(topicId, progress) {
    if (!currentUser || isTeacher) return;
    setLessonProgress((prev) => ({ ...prev, [topicId]: progress }));
    dbSetLessonProgress(currentUser.id, topicId, progress).catch(() => setStorageError(true));
  }

  function addTopic(t) {
    setTopics((prev) => [...prev, t]);
    dbAddTopic(t).catch(() => setStorageError(true));
  }
  function updateTopic(t) {
    setTopics((prev) => prev.map((item) => item.id === t.id ? t : item));
    dbUpdateTopic(t).catch(() => setStorageError(true));
  }
  function removeTopic(id) {
    setTopics((prev) => prev.filter((item) => item.id !== id));
    dbRemoveTopic(id).catch(() => setStorageError(true));
  }
  function addProblem(p) {
    setProblems((prev) => [...prev, p]);
    dbAddProblem(p).catch(() => setStorageError(true));
  }
  function updateProblem(p) {
    setProblems((prev) => prev.map((item) => item.id === p.id ? p : item));
    dbUpdateProblem(p).catch(() => setStorageError(true));
  }
  function removeProblem(id) {
    setProblems((prev) => prev.filter((item) => item.id !== id));
    dbRemoveProblem(id).catch(() => setStorageError(true));
  }
  function addContest(c) {
    setContests((prev) => [...prev, c]);
    dbAddContest(c).catch(() => setStorageError(true));
  }
  function setContestStatus(id, status) {
    setContests((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    dbSetContestStatus(id, status).catch(() => setStorageError(true));
  }
  function addThread(t) {
    setDiscussions((prev) => [t, ...prev]);
    dbAddThread(t).catch(() => setStorageError(true));
  }
  function addReply(threadId, reply) {
    setDiscussions((prev) => prev.map((d) => (d.id === threadId ? { ...d, replies: [...d.replies, reply] } : d)));
    dbAddReply(threadId, reply).catch(() => setStorageError(true));
  }
  function resetPassword(id, newPassword) {
    const hash = hashPassword(newPassword);
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, passwordHash: hash, passwordChanged: true, plainInitial: undefined } : a)));
    dbUpdatePassword(id, hash).catch(() => setStorageError(true));
  }
  function addAccount({ name, username, password }) {
    const acc = {
      id: "hs" + Date.now(), name, role: "student", username,
      passwordHash: hashPassword(password), plainInitial: password, passwordChanged: false,
      className: "11 Tin", streak: 0,
    };
    setAccounts((prev) => [...prev, acc]);
    dbAddAccount(acc).catch(() => setStorageError(true));
  }
  function removeAccount(id) {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    dbRemoveAccount(id).catch(() => setStorageError(true));
  }
  function selfChangePassword(newPassword) {
    if (!currentUser) return;
    const hash = hashPassword(newPassword);
    setAccounts((prev) => prev.map((a) => (a.id === currentUser.id ? { ...a, passwordHash: hash, passwordChanged: true, plainInitial: undefined } : a)));
    dbUpdatePassword(currentUser.id, hash).catch(() => setStorageError(true));
  }

  const navItems = isTeacher ? [...BASE_NAV, ACCOUNTS_NAV] : BASE_NAV;
  const activeTabLabel = navItems.find((n) => n.key === tab)?.label;

  return (
    <div className="nb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        .nb-root {
          --ink: #10151C;
          --ink-soft: #1B2432;
          --paper: #F7F4EA;
          --paper-line: #E1D9C0;
          --red-pen: #B23A3A;
          --pen-blue: #2C4A8C;
          --gold: #B9822F;
          --ac-green: #2E9E6D;
          --slate: #6B7280;
          font-family: 'Be Vietnam Pro', sans-serif;
          color: var(--ink);
          background: var(--ink);
          display: flex;
          min-height: 100dvh;
          overflow: hidden;
        }
        .nb-mono { font-family: 'JetBrains Mono', monospace; }
        .nb-only-mobile { display: none; }

        .nb-sidebar {
          width: 230px; flex-shrink: 0; background: var(--ink); color: #C6CDDA;
          display: flex; flex-direction: column; position: relative; padding: 22px 14px;
        }
        .nb-sidebar::before {
          content: ""; position: absolute; left: 10px; top: 0; bottom: 0; width: 1px;
          background-image: radial-gradient(circle, rgba(255,255,255,0.14) 1.5px, transparent 1.5px);
          background-size: 100% 22px;
        }
        .nb-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 20px 14px; }
        .nb-brand-mark {
          width: 34px; height: 34px; border-radius: 8px; background: var(--red-pen);
          display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0;
        }
        .nb-brand-text { line-height: 1.15; }
        .nb-brand-text b { font-size: 14px; color: #fff; display: block; }
        .nb-brand-text span { font-size: 11px; color: #8D97A8; font-family: 'JetBrains Mono', monospace; }

        .nb-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; margin-top: 6px; }
        .nb-nav-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;
          background: transparent; border: none; color: #A9B2C3; font-size: 13.5px; font-weight: 500;
          cursor: pointer; text-align: left; font-family: inherit; transition: background .15s, color .15s;
        }
        .nb-nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .nb-nav-item.active { background: var(--red-pen); color: #fff; }

        .nb-sidebar-foot { margin-top: auto; padding: 14px; border-top: 1px solid rgba(255,255,255,0.08); }
        .nb-btn-ghost-dark { background: transparent; color: #C6CDDA; border: 1px solid rgba(255,255,255,0.18); }

        .nb-main {
          flex: 1; background: var(--paper);
          background-image:
            linear-gradient(var(--paper-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--paper-line) 1px, transparent 1px);
          background-size: 26px 26px;
          position: relative; overflow-y: auto; height: 100dvh;
        }
        .nb-main::before {
          content: ""; position: absolute; left: 46px; top: 0; bottom: 0; width: 1.5px; background: rgba(178,58,58,0.35);
          pointer-events: none;
        }
        .nb-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 30px 18px 62px; border-bottom: 1px solid var(--paper-line);
          background: rgba(247,244,234,0.92); backdrop-filter: blur(2px); position: sticky; top: 0; z-index: 5;
        }
        .nb-topbar-user { display: flex; align-items: center; gap: 8px; }
        .nb-content { padding: 26px 30px 40px 62px; }

        .nb-storage-banner {
          display: flex; align-items: center; gap: 8px; background: rgba(178,58,58,0.1); color: var(--red-pen);
          font-size: 12.5px; padding: 8px 14px; margin: -8px -30px 18px -62px; padding-left: 62px;
        }

        .nb-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--slate); margin-bottom: 4px; }
        .nb-h2 { font-size: 24px; font-weight: 800; margin: 0; }
        .nb-h3 { font-size: 16px; font-weight: 700; margin: 0; }
        .nb-sub { font-size: 12.5px; color: var(--slate); margin: 0; }
        .nb-para { font-size: 14px; line-height: 1.65; color: #2B2F36; }

        .nb-avatar {
          border-radius: 50%; background: var(--pen-blue); color: #fff; display: flex; align-items: center;
          justify-content: center; font-weight: 700; font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
        }

        .nb-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
        .nb-practice-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
        .nb-practice-summary-card { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--paper-line); border-radius: 9px; padding: 12px 14px; color: var(--pen-blue); }
        .nb-practice-summary-card strong { color: var(--ink); font: 700 18px 'JetBrains Mono', monospace; margin-left: auto; }
        .nb-practice-summary-card span { color: var(--slate); font-size: 11px; }
        .nb-management-panel { margin-bottom: 16px; }
        .nb-management-head, .nb-editor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .nb-management-list { display: flex; flex-direction: column; margin-top: 12px; }
        .nb-management-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid var(--paper-line); }
        .nb-management-info { min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .nb-management-info strong { font-size: 13.5px; }
        .nb-management-info .nb-eyebrow { margin: 0; }
        .nb-management-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .nb-btn-danger { background: rgba(178,58,58,0.08); color: var(--red-pen); border: 1px solid rgba(178,58,58,0.22); }
        .nb-problem-editor { gap: 12px; }
        .nb-form-section-label { color: var(--ink); font-size: 12px; font-weight: 700; margin-top: 3px; }
        .nb-testcase-editor { display: flex; flex-direction: column; gap: 10px; }
        .nb-testcase-card { border: 1px solid var(--paper-line); border-radius: 9px; padding: 10px; background: #FDFCF7; }
        .nb-testcase-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; color: var(--pen-blue); font-size: 12px; }
        .nb-testcase-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nb-editor-actions { display: flex; gap: 8px; }
        .nb-stat-card { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 16px; color: var(--pen-blue); }
        .nb-stat-num { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 700; color: var(--ink); margin-top: 8px; }
        .nb-stat-label { font-size: 12px; color: var(--slate); margin-top: 2px; }

        .nb-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .nb-panel { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 18px; }

        .nb-activity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .nb-activity-list li { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }

        .nb-pill { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; display: inline-block; white-space: nowrap; }
        .nb-pill-ac { background: rgba(46,158,109,0.12); color: var(--ac-green); }
        .nb-pill-wa { background: rgba(178,58,58,0.1); color: var(--red-pen); }
        .nb-pill-pending { background: rgba(185,130,47,0.14); color: var(--gold); }

        .nb-tag { font-size: 11px; font-weight: 600; border: 1px solid; border-radius: 6px; padding: 2px 7px; font-family: 'JetBrains Mono', monospace; }

        .nb-lesson-list { display: flex; flex-direction: column; gap: 8px; }
        .nb-lesson-item { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; overflow: hidden; }
        .nb-lesson-head { width: 100%; display: grid; grid-template-columns: 60px 1fr auto 20px; align-items: center; gap: 14px; padding: 14px 16px; background: transparent; border: none; cursor: pointer; text-align: left; font-family: inherit; }
        .nb-lesson-title { font-weight: 600; font-size: 14px; }
        .nb-chevron { transition: transform .15s; color: var(--slate); }
        .nb-lesson-item.open .nb-chevron { transform: rotate(90deg); }
        .nb-lesson-body { padding: 0 16px 16px 76px; }
        .nb-lesson-overview { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-bottom: 18px; }
        .nb-lesson-progress-card, .nb-lesson-stat-card { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 15px; }
        .nb-lesson-progress-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
        .nb-lesson-progress-head strong { color: var(--pen-blue); font: 700 18px 'JetBrains Mono', monospace; }
        .nb-progress-track { height: 8px; background: var(--paper-line); border-radius: 99px; overflow: hidden; margin-bottom: 8px; }
        .nb-progress-fill { height: 100%; background: var(--ac-green); border-radius: inherit; transition: width .25s ease; }
        .nb-lesson-stat-card { display: flex; align-items: center; gap: 9px; color: var(--pen-blue); }
        .nb-lesson-stat-card strong { color: var(--ink); font: 700 22px 'JetBrains Mono', monospace; margin-left: auto; }
        .nb-lesson-stat-card span { color: var(--slate); font-size: 11px; }
        .nb-lesson-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
        .nb-lesson-search { flex: 1 1 260px; }
        .nb-lesson-layout { display: grid; grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.7fr); gap: 16px; align-items: start; }
        .nb-lesson-catalog, .nb-lesson-reader { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-lesson-catalog { overflow: hidden; }
        .nb-lesson-catalog-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 16px; border-bottom: 1px solid var(--paper-line); }
        .nb-lesson-catalog-list { display: flex; flex-direction: column; }
        .nb-lesson-catalog-item { display: flex; align-items: stretch; border-bottom: 1px solid var(--paper-line); }
        .nb-lesson-catalog-item:last-child { border-bottom: none; }
        .nb-lesson-catalog-item.active { background: rgba(44,74,140,0.07); box-shadow: inset 3px 0 var(--pen-blue); }
        .nb-lesson-catalog-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; padding: 13px 12px 13px 16px; border: none; background: transparent; text-align: left; cursor: pointer; font-family: inherit; }
        .nb-lesson-index { width: 28px; color: var(--slate); font: 600 11px 'JetBrains Mono', monospace; }
        .nb-lesson-catalog-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .nb-lesson-catalog-text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
        .nb-lesson-catalog-text small { color: var(--slate); font-size: 11px; }
        .nb-lesson-item-actions { display: flex; align-items: center; gap: 2px; padding-right: 7px; }
        .nb-lesson-reader { min-height: 520px; padding: 26px 30px 30px; }
        .nb-lesson-reader-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .nb-lesson-reader-title { font-size: 30px; line-height: 1.2; margin: 10px 0 18px; max-width: 760px; }
        .nb-lesson-callout { display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px; border-left: 3px solid var(--pen-blue); background: rgba(44,74,140,0.07); color: var(--pen-blue); border-radius: 0 8px 8px 0; margin-bottom: 22px; }
        .nb-lesson-callout p { margin: 0; color: var(--ink); font-size: 13.5px; line-height: 1.6; }
        .nb-lesson-content { color: #2B2F36; font-size: 14px; line-height: 1.8; margin-bottom: 24px; }
        .nb-lesson-content p { margin: 0 0 16px; white-space: pre-wrap; }
        .nb-lesson-status-badges { display: flex; flex-wrap: wrap; gap: 5px; }
        .nb-lesson-progress-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-bottom: 24px; border-bottom: 1px solid var(--paper-line); }
        .nb-lesson-discussion { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--paper-line); }
        .nb-lesson-discussion-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
        .nb-lesson-question-form { display: flex; gap: 8px; align-items: flex-end; margin-bottom: 16px; }
        .nb-lesson-question-form .nb-input { flex: 1; }
        .nb-lesson-thread-list { display: flex; flex-direction: column; gap: 12px; }
        .nb-lesson-thread { padding: 13px; border: 1px solid var(--paper-line); border-radius: 9px; background: #FDFCF7; }
        .nb-lesson-form-grid { display: grid; grid-template-columns: 0.8fr 2fr 1fr; gap: 10px; }
        .nb-lesson-editor { gap: 12px; }
        .nb-lesson-empty { min-height: 460px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--slate); text-align: center; }

        .nb-filter-row { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
        .nb-chip { font-size: 12.5px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--paper-line); background: #fff; cursor: pointer; font-family: inherit; color: var(--slate); }
        .nb-chip.active { background: var(--pen-blue); color: #fff; border-color: var(--pen-blue); }

        .nb-problem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        .nb-problem-card { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 14px; text-align: left; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 10px; transition: transform .12s, box-shadow .12s; }
        .nb-problem-card:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(16,21,28,0.08); }
        .nb-problem-meta { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--paper-line); padding-top: 8px; color: var(--slate); font-size: 11px; }
        .nb-problem-meta strong { color: var(--pen-blue); font-family: 'JetBrains Mono', monospace; }
        .nb-problem-top { display: flex; justify-content: space-between; align-items: center; }
        .nb-problem-title { font-weight: 600; font-size: 13.5px; line-height: 1.4; }
        .nb-problem-bottom { display: flex; justify-content: space-between; align-items: center; }

        .nb-btn { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; }
        .nb-btn-primary { background: var(--pen-blue); color: #fff; }
        .nb-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .nb-btn-ghost { background: transparent; color: var(--pen-blue); border: 1px dashed var(--pen-blue); }
        .nb-icon-btn { background: transparent; border: none; cursor: pointer; color: var(--slate); padding: 6px; border-radius: 6px; }
        .nb-icon-btn:hover { background: rgba(0,0,0,0.05); }

        .nb-form { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
        .nb-input { border: 1px solid var(--paper-line); border-radius: 7px; padding: 9px 11px; font-size: 13.5px; font-family: inherit; background: #FDFCF7; width: 100%; box-sizing: border-box; }
        .nb-checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--slate); }
        .nb-checklist { max-height: 170px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--paper-line); border-radius: 8px; padding: 10px; background: #FDFCF7; }

        .nb-modal-overlay { position: fixed; inset: 0; background: rgba(16,21,28,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
        .nb-modal { background: var(--paper); border-radius: 12px; max-width: 820px; width: 100%; max-height: 88vh; overflow-y: auto; }
        .nb-modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 22px; border-bottom: 1px solid var(--paper-line); }
        .nb-modal-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px 22px; }
        .nb-modal-col { display: flex; flex-direction: column; }
        .nb-sample { background: #fff; border: 1px solid var(--paper-line); border-radius: 8px; padding: 10px; margin-top: 14px; }
        .nb-sample-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; font-family: 'JetBrains Mono', monospace; gap: 8px; }
        .nb-code-editor { width: 100%; min-height: 200px; background: var(--ink); color: #D8DEE9; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; border-radius: 8px; border: none; padding: 14px; resize: vertical; box-sizing: border-box; }
        .nb-modal-actions { margin-top: 10px; display: flex; }
        .nb-solver-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 12px; color: var(--slate); font-size: 11.5px; }
        .nb-solver-meta strong { color: var(--ink); font-family: 'JetBrains Mono', monospace; }
        .nb-result { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
        .nb-result-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .nb-result-score { color: var(--pen-blue); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-result-output { margin: 0; padding: 10px; border-radius: 7px; background: var(--ink); color: #D8DEE9; font: 12px/1.5 'JetBrains Mono', monospace; white-space: pre-wrap; overflow-x: auto; }
        .nb-testrow { display: flex; gap: 6px; }
        .nb-testdot { display: inline-flex; padding: 4px; border-radius: 6px; }
        .nb-testdot.ok { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-testdot.fail { color: var(--red-pen); background: rgba(178,58,58,0.1); }
        .nb-spin { animation: nb-spin 0.9s linear infinite; }
        @keyframes nb-spin { to { transform: rotate(360deg); } }

        .nb-contest-list { display: flex; flex-direction: column; gap: 14px; }
        .nb-contest-card { display: flex; flex-direction: column; gap: 10px; }
        .nb-contest-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .nb-mini-leaderboard { border-top: 1px solid var(--paper-line); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .nb-mini-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .nb-contest-bar { display: flex; align-items: center; gap: 18px; margin-bottom: 12px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 12px 16px; flex-wrap: wrap; }
        .nb-contest-timer { font-family: 'JetBrains Mono', monospace; font-weight: 700; display: flex; align-items: center; gap: 6px; color: var(--red-pen); }
        .nb-locked-banner { display: flex; align-items: center; gap: 8px; background: rgba(178,58,58,0.08); color: var(--red-pen); font-size: 12.5px; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }

        .nb-barchart { display: flex; align-items: flex-end; gap: 10px; height: 220px; padding: 10px 6px 0; }
        .nb-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
        .nb-bar-track { flex: 1; width: 100%; max-width: 34px; display: flex; align-items: flex-end; }
        .nb-bar-fill { width: 100%; background: var(--pen-blue); border-radius: 5px 5px 0 0; min-height: 3px; transition: height .3s; }
        .nb-bar-fill.me { background: var(--red-pen); }
        .nb-bar-value { font-size: 11px; }
        .nb-bar-label { font-size: 10px; color: var(--slate); text-align: center; max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .nb-table-wrap { overflow-x: auto; }
        .nb-table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 420px; }
        .nb-table th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; color: var(--slate); padding: 8px 10px; border-bottom: 1px solid var(--paper-line); white-space: nowrap; }
        .nb-table td { padding: 9px 10px; border-bottom: 1px solid var(--paper-line); white-space: nowrap; }
        .nb-table tr.me { background: rgba(178,58,58,0.05); }

        .nb-thread-list { display: flex; flex-direction: column; gap: 14px; }
        .nb-thread-head { display: flex; align-items: center; gap: 10px; }
        .nb-reply-list { display: flex; flex-direction: column; gap: 10px; padding-left: 8px; border-left: 2px solid var(--paper-line); margin-left: 4px; }
        .nb-reply { display: flex; gap: 8px; }
        .nb-reply-form { display: flex; gap: 8px; margin-top: 12px; }
        .nb-reply-form .nb-input { flex: 1; }

        .nb-boot-loading { width: 100%; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #8D97A8; }

        .nb-login-wrap { width: 100%; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .nb-login-card { background: #fff; border-radius: 14px; padding: 32px 28px; width: 100%; max-width: 360px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
        .nb-field-label { display: block; font-size: 12px; font-weight: 600; color: var(--slate); margin-bottom: 6px; }
        .nb-password-row { display: flex; gap: 6px; align-items: center; }
        .nb-password-row .nb-input { flex: 1; }
        .nb-login-error { display: flex; align-items: center; gap: 6px; color: var(--red-pen); font-size: 12.5px; background: rgba(178,58,58,0.08); padding: 8px 10px; border-radius: 7px; margin-top: 4px; }

        .nb-bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; background: var(--ink); border-top: 1px solid rgba(255,255,255,0.08); padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px)); gap: 2px; z-index: 20; overflow-x: auto; }
        .nb-bottom-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: transparent; border: none; color: #8D97A8; font-size: 10px; font-family: inherit; padding: 6px 2px; border-radius: 8px; white-space: nowrap; }
        .nb-bottom-nav-item.active { color: #fff; background: var(--red-pen); }

        @media (max-width: 860px) {
          .nb-only-desktop { display: none !important; }
          .nb-only-mobile { display: flex !important; }
          .nb-root { flex-direction: column; }
          .nb-main::before { display: none; }
          .nb-topbar { padding: 12px 14px; }
          .nb-content { padding: 16px 14px 92px 14px; }
          .nb-storage-banner { margin: -8px -14px 16px -14px; padding-left: 14px; }
          .nb-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .nb-lesson-overview { grid-template-columns: 1fr 1fr; }
          .nb-lesson-progress-card { grid-column: 1 / -1; }
          .nb-lesson-layout { grid-template-columns: 1fr; }
          .nb-lesson-reader { min-height: 0; padding: 20px 16px 24px; }
          .nb-lesson-reader-title { font-size: 24px; }
          .nb-lesson-form-grid { grid-template-columns: 1fr; }
          .nb-lesson-question-form { flex-direction: column; align-items: stretch; }
          .nb-lesson-question-form .nb-btn { justify-content: center; }
          .nb-lesson-progress-actions .nb-btn { flex: 1; justify-content: center; }
          .nb-practice-summary { grid-template-columns: 1fr; }
          .nb-management-row { align-items: flex-start; flex-direction: column; }
          .nb-management-actions { width: 100%; }
          .nb-management-actions .nb-btn { flex: 1; justify-content: center; }
          .nb-testcase-grid { grid-template-columns: 1fr; }
          .nb-two-col, .nb-modal-body { grid-template-columns: 1fr; }
          .nb-modal { max-height: 94vh; }
          .nb-modal-body { padding: 16px; }
          .nb-code-editor { min-height: 160px; }
        }
      `}</style>

      {loading ? (
        <div className="nb-boot-loading">
          <Loader2 size={26} className="nb-spin" />
          <span>Đang tải dữ liệu lớp học…</span>
        </div>
      ) : setupError ? (
        <SetupErrorScreen onRetry={runInitialLoad} />
      ) : !currentUser ? (
        <LoginScreen onLogin={handleLogin} error={loginError} busy={loginBusy} />
      ) : (
        <>
          <aside className="nb-sidebar nb-only-desktop">
            <div className="nb-brand">
              <div className="nb-brand-mark"><GraduationCap size={18} /></div>
              <div className="nb-brand-text"><b>Đội tuyển Tin học</b><span>ÔN THI HSG · 11 TIN</span></div>
            </div>
            <nav className="nb-nav">
              {navItems.map((n) => (
                <button key={n.key} className={"nb-nav-item " + (tab === n.key ? "active" : "")} onClick={() => setTab(n.key)}>
                  <n.icon size={16} /> {n.label}
                </button>
              ))}
            </nav>
            <div className="nb-sidebar-foot">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Avatar name={currentUser.name} size={30} />
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{currentUser.name}</div>
                  <div className="nb-sub" style={{ color: "#75809A" }}>{isTeacher ? "Giáo viên" : "Học sinh"}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="nb-btn nb-btn-ghost-dark" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "7px 8px" }} onClick={() => setShowChangePw(true)}>Đổi mật khẩu</button>
                <button className="nb-btn nb-btn-ghost-dark" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "7px 8px" }} onClick={handleLogout}>Đăng xuất</button>
              </div>
            </div>
          </aside>

          <main className="nb-main">
            <div className="nb-topbar">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="nb-brand-mark nb-only-mobile" style={{ width: 26, height: 26 }}><GraduationCap size={14} /></div>
                <div className="nb-eyebrow" style={{ margin: 0 }}>{activeTabLabel}</div>
              </div>
              <div className="nb-topbar-user">
                <button className="nb-icon-btn" onClick={refreshNow} title="Làm mới dữ liệu" aria-label="Làm mới dữ liệu">
                  <RefreshCw size={16} className={refreshing ? "nb-spin" : ""} />
                </button>
                <button className="nb-icon-btn" onClick={() => setShowChangePw(true)} title="Đổi mật khẩu" aria-label="Đổi mật khẩu">
                  <Lock size={16} />
                </button>
                <button className="nb-icon-btn" onClick={handleLogout} title="Đăng xuất" aria-label="Đăng xuất">
                  <LogOut size={16} />
                </button>
                <span className="nb-only-desktop" style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</span>
                <Avatar name={currentUser.name} size={30} />
              </div>
            </div>

            <div className="nb-content">
              <StorageBanner visible={storageError} onDismiss={() => setStorageError(false)} />

              {tab === "overview" && (
                <OverviewView
                  currentUser={currentUser} students={students} submissions={submissions}
                  points={points} solvedCount={solvedCount} contests={contests} discussions={discussions}
                  problemsCount={problems.length}
                />
              )}
              {tab === "lessons" && (
                <LessonsView
                  isTeacher={isTeacher} currentUser={currentUser} topics={topics} progress={lessonProgress}
                  onProgressChange={handleLessonProgress} discussions={discussions} addThread={addThread} addReply={addReply}
                  addTopic={addTopic} updateTopic={updateTopic} removeTopic={removeTopic}
                />
              )}
              {tab === "problems" && (
                <ProblemsView
                  isTeacher={isTeacher} currentUser={currentUser} problems={problems} submissions={submissions}
                  points={points} addProblem={addProblem} updateProblem={updateProblem} removeProblem={removeProblem} topics={topics}
                  solvedByCurrent={solvedByCurrent} onVerdict={registerVerdict}
                />
              )}
              {tab === "contests" && (
                <ContestsView
                  contests={contests} isTeacher={isTeacher} students={students} points={points} problems={problems}
                  addContest={addContest} setContestStatus={setContestStatus}
                  solvedByCurrent={solvedByCurrent} onVerdict={registerVerdict}
                />
              )}
              {tab === "leaderboard" && (
                <LeaderboardView students={students} points={points} solvedCount={solvedCount} currentUser={currentUser} problemsCount={problems.length} />
              )}
              {tab === "discussion" && (
                <DiscussionView discussions={discussions} addThread={addThread} addReply={addReply} currentUser={currentUser} />
              )}
              {tab === "accounts" && isTeacher && (
                <AccountsView accounts={accounts} resetPassword={resetPassword} addAccount={addAccount} removeAccount={removeAccount} currentUser={currentUser} />
              )}
            </div>

            <nav className="nb-bottom-nav nb-only-mobile">
              {navItems.map((n) => (
                <button key={n.key} className={"nb-bottom-nav-item " + (tab === n.key ? "active" : "")} onClick={() => setTab(n.key)}>
                  <n.icon size={17} />
                  <span>{n.shortLabel}</span>
                </button>
              ))}
            </nav>
          </main>
        </>
      )}

      {showChangePw && currentUser && (
        <ChangePasswordModal currentUser={currentUser} onClose={() => setShowChangePw(false)} onChange={selfChangePassword} />
      )}
    </div>
  );
}

const rootEl = document.getElementById("root");
createRoot(rootEl).render(<App />);
