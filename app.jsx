import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Home, BookOpen, Code2, Trophy, MessageSquare, Clock, Users, Plus,
  Send, CheckCircle2, XCircle, Loader2, Flame, ChevronRight, ChevronLeft, Search,
  Award, TrendingUp, AlertCircle, X, Play, Lock, GraduationCap, ListChecks,
  RefreshCw, Eye, EyeOff, LogOut, Pencil, Trash2, Save, UploadCloud,
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
    sampleInput: "", sampleOutput: "", imageUrl: "", imageFile: null,
    testCases: [createEmptyTestCase()], isPython: false,
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
    imageUrl: row.statement_image_url || "",
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
    sourceCode: row.source_code || "",
    createdAt: row.created_at || null,
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
    is_python: p.isPython, statement: p.statement, statement_image_url: p.imageUrl || null,
    sample_input: p.sample.input, sample_output: p.sample.output,
    test_cases: normalizeTestCases(p.testCases),
  });
  if (error) throw error;
}
async function dbUpdateProblem(p) {
  const { error } = await supabase.from("problems").update({
    title: p.title, topic: p.topic, difficulty: p.difficulty, points: p.points,
    is_python: p.isPython, statement: p.statement, statement_image_url: p.imageUrl || null,
    sample_input: p.sample.input, sample_output: p.sample.output,
    test_cases: normalizeTestCases(p.testCases),
  }).eq("id", p.id);
  if (error) throw error;
}
async function dbRemoveProblem(id) {
  const { error } = await supabase.from("problems").delete().eq("id", id);
  if (error) throw error;
}

async function uploadProblemImage(file) {
  if (!file) return "";
  if (!file.type.startsWith("image/")) throw new Error("Chỉ được tải tệp hình ảnh.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ảnh đề bài không được vượt quá 5 MB.");
  const extension = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const objectPath = `problem-statements/${suffix}.${extension}`;
  const { error } = await supabase.storage.from("problem-assets").upload(objectPath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("problem-assets").getPublicUrl(objectPath);
  return data?.publicUrl || "";
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
    source_code: sub.sourceCode || null,
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

async function readJudgeResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`Dịch vụ chấm trả về dữ liệu không hợp lệ (HTTP ${response.status}).`); }
}

function judgeResponseMessage(payload, fallback = "Không có thông tin chi tiết.") {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  return payload.error || payload.message || payload.detail || payload.status?.description || fallback;
}

async function judgeOneTest({ sourceCode, languageId, input, expectedOutput }) {
  const payload = {
    source_code: String(sourceCode || ""),
    language_id: Number(languageId),
    stdin: String(input ?? ""),
    expected_output: String(expectedOutput ?? ""),
    cpu_time_limit: 2,
    wall_time_limit: 5,
    memory_limit: 128000,
  };
  const createResponse = await fetchWithTimeout(
    `${JUDGE0_ENDPOINT}/submissions?base64_encoded=false&wait=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const created = await readJudgeResponse(createResponse);
  if (!createResponse.ok) {
    throw new Error(`Không thể tạo lượt chấm (HTTP ${createResponse.status}): ${judgeResponseMessage(created)}.`);
  }
  if (!created?.token) throw new Error("Dịch vụ chấm không trả về mã lượt chấm.");

  let lastPollError = "";
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await wait(attempt < 4 ? 500 : 800);
    const resultResponse = await fetchWithTimeout(
      `${JUDGE0_ENDPOINT}/submissions/${encodeURIComponent(created.token)}?base64_encoded=false`,
      { headers: { Accept: "application/json" } },
      10000
    );
    const result = await readJudgeResponse(resultResponse);
    if ([400, 408, 425, 429, 500, 502, 503, 504].includes(resultResponse.status)) {
      lastPollError = `HTTP ${resultResponse.status}: ${judgeResponseMessage(result, "phản hồi tạm thời không có nội dung")}`;
      if (attempt < 10) continue;
      throw new Error(`Không thể lấy kết quả chấm sau nhiều lần thử (${lastPollError}).`);
    }
    if (!resultResponse.ok) {
      throw new Error(`Không thể lấy kết quả chấm (HTTP ${resultResponse.status}): ${judgeResponseMessage(result)}.`);
    }
    if (!result) continue;
    const statusId = result.status?.id;
    if (result.error && !result.status) throw new Error(`Judge0 từ chối lượt chấm: ${judgeResponseMessage(result)}.`);
    if (statusId !== 1 && statusId !== 2) return result;
  }
  throw new Error(lastPollError || "Dịch vụ chấm phản hồi quá lâu. Em hãy thử nộp lại sau ít giây.");
}

function getJudgeVerdict(result) {
  const mapped = JUDGE_STATUS_TO_VERDICT[result?.status?.id] || "SE";
  const diagnostics = `${result?.compile_output || ""}\n${result?.stderr || ""}`;
  if (mapped === "RE" && /(SyntaxError|IndentationError|TabError|Compilation failed|fatal error|Syntax error)/i.test(diagnostics)) return "CE";
  return mapped;
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
  if (incompleteCase || testCases.length === 0) {
    return {
      verdict: "CONFIG",
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

  const verdicts = results.map(getJudgeVerdict);
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
    CONFIG: { label: "CẤU HÌNH · Thiếu test hợp lệ", cls: "nb-pill-wa" },
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

function ProblemStatement({ problem }) {
  const paragraphs = String(problem.statement || "").split(/\n{2,}/).filter((part) => part.trim());
  return (
    <div className="nb-problem-statement">
      {problem.imageUrl && <img className="nb-problem-statement-image" src={problem.imageUrl} alt={`Hình minh họa cho ${problem.title}`} />}
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  );
}

function MultilineCodeBlock({ label, value }) {
  return (
    <div className="nb-code-block">
      <div className="nb-code-block-label">{label}</div>
      <pre>{String(value || "") || "(không có dữ liệu)"}</pre>
    </div>
  );
}

function formatSubmissionDate(value) {
  if (!value) return "Thời gian chưa có";
  try { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
  catch (e) { return "Thời gian chưa có"; }
}

const PYTHON_KEYWORDS = new Set("and as assert async await break case class continue def del elif else except False finally for from global if import in is lambda match None nonlocal not or pass raise return True try while with yield print range len int float str list dict set tuple input open enumerate zip sum min max".split(" "));
const CPP_KEYWORDS = new Set("alignas alignof auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend if inline int long namespace new nullptr operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while std string cin cout endl".split(" "));

function highlightCodeLine(line, language) {
  const keywords = language === "python" ? PYTHON_KEYWORDS : CPP_KEYWORDS;
  const tokenPattern = /(#.*|\/\/.*|\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(line))) {
    if (match.index > cursor) parts.push({ value: line.slice(cursor, match.index), className: "" });
    const token = match[0];
    let className = "";
    if (token.startsWith("#") || token.startsWith("//")) className = "nb-syntax-comment";
    else if (token.startsWith("\"") || token.startsWith("'")) className = "nb-syntax-string";
    else if (/^\\d/.test(token)) className = "nb-syntax-number";
    else if (keywords.has(token)) className = "nb-syntax-keyword";
    else if (/^(print|input|len|range|int|float|str|sum|cout|cin|std)$/.test(token)) className = "nb-syntax-function";
    parts.push({ value: token, className });
    cursor = match.index + token.length;
  }
  if (cursor < line.length) parts.push({ value: line.slice(cursor), className: "" });
  return parts.map((part, index) => part.className ? <span key={index} className={part.className}>{part.value}</span> : <React.Fragment key={index}>{part.value}</React.Fragment>);
}

function CodeEditor({ code, onChange, language, onSubmit, readOnly }) {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const lines = String(code || "").split("\n");
  const textareaRef = useRef(null);

  function handleKeyDown(event) {
    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${code.slice(0, start)}    ${code.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 4; });
    } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
    }
  }

  return (
    <div className="nb-thonny-editor">
      <div className="nb-editor-toolbar"><span><Code2 size={14} /> {language === "python" ? "Python 3 · Editor" : "C++17 · Editor"}</span><span>Ln {Math.min(lines.length, 999)} · {code.length} ký tự</span></div>
      <div className="nb-editor-workspace">
        <div className="nb-editor-gutter" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div>
        <div className="nb-editor-code-layer">
          <pre className="nb-code-highlight" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }} aria-hidden="true"><code>{lines.map((line, index) => <React.Fragment key={index}>{highlightCodeLine(line, language)}{index < lines.length - 1 ? "\n" : ""}</React.Fragment>)}</code></pre>
          <textarea ref={textareaRef} className="nb-code-input" value={code} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })} spellCheck={false} readOnly={readOnly} aria-label="Trình soạn thảo mã nguồn" />
        </div>
      </div>
      <div className="nb-editor-status"><span>{readOnly ? "Chế độ chỉ xem" : "Tab: 4 khoảng trắng · Ctrl/Cmd + Enter: nộp bài"}</span><span>{language === "python" ? "Python" : "GNU C++17"}</span></div>
    </div>
  );
}

function ProblemSolverModal({ problem, onClose, onVerdict, readOnly, disabledLabel, alreadySolved, bestScore = 0, attemptCount = 0, submissionHistory = [] }) {
  const [code, setCode] = useState(
    problem.isPython ? "# Viết code Python của bạn tại đây\n\n" : "// Viết code của bạn tại đây\n\n"
  );
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const orderedHistory = submissionHistory.filter((submission) => submission.problemId === problem.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const selectedHistory = orderedHistory.find((submission) => submission.id === selectedHistoryId) || orderedHistory[0] || null;

  async function handleSubmit() {
    if (readOnly || judging) return;
    setJudging(true);
    setResult(null);
    try {
      const r = await judgeSourceCode(problem, code);
      setResult(r);
      onVerdict && onVerdict(problem.id, r, code);
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
            <ProblemStatement problem={problem} />
            <div className="nb-sample">
              <div className="nb-sample-title">Ví dụ minh họa</div>
              <div className="nb-sample-grid">
                <MultilineCodeBlock label="Input mẫu" value={problem.sample.input} />
                <MultilineCodeBlock label="Output mẫu" value={problem.sample.output} />
              </div>
            </div>
            {!readOnly && <div className="nb-solver-meta"><span>Điểm tốt nhất: <strong>{bestScore}/{problem.points}</strong></span><span>Đã nộp: <strong>{attemptCount}</strong> lần</span><span>{getProblemTestCases(problem).length} test case</span></div>}
            {!readOnly && orderedHistory.length > 0 && <div className="nb-history-panel">
              <button type="button" className="nb-history-toggle" onClick={() => setHistoryOpen((open) => !open)}><RefreshCw size={14} /> Lịch sử code đã nộp ({orderedHistory.length})<ChevronRight size={14} className={historyOpen ? "nb-history-chevron open" : "nb-history-chevron"} /></button>
              {historyOpen && <div className="nb-history-body">
                <div className="nb-history-list">{orderedHistory.map((submission) => <button type="button" key={submission.id} className={"nb-history-item " + (selectedHistory?.id === submission.id ? "active" : "")} onClick={() => setSelectedHistoryId(submission.id)}><div><VerdictPill verdict={submission.verdict} /><span className="nb-history-date">{formatSubmissionDate(submission.createdAt)}</span></div><strong>{submission.score ?? 0}/{submission.problemPoints ?? problem.points}đ</strong><small>{submission.passedTests != null && submission.totalTests != null ? `${submission.passedTests}/${submission.totalTests} test đạt` : "Bản nộp cũ"}</small></button>)}</div>
                {selectedHistory && <div className="nb-history-viewer"><div className="nb-history-viewer-head"><strong>Code của lần nộp</strong><button type="button" className="nb-btn nb-btn-ghost" disabled={!selectedHistory.sourceCode} onClick={() => { setCode(selectedHistory.sourceCode); setResult(null); setHistoryOpen(false); }}><Code2 size={14} /> Khôi phục vào editor</button></div>{selectedHistory.sourceCode ? <pre className="nb-history-code">{selectedHistory.sourceCode}</pre> : <p className="nb-sub">Lượt nộp này được tạo trước khi hệ thống lưu source code.</p>}</div>}
              </div>}
            </div>}
          </div>

          <div className="nb-modal-col">
            <CodeEditor code={code} onChange={setCode} language={problem.isPython ? "python" : "cpp"} onSubmit={handleSubmit} readOnly={readOnly} />
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const imageObjectUrlRef = useRef(null);
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

  function clearImagePreview() {
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current);
      imageObjectUrlRef.current = null;
    }
    setImagePreview("");
  }

  function resetForm() {
    clearImagePreview();
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
      imageUrl: problem.imageUrl || "", imageFile: null,
      testCases: normalizeTestCases(problem.testCases).length > 0 ? normalizeTestCases(problem.testCases) : [createEmptyTestCase()],
      isPython: Boolean(problem.isPython),
    });
    clearImagePreview();
    setImagePreview(problem.imageUrl || "");
    setFormError("");
    setShowForm(true);
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFormError("Chỉ được tải tệp hình ảnh."); return; }
    if (file.size > 5 * 1024 * 1024) { setFormError("Ảnh đề bài không được vượt quá 5 MB."); return; }
    if (imageObjectUrlRef.current) URL.revokeObjectURL(imageObjectUrlRef.current);
    imageObjectUrlRef.current = URL.createObjectURL(file);
    setImagePreview(imageObjectUrlRef.current);
    setForm((current) => ({ ...current, imageFile: file }));
    setFormError("");
  }

  function removeImage() {
    clearImagePreview();
    setForm((current) => ({ ...current, imageFile: null, imageUrl: "" }));
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

  async function submit(e) {
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

    setUploadingImage(true);
    try {
      const uploadedImageUrl = form.imageFile ? await uploadProblemImage(form.imageFile) : form.imageUrl || "";
      const problem = {
        id: editingId || ("PX" + Date.now()),
        title: form.title.trim(),
        topic: form.topic || topics[0]?.id || "",
        difficulty: form.difficulty,
        points: pointsValue,
        isPython: form.isPython,
        statement: form.statement.trim(),
        imageUrl: uploadedImageUrl,
        sample: { input: form.sampleInput.trim() || "—", output: form.sampleOutput.trim() || "—" },
        testCases,
      };
      if (editingId) updateProblem(problem);
      else addProblem(problem);
      resetForm();
      setShowForm(false);
    } catch (error) {
      setFormError(error?.message || "Không thể tải ảnh hoặc lưu bài tập.");
    } finally {
      setUploadingImage(false);
    }
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
          <textarea className="nb-input" placeholder="Đề bài — có thể nhập nhiều đoạn, mô tả thuật toán, ràng buộc và ví dụ" rows={7} value={form.statement}
            onChange={(e) => setForm({ ...form, statement: e.target.value })} />
          <div className="nb-form-section-label">Hình minh họa cho đề bài</div>
          <div className="nb-image-upload-panel">
            <label className="nb-upload-drop">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} />
              <UploadCloud size={20} />
              <span><strong>Chọn ảnh đề bài</strong><small>PNG, JPG, WEBP hoặc GIF · tối đa 5 MB</small></span>
            </label>
            {imagePreview && <div className="nb-image-preview-wrap"><img src={imagePreview} className="nb-image-preview" alt="Xem trước ảnh đề bài" /><button type="button" className="nb-btn nb-btn-danger" onClick={removeImage}><Trash2 size={14} /> Xóa ảnh</button></div>}
            <input className="nb-input" placeholder="Hoặc dán URL ảnh công khai (không bắt buộc)" value={form.imageUrl} onChange={(e) => { setForm({ ...form, imageUrl: e.target.value, imageFile: null }); setImagePreview(e.target.value); }} />
          </div>
          <div className="nb-form-section-label">Ví dụ hiển thị cho học sinh</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <textarea className="nb-input nb-mono" rows={6} placeholder="Input mẫu — hỗ trợ nhiều dòng" value={form.sampleInput}
              onChange={(e) => setForm({ ...form, sampleInput: e.target.value })} />
            <textarea className="nb-input nb-mono" rows={6} placeholder="Output mẫu — hỗ trợ nhiều dòng" value={form.sampleOutput}
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
                  <textarea className="nb-input nb-mono" rows={6} placeholder="Input chạy thử — dữ liệu có thể gồm nhiều dòng" value={test.input}
                    onChange={(e) => updateTestCase(test.id, "input", e.target.value)} />
                  <textarea className="nb-input nb-mono" rows={6} placeholder="Output kỳ vọng — giữ nguyên xuống dòng và khoảng trắng" value={test.output}
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
            <button className="nb-btn nb-btn-primary" type="submit" disabled={uploadingImage}><Save size={15} /> {uploadingImage ? "Đang tải ảnh…" : (editingId ? "Lưu thay đổi" : "Tạo bài tập")}</button>
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
              {p.imageUrl && <img className="nb-problem-card-image" src={p.imageUrl} alt="Ảnh minh họa đề bài" />}
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
          submissionHistory={currentSubmissions}
          onVerdict={(problemId, result, sourceCode) => onVerdict(problemId, result, sourceCode)}
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
          onVerdict={(problemId, result, sourceCode) => onVerdict(problemId, result, sourceCode)}
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
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("score");
  const [scope, setScope] = useState("all");

  const ranked = useMemo(() => {
    const rows = students.map((student) => {
      const score = Number(points(student.id)) || 0;
      const solved = Number(solvedCount(student.id)) || 0;
      return { ...student, score, solved, progress: problemsCount ? Math.round((solved / problemsCount) * 100) : 0 };
    });
    rows.sort((a, b) => {
      const primary = sortBy === "solved" ? b.solved - a.solved : b.score - a.score;
      return primary || (b.score - a.score) || (b.solved - a.solved) || a.name.localeCompare(b.name, "vi");
    });
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [students, points, solvedCount, problemsCount, sortBy]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ranked.filter((row) => {
      const matchesName = !normalizedQuery || row.name.toLowerCase().includes(normalizedQuery) || String(row.username || "").toLowerCase().includes(normalizedQuery);
      const matchesScope = scope === "all" || (scope === "top" ? row.rank <= 10 : row.id === currentUser.id);
      return matchesName && matchesScope;
    });
  }, [ranked, query, scope, currentUser.id]);

  const currentRank = ranked.find((row) => row.id === currentUser.id);
  const topThree = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const chartData = ranked.slice(0, 10).map((row) => ({ name: row.name.split(" ").slice(-1)[0], full: row.name, pts: row.score }));
  const averageScore = ranked.length ? Math.round(ranked.reduce((sum, row) => sum + row.score, 0) / ranked.length) : 0;
  const completedCount = ranked.filter((row) => row.solved > 0).length;

  return (
    <div className="nb-ranking-page">
      <div className="nb-ranking-hero">
        <div><div className="nb-eyebrow">Thi đua · Thành tích học tập</div><h2 className="nb-ranking-title">Bảng xếp hạng đội tuyển</h2><p className="nb-ranking-sub">Ghi nhận nỗ lực luyện tập dựa trên điểm tốt nhất của từng bài.</p></div>
        <div className="nb-ranking-hero-badge"><Trophy size={22} /><span><strong>{ranked.length}</strong><small>thành viên</small></span></div>
      </div>

      <div className="nb-ranking-stat-grid">
        <div className="nb-ranking-stat"><span className="nb-ranking-stat-icon blue"><TrendingUp size={17} /></span><div><strong>{currentRank?.score || 0}</strong><small>Điểm của bạn</small></div></div>
        <div className="nb-ranking-stat"><span className="nb-ranking-stat-icon gold"><Award size={17} /></span><div><strong>{currentRank ? `#${currentRank.rank}` : "—"}</strong><small>Vị trí hiện tại</small></div></div>
        <div className="nb-ranking-stat"><span className="nb-ranking-stat-icon green"><ListChecks size={17} /></span><div><strong>{currentRank?.solved || 0}/{problemsCount}</strong><small>Bài đã giải</small></div></div>
        <div className="nb-ranking-stat"><span className="nb-ranking-stat-icon ink"><Users size={17} /></span><div><strong>{averageScore}</strong><small>Điểm trung bình</small></div></div>
      </div>

      {ranked.length > 0 && <div className="nb-ranking-podium">
        {topThree.map((row) => <div key={row.id} className={`nb-podium-card rank-${row.rank} ${row.id === currentUser.id ? "is-me" : ""}`}><div className="nb-podium-rank">{row.rank === 1 ? <Trophy size={19} /> : <Award size={18} />}<span>#{row.rank}</span></div><Avatar name={row.name} size={row.rank === 1 ? 54 : 44} /><strong>{row.name}</strong><span className="nb-sub">{row.solved} bài · {row.progress}% tiến độ</span><b>{row.score}<small> điểm</small></b>{row.id === currentUser.id && <span className="nb-podium-me">Bạn</span>}</div>)}
      </div>}

      <div className="nb-ranking-insight-grid">
        <div className="nb-panel nb-ranking-chart-panel"><div className="nb-ranking-section-head"><div><div className="nb-eyebrow">Top 10</div><h3 className="nb-h3">Đường đua điểm số</h3></div><TrendingUp size={18} style={{ color: "var(--pen-blue)" }} /></div><SimpleBarChart data={chartData} highlightName={currentUser.name} /></div>
        <div className="nb-panel nb-ranking-me-panel"><div className="nb-eyebrow">Hồ sơ thành tích</div><h3 className="nb-h3">{currentRank ? `Bạn đang ở vị trí #${currentRank.rank}` : "Chưa có thứ hạng"}</h3><div className="nb-ranking-me-score"><strong>{currentRank?.score || 0}</strong><span>điểm tích lũy</span></div><div className="nb-ranking-progress-head"><span>Tiến độ giải bài</span><strong>{currentRank?.progress || 0}%</strong></div><div className="nb-ranking-progress"><span style={{ width: `${currentRank?.progress || 0}%` }} /></div><p className="nb-sub">{completedCount}/{ranked.length} thành viên đã bắt đầu luyện tập.</p></div>
      </div>

      <div className="nb-ranking-toolbar"><div className="nb-ranking-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên học sinh…" /></div><div className="nb-ranking-controls"><select className="nb-input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="score">Xếp theo điểm</option><option value="solved">Xếp theo bài giải</option></select><div className="nb-filter-row" style={{ margin: 0 }}>{[["all", "Tất cả"], ["top", "Top 10"], ["me", "Của tôi"]].map(([key, label]) => <button key={key} className={`nb-chip ${scope === key ? "active" : ""}`} onClick={() => setScope(key)}>{label}</button>)}</div></div></div>

      <div className="nb-panel nb-table-wrap nb-ranking-table-panel"><div className="nb-ranking-table-title"><div><div className="nb-eyebrow">Bảng thành tích</div><h3 className="nb-h3">Xếp hạng chi tiết</h3></div><span className="nb-sub">{filtered.length}/{ranked.length} học sinh</span></div><table className="nb-table nb-ranking-table"><thead><tr><th>Hạng</th><th>Học sinh</th><th>Bài đã giải</th><th>Tiến độ</th><th className="nb-ranking-score-col">Điểm</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className={row.id === currentUser.id ? "me" : ""}><td><span className={`nb-rank-number rank-${row.rank}`}>{row.rank <= 3 ? (row.rank === 1 ? "01" : row.rank === 2 ? "02" : "03") : row.rank}</span></td><td><div className="nb-ranking-student"><Avatar name={row.name} size={30} /><span><strong>{row.name}</strong>{row.id === currentUser.id && <small>Bạn</small>}</span></div></td><td><strong>{row.solved}</strong><span className="nb-table-muted">/{problemsCount}</span></td><td><div className="nb-row-progress"><div><span style={{ width: `${row.progress}%` }} /></div><small>{row.progress}%</small></div></td><td className="nb-ranking-score-col"><strong>{row.score}</strong><span className="nb-table-muted">đ</span></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="nb-ranking-empty"><Search size={22} /><strong>Không tìm thấy học sinh</strong><span>Thử đổi từ khóa hoặc bộ lọc.</span></div>}</div>
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

  function registerVerdict(problemId, result, sourceCode = "") {
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
      sourceCode: String(sourceCode || ""),
      createdAt: new Date().toISOString(),
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
        .nb-image-upload-panel { display: flex; flex-direction: column; gap: 10px; }
        .nb-upload-drop { display: flex; align-items: center; gap: 10px; border: 1px dashed var(--pen-blue); background: rgba(44,74,140,0.05); color: var(--pen-blue); border-radius: 9px; padding: 13px; cursor: pointer; }
        .nb-upload-drop input { display: none; }
        .nb-upload-drop span { display: flex; flex-direction: column; gap: 3px; }
        .nb-upload-drop small { color: var(--slate); font-size: 11px; }
        .nb-image-preview-wrap { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
        .nb-image-preview { max-width: 100%; max-height: 220px; object-fit: contain; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; padding: 4px; }
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
        .nb-problem-card-image { width: 100%; max-height: 110px; object-fit: cover; border-radius: 7px; border: 1px solid var(--paper-line); }
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
        .nb-sample-title { color: var(--ink); font-size: 12px; font-weight: 700; margin-bottom: 9px; }
        .nb-sample-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nb-code-block { min-width: 0; border: 1px solid var(--paper-line); border-radius: 7px; overflow: hidden; background: #F8F8F4; }
        .nb-code-block-label { padding: 6px 8px; color: var(--slate); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--paper-line); }
        .nb-code-block pre { margin: 0; padding: 9px; min-height: 34px; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: var(--ink); font: 12px/1.55 'JetBrains Mono', monospace; }
        .nb-problem-statement { margin-top: 12px; color: var(--ink); font-size: 13.5px; line-height: 1.7; }
        .nb-problem-statement p { margin: 0 0 10px; white-space: pre-wrap; }
        .nb-problem-statement-image { display: block; max-width: 100%; max-height: 360px; object-fit: contain; margin: 0 0 14px; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; padding: 5px; }
        .nb-code-editor { width: 100%; min-height: 200px; background: var(--ink); color: #D8DEE9; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; border-radius: 8px; border: none; padding: 14px; resize: vertical; box-sizing: border-box; }
        .nb-thonny-editor { border: 1px solid #27364A; border-radius: 9px; overflow: hidden; background: #10202F; box-shadow: 0 6px 16px rgba(16,32,47,0.16); }
        .nb-editor-toolbar, .nb-editor-status { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 10px; color: #A8B8C8; background: #1A3045; font: 11px/1.2 'JetBrains Mono', monospace; }
        .nb-editor-toolbar span:first-child { display: flex; align-items: center; gap: 6px; color: #E4EDF5; font-weight: 600; }
        .nb-editor-status { color: #8296A8; background: #14283A; border-top: 1px solid #27364A; font-size: 10px; }
        .nb-editor-workspace { display: flex; position: relative; min-height: 330px; max-height: 480px; overflow: hidden; background: #10202F; }
        .nb-editor-gutter { flex: 0 0 46px; padding: 14px 7px 14px 0; color: #687E91; background: #0D1B28; text-align: right; user-select: none; font: 13px/1.55 'JetBrains Mono', monospace; }
        .nb-editor-gutter span { display: block; height: 20px; }
        .nb-editor-code-layer { position: relative; flex: 1; min-width: 0; overflow: hidden; }
        .nb-code-highlight, .nb-code-input { position: absolute; inset: 0; width: max-content; min-width: 100%; min-height: 100%; margin: 0; padding: 14px 16px; border: 0; box-sizing: border-box; font: 13px/1.55 'JetBrains Mono', monospace; letter-spacing: 0; tab-size: 4; white-space: pre; }
        .nb-code-highlight { pointer-events: none; color: #E5EDF5; background: transparent; }
        .nb-code-highlight code { font: inherit; }
        .nb-code-input { z-index: 2; resize: none; overflow: auto; color: transparent; caret-color: #F7C873; background: transparent; outline: none; -webkit-text-fill-color: transparent; }
        .nb-code-input::selection { background: rgba(92, 155, 213, 0.38); }
        .nb-syntax-comment { color: #6FA47C; font-style: italic; }
        .nb-syntax-string { color: #E6B36A; }
        .nb-syntax-number { color: #C99BE8; }
        .nb-syntax-keyword { color: #7DB7E8; font-weight: 600; }
        .nb-syntax-function { color: #82D4C1; }
        .nb-modal-actions { margin-top: 10px; display: flex; }
        .nb-solver-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 12px; color: var(--slate); font-size: 11.5px; }
        .nb-solver-meta strong { color: var(--ink); font-family: 'JetBrains Mono', monospace; }
        .nb-history-panel { margin-top: 14px; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; overflow: hidden; }
        .nb-history-toggle { width: 100%; display: flex; align-items: center; gap: 7px; padding: 10px 11px; background: transparent; border: none; color: var(--pen-blue); font: 600 12px inherit; cursor: pointer; text-align: left; }
        .nb-history-chevron { margin-left: auto; transition: transform .15s; }
        .nb-history-chevron.open { transform: rotate(90deg); }
        .nb-history-body { border-top: 1px solid var(--paper-line); padding: 9px; }
        .nb-history-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
        .nb-history-item { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 8px; border: 1px solid transparent; border-radius: 6px; background: #F8F8F4; text-align: left; cursor: pointer; font-family: inherit; }
        .nb-history-item:hover, .nb-history-item.active { border-color: var(--pen-blue); background: rgba(44,74,140,0.06); }
        .nb-history-item > div { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .nb-history-item strong { color: var(--ink); font: 700 11px 'JetBrains Mono', monospace; }
        .nb-history-item small { grid-column: 1 / -1; color: var(--slate); font-size: 10px; }
        .nb-history-date { color: var(--slate); font-size: 10px; }
        .nb-history-viewer { margin-top: 9px; border-top: 1px dashed var(--paper-line); padding-top: 9px; }
        .nb-history-viewer-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; font-size: 11px; }
        .nb-history-viewer-head .nb-btn { padding: 5px 8px; font-size: 10px; }
        .nb-history-code { max-height: 260px; overflow: auto; margin: 0; padding: 10px; border-radius: 6px; background: var(--ink); color: #D8DEE9; white-space: pre-wrap; word-break: break-word; font: 11px/1.5 'JetBrains Mono', monospace; }
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

        .nb-ranking-page { display: flex; flex-direction: column; gap: 18px; }
        .nb-ranking-hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 24px 26px; border-radius: 14px; color: #fff; background: linear-gradient(120deg, #183A5A 0%, #2C4A8C 58%, #5C78B8 100%); box-shadow: 0 10px 24px rgba(44,74,140,0.18); }
        .nb-ranking-title { margin: 6px 0 7px; font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; }
        .nb-ranking-sub { margin: 0; color: rgba(255,255,255,0.72); font-size: 13px; line-height: 1.5; }
        .nb-ranking-hero .nb-eyebrow { color: #C8D7EC; }
        .nb-ranking-hero-badge { display: flex; align-items: center; gap: 10px; padding: 10px 13px; border: 1px solid rgba(255,255,255,0.22); border-radius: 10px; background: rgba(255,255,255,0.1); }
        .nb-ranking-hero-badge span { display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-hero-badge strong { font: 700 18px 'JetBrains Mono', monospace; }
        .nb-ranking-hero-badge small { color: rgba(255,255,255,0.68); font-size: 10px; }
        .nb-ranking-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .nb-ranking-stat { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 14px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-ranking-stat-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; }
        .nb-ranking-stat-icon.blue { color: var(--pen-blue); background: rgba(44,74,140,0.11); }
        .nb-ranking-stat-icon.gold { color: var(--gold); background: rgba(185,130,47,0.13); }
        .nb-ranking-stat-icon.green { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-ranking-stat-icon.ink { color: var(--ink); background: rgba(16,21,28,0.08); }
        .nb-ranking-stat div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-stat strong { color: var(--ink); font: 700 20px 'JetBrains Mono', monospace; }
        .nb-ranking-stat small { color: var(--slate); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nb-ranking-podium { display: grid; grid-template-columns: 1fr 1.1fr 1fr; align-items: end; gap: 12px; min-height: 220px; }
        .nb-podium-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 20px 14px 17px; background: #fff; border: 1px solid var(--paper-line); border-radius: 12px; text-align: center; box-shadow: 0 5px 14px rgba(16,21,28,0.05); }
        .nb-podium-card.rank-1 { min-height: 220px; padding-top: 24px; border-color: rgba(185,130,47,0.55); box-shadow: 0 10px 22px rgba(185,130,47,0.14); }
        .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 184px; }
        .nb-podium-card.is-me { outline: 2px solid var(--red-pen); outline-offset: 2px; }
        .nb-podium-rank { display: flex; align-items: center; gap: 5px; color: var(--gold); font: 700 13px 'JetBrains Mono', monospace; }
        .nb-podium-card.rank-2 .nb-podium-rank { color: #738299; }
        .nb-podium-card.rank-3 .nb-podium-rank { color: #A86E4B; }
        .nb-podium-card > strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
        .nb-podium-card > b { color: var(--pen-blue); font: 700 19px 'JetBrains Mono', monospace; }
        .nb-podium-card > b small { color: var(--slate); font: 500 10px inherit; }
        .nb-podium-me { position: absolute; top: 9px; right: 9px; color: var(--red-pen); font: 700 9px 'JetBrains Mono', monospace; text-transform: uppercase; }
        .nb-ranking-insight-grid { display: grid; grid-template-columns: 1.35fr 0.65fr; gap: 16px; }
        .nb-ranking-chart-panel, .nb-ranking-me-panel { min-width: 0; }
        .nb-ranking-section-head, .nb-ranking-table-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .nb-ranking-me-panel { display: flex; flex-direction: column; }
        .nb-ranking-me-score { display: flex; align-items: baseline; gap: 8px; margin: 18px 0 22px; }
        .nb-ranking-me-score strong { color: var(--pen-blue); font: 700 32px 'JetBrains Mono', monospace; }
        .nb-ranking-me-score span { color: var(--slate); font-size: 12px; }
        .nb-ranking-progress-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 7px; color: var(--slate); font-size: 12px; }
        .nb-ranking-progress-head strong { color: var(--ink); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-ranking-progress, .nb-row-progress > div { height: 7px; border-radius: 99px; overflow: hidden; background: var(--paper-line); }
        .nb-ranking-progress span, .nb-row-progress > div span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #6A91D1); }
        .nb-ranking-me-panel .nb-sub { margin-top: auto; padding-top: 18px; }
        .nb-ranking-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .nb-ranking-search { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; padding: 0 11px; height: 40px; background: #fff; border: 1px solid var(--paper-line); border-radius: 8px; color: var(--slate); }
        .nb-ranking-search input { min-width: 0; flex: 1; border: none; outline: none; background: transparent; color: var(--ink); font: 13px inherit; }
        .nb-ranking-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .nb-ranking-controls .nb-input { width: auto; min-width: 150px; height: 36px; padding-top: 5px; padding-bottom: 5px; }
        .nb-ranking-table-panel { padding: 18px 18px 8px; }
        .nb-ranking-table-title { margin-bottom: 12px; }
        .nb-ranking-table { min-width: 650px; }
        .nb-ranking-table th { padding-top: 8px; padding-bottom: 10px; }
        .nb-ranking-table td { height: 52px; }
        .nb-ranking-table tr.me { background: rgba(44,74,140,0.07); }
        .nb-ranking-table tr.me td:first-child { box-shadow: inset 3px 0 var(--red-pen); }
        .nb-ranking-score-col { text-align: right !important; }
        .nb-rank-number { display: inline-flex; align-items: center; justify-content: center; min-width: 27px; height: 27px; color: var(--slate); font: 600 11px 'JetBrains Mono', monospace; }
        .nb-rank-number.rank-1, .nb-rank-number.rank-2, .nb-rank-number.rank-3 { border-radius: 7px; }
        .nb-rank-number.rank-1 { color: #8A6417; background: rgba(185,130,47,0.18); }
        .nb-rank-number.rank-2 { color: #5F6D80; background: rgba(95,109,128,0.13); }
        .nb-rank-number.rank-3 { color: #8E5C40; background: rgba(168,110,75,0.14); }
        .nb-ranking-student { display: flex; align-items: center; gap: 9px; }
        .nb-ranking-student > span { display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-student strong { font-size: 13px; }
        .nb-ranking-student small { color: var(--red-pen); font: 600 10px 'JetBrains Mono', monospace; }
        .nb-table-muted { color: var(--slate); font-size: 11px; margin-left: 2px; }
        .nb-row-progress { display: flex; align-items: center; gap: 8px; min-width: 130px; }
        .nb-row-progress > div { flex: 1; height: 6px; }
        .nb-row-progress small { width: 32px; color: var(--slate); font: 10px 'JetBrains Mono', monospace; }
        .nb-ranking-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 36px 12px 28px; color: var(--slate); }
        .nb-ranking-empty strong { color: var(--ink); font-size: 13px; }
        .nb-ranking-empty span { font-size: 11px; }

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
          .nb-ranking-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .nb-ranking-insight-grid { grid-template-columns: 1fr; }
          .nb-ranking-podium { gap: 8px; }
          .nb-podium-card { padding-left: 8px; padding-right: 8px; }
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
          .nb-sample-grid { grid-template-columns: 1fr; }
          .nb-two-col, .nb-modal-body { grid-template-columns: 1fr; }
          .nb-ranking-hero { align-items: flex-start; padding: 20px; }
          .nb-ranking-title { font-size: 24px; }
          .nb-ranking-toolbar { align-items: stretch; }
          .nb-ranking-search { flex-basis: 100%; }
          .nb-ranking-controls { width: 100%; justify-content: space-between; }
          .nb-ranking-controls .nb-input { flex: 1; }
          .nb-modal { max-height: 94vh; }
          .nb-ranking-podium { grid-template-columns: 1fr 1fr 1fr; min-height: 180px; }
          .nb-podium-card.rank-1 { min-height: 188px; }
          .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 160px; }
          .nb-podium-card > strong { font-size: 11px; }
          .nb-podium-card > b { font-size: 15px; }
          .nb-modal-body { padding: 16px; }
          .nb-code-editor { min-height: 160px; }
          .nb-ranking-stat-grid { gap: 8px; }
          .nb-ranking-stat { padding: 11px; }
          .nb-ranking-stat strong { font-size: 16px; }
          .nb-ranking-hero-badge { display: none; }
          .nb-ranking-controls { flex-direction: column; align-items: stretch; }
          .nb-ranking-controls .nb-input { width: 100%; }
          .nb-ranking-controls .nb-filter-row { justify-content: stretch; }
          .nb-ranking-controls .nb-chip { flex: 1; }
          .nb-ranking-podium { gap: 5px; }
          .nb-podium-card { border-radius: 9px; }
          .nb-podium-card.rank-1 { min-height: 172px; }
          .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 145px; }
          .nb-podium-card .nb-sub { font-size: 9px; }
          .nb-ranking-table-panel { padding-left: 10px; padding-right: 10px; }
          .nb-editor-workspace { min-height: 250px; }
          .nb-editor-toolbar, .nb-editor-status { font-size: 9px; }
          .nb-code-highlight, .nb-code-input { font-size: 12px; padding-left: 12px; padding-right: 12px; }
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
