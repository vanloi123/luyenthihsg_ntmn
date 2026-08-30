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

const LANGUAGE_OPTIONS = [
  { value: "python", label: "Python 3", judgeId: 71, extension: ".py", starter: "# Viết code Python của bạn tại đây\n\n" },
  { value: "c", label: "C (GNU C11)", judgeId: 50, extension: ".c", starter: "/* Viết code C của bạn tại đây */\n\n" },
  { value: "cpp", label: "C++17", judgeId: 54, extension: ".cpp", starter: "// Viết code C++ của bạn tại đây\n\n" },
];
const LANGUAGE_META = Object.fromEntries(LANGUAGE_OPTIONS.map((item) => [item.value, item]));

function normalizeLanguage(rawLanguage, legacyIsPython = false) {
  const value = String(rawLanguage ?? "").trim().toLowerCase();
  if (["python", "py", "python3", "71", "true"].includes(value)) return "python";
  if (["c", "c11", "gnu c", "gnu c11", "50"].includes(value)) return "c";
  if (["cpp", "c++", "cxx", "gnu c++", "gnu c++17", "54"].includes(value)) return "cpp";
  if (legacyIsPython === true || legacyIsPython === 1 || String(legacyIsPython).trim().toLowerCase() === "true") return "python";
  return "cpp";
}

function problemLanguage(problem) {
  return normalizeLanguage(problem?.language, problem?.isPython);
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
    testCases: [createEmptyTestCase()], language: "cpp", isPython: false,
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

const ACCOUNT_ROLE_META = {
  student: { label: "Học sinh", shortLabel: "HS" },
  teacher: { label: "Giáo viên", shortLabel: "GV" },
  admin: { label: "Quản trị viên tối cao", shortLabel: "Admin" },
};

function normalizeAccountRole(rawRole) {
  const value = String(rawRole || "").trim().toLowerCase();
  if (["admin", "administrator", "superadmin", "super_admin", "root"].includes(value)) return "admin";
  if (["teacher", "gv", "lecturer"].includes(value)) return "teacher";
  return "student";
}

function accountRoleLabel(role) {
  return ACCOUNT_ROLE_META[normalizeAccountRole(role)]?.label || ACCOUNT_ROLE_META.student.label;
}

function mapAccount(row) {
  return {
    id: row.id, name: row.name, role: normalizeAccountRole(row.role), username: row.username,
    passwordHash: row.password_hash, passwordChanged: row.password_changed,
    plainInitial: row.plain_initial, className: row.class_name, streak: row.streak || 0,
  };
}
function mapTopic(row) {
  return { id: row.id, code: row.code, title: row.title, weeks: row.weeks, summary: row.summary, content: row.content };
}
function mapProblem(row) {
  const language = normalizeLanguage(row.language, row.is_python);
  return {
    id: row.id, title: row.title, topic: row.topic, difficulty: row.difficulty, points: row.points,
    language, isPython: language === "python", statement: row.statement,
    sample: { input: row.sample_input, output: row.sample_output },
    imageUrl: row.statement_image_url || "",
    createdAt: row.created_at || row.createdAt || null,
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
  // Schema hiện tại đã có cột language; lưu cả language và is_python để tương thích dữ liệu cũ.
  const language = normalizeLanguage(p.language, p.isPython);
  const { error } = await supabase.from("problems").insert({
    id: p.id, title: p.title, topic: p.topic, difficulty: p.difficulty, points: p.points,
    language, is_python: language === "python", statement: p.statement, statement_image_url: p.imageUrl || null,
    sample_input: p.sample.input, sample_output: p.sample.output,
    test_cases: normalizeTestCases(p.testCases),
  });
  if (error) throw error;
}
async function dbUpdateProblem(p) {
  // Cập nhật language để lần mở lại biểu mẫu giữ đúng Python, C hoặc C++ đã chọn.
  const language = normalizeLanguage(p.language, p.isPython);
  const { error } = await supabase.from("problems").update({
    title: p.title, topic: p.topic, difficulty: p.difficulty, points: p.points,
    language, is_python: language === "python", statement: p.statement, statement_image_url: p.imageUrl || null,
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
async function dbUpdateContest(c) {
  const { error } = await supabase.from("contests").update({
    title: c.title, status: c.status, date: c.date, duration: c.duration, problem_ids: c.problemIds,
  }).eq("id", c.id);
  if (error) throw error;
}
async function dbRemoveContest(id) {
  const { error } = await supabase.from("contests").delete().eq("id", id);
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
  const role = normalizeAccountRole(a.role);
  const { error } = await supabase.from("accounts").insert({
    id: a.id, name: a.name, role, username: a.username,
    password_hash: a.passwordHash, password_changed: false, plain_initial: a.plainInitial,
    class_name: role === "student" ? "11 Tin" : null, streak: 0,
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

const PENDING_PROBLEM_WRITES_KEY = "pending-problem-writes-v1";

function getPendingProblemWrites() {
  const pending = lsGet(PENDING_PROBLEM_WRITES_KEY);
  return Array.isArray(pending) ? pending : [];
}

function isDuplicateKeyError(error) {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(String(error?.message || ""));
}

function problemSaveErrorMessage(error) {
  const detail = String(error?.message || "").trim();
  if (error?.code === "42501" || /row-level security|permission denied|not allowed/i.test(detail)) {
    return "Không thể lưu bài tập vì tài khoản hiện tại chưa có quyền tạo bài. Hãy kiểm tra quyền INSERT của bảng problems.";
  }
  if (/network|fetch|failed to fetch|timeout/i.test(detail)) {
    return "Không thể kết nối để lưu bài tập. Bài đã được giữ trên thiết bị này và sẽ thử gửi lại khi bạn bấm làm mới.";
  }
  return detail
    ? `Không thể lưu bài tập. Bài đã được giữ trên thiết bị này. Chi tiết: ${detail}`
    : "Không thể lưu bài tập. Bài đã được giữ trên thiết bị này và sẽ thử gửi lại khi bạn bấm làm mới.";
}

/* ---------------------------------------------------------------------- */
/*  HELPERS                                                                 */
/* ---------------------------------------------------------------------- */

const DIFFICULTIES = ["Dễ", "Trung bình", "Khó"];

const JUDGE0_ENDPOINT = "https://ce.judge0.com";
const JUDGE0_LANGUAGE_IDS = {
  python: 71, // Python 3
  c: 50, // GNU C11
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

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  if (!value || typeof value !== "string") return value || "";
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (error) {
    return value;
  }
}

function decodeJudgeResult(result) {
  if (!result || typeof result !== "object") return result;
  return {
    ...result,
    stdout: decodeBase64Utf8(result.stdout),
    stderr: decodeBase64Utf8(result.stderr),
    compile_output: decodeBase64Utf8(result.compile_output),
    message: decodeBase64Utf8(result.message),
  };
}

async function judgeOneTest({ sourceCode, languageId, input, expectedOutput }) {
  const payload = {
    source_code: encodeBase64Utf8(sourceCode),
    language_id: Number(languageId),
    stdin: encodeBase64Utf8(input),
    expected_output: encodeBase64Utf8(expectedOutput),
    cpu_time_limit: 2,
    wall_time_limit: 5,
    memory_limit: 128000,
  };
  const createResponse = await fetchWithTimeout(
    `${JUDGE0_ENDPOINT}/submissions?base64_encoded=true&wait=false`,
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
      `${JUDGE0_ENDPOINT}/submissions/${encodeURIComponent(created.token)}?base64_encoded=true`,
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
    const decodedResult = decodeJudgeResult(result);
    const statusId = decodedResult.status?.id;
    if (decodedResult.error && !decodedResult.status) throw new Error(`Judge0 từ chối lượt chấm: ${judgeResponseMessage(decodedResult)}.`);
    if (statusId !== 1 && statusId !== 2) return decodedResult;
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

  const language = problemLanguage(problem);
  const languageId = JUDGE0_LANGUAGE_IDS[language] || JUDGE0_LANGUAGE_IDS.cpp;
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

function StorageBanner({ visible, message, onDismiss, onRetry }) {
  if (!visible) return null;
  const text = typeof message === "string" && message.trim()
    ? message
    : "Không đồng bộ được dữ liệu lúc này — thay đổi có thể chưa được lưu cho cả lớp.";
  return (
    <div className="nb-storage-banner">
      <AlertCircle size={15} />
      <span>{text}</span>
      {onRetry && <button className="nb-icon-btn" onClick={onRetry} aria-label="Thử đồng bộ lại" title="Thử đồng bộ lại"><RefreshCw size={14} /></button>}
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
        <div className="nb-brand-mark" style={{ width: 44, height: 44, margin: "0 auto 14px", background: "var(--pen-blue)" }}>
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
const C_KEYWORDS = new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool _Complex _Imaginary NULL printf scanf malloc free".split(" "));
const CPP_KEYWORDS = new Set("alignas alignof auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend if inline int long namespace new nullptr operator private protected public register return short signed sizeof static struct template this throw true try typedef typename union unsigned using virtual void volatile while std string cin cout endl".split(" "));

function highlightCodeLine(line, language) {
  const keywords = language === "python" ? PYTHON_KEYWORDS : language === "c" ? C_KEYWORDS : CPP_KEYWORDS;
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
  const INDENT = "    ";

  function applyEdit(nextCode, nextStart, nextEnd = nextStart) {
    onChange(nextCode);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.selectionStart = nextStart;
      textareaRef.current.selectionEnd = nextEnd;
    });
  }

  function getLineStart(value, position) {
    const index = value.lastIndexOf("\n", Math.max(0, position - 1));
    return index < 0 ? 0 : index + 1;
  }

  function getIndent(value) {
    const match = String(value || "").match(/^[ \\t]*/);
    return (match ? match[0] : "").replace(/\t/g, INDENT);
  }

  function previousNonEmptyLine(value, position) {
    const before = value.slice(0, position).split("\n");
    before.pop();
    for (let index = before.length - 1; index >= 0; index -= 1) {
      if (before[index].trim()) return before[index];
    }
    return "";
  }

  function handleIndentSelection(event) {
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const selectionStart = getLineStart(code, start);
    const selectionEndIndex = code.indexOf("\n", end);
    const selectionEnd = selectionEndIndex < 0 ? code.length : selectionEndIndex;
    const selected = code.slice(selectionStart, selectionEnd);
    const selectedLines = selected.split("\n");
    const isUnindent = event.shiftKey;
    const transformed = selectedLines.map((line) => {
      if (!isUnindent) return INDENT + line;
      if (line.startsWith(INDENT)) return line.slice(INDENT.length);
      if (line.startsWith("\t")) return line.slice(1);
      return line.replace(/^ {1,3}/, "");
    }).join("\n");
    const next = code.slice(0, selectionStart) + transformed + code.slice(selectionEnd);
    const deltaStart = transformed.length - selected.length;
    const lineCountBeforeEnd = selected.slice(0, Math.max(0, end - selectionStart)).split("\n").length - 1;
    const nextStart = Math.max(selectionStart, start + (isUnindent ? Math.min(0, deltaStart) : INDENT.length));
    const nextEnd = Math.max(nextStart, end + (isUnindent ? deltaStart - lineCountBeforeEnd * (deltaStart < 0 ? -deltaStart : 0) : lineCountBeforeEnd * INDENT.length + INDENT.length));
    applyEdit(next, nextStart, nextEnd);
  }

  function handleEnter(target) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const lineStart = getLineStart(code, start);
    const currentLine = code.slice(lineStart, start);
    const currentIndent = getIndent(currentLine);
    const trimmed = currentLine.trim();
    const previousLine = previousNonEmptyLine(code, lineStart);
    const previousIndent = getIndent(previousLine);
    const pythonOpener = language === "python" && /:\s*(#.*)?$/.test(trimmed);
    const pythonDedenter = language === "python" && /^(return|pass|break|continue|raise)\b/.test(trimmed);
    const cppOpener = language !== "python" && /\{\s*(\/\/.*)?$/.test(trimmed);
    const cppCloser = language !== "python" && /^}/.test(trimmed);
    let nextIndent = currentIndent;
    if (pythonOpener || cppOpener) nextIndent += INDENT;
    if (pythonDedenter) nextIndent = currentIndent.length >= INDENT.length ? currentIndent.slice(0, -INDENT.length) : previousIndent;
    if (cppCloser) nextIndent = currentIndent.length >= INDENT.length ? currentIndent.slice(0, -INDENT.length) : "";
    const insertion = `\n${nextIndent}`;
    applyEdit(code.slice(0, start) + insertion + code.slice(end), start + insertion.length);
  }

  function handleKeyDown(event) {
    const target = event.currentTarget;
    if (readOnly) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (target.selectionStart !== target.selectionEnd || event.shiftKey) handleIndentSelection(event);
      else {
        const start = target.selectionStart;
        applyEdit(code.slice(0, start) + INDENT + code.slice(target.selectionEnd), start + INDENT.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleEnter(target);
    } else if (event.key === "Backspace" && target.selectionStart === target.selectionEnd) {
      const start = target.selectionStart;
      const lineStart = getLineStart(code, start);
      const beforeCursor = code.slice(lineStart, start);
      if (beforeCursor.length > 0 && beforeCursor.length % INDENT.length === 0 && /^ +$/.test(beforeCursor)) {
        event.preventDefault();
        applyEdit(code.slice(0, start - INDENT.length) + code.slice(start), start - INDENT.length);
      }
    }
  }

  return (
    <div className="nb-thonny-editor">
      <div className="nb-editor-toolbar"><span><Code2 size={14} /> {(LANGUAGE_META[language] || LANGUAGE_META.cpp).label} · Editor</span><span>Ln {Math.min(lines.length, 999)} · {code.length} ký tự</span></div>
      <div className="nb-editor-workspace">
        <div className="nb-editor-gutter" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div>
        <div className="nb-editor-code-layer">
          <pre className="nb-code-highlight" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }} aria-hidden="true"><code>{lines.map((line, index) => <React.Fragment key={index}>{highlightCodeLine(line, language)}{index < lines.length - 1 ? "\n" : ""}</React.Fragment>)}</code></pre>
          <textarea ref={textareaRef} className="nb-code-input" value={code} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })} spellCheck={false} readOnly={readOnly} aria-label="Trình soạn thảo mã nguồn" />
        </div>
      </div>
      <div className="nb-editor-status"><span>{readOnly ? "Chế độ chỉ xem" : "Enter sau : tự thụt 4 khoảng · Shift+Tab lùi dòng · Ctrl/Cmd + Enter nộp bài"}</span><span>{(LANGUAGE_META[language] || LANGUAGE_META.cpp).label}</span></div>
    </div>
  );
}

function ProblemSolverModal({ problem, onClose, onVerdict, readOnly, disabledLabel, alreadySolved, bestScore = 0, attemptCount = 0, submissionHistory = [] }) {
  const editorLanguage = problemLanguage(problem);
  const editorMeta = LANGUAGE_META[editorLanguage] || LANGUAGE_META.cpp;
  const [code, setCode] = useState(() => editorMeta.starter);
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const editorRef = useRef(null);
  const orderedHistory = submissionHistory.filter((submission) => submission.problemId === problem.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const selectedHistory = orderedHistory.find((submission) => submission.id === selectedHistoryId) || orderedHistory[0] || null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event) => {
      if (event.key === "Escape" && !judging) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [problem.id, onClose, judging]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [problem.id]);

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
    <div className="nb-modal-overlay" onClick={onClose} role="presentation">
      <div className="nb-modal nb-solver-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="problem-solver-title">
        <div className="nb-modal-head">
          <div>
            <div className="nb-eyebrow">{problem.id} · {editorMeta.label} · {problem.points} điểm</div>
            <h3 id="problem-solver-title" className="nb-h3">{problem.title}</h3>
          </div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="nb-modal-body nb-solver-modal-body">
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

          <div ref={editorRef} className="nb-modal-col nb-solver-editor-anchor">
            <CodeEditor code={code} onChange={setCode} language={editorLanguage} onSubmit={handleSubmit} readOnly={readOnly} />
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

function OverviewView({ currentUser, students, submissions, points, solvedCount, contests, discussions, problemsCount, onNavigate }) {
  const isTeacher = currentUser.role === "teacher" || currentUser.role === "admin";
  const firstName = currentUser.name.split(" ").slice(-1)[0];

  if (!isTeacher) {
    const rankSorted = [...students].sort((a, b) => (points(b.id) - points(a.id)) || (solvedCount(b.id) - solvedCount(a.id)));
    const rank = rankSorted.findIndex((student) => student.id === currentUser.id) + 1;
    const activeContest = contests.find((contest) => contest.status === "active");
    const recentActivity = submissions.filter((submission) => submission.studentId === currentUser.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
    const solved = solvedCount(currentUser.id);
    const progress = problemsCount ? Math.round((solved / problemsCount) * 100) : 0;
    const bestRecent = recentActivity.find((submission) => submission.verdict === "AC");

    return (
      <div className="nb-home-page">
        <div className="nb-home-hero student"><div><div className="nb-eyebrow">Bảng điều khiển cá nhân · Đội tuyển Tin học</div><h1>Chào {firstName}</h1><p>Tiếp tục nhịp học hôm nay và tiến gần hơn đến mục tiêu của em.</p></div><div className="nb-home-hero-rank"><Award size={21} /><span><strong>#{rank > 0 ? rank : "—"}</strong><small>thứ hạng hiện tại</small></span></div></div>
        <div className="nb-home-stat-grid"><div className="nb-home-stat"><span className="blue"><TrendingUp size={17} /></span><div><strong>{points(currentUser.id)}</strong><small>Tổng điểm</small></div></div><div className="nb-home-stat"><span className="gold"><Award size={17} /></span><div><strong>#{rank > 0 ? rank : "—"}</strong><small>Xếp hạng lớp</small></div></div><div className="nb-home-stat"><span className="green"><ListChecks size={17} /></span><div><strong>{solved}/{problemsCount}</strong><small>Bài đã giải</small></div></div><div className="nb-home-stat"><span className="red"><Flame size={17} /></span><div><strong>{currentUser.streak || 0}</strong><small>Ngày liên tục</small></div></div></div>

        <div className="nb-home-main-grid"><section className="nb-home-progress-card"><div className="nb-home-card-head"><div><div className="nb-eyebrow">Mục tiêu học tập</div><h2>Tiến độ luyện tập</h2></div><span className="nb-home-percent">{progress}%</span></div><p className="nb-sub">Em đã hoàn thành {solved} trên tổng số {problemsCount} bài tập trong ngân hàng.</p><div className="nb-home-progress"><span style={{ width: `${progress}%` }} /></div><div className="nb-home-progress-foot"><span>Tiếp tục duy trì nhịp học đều đặn</span><strong>{problemsCount - solved > 0 ? `${problemsCount - solved} bài còn lại` : "Đã hoàn thành tất cả"}</strong></div><div className="nb-home-actions"><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Luyện tập ngay</button><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("lessons")}><BookOpen size={15} /> Xem bài giảng</button></div></section><section className={`nb-home-contest-card ${activeContest ? "live" : ""}`}><div className="nb-home-card-head"><div><div className="nb-eyebrow">Đề thi thử</div><h2>{activeContest ? "Kỳ thi đang mở" : "Sẵn sàng cho thử thách?"}</h2></div><span className={activeContest ? "nb-home-live-dot" : "nb-home-clock-icon"}>{activeContest ? <span /> : <Clock size={19} />}</span></div>{activeContest ? <><h3>{activeContest.title}</h3><div className="nb-home-contest-meta"><span><Clock size={13} /> {activeContest.duration} phút</span><span><ListChecks size={13} /> {activeContest.problemIds.length} bài</span></div><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("contests")}><Play size={15} /> Vào thi thử</button></> : <><p className="nb-sub">Hiện chưa có đề đang mở. Em có thể xem lịch và chuẩn bị trước cho kỳ thi tiếp theo.</p><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("contests")}><Clock size={15} /> Xem lịch đề thi</button></>}</section></div>

        <div className="nb-home-lower-grid"><section className="nb-panel nb-home-activity"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Nhật ký học tập</div><h2>Hoạt động gần đây</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("problems")}>Xem tất cả <ChevronRight size={14} /></button></div>{recentActivity.length === 0 ? <div className="nb-home-empty"><Code2 size={22} /><strong>Chưa có hoạt động</strong><span>Bắt đầu giải bài đầu tiên để theo dõi tiến độ.</span></div> : <div className="nb-home-activity-list">{recentActivity.map((submission, index) => <div className="nb-home-activity-item" key={submission.id || index}><span className={`nb-home-activity-icon ${submission.verdict === "AC" ? "success" : "warning"}`}>{submission.verdict === "AC" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</span><div><strong>{submission.verdict === "AC" ? "Đã giải thành công" : "Đã nộp bài"}</strong><small>{submission.problemTitle || submission.problemId} · {submission.passedTests != null && submission.totalTests != null ? `${submission.passedTests}/${submission.totalTests} test` : submission.verdict}</small></div><span className="nb-home-activity-score">{submission.score ?? 0}đ</span></div>)}</div>}</section><section className="nb-panel nb-home-next"><div className="nb-eyebrow">Gợi ý tiếp theo</div><h2>{bestRecent ? "Duy trì đà tiến bộ" : "Bắt đầu hành trình"}</h2><p className="nb-sub">{bestRecent ? `Bài gần nhất em giải tốt là ${bestRecent.problemTitle || bestRecent.problemId}. Hãy thử một bài khó hơn.` : "Hãy chọn một bài giảng hoặc bài tập để bắt đầu xây dựng thành tích."}</p><div className="nb-home-next-links"><button onClick={() => onNavigate?.("problems")}><span><Code2 size={15} /> Bài tập đề xuất</span><ChevronRight size={15} /></button><button onClick={() => onNavigate?.("lessons")}><span><BookOpen size={15} /> Học lý thuyết</span><ChevronRight size={15} /></button><button onClick={() => onNavigate?.("leaderboard")}><span><Trophy size={15} /> Xem bảng xếp hạng</span><ChevronRight size={15} /></button></div></section></div>
      </div>
    );
  }

  const avgPoints = students.length ? Math.round(students.reduce((sum, student) => sum + points(student.id), 0) / students.length) : 0;
  const topThree = [...students].sort((a, b) => (points(b.id) - points(a.id)) || (solvedCount(b.id) - solvedCount(a.id))).slice(0, 3);
  const behind = [...students].sort((a, b) => solvedCount(a.id) - solvedCount(b.id)).slice(0, 4);
  const openThreads = discussions.filter((discussion) => discussion.replies.length === 0);
  const activeContest = contests.find((contest) => contest.status === "active");
  const activeStudents = students.filter((student) => solvedCount(student.id) > 0).length;
  const totalSolved = students.reduce((sum, student) => sum + solvedCount(student.id), 0);
  const recentClassActivity = submissions.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 4);

  return (
    <div className="nb-home-page"><div className="nb-home-hero teacher"><div><div className="nb-eyebrow">Bảng điều khiển giáo viên · Đội tuyển Tin học</div><h1>Tổng quan đội tuyển</h1><p>Theo dõi nhịp học, kết quả và những điểm cần hỗ trợ của lớp.</p></div><div className="nb-home-hero-rank"><Users size={21} /><span><strong>{students.length}</strong><small>học sinh trong lớp</small></span></div></div><div className="nb-home-stat-grid"><div className="nb-home-stat"><span className="blue"><Users size={17} /></span><div><strong>{students.length}</strong><small>Học sinh</small></div></div><div className="nb-home-stat"><span className="green"><TrendingUp size={17} /></span><div><strong>{avgPoints}</strong><small>Điểm trung bình</small></div></div><div className="nb-home-stat"><span className="gold"><Code2 size={17} /></span><div><strong>{problemsCount}</strong><small>Bài trong ngân hàng</small></div></div><div className="nb-home-stat"><span className="red"><MessageSquare size={17} /></span><div><strong>{openThreads.length}</strong><small>Câu hỏi cần trả lời</small></div></div></div><div className="nb-home-main-grid"><section className="nb-home-class-card"><div className="nb-home-card-head"><div><div className="nb-eyebrow">Sức khỏe lớp học</div><h2>Nhịp luyện tập</h2></div><span className="nb-home-percent">{students.length ? Math.round((activeStudents / students.length) * 100) : 0}%</span></div><p className="nb-sub">{activeStudents}/{students.length} học sinh đã bắt đầu giải bài.</p><div className="nb-home-progress"><span style={{ width: `${students.length ? (activeStudents / students.length) * 100 : 0}%` }} /></div><div className="nb-home-progress-foot"><span>{totalSolved} lượt bài đã được giải</span><strong>{activeStudents} học sinh đang hoạt động</strong></div><div className="nb-home-actions"><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("leaderboard")}><Trophy size={15} /> Xem bảng xếp hạng</button><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Quản lý bài tập</button></div></section><section className={`nb-home-contest-card ${activeContest ? "live" : ""}`}><div className="nb-home-card-head"><div><div className="nb-eyebrow">Trạng thái kỳ thi</div><h2>{activeContest ? "Đang có đề mở" : "Chưa có đề đang mở"}</h2></div><Clock size={19} /></div>{activeContest ? <><h3>{activeContest.title}</h3><div className="nb-home-contest-meta"><span><Clock size={13} /> {activeContest.duration} phút</span><span><ListChecks size={13} /> {activeContest.problemIds.length} bài</span></div><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("contests")}><Eye size={15} /> Quản lý kỳ thi</button></> : <><p className="nb-sub">Tạo hoặc mở một kỳ thi để học sinh bắt đầu thử sức.</p><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("contests")}><Plus size={15} /> Mở khu vực đề thi</button></>}</section></div><div className="nb-home-lower-grid"><section className="nb-panel nb-home-activity"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Thành tích lớp</div><h2>Học sinh nổi bật</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("leaderboard")}>Xem bảng đầy đủ <ChevronRight size={14} /></button></div>{topThree.length === 0 ? <div className="nb-home-empty"><Users size={22} /><strong>Chưa có dữ liệu</strong><span>Thành tích sẽ xuất hiện khi học sinh bắt đầu nộp bài.</span></div> : <div className="nb-home-student-list">{topThree.map((student, index) => <div className="nb-home-student-row" key={student.id}><span className={`nb-home-rank rank-${index + 1}`}>{index + 1}</span><Avatar name={student.name} size={32} /><div><strong>{student.name}</strong><small>{solvedCount(student.id)} bài đã giải</small></div><b>{points(student.id)}<small>đ</small></b></div>)}</div>}</section><section className="nb-panel nb-home-attention"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Theo dõi hỗ trợ</div><h2>Cần quan tâm thêm</h2></div><AlertCircle size={18} style={{ color: "var(--gold)" }} /></div>{behind.length === 0 ? <p className="nb-sub">Chưa có dữ liệu để phân tích.</p> : <div className="nb-home-support-list">{behind.map((student) => <div key={student.id}><Avatar name={student.name} size={28} /><span><strong>{student.name}</strong><small>{solvedCount(student.id)} bài đã giải</small></span><button onClick={() => onNavigate?.("problems")} aria-label={`Xem bài tập của ${student.name}`}><ChevronRight size={15} /></button></div>)}</div>}</section></div><section className="nb-panel nb-home-class-activity"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Theo thời gian thực</div><h2>Hoạt động gần đây của lớp</h2></div><span className="nb-pill nb-pill-ac">{recentClassActivity.length} cập nhật</span></div>{recentClassActivity.length === 0 ? <p className="nb-sub">Chưa có lượt nộp bài gần đây.</p> : <div className="nb-home-class-feed">{recentClassActivity.map((submission, index) => <div key={submission.id || index}><span className={`nb-home-activity-icon ${submission.verdict === "AC" ? "success" : "warning"}`}>{submission.verdict === "AC" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</span><span><strong>{submission.studentId}</strong> đã nộp <b>{submission.problemTitle || submission.problemId}</b><small>{submission.verdict} · {submission.score ?? 0} điểm</small></span></div>)}</div>}</section></div>
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
              <div><strong>{discussion.author}</strong>{discussion.role !== "student" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 6 }}>{discussion.role === "admin" ? "Quản trị viên" : "Giáo viên"}</span>}<div className="nb-sub">Câu hỏi về {topic.title}</div></div>
            </div>
            <p className="nb-para" style={{ margin: "9px 0" }}>{discussion.content}</p>
            {(discussion.replies || []).length > 0 && <div className="nb-reply-list">{discussion.replies.map((reply, index) => <div className="nb-reply" key={index}><Avatar name={reply.author} size={22} /><div><strong style={{ fontSize: 12 }}>{reply.author}</strong>{reply.role !== "student" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 5 }}>{reply.role === "admin" ? "Admin" : "GV"}</span>}<div className="nb-sub" style={{ color: "var(--ink)" }}>{reply.content}</div></div></div>)}</div>}
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
  const [languageFilter, setLanguageFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const imageObjectUrlRef = useRef(null);
  const [form, setForm] = useState(() => createProblemForm(topics[0]?.id));
  const [collapsedMonths, setCollapsedMonths] = useState({});
  const problemFormRef = useRef(null);

  const currentSubmissions = submissions.filter((s) => s.studentId === currentUser?.id);
  const completedCount = problems.filter((p) => solvedByCurrent(p.id)).length;
  const attemptsCount = currentSubmissions.length;

  function problemStats(problemId) {
    const attempts = currentSubmissions.filter((s) => s.problemId === problemId);
    return {
      attempts: attempts.length,
      bestScore: attempts.reduce((best, s) => Math.max(best, Number(s.score ?? (s.verdict === "AC" ? s.problemPoints : 0))), 0),
    };
  }

  function teacherProblemStats(problemId) {
    const attempts = submissions.filter((s) => s.problemId === problemId);
    return {
      attempts: attempts.length,
      solvedStudents: new Set(attempts.filter((s) => s.verdict === "AC").map((s) => s.studentId)).size,
    };
  }

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const filtered = useMemo(() => problems.filter((problem) => {
    const languageMatches = languageFilter === "all" || problemLanguage(problem) === languageFilter;
    const solved = solvedByCurrent(problem.id);
    const attempts = problemStats(problem.id).attempts;
    const progressMatches = progressFilter === "all"
      || (progressFilter === "todo" && attempts === 0)
      || (progressFilter === "in-progress" && attempts > 0 && !solved)
      || (progressFilter === "done" && solved);
    const topic = topicById.get(problem.topic);
    const searchText = `${problem.id} ${problem.title} ${topic?.title || ""} ${topic?.code || ""}`.toLocaleLowerCase("vi-VN");
    return languageMatches && progressMatches && (!query.trim() || searchText.includes(query.trim().toLocaleLowerCase("vi-VN")));
  }), [problems, languageFilter, progressFilter, query, topicById, currentSubmissions, solvedByCurrent]);

  function problemMonth(problem) {
    const rawDate = problem.createdAt || problem.created_at || (String(problem.id || "").startsWith("PX") ? Number(String(problem.id).slice(2)) : null);
    if (!rawDate) return { key: "unknown", label: "Chưa phân tháng", sort: 0 };
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return { key: "unknown", label: "Chưa phân tháng", sort: 0 };
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return { key: `${year}-${String(month).padStart(2, "0")}`, label: `Tháng ${month}/${year}`, sort: year * 100 + month };
  }

  const practiceGroups = useMemo(() => {
    const buildGroup = (id, title, subtitle, groupProblems) => {
      const monthMap = new Map();
      groupProblems.forEach((problem) => {
        const month = problemMonth(problem);
        if (!monthMap.has(month.key)) monthMap.set(month.key, { ...month, problems: [] });
        monthMap.get(month.key).problems.push(problem);
      });
      const months = [...monthMap.values()].sort((a, b) => b.sort - a.sort);
      return { id, title, subtitle, problems: groupProblems, months };
    };
    const groups = topics.map((topic) => buildGroup(
      topic.id,
      topic.title,
      `${topic.code || "Chuyên đề"}${topic.weeks ? ` · ${topic.weeks}` : ""}`,
      filtered.filter((problem) => problem.topic === topic.id),
    )).filter((group) => group.problems.length > 0);
    const uncategorized = filtered.filter((problem) => !topicById.has(problem.topic));
    if (uncategorized.length > 0) groups.push(buildGroup("uncategorized", "Chưa phân chuyên đề", "Cần giáo viên sắp xếp", uncategorized));
    return groups;
  }, [topics, filtered, topicById]);

  function progressState(problem) {
    const solved = solvedByCurrent(problem.id);
    const attempts = problemStats(problem.id).attempts;
    if (solved) return { label: "Đã hoàn thành", className: "done" };
    if (attempts > 0) return { label: "Đang luyện", className: "in-progress" };
    return { label: "Chưa bắt đầu", className: "todo" };
  }

  function renderPracticeProblem(problem, index) {
    const studentStats = problemStats(problem.id);
    const teacherStats = teacherProblemStats(problem.id);
    const state = progressState(problem);
    const language = LANGUAGE_META[problemLanguage(problem)] || LANGUAGE_META.cpp;
    return (
      <div key={problem.id} className={`nb-practice-problem ${state.className} ${isTeacher ? "teacher" : ""}`} role="button" tabIndex={0} onClick={() => setActive(problem)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(problem); } }}>
        <div className="nb-practice-problem-index">{String(index + 1).padStart(2, "0")}</div>
        <div className="nb-practice-problem-main">
          <div className="nb-practice-problem-titleline">
            <h4>{problem.title}</h4>
            {!isTeacher && <span className={`nb-practice-status ${state.className}`}>{state.label}</span>}
          </div>
          <div className="nb-practice-problem-meta">
            <span>{language.label}</span><i />
            <span>{problem.points} điểm</span><i />
            <span>{getProblemTestCases(problem).length} test</span>
            {isTeacher ? <><i /><span>{teacherStats.attempts} lượt nộp · {teacherStats.solvedStudents} học sinh đạt</span></> : <><i /><span>{studentStats.attempts ? `${studentStats.attempts} lượt nộp` : "Chưa có lượt nộp"}</span></>}
          </div>
        </div>
        <div className="nb-practice-problem-score">
          <DifficultyTag level={problem.difficulty} />
          {!isTeacher && <strong>{studentStats.bestScore}/{problem.points}</strong>}
          {isTeacher && <span>Quản lý <ChevronRight size={16} /></span>}
        </div>
        {isTeacher && <div className="nb-practice-problem-actions"><button type="button" className="nb-practice-manage-action edit" onClick={(event) => { event.stopPropagation(); beginEdit(problem); }}><Pencil size={14} /> Sửa</button><button type="button" className="nb-practice-manage-action delete" onClick={(event) => { event.stopPropagation(); handleDelete(problem); }}><Trash2 size={14} /> Xóa</button></div>}
      </div>
    );
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

  function beginAdd(topicId) {
    resetForm();
    if (topicId) setForm(createProblemForm(topicId));
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
      language: problemLanguage(problem), isPython: problemLanguage(problem) === "python",
      createdAt: problem.createdAt || problem.created_at || null,
    });
    clearImagePreview();
    setImagePreview(problem.imageUrl || "");
    setFormError("");
    setShowForm(true);
  }

  useEffect(() => {
    if (!showForm) return;
    const frame = window.requestAnimationFrame(() => {
      problemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showForm, editingId]);

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
        language: normalizeLanguage(form.language, form.isPython),
        isPython: normalizeLanguage(form.language, form.isPython) === "python",
        statement: form.statement.trim(),
        createdAt: form.createdAt || (editingId ? null : new Date().toISOString()),
        imageUrl: uploadedImageUrl,
        sample: { input: form.sampleInput.trim() || "—", output: form.sampleOutput.trim() || "—" },
        testCases,
      };
      if (editingId) await updateProblem(problem);
      else await addProblem(problem);
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
      <SectionHeading eyebrow="Lộ trình luyện tập" title="Luyện tập & Python"
        sub="Bài tập được xếp theo chuyên đề đang học để học sinh biết bước tiếp theo, còn giáo viên nhìn được mức độ tham gia của cả lớp." />

      {!isTeacher && (
        <div className="nb-practice-progress-board">
          <div className="nb-practice-progress-copy"><div className="nb-eyebrow">Tiến độ của em</div><strong>{completedCount}/{problems.length}</strong><span>bài đã hoàn thành</span><div className="nb-practice-track"><i style={{ width: `${problems.length ? Math.round(completedCount / problems.length * 100) : 0}%` }} /></div></div>
          <div className="nb-practice-summary"><div className="nb-practice-summary-card"><Award size={17} /><strong>{points(currentUser.id)}</strong><span>Điểm tích lũy</span></div><div className="nb-practice-summary-card"><TrendingUp size={17} /><strong>{attemptsCount}</strong><span>Lượt nộp</span></div></div>
        </div>
      )}

      <div className="nb-practice-toolbar">
        <label className="nb-practice-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm bài, mã bài hoặc chuyên đề…" /></label>
        <div className="nb-practice-filter-stack"><span>Ngôn ngữ</span><div className="nb-filter-row" style={{ margin: 0 }}>{[['all', 'Tất cả'], ['python', 'Python'], ['c', 'C'], ['cpp', 'C++']].map(([key, label]) => <button key={key} className={`nb-chip ${languageFilter === key ? "active" : ""}`} onClick={() => setLanguageFilter(key)}>{label}</button>)}</div></div>
        {!isTeacher && <div className="nb-practice-filter-stack"><span>Tiến độ</span><div className="nb-filter-row" style={{ margin: 0 }}>{[['all', 'Tất cả'], ['todo', 'Chưa mở'], ['in-progress', 'Đang luyện'], ['done', 'Đã xong']].map(([key, label]) => <button key={key} className={`nb-chip ${progressFilter === key ? "active" : ""}`} onClick={() => setProgressFilter(key)}>{label}</button>)}</div></div>}
      </div>

      {isTeacher && (
        <div className="nb-practice-teacher-board">
          <div><div className="nb-eyebrow">Bàn điều phối giáo viên</div><h3 className="nb-h3">Sắp xếp bài theo chuyên đề học</h3><p className="nb-sub">Chọn chuyên đề khi tạo bài để học sinh luôn thấy bài theo đúng lộ trình đang ôn.</p></div>
          <div className="nb-practice-teacher-stats"><span><b>{problems.length}</b> bài tập</span><span><b>{topics.length}</b> chuyên đề</span><span><b>{submissions.length}</b> lượt nộp</span></div>
          <button className="nb-btn nb-btn-primary" onClick={() => beginAdd()}><Plus size={16} /> Thêm bài tập</button>
        </div>
      )}

      {isTeacher && showForm && (
        <form ref={problemFormRef} onSubmit={submit} className="nb-form nb-panel nb-problem-editor" style={{ marginBottom: 16, scrollMarginTop: 18 }}>
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
            <span className="nb-field-label">Ngôn ngữ biên dịch</span>
            <select className="nb-input" value={form.language || (form.isPython ? "python" : "cpp")} onChange={(e) => setForm({ ...form, language: e.target.value, isPython: e.target.value === "python" })}>
              {LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} · Judge0 {option.judgeId}</option>)}
            </select>
          </label>
          <div className="nb-editor-actions">
            <button className="nb-btn nb-btn-primary" type="submit" disabled={uploadingImage}><Save size={15} /> {uploadingImage ? "Đang tải ảnh…" : (editingId ? "Lưu thay đổi" : "Tạo bài tập")}</button>
            <button className="nb-btn nb-btn-ghost" type="button" onClick={() => { resetForm(); setShowForm(false); }}>Hủy</button>
          </div>
        </form>
      )}

      <div className="nb-practice-roadmap">
        <div className="nb-practice-roadmap-head"><div><div className="nb-eyebrow">Lộ trình hiện tại</div><h3 className="nb-h3">Bài tập theo chuyên đề</h3></div><span className="nb-sub">{filtered.length}/{problems.length} bài đang hiển thị</span></div>
        {practiceGroups.map((group, groupIndex) => {
          const groupSolved = group.problems.filter((problem) => solvedByCurrent(problem.id)).length;
          const groupAttempts = group.problems.reduce((total, problem) => total + (isTeacher ? teacherProblemStats(problem.id).attempts : problemStats(problem.id).attempts), 0);
          return <section className="nb-practice-group" key={group.id}>
            <div className="nb-practice-group-rail"><span>{String(groupIndex + 1).padStart(2, "0")}</span><i /></div>
            <div className="nb-practice-group-content">
              <div className="nb-practice-group-head"><div><p>{group.subtitle}</p><h3>{group.title}</h3></div><div className="nb-practice-group-summary">{isTeacher ? <span>{group.problems.length} bài · {groupAttempts} lượt nộp</span> : <><span>{groupSolved}/{group.problems.length} đã xong</span><div><i style={{ width: `${group.problems.length ? Math.round(groupSolved / group.problems.length * 100) : 0}%` }} /></div></>}</div></div>
              <div className="nb-practice-month-list">
                {group.months.map((month) => {
                  const monthId = `${group.id}-${month.key}`;
                  const isCollapsed = Boolean(collapsedMonths[monthId]);
                  const monthSolved = month.problems.filter((problem) => solvedByCurrent(problem.id)).length;
                  const monthAttempts = month.problems.reduce((total, problem) => total + (isTeacher ? teacherProblemStats(problem.id).attempts : problemStats(problem.id).attempts), 0);
                  return <div className={`nb-practice-month ${isCollapsed ? "collapsed" : ""}`} key={monthId}>
                    <button type="button" className="nb-practice-month-head" onClick={() => setCollapsedMonths((current) => ({ ...current, [monthId]: !current[monthId] }))} aria-expanded={!isCollapsed}>
                      <span className="nb-practice-month-chevron"><ChevronRight size={15} /></span>
                      <span className="nb-practice-month-title"><strong>{month.label}</strong><small>{month.problems.length} bài{isTeacher ? ` · ${monthAttempts} lượt nộp` : ` · ${monthSolved} đã xong`}</small></span>
                      {!isTeacher && <span className="nb-practice-month-progress">{Math.round(monthSolved / month.problems.length * 100)}%</span>}
                    </button>
                    {!isCollapsed && <div className="nb-practice-problem-list">{month.problems.map(renderPracticeProblem)}</div>}
                  </div>;
                })}
              </div>
              {isTeacher && <div className="nb-practice-group-actions"><button className="nb-btn nb-btn-ghost" type="button" onClick={() => beginAdd(group.id === "uncategorized" ? undefined : group.id)}><Plus size={14} /> Thêm bài vào chuyên đề</button></div>}
            </div>
          </section>;
        })}
        {practiceGroups.length === 0 && <div className="nb-practice-empty"><Search size={20} /><strong>Không tìm thấy bài tập phù hợp</strong><span>Hãy đổi bộ lọc, từ khóa tìm kiếm hoặc thêm bài mới.</span></div>}
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

function ContestsView({ contests, isTeacher, students, points, problems, addContest, setContestStatus, updateContest, removeContest, solvedByCurrent, onVerdict }) {
  const [running, setRunning] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ title: "", date: "", duration: 90, problemIds: [], status: "upcoming" });

  const statusMeta = {
    active: { label: "Đang mở", cls: "nb-pill-ac", tone: "active" },
    upcoming: { label: "Sắp diễn ra", cls: "nb-pill-pending", tone: "upcoming" },
    completed: { label: "Đã kết thúc", cls: "nb-pill-wa", tone: "completed" },
  };
  const visibleContests = useMemo(() => contests.filter((contest) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery = !normalized || String(contest.title || "").toLowerCase().includes(normalized) || String(contest.date || "").toLowerCase().includes(normalized);
    return matchesQuery && (filter === "all" || contest.status === filter);
  }), [contests, query, filter]);
  const stats = useMemo(() => ({ total: contests.length, active: contests.filter((c) => c.status === "active").length, upcoming: contests.filter((c) => c.status === "upcoming").length, completed: contests.filter((c) => c.status === "completed").length }), [contests]);

  function resetForm() {
    setForm({ title: "", date: "", duration: 90, problemIds: [], status: "upcoming" });
    setEditingId(null);
  }
  function toggleProblem(id) {
    setForm((current) => ({ ...current, problemIds: current.problemIds.includes(id) ? current.problemIds.filter((value) => value !== id) : [...current.problemIds, id] }));
  }
  function openCreate() { resetForm(); setShowForm(true); }
  function openEdit(contest) { setEditingId(contest.id); setForm({ title: contest.title, date: contest.date || "", duration: contest.duration, problemIds: [...contest.problemIds], status: contest.status }); setShowForm(true); }
  function submit(event) {
    event.preventDefault();
    if (!form.title.trim() || form.problemIds.length === 0) return;
    const contest = { id: editingId || `kt${Date.now()}`, title: form.title.trim(), status: editingId ? form.status : "upcoming", date: form.date || "Chưa xếp lịch", duration: Math.min(300, Math.max(10, Number(form.duration) || 60)), problemIds: form.problemIds };
    if (editingId) updateContest(contest); else addContest(contest);
    resetForm(); setShowForm(false);
  }
  function cloneContest(contest) {
    addContest({ ...contest, id: `kt${Date.now()}-copy`, title: `${contest.title} · Bản sao`, status: "upcoming", date: "Chưa xếp lịch", problemIds: [...contest.problemIds] });
  }
  function deleteContest(contest) {
    if (window.confirm(`Xóa đề thi “${contest.title}”? Thao tác này không thể hoàn tác.`)) removeContest(contest.id);
  }

  if (running) return <ContestRunner contest={running} onExit={() => setRunning(null)} isTeacher={isTeacher} problems={problems} solvedByCurrent={solvedByCurrent} onVerdict={onVerdict} />;

  return (
    <div className="nb-exam-page">
      <div className="nb-exam-hero"><div><div className="nb-eyebrow">Kiểm tra định kỳ · Mô phỏng phòng thi</div><h2 className="nb-exam-title">Đề thi thử</h2><p className="nb-exam-sub">Một không gian thi tập trung, minh bạch và có tính giờ cho từng thử thách.</p></div><div className="nb-exam-hero-icon"><Clock size={28} /><span>Thi thật<br />Tự tin hơn</span></div></div>
      <div className="nb-exam-stat-grid"><div className="nb-exam-stat"><span className="blue"><ListChecks size={17} /></span><div><strong>{stats.total}</strong><small>Tổng số đề</small></div></div><div className="nb-exam-stat"><span className="green"><Play size={17} /></span><div><strong>{stats.active}</strong><small>Đang mở</small></div></div><div className="nb-exam-stat"><span className="gold"><Clock size={17} /></span><div><strong>{stats.upcoming}</strong><small>Sắp diễn ra</small></div></div><div className="nb-exam-stat"><span className="ink"><CheckCircle2 size={17} /></span><div><strong>{stats.completed}</strong><small>Đã kết thúc</small></div></div></div>

      {isTeacher && <div className="nb-exam-create-panel"><div className="nb-exam-manage-head"><div><div className="nb-eyebrow">Khu vực giáo viên</div><h3 className="nb-h3">Quản lý đề thi</h3><p className="nb-sub">Tạo, chỉnh sửa, nhân bản, mở hoặc đóng kỳ thi từ một nơi.</p></div><button className="nb-btn nb-btn-primary" onClick={() => showForm ? (resetForm(), setShowForm(false)) : openCreate()}><Plus size={16} /> {showForm ? "Đóng biểu mẫu" : "Tạo đề thi mới"}</button></div>{showForm && <form onSubmit={submit} className="nb-exam-form"><div className="nb-exam-form-heading"><div><div className="nb-eyebrow">{editingId ? "Chỉnh sửa kỳ thi" : "Tạo kỳ thi mới"}</div><h3 className="nb-h3">{editingId ? "Cập nhật thông tin đề" : "Thiết lập đề thi"}</h3></div><span>{form.problemIds.length} bài đã chọn</span></div><div className="nb-exam-form-grid"><label><span>Tên đề thi</span><input className="nb-input" placeholder="Ví dụ: Vòng loại tháng 9" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>Ngày thi</span><input className="nb-input" placeholder="20/09/2026 · 08:00" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label><span>Thời lượng (phút)</span><input className="nb-input" type="number" min="10" max="300" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} /></label></div>{editingId && <div className="nb-exam-status-selector"><span>Trạng thái</span>{["upcoming", "active", "completed"].map((status) => <button type="button" key={status} className={`nb-chip ${form.status === status ? "active" : ""}`} onClick={() => setForm({ ...form, status })}>{statusMeta[status].label}</button>)}</div>}<div className="nb-exam-select-head"><div><strong>Chọn bài tập</strong><small>Đề thi cần ít nhất một bài</small></div><span>{form.problemIds.length}/{problems.length} đã chọn</span></div><div className="nb-exam-problem-checklist">{problems.map((problem) => <label key={problem.id} className={`nb-exam-check ${form.problemIds.includes(problem.id) ? "selected" : ""}`}><input type="checkbox" checked={form.problemIds.includes(problem.id)} onChange={() => toggleProblem(problem.id)} /><span><strong>{problem.id} · {problem.title}</strong><small>{problem.points} điểm · {(LANGUAGE_META[problemLanguage(problem)] || LANGUAGE_META.cpp).label} · {problem.difficulty}</small></span><CheckCircle2 size={16} /></label>)}</div><div className="nb-editor-actions"><button className="nb-btn nb-btn-primary" type="submit" disabled={!form.title.trim() || form.problemIds.length === 0}><Save size={15} /> {editingId ? "Lưu thay đổi" : "Tạo đề thi"}</button><button className="nb-btn nb-btn-ghost" type="button" onClick={() => { resetForm(); setShowForm(false); }}>Hủy</button></div></form>}</div>}

      <div className="nb-exam-toolbar"><div className="nb-exam-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm đề thi hoặc ngày thi…" /></div><div className="nb-filter-row" style={{ margin: 0 }}>{[["all", "Tất cả"], ["active", "Đang mở"], ["upcoming", "Sắp diễn ra"], ["completed", "Đã kết thúc"]].map(([key, label]) => <button key={key} className={`nb-chip ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>{label}</button>)}</div></div>

      <div className="nb-exam-list">{visibleContests.map((contest) => { const meta = statusMeta[contest.status] || statusMeta.upcoming; const contestProblems = problems.filter((problem) => contest.problemIds.includes(problem.id)); const solved = contestProblems.filter((problem) => solvedByCurrent(problem.id)).length; const progress = contestProblems.length ? Math.round((solved / contestProblems.length) * 100) : 0; const totalPoints = contestProblems.reduce((sum, problem) => sum + (Number(problem.points) || 0), 0); return <article key={contest.id} className={`nb-exam-card ${meta.tone}`}><div className="nb-exam-card-accent" /><div className="nb-exam-card-head"><div><div className="nb-exam-card-kicker"><span className={`nb-pill ${meta.cls}`}>{meta.label}</span><span>{contest.date}</span></div><h3>{contest.title}</h3></div><div className="nb-exam-card-code">{contest.id}</div></div><div className="nb-exam-card-meta"><span><Clock size={14} /> {contest.duration} phút</span><span><ListChecks size={14} /> {contestProblems.length} bài</span><span><Award size={14} /> {totalPoints} điểm</span></div>{!isTeacher && contest.status !== "upcoming" && <div className="nb-exam-card-progress"><div className="nb-exam-progress-head"><span>Tiến độ của bạn</span><strong>{solved}/{contestProblems.length} bài · {progress}%</strong></div><div className="nb-exam-progress"><span style={{ width: `${progress}%` }} /></div></div>}{contest.status === "completed" && <div className="nb-mini-leaderboard">{[...students].sort((a, b) => points(b.id) - points(a.id)).slice(0, 3).map((student, index) => <div key={student.id} className="nb-mini-row"><span className="nb-eyebrow">#{index + 1}</span><Avatar name={student.name} size={22} /><span>{student.name}</span><span className="nb-sub" style={{ marginLeft: "auto" }}>{points(student.id)}đ</span></div>)}</div>}<div className="nb-exam-card-actions">{!isTeacher && contest.status === "upcoming" && <span className="nb-sub"><Lock size={13} /> Chưa mở đăng ký</span>}{(isTeacher || contest.status !== "upcoming") && <button className="nb-btn nb-btn-primary" onClick={() => setRunning(contest)}>{contest.status === "completed" ? <><Eye size={15} /> Xem lại đề</> : isTeacher ? <><Eye size={15} /> Xem trước</> : <><Play size={15} /> Vào thi</>}</button>}{isTeacher && <><button className="nb-btn nb-btn-ghost" onClick={() => openEdit(contest)}><Pencil size={15} /> Sửa</button><button className="nb-btn nb-btn-ghost" onClick={() => cloneContest(contest)}><RefreshCw size={15} /> Nhân bản</button><button className="nb-icon-btn nb-danger-icon" onClick={() => deleteContest(contest)} title="Xóa đề thi" aria-label="Xóa đề thi"><Trash2 size={15} /></button></>}{isTeacher && contest.status === "upcoming" && <button className="nb-btn nb-btn-ghost" onClick={() => setContestStatus(contest.id, "active")}><Play size={15} /> Mở đề</button>}{isTeacher && contest.status === "active" && <button className="nb-btn nb-btn-ghost" onClick={() => setContestStatus(contest.id, "completed")}><CheckCircle2 size={15} /> Đóng đề</button>}</div></article>; })}</div>
      {visibleContests.length === 0 && <div className="nb-exam-empty"><Clock size={26} /><strong>Không tìm thấy đề thi</strong><span>Thử đổi bộ lọc hoặc tạo một kỳ thi mới.</span></div>}
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
                <div style={{ fontWeight: 600 }}>{d.author} {d.role !== "student" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 6 }}>{d.role === "admin" ? "Quản trị viên" : "Giáo viên"}</span>}</div>
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
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.author} {r.role !== "student" && <span className="nb-pill nb-pill-pending" style={{ marginLeft: 6 }}>{r.role === "admin" ? "Quản trị viên" : "Giáo viên"}</span>}</div>
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

function AccountsView({ accounts, resetPassword, addAccount, removeAccount, currentUser, isAdmin }) {
  const [resetDrafts, setResetDrafts] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "student" });

  const teacherCount = accounts.filter((account) => account.role === "teacher").length;
  const studentCount = accounts.filter((account) => account.role === "student").length;
  const adminCount = accounts.filter((account) => account.role === "admin").length;
  const filteredAccounts = accounts.filter((account) => {
    const haystack = `${account.name} ${account.username}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesRole = roleFilter === "all" || account.role === roleFilter;
    return matchesQuery && matchesRole;
  });

  function resetForm() {
    setForm({ name: "", username: "", password: "", role: "student" });
  }

  function doReset(id) {
    const val = (resetDrafts[id] || "").trim();
    if (val.length < 4) {
      alert("Mật khẩu mới cần ít nhất 4 ký tự.");
      return;
    }
    resetPassword(id, val);
    setResetDrafts({ ...resetDrafts, [id]: "" });
  }

  function submitAdd(e) {
    e.preventDefault();
    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    const password = form.password.trim();
    if (!name || !username || password.length < 4) {
      alert("Vui lòng nhập đủ thông tin; mật khẩu cần ít nhất 4 ký tự.");
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      alert("Tên đăng nhập chỉ nên gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.");
      return;
    }
    if (accounts.some((a) => a.username.toLowerCase() === username)) {
      alert("Tên đăng nhập này đã tồn tại, hãy chọn tên khác.");
      return;
    }
    const role = normalizeAccountRole(form.role);
    if (role === "teacher" && !isAdmin) {
      alert("Chỉ Quản trị viên tối cao mới được tạo tài khoản giáo viên.");
      return;
    }
    addAccount({ name, username, password, role });
    resetForm();
    setShowAdd(false);
  }

  return (
    <div>
      <SectionHeading eyebrow="Quản trị" title="Quản lý tài khoản" sub="Quản lý thành viên, tạo giáo viên mới và cấp lại mật khẩu trong cùng một không gian." />

      <div className="nb-home-stat-grid" style={{ marginBottom: 16 }}>
        <div className="nb-home-stat"><span className="blue"><Users size={17} /></span><div><strong>{accounts.length}</strong><small>Tổng tài khoản</small></div></div>
        <div className="nb-home-stat"><span className="green"><GraduationCap size={17} /></span><div><strong>{studentCount}</strong><small>Học sinh</small></div></div>
        <div className="nb-home-stat"><span className="gold"><Users size={17} /></span><div><strong>{teacherCount}</strong><small>Giáo viên</small></div></div>
        <div className="nb-home-stat"><span className="red"><Award size={17} /></span><div><strong>{adminCount}</strong><small>Quản trị tối cao</small></div></div>
      </div>

      <div className="nb-panel" style={{ marginBottom: 16 }}>
        <div className="nb-management-head">
          <div>
            <div className="nb-eyebrow">Cấp quyền truy cập</div>
            <h3 className="nb-h3">Tạo tài khoản mới</h3>
            <p className="nb-sub">{isAdmin ? "Quản trị viên tối cao có thể tạo học sinh và giáo viên; giáo viên thường chỉ được tạo học sinh." : "Giáo viên có thể tạo tài khoản học sinh và quản lý mật khẩu học sinh."}</p>
          </div>
          <button className="nb-btn nb-btn-primary" onClick={() => setShowAdd((value) => !value)}>
            <Plus size={16} /> {showAdd ? "Đóng biểu mẫu" : "Tạo tài khoản"}
          </button>
        </div>
        {showAdd && (
          <form onSubmit={submitAdd} className="nb-form" style={{ marginTop: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
              <label><span className="nb-field-label">Họ và tên</span><input className="nb-input" placeholder="Ví dụ: Nguyễn Minh Anh" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label><span className="nb-field-label">Tên đăng nhập</span><input className="nb-input" autoCapitalize="none" autoCorrect="off" placeholder={form.role === "teacher" ? "Ví dụ: gv.toan" : "Ví dụ: hs21"} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
              <label><span className="nb-field-label">Mật khẩu ban đầu</span><input className="nb-input" type="password" minLength={4} placeholder="Ít nhất 4 ký tự" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <label><span className="nb-field-label">Vai trò</span><select className="nb-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="student">Học sinh</option>{isAdmin && <option value="teacher">Giáo viên</option>}</select></label>
            </div>
            <div className="nb-sub" style={{ marginTop: 10 }}>{form.role === "teacher" ? "Tài khoản giáo viên có thể quản lý nội dung học tập; chỉ Quản trị viên tối cao mới có thể tạo vai trò này." : "Tài khoản học sinh được gắn mặc định với lớp 11 Tin và chỉ sử dụng các khu vực học tập."}</div>
            <div className="nb-editor-actions"><button className="nb-btn nb-btn-primary" type="submit"><Save size={15} /> Tạo {form.role === "teacher" ? "tài khoản giáo viên" : "tài khoản học sinh"}</button><button className="nb-btn nb-btn-ghost" type="button" onClick={() => { resetForm(); setShowAdd(false); }}>Hủy</button></div>
          </form>
        )}
      </div>

      <div className="nb-panel nb-table-wrap">
        <div className="nb-management-head" style={{ padding: "16px 18px 10px" }}>
          <div><div className="nb-eyebrow">Danh sách thành viên</div><h3 className="nb-h3">Tài khoản trong hệ thống</h3></div>
          <span className="nb-sub">{filteredAccounts.length}/{accounts.length} tài khoản</span>
        </div>
        <div className="nb-exam-toolbar" style={{ padding: "0 18px 14px" }}>
          <div className="nb-exam-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc tên đăng nhập…" /></div>
          <div className="nb-filter-row" style={{ margin: 0 }}>{[["all", "Tất cả"], ["student", "Học sinh"], ["teacher", "Giáo viên"], ...(isAdmin ? [["admin", "Quản trị tối cao"]] : [])].map(([key, label]) => <button key={key} className={`nb-chip ${roleFilter === key ? "active" : ""}`} onClick={() => setRoleFilter(key)}>{label}</button>)}</div>
        </div>
        <table className="nb-table">
          <thead><tr><th>Họ tên</th><th>Vai trò</th><th>Tên đăng nhập</th><th>Trạng thái mật khẩu</th><th>Đặt lại mật khẩu</th><th></th></tr></thead>
          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.id}>
                <td><strong>{account.name}</strong>{account.id === currentUser?.id && <span className="nb-sub"> (bạn)</span>}</td>
                <td>{account.role === "admin" ? <span className="nb-pill nb-pill-pending">Quản trị tối cao</span> : account.role === "teacher" ? <span className="nb-pill nb-pill-pending">Giáo viên</span> : <span className="nb-pill nb-pill-ac">Học sinh</span>}</td>
                <td className="nb-mono">{account.username}</td>
                <td>{account.passwordChanged ? <span className="nb-pill nb-pill-ac">Đã đổi</span> : <span className="nb-pill nb-pill-pending">Mặc định: {account.plainInitial || "Đã thiết lập"}</span>}</td>
                <td>{account.role === "admin" ? <span className="nb-sub">Chỉ tự đổi mật khẩu</span> : (isAdmin || account.role === "student") ? <div style={{ display: "flex", gap: 6 }}><input className="nb-input" style={{ width: 120 }} type="password" minLength={4} placeholder="Mật khẩu mới" value={resetDrafts[account.id] || ""} onChange={(e) => setResetDrafts({ ...resetDrafts, [account.id]: e.target.value })} /><button className="nb-btn nb-btn-ghost" type="button" onClick={() => doReset(account.id)}>Đặt lại</button></div> : <span className="nb-sub">Chỉ admin quản lý</span>}</td>
                <td>{((isAdmin && account.role !== "admin") || account.role === "student") && <button className="nb-icon-btn" title="Xóa tài khoản" aria-label={`Xóa tài khoản ${account.name}`} onClick={() => { if (window.confirm(`Xóa tài khoản ${account.name}? Không thể hoàn tác.`)) removeAccount(account.id); }}><X size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAccounts.length === 0 && <div className="nb-home-empty" style={{ padding: 28 }}><Users size={22} /><strong>Không tìm thấy tài khoản</strong><span>Hãy thử từ khóa hoặc bộ lọc vai trò khác.</span></div>}
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
  const [pendingProblemWrites, setPendingProblemWrites] = useState(getPendingProblemWrites);

  const currentUser = accounts.find((a) => a.id === authUserId) || null;
  const isAdmin = currentUser?.role === "admin";
  const isTeacher = currentUser?.role === "teacher" || isAdmin;
  const students = accounts.filter((a) => a.role === "student");

  useEffect(() => {
    lsSet(PENDING_PROBLEM_WRITES_KEY, pendingProblemWrites);
  }, [pendingProblemWrites]);

  useEffect(() => {
    if (pendingProblemWrites.length > 0) {
      setStorageError((current) => current || `Có ${pendingProblemWrites.length} bài tập đang chờ gửi. Dữ liệu đã được giữ trên thiết bị này.`);
    }
  }, [pendingProblemWrites.length]);

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
      const retryResult = await retryPendingProblemWrites();
      if (retryResult.failed === 0) setStorageError(false);
    } catch (e) {
      setStorageError("Không thể tải dữ liệu lớp học lúc này. Hãy kiểm tra kết nối rồi thử đồng bộ lại.");
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
  async function retryPendingProblemWrites() {
    if (pendingProblemWrites.length === 0) return { saved: 0, failed: 0 };

    const saved = [];
    const remaining = [];
    for (const problem of pendingProblemWrites) {
      try {
        await dbAddProblem(problem);
        saved.push(problem);
      } catch (error) {
        // Nếu lần trước máy chủ đã ghi thành công nhưng phản hồi bị mất, coi lỗi khóa trùng là đã lưu.
        if (isDuplicateKeyError(error)) saved.push(problem);
        else remaining.push(problem);
      }
    }

    if (saved.length > 0) {
      setProblems((prev) => {
        const knownIds = new Set(prev.map((item) => item.id));
        return [...prev, ...saved.filter((item) => !knownIds.has(item.id))];
      });
    }
    setPendingProblemWrites(remaining);

    if (remaining.length > 0) {
      setStorageError(`Vẫn còn ${remaining.length} bài tập chưa gửi được. Dữ liệu đã được giữ trên thiết bị này.`);
    }
    return { saved: saved.length, failed: remaining.length };
  }
  async function addProblem(p) {
    try {
      await dbAddProblem(p);
    } catch (error) {
      // Không thêm dữ liệu vào danh sách chính trước khi máy chủ xác nhận đã lưu.
      // Bản ghi được lưu cục bộ để người dùng không mất nội dung khi tải lại trang.
      if (!isDuplicateKeyError(error)) {
        setPendingProblemWrites((prev) => prev.some((item) => item.id === p.id) ? prev : [...prev, p]);
        const message = problemSaveErrorMessage(error);
        setStorageError(message);
        throw new Error(message);
      }
    }
    setProblems((prev) => prev.some((item) => item.id === p.id) ? prev : [...prev, p]);
    setPendingProblemWrites((prev) => prev.filter((item) => item.id !== p.id));
    setStorageError(false);
  }
  async function updateProblem(p) {
    try {
      await dbUpdateProblem(p);
      setProblems((prev) => prev.map((item) => item.id === p.id ? p : item));
      setStorageError(false);
    } catch (error) {
      const message = problemSaveErrorMessage(error);
      setStorageError(message);
      throw new Error(message);
    }
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
  function updateContest(contest) {
    setContests((prev) => prev.map((item) => item.id === contest.id ? contest : item));
    dbUpdateContest(contest).catch(() => setStorageError(true));
  }
  function removeContest(id) {
    setContests((prev) => prev.filter((item) => item.id !== id));
    dbRemoveContest(id).catch(() => setStorageError(true));
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
    if (!isTeacher) return;
    const target = accounts.find((account) => account.id === id);
    if (!target || target.role === "admin" || (!isAdmin && target.role !== "student")) return;
    const hash = hashPassword(newPassword);
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, passwordHash: hash, passwordChanged: true, plainInitial: undefined } : a)));
    dbUpdatePassword(id, hash).catch(() => setStorageError(true));
  }
  function addAccount({ name, username, password, role = "student" }) {
    if (!isTeacher) return;
    const normalizedRole = normalizeAccountRole(role);
    if (normalizedRole === "admin" || (normalizedRole === "teacher" && !isAdmin)) return;
    const acc = {
      id: (normalizedRole === "teacher" ? "gv" : "hs") + Date.now(), name, role: normalizedRole, username,
      passwordHash: hashPassword(password), plainInitial: password, passwordChanged: false,
      className: normalizedRole === "student" ? "11 Tin" : null, streak: 0,
    };
    setAccounts((prev) => [...prev, acc]);
    dbAddAccount(acc).catch(() => setStorageError(true));
  }
  function removeAccount(id) {
    if (!isTeacher) return;
    const target = accounts.find((account) => account.id === id);
    if (!target || target.role === "admin" || (!isAdmin && target.role !== "student")) return;
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
          --ink: #0B1736;
          --ink-soft: #162B59;
          --paper: #F4F8FD;
          --paper-line: #D7E2F0;
          --red-pen: #DC2626;
          --pen-blue: #04a6c7;
          --gold: #D97706;
          --ac-green: #059669;
          --slate: #64748B;
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
          width: 230px; flex-shrink: 0; background: var(--ink); color: #D5E0F0;
          display: flex; flex-direction: column; position: relative; padding: 22px 14px;
        }
        .nb-sidebar::before {
          content: ""; position: absolute; left: 10px; top: 0; bottom: 0; width: 1px;
          background-image: radial-gradient(circle, rgba(255,255,255,0.14) 1.5px, transparent 1.5px);
          background-size: 100% 22px;
        }
        .nb-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 20px 14px; }
        .nb-brand-mark {
          width: 34px; height: 34px; border-radius: 8px; background: var(--pen-blue);
          display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0;
        }
        .nb-brand-text { line-height: 1.15; }
        .nb-brand-text b { font-size: 14px; color: #fff; display: block; }
        .nb-brand-text span { font-size: 11px; color: #9FB2CC; font-family: 'JetBrains Mono', monospace; }

        .nb-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; margin-top: 6px; }
        .nb-nav-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;
          background: transparent; border: none; color: #B8C7DD; font-size: 13.5px; font-weight: 500;
          cursor: pointer; text-align: left; font-family: inherit; transition: background .15s, color .15s;
        }
        .nb-nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .nb-nav-item.active { background: #04a6c7; color: #fff; }

        .nb-sidebar-foot { margin-top: auto; padding: 14px; border-top: 1px solid rgba(255,255,255,0.08); }
        .nb-btn-ghost-dark { background: transparent; color: #D5E0F0; border: 1px solid rgba(255,255,255,0.18); }

        .nb-main {
          flex: 1; background: var(--paper);
          background-image:
            linear-gradient(var(--paper-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--paper-line) 1px, transparent 1px);
          background-size: 26px 26px;
          position: relative; overflow-y: auto; height: 100dvh;
        }
        .nb-main::before {
          content: ""; position: absolute; left: 46px; top: 0; bottom: 0; width: 1.5px; background: rgba(37,99,235,0.35);
          pointer-events: none;
        }
        .nb-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 30px 18px 62px; border-bottom: 1px solid var(--paper-line);
          background: rgba(244,248,253,0.92); backdrop-filter: blur(2px); position: sticky; top: 0; z-index: 5;
        }
        .nb-topbar-user { display: flex; align-items: center; gap: 8px; }
        .nb-content { padding: 26px 30px 40px 62px; }

        .nb-storage-banner {
          display: flex; align-items: center; gap: 8px; background: rgba(37,99,235,0.1); color: var(--red-pen);
          font-size: 12.5px; padding: 8px 14px; margin: -8px -30px 18px -62px; padding-left: 62px;
        }

        .nb-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--slate); margin-bottom: 4px; }
        .nb-h2 { font-size: 24px; font-weight: 800; margin: 0; }
        .nb-h3 { font-size: 16px; font-weight: 700; margin: 0; }
        .nb-sub { font-size: 12.5px; color: var(--slate); margin: 0; }
        .nb-para { font-size: 14px; line-height: 1.65; color: #26364D; }

        .nb-avatar {
          border-radius: 50%; background: var(--pen-blue); color: #fff; display: flex; align-items: center;
          justify-content: center; font-weight: 700; font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
        }

        .nb-home-page { display: flex; flex-direction: column; gap: 18px; }
        .nb-home-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 25px 27px; border-radius: 14px; color: #fff; box-shadow: 0 10px 24px rgba(4,166,199,0.16); }
        .nb-home-hero.student { background: linear-gradient(120deg, #102A56 0%, #04a6c7 62%, #27BBD4 100%); }
        .nb-home-hero.teacher { background: linear-gradient(120deg, #123B70 0%, #1769AA 58%, #3B9BD6 100%); }
        .nb-home-hero .nb-eyebrow { color: rgba(255,255,255,0.7); }
        .nb-home-hero h1 { margin: 6px 0 7px; color: #fff; font-size: 29px; line-height: 1.15; letter-spacing: -0.02em; }
        .nb-home-hero p { margin: 0; color: rgba(255,255,255,0.75); font-size: 13px; line-height: 1.5; }
        .nb-home-hero-rank { display: flex; align-items: center; gap: 10px; padding: 12px 15px; border: 1px solid rgba(255,255,255,0.22); border-radius: 10px; background: rgba(255,255,255,0.1); }
        .nb-home-hero-rank > span { display: flex; flex-direction: column; gap: 2px; }
        .nb-home-hero-rank strong { font: 700 21px 'JetBrains Mono', monospace; }
        .nb-home-hero-rank small { color: rgba(255,255,255,0.7); font-size: 10px; }
        .nb-home-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .nb-home-stat { display: flex; align-items: center; gap: 10px; padding: 14px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-home-stat > span { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; }
        .nb-home-stat > span.blue { color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-home-stat > span.green { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-home-stat > span.gold { color: var(--gold); background: rgba(185,130,47,0.13); }
        .nb-home-stat > span.red { color: var(--red-pen); background: rgba(37,99,235,0.1); }
        .nb-home-stat div { display: flex; flex-direction: column; gap: 2px; }
        .nb-home-stat strong { color: var(--ink); font: 700 20px 'JetBrains Mono', monospace; }
        .nb-home-stat small { color: var(--slate); font-size: 11px; }
        .nb-home-main-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 14px; }
        .nb-home-progress-card, .nb-home-class-card, .nb-home-contest-card { display: flex; flex-direction: column; gap: 12px; padding: 21px; border: 1px solid var(--paper-line); border-radius: 11px; background: #fff; }
        .nb-home-progress-card, .nb-home-class-card { background: linear-gradient(135deg, #fff 0%, #F7FAFF 100%); }
        .nb-home-contest-card { background: #F6F9FE; }
        .nb-home-contest-card.live { border-color: rgba(46,158,109,0.35); background: linear-gradient(135deg, #F0FAF7, #E5F7F2); }
        .nb-home-card-head, .nb-home-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .nb-home-card-head h2, .nb-home-section-head h2 { margin: 4px 0 0; font-size: 18px; letter-spacing: -0.01em; }
        .nb-home-percent { color: var(--pen-blue); font: 700 25px 'JetBrains Mono', monospace; }
        .nb-home-progress { height: 9px; overflow: hidden; border-radius: 99px; background: var(--paper-line); }
        .nb-home-progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #68D7E7); }
        .nb-home-progress-foot { display: flex; justify-content: space-between; gap: 10px; color: var(--slate); font-size: 11px; }
        .nb-home-progress-foot strong { color: var(--ink); font: 600 10px 'JetBrains Mono', monospace; }
        .nb-home-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 3px; }
        .nb-home-contest-card h3 { margin: 2px 0 0; font-size: 17px; }
        .nb-home-contest-meta { display: flex; align-items: center; gap: 12px; color: var(--slate); font-size: 11px; }
        .nb-home-contest-meta span { display: inline-flex; align-items: center; gap: 4px; }
        .nb-home-live-dot { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: rgba(46,158,109,0.12); }
        .nb-home-live-dot span { width: 9px; height: 9px; border-radius: 50%; background: var(--ac-green); box-shadow: 0 0 0 5px rgba(46,158,109,0.12); }
        .nb-home-clock-icon { color: var(--gold); }
        .nb-home-lower-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 14px; }
        .nb-home-activity, .nb-home-next, .nb-home-class-activity, .nb-home-attention { min-width: 0; }
        .nb-home-section-head { margin-bottom: 14px; }
        .nb-link-button { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; background: transparent; color: var(--pen-blue); cursor: pointer; font-size: 11px; font-weight: 600; }
        .nb-home-activity-list, .nb-home-student-list, .nb-home-support-list, .nb-home-class-feed { display: flex; flex-direction: column; gap: 2px; }
        .nb-home-activity-item, .nb-home-student-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--paper-line); }
        .nb-home-activity-item:last-child, .nb-home-student-row:last-child { border-bottom: 0; }
        .nb-home-activity-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px; }
        .nb-home-activity-icon.success { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-home-activity-icon.warning { color: var(--gold); background: rgba(185,130,47,0.14); }
        .nb-home-activity-item > div, .nb-home-student-row > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .nb-home-activity-item strong, .nb-home-student-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-home-activity-item small, .nb-home-student-row small { color: var(--slate); font-size: 10px; }
        .nb-home-activity-score, .nb-home-student-row > b { color: var(--pen-blue); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-home-student-row > b small { margin-left: 2px; color: var(--slate); font-size: 9px; }
        .nb-home-rank { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; color: var(--slate); background: var(--paper-line); font: 700 10px 'JetBrains Mono', monospace; }
        .nb-home-rank.rank-1 { color: #9A6B13; background: rgba(185,130,47,0.18); }
        .nb-home-rank.rank-2 { color: #5A6878; background: rgba(90,104,120,0.14); }
        .nb-home-rank.rank-3 { color: #8A5B3B; background: rgba(138,91,59,0.13); }
        .nb-home-next { background: #fff; }
        .nb-home-next h2 { margin: 6px 0 5px; font-size: 19px; }
        .nb-home-next-links { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
        .nb-home-next-links button { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border: 0; border-top: 1px solid var(--paper-line); background: transparent; color: var(--ink); cursor: pointer; font-family: inherit; font-size: 12px; text-align: left; }
        .nb-home-next-links button > span { display: inline-flex; align-items: center; gap: 8px; }
        .nb-home-next-links button > svg { color: var(--slate); }
        .nb-home-support-list > div { display: flex; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--paper-line); }
        .nb-home-support-list > div:last-child { border-bottom: 0; }
        .nb-home-support-list > div > span { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .nb-home-support-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-home-support-list small { color: var(--slate); font-size: 10px; }
        .nb-home-support-list button { display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; border: 1px solid var(--paper-line); border-radius: 6px; background: #fff; color: var(--slate); cursor: pointer; }
        .nb-home-class-activity { padding: 18px 20px; }
        .nb-home-class-feed > div { display: flex; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--paper-line); font-size: 12px; }
        .nb-home-class-feed > div:last-child { border-bottom: 0; }
        .nb-home-class-feed > div > span:last-child { display: flex; flex-direction: column; gap: 2px; }
        .nb-home-class-feed small { color: var(--slate); font-size: 10px; }
        .nb-home-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 25px 10px; color: var(--slate); text-align: center; }
        .nb-home-empty strong { color: var(--ink); font-size: 13px; }
        .nb-home-empty span { font-size: 11px; }
        .nb-exam-page { display: flex; flex-direction: column; gap: 18px; }
        .nb-exam-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 25px 27px; border-radius: 14px; color: #fff; background: linear-gradient(120deg, #102A56 0%, #04a6c7 62%, #27BBD4 100%); box-shadow: 0 10px 24px rgba(4,166,199,0.18); }
        .nb-exam-title { margin: 6px 0 7px; font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; }
        .nb-exam-sub { margin: 0; color: rgba(255,255,255,0.72); font-size: 13px; line-height: 1.5; }
        .nb-exam-hero .nb-eyebrow { color: #D5E5FF; }
        .nb-exam-hero-icon { display: flex; align-items: center; gap: 10px; padding: 12px 15px; border: 1px solid rgba(255,255,255,0.22); border-radius: 10px; background: rgba(255,255,255,0.1); font: 600 11px/1.4 'JetBrains Mono', monospace; }
        .nb-exam-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .nb-exam-stat { display: flex; align-items: center; gap: 10px; padding: 14px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-exam-stat > span { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; }
        .nb-exam-stat > span.blue { color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-exam-stat > span.green { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-exam-stat > span.gold { color: var(--gold); background: rgba(185,130,47,0.13); }
        .nb-exam-stat > span.ink { color: var(--ink); background: rgba(11,23,54,0.08); }
        .nb-exam-stat div { display: flex; flex-direction: column; gap: 2px; }
        .nb-exam-stat strong { color: var(--ink); font: 700 20px 'JetBrains Mono', monospace; }
        .nb-exam-stat small { color: var(--slate); font-size: 11px; }
        .nb-exam-create-panel { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 16px; }
        .nb-exam-form { display: flex; flex-direction: column; gap: 16px; margin-top: 17px; padding-top: 16px; border-top: 1px solid var(--paper-line); }
        .nb-exam-form-heading, .nb-exam-select-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .nb-exam-form-heading > span, .nb-exam-select-head > span { color: var(--pen-blue); font: 700 11px 'JetBrains Mono', monospace; }
        .nb-exam-form-grid { display: grid; grid-template-columns: 1.6fr 1fr 0.7fr; gap: 10px; }
        .nb-exam-form-grid label { display: flex; flex-direction: column; gap: 6px; }
        .nb-exam-form-grid label > span { color: var(--slate); font-size: 11px; font-weight: 600; }
        .nb-exam-select-head > div { display: flex; flex-direction: column; gap: 3px; }
        .nb-exam-select-head small { color: var(--slate); font-size: 11px; }
        .nb-exam-problem-checklist { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 230px; overflow-y: auto; padding: 3px; }
        .nb-exam-check { display: flex; align-items: center; gap: 9px; padding: 10px; border: 1px solid var(--paper-line); border-radius: 8px; background: #F8FBFF; cursor: pointer; }
        .nb-exam-check.selected { border-color: var(--pen-blue); background: rgba(4,166,199,0.06); }
        .nb-exam-check input { accent-color: var(--pen-blue); }
        .nb-exam-check > span { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .nb-exam-check strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-exam-check small { color: var(--slate); font-size: 10px; }
        .nb-exam-check > svg { color: var(--pen-blue); opacity: 0; }
        .nb-exam-check.selected > svg { opacity: 1; }
        .nb-exam-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .nb-exam-search { display: flex; align-items: center; gap: 8px; flex: 1 1 240px; height: 40px; padding: 0 11px; background: #fff; border: 1px solid var(--paper-line); border-radius: 8px; color: var(--slate); }
        .nb-exam-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: 13px inherit; }
        .nb-exam-list { display: flex; flex-direction: column; gap: 12px; }
        .nb-exam-card { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 13px; padding: 19px 20px 17px 23px; background: #fff; border: 1px solid var(--paper-line); border-radius: 11px; }
        .nb-exam-card-accent { position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--pen-blue); }
        .nb-exam-card.active .nb-exam-card-accent { background: var(--ac-green); }
        .nb-exam-card.upcoming .nb-exam-card-accent { background: var(--gold); }
        .nb-exam-card.completed .nb-exam-card-accent { background: var(--slate); }
        .nb-exam-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .nb-exam-card-kicker { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 7px; color: var(--slate); font-size: 11px; }
        .nb-exam-card-head h3 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
        .nb-exam-card-code { color: var(--slate); font: 11px 'JetBrains Mono', monospace; }
        .nb-exam-card-meta { display: flex; flex-wrap: wrap; gap: 14px; color: var(--slate); font-size: 12px; }
        .nb-exam-card-meta span { display: inline-flex; align-items: center; gap: 5px; }
        .nb-exam-card-progress { max-width: 520px; }
        .nb-exam-progress-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; color: var(--slate); font-size: 11px; }
        .nb-exam-progress-head strong { color: var(--ink); font: 600 10px 'JetBrains Mono', monospace; }
        .nb-exam-progress { height: 7px; flex: 1; overflow: hidden; border-radius: 99px; background: var(--paper-line); }
        .nb-exam-progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #68D7E7); }
        .nb-exam-card-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 3px; }
        .nb-exam-card-actions .nb-sub { display: inline-flex; align-items: center; gap: 5px; }
        .nb-exam-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 48px 15px; color: var(--slate); text-align: center; background: #fff; border: 1px dashed var(--paper-line); border-radius: 10px; }
        .nb-exam-empty strong { color: var(--ink); font-size: 14px; }
        .nb-exam-empty span { font-size: 12px; }
        .nb-exam-room { display: flex; flex-direction: column; gap: 14px; }
        .nb-exam-room-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; padding: 15px 17px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-exam-room-title { min-width: 0; }
        .nb-exam-room-title h2 { margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 20px; }
        .nb-exam-timer { display: inline-flex; align-items: center; gap: 7px; padding: 9px 12px; border-radius: 8px; color: var(--red-pen); background: rgba(37,99,235,0.08); font: 700 14px 'JetBrains Mono', monospace; white-space: nowrap; }
        .nb-exam-timer.warning { color: #9B5C00; background: rgba(185,130,47,0.16); }
        .nb-exam-room-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: var(--slate); font-size: 12px; }
        .nb-exam-room-meta > span { display: inline-flex; align-items: center; gap: 5px; }
        .nb-exam-room-meta > .nb-exam-progress { max-width: 180px; }
        .nb-exam-room-meta > strong { color: var(--ink); font: 600 11px 'JetBrains Mono', monospace; }
        .nb-exam-room-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 14px; align-items: start; }
        .nb-exam-navigator { overflow: hidden; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-exam-navigator-head { display: flex; justify-content: space-between; align-items: center; padding: 14px; border-bottom: 1px solid var(--paper-line); }
        .nb-exam-navigator-head > strong { color: var(--pen-blue); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-exam-navigator-list { display: flex; flex-direction: column; }
        .nb-exam-nav-item { display: flex; align-items: center; gap: 9px; padding: 12px 11px; border: 0; border-bottom: 1px solid var(--paper-line); background: transparent; text-align: left; cursor: pointer; font-family: inherit; }
        .nb-exam-nav-item:last-child { border-bottom: 0; }
        .nb-exam-nav-item:hover, .nb-exam-nav-item.active { background: rgba(4,166,199,0.07); box-shadow: inset 3px 0 var(--pen-blue); }
        .nb-exam-nav-item > span { width: 26px; color: var(--slate); font: 600 10px 'JetBrains Mono', monospace; }
        .nb-exam-nav-item > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .nb-exam-nav-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-exam-nav-item small { color: var(--slate); font-size: 10px; }
        .nb-exam-nav-item > svg { color: var(--slate); }
        .nb-exam-nav-item.done > svg { color: var(--ac-green); }
        .nb-exam-room-main { min-width: 0; }
        .nb-exam-room-intro { padding: 22px 24px; border-radius: 10px; background: linear-gradient(135deg, #F3F7FC, #fff); border: 1px solid var(--paper-line); }
        .nb-exam-room-intro h3 { margin: 5px 0 5px; font-size: 20px; }
        .nb-exam-room-intro p { margin: 0; color: var(--slate); font-size: 13px; line-height: 1.6; }
        .nb-exam-problem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 12px; }
        .nb-exam-problem-card { display: flex; flex-direction: column; gap: 15px; min-height: 145px; padding: 15px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; text-align: left; cursor: pointer; font-family: inherit; transition: transform .12s, box-shadow .12s, border-color .12s; }
        .nb-exam-problem-card:hover { transform: translateY(-2px); border-color: var(--pen-blue); box-shadow: 0 8px 18px rgba(11,23,54,0.07); }
        .nb-exam-problem-card.done { border-color: rgba(46,158,109,0.45); }
        .nb-exam-problem-card-top, .nb-exam-problem-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .nb-exam-index { color: var(--pen-blue); font: 700 10px 'JetBrains Mono', monospace; }
        .nb-exam-done { display: inline-flex; align-items: center; gap: 4px; color: var(--ac-green); font-size: 10px; font-weight: 600; }
        .nb-exam-problem-card h4 { flex: 1; margin: 0; font-size: 14px; line-height: 1.4; }
        .nb-exam-problem-card-foot > span { color: var(--slate); font: 11px 'JetBrains Mono', monospace; }

        .nb-exam-manage-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
        .nb-exam-manage-head h3 { margin: 4px 0; }
        .nb-exam-status-selector { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; padding: 10px; border: 1px solid var(--paper-line); border-radius: 8px; background: #F6F9FD; }
        .nb-exam-status-selector > span { margin-right: 4px; color: var(--slate); font-size: 11px; font-weight: 600; }
        .nb-danger-icon { color: var(--red-pen) !important; border-color: rgba(37,99,235,0.22) !important; }
        .nb-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
        .nb-practice-progress-board { display: grid; grid-template-columns: minmax(210px, 0.9fr) minmax(0, 1.1fr); gap: 1px; margin-bottom: 18px; overflow: hidden; border: 1px solid var(--paper-line); border-radius: 12px; background: var(--paper-line); box-shadow: 0 8px 20px rgba(11,23,54,0.04); }
        .nb-practice-progress-copy { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 10px; row-gap: 3px; padding: 17px 19px; color: #fff; background: linear-gradient(125deg, #102A56 0%, #04a6c7 100%); }
        .nb-practice-progress-copy .nb-eyebrow { grid-column: 1 / -1; color: rgba(255,255,255,0.62); }
        .nb-practice-progress-copy strong { color: #fff; font: 700 27px 'JetBrains Mono', monospace; line-height: 1; }
        .nb-practice-progress-copy > span { color: rgba(255,255,255,0.78); font-size: 12px; }
        .nb-practice-track { grid-column: 1 / -1; height: 7px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,0.2); }
        .nb-practice-track i { display: block; height: 100%; border-radius: inherit; background: #7CE0B1; transition: width .25s ease; }
        .nb-practice-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--paper-line); }
        .nb-practice-summary-card { display: grid; grid-template-columns: auto 1fr; align-content: center; gap: 3px 9px; padding: 14px 16px; color: var(--pen-blue); background: #fff; }
        .nb-practice-summary-card svg { grid-row: 1 / 3; align-self: center; }
        .nb-practice-summary-card strong { color: var(--ink); font: 700 18px 'JetBrains Mono', monospace; }
        .nb-practice-summary-card span { color: var(--slate); font-size: 11px; }
        .nb-practice-toolbar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; padding: 14px; margin-bottom: 18px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; }
        .nb-practice-search { flex: 1 1 250px; display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 10px; color: var(--slate); border: 1px solid var(--paper-line); border-radius: 7px; background: #F8FBFF; }
        .nb-practice-search:focus-within { color: var(--pen-blue); border-color: var(--pen-blue); box-shadow: 0 0 0 3px rgba(4,166,199,0.08); }
        .nb-practice-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: var(--ink); background: transparent; font: 13px inherit; }
        .nb-practice-filter-stack { display: flex; flex-direction: column; gap: 5px; }
        .nb-practice-filter-stack > span { color: var(--slate); font: 600 10px 'JetBrains Mono', monospace; letter-spacing: .04em; text-transform: uppercase; }
        .nb-practice-toolbar .nb-chip { padding: 5px 10px; font-size: 11px; }
        .nb-practice-teacher-board { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 20px; margin: 0 0 18px; padding: 16px 18px; border: 1px solid #D6E4F7; border-left: 4px solid var(--pen-blue); border-radius: 0 10px 10px 0; background: linear-gradient(90deg, rgba(4,166,199,0.07), rgba(255,255,255,0.96)); }
        .nb-practice-teacher-board h3 { margin: 3px 0 4px; }
        .nb-practice-teacher-stats { display: flex; align-items: center; gap: 14px; color: var(--slate); font-size: 11px; white-space: nowrap; }
        .nb-practice-teacher-stats b { color: var(--pen-blue); font: 700 14px 'JetBrains Mono', monospace; }
        .nb-practice-roadmap { position: relative; padding: 19px 20px 20px; border: 1px solid var(--paper-line); border-radius: 12px; background: #fff; }
        .nb-practice-roadmap-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 15px; border-bottom: 1px solid var(--paper-line); }
        .nb-practice-roadmap-head h3 { margin: 3px 0 0; font-size: 18px; }
        .nb-practice-group { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 10px; padding-top: 18px; }
        .nb-practice-group-rail { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 5px; }
        .nb-practice-group-rail span { z-index: 1; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; color: #fff; background: var(--pen-blue); box-shadow: 0 0 0 4px #EAF2FF; font: 700 10px 'JetBrains Mono', monospace; }
        .nb-practice-group-rail i { position: absolute; top: 35px; bottom: -20px; width: 1px; background: var(--paper-line); }
        .nb-practice-group:last-child .nb-practice-group-rail i { display: none; }
        .nb-practice-group-content { min-width: 0; padding-bottom: 8px; }
        .nb-practice-group-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; margin-bottom: 9px; }
        .nb-practice-group-head p { margin: 0 0 3px; color: var(--slate); font: 10px 'JetBrains Mono', monospace; }
        .nb-practice-group-head h3 { margin: 0; color: var(--ink); font-size: 16px; }
        .nb-practice-group-summary { min-width: 125px; color: var(--slate); font-size: 11px; text-align: right; }
        .nb-practice-group-summary > div { width: 128px; height: 5px; margin-top: 5px; margin-left: auto; overflow: hidden; border-radius: 99px; background: var(--paper-line); }
        .nb-practice-group-summary > div i { display: block; height: 100%; border-radius: inherit; background: var(--ac-green); transition: width .25s ease; }
        .nb-practice-month-list { display: flex; flex-direction: column; gap: 9px; }
        .nb-practice-month { overflow: hidden; border: 1px solid var(--paper-line); border-radius: 9px; background: #FBFDFF; }
        .nb-practice-month-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 0; color: var(--ink); background: linear-gradient(90deg, rgba(4,166,199,0.08), rgba(255,255,255,0.72)); text-align: left; cursor: pointer; font-family: inherit; transition: background 180ms ease, color 180ms ease; }
        .nb-practice-month-head:hover { background: rgba(4,166,199,0.14); }
        .nb-practice-month-chevron { display: inline-flex; color: var(--pen-blue); transition: transform 180ms ease; }
        .nb-practice-month:not(.collapsed) .nb-practice-month-chevron { transform: rotate(90deg); }
        .nb-practice-month-title { display: flex; align-items: baseline; gap: 9px; min-width: 0; flex: 1; }
        .nb-practice-month-title strong { font-size: 12px; }
        .nb-practice-month-title small { color: var(--slate); font-size: 10px; }
        .nb-practice-month-progress { color: var(--pen-blue); font: 700 10px 'JetBrains Mono', monospace; }
        .nb-practice-month .nb-practice-problem-list { margin: 0 10px; }
        .nb-practice-month .nb-practice-problem:last-child { border-bottom: 0; }
        .nb-practice-problem-list { display: flex; flex-direction: column; border-top: 1px solid var(--paper-line); }
        .nb-practice-problem { width: 100%; display: grid; grid-template-columns: 29px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 12px 5px 12px 0; color: var(--ink); border: 0; border-bottom: 1px solid var(--paper-line); background: transparent; text-align: left; cursor: pointer; font-family: inherit; transition: background .14s ease, transform .14s ease; }
        .nb-practice-problem:hover { padding-left: 8px; background: rgba(4,166,199,0.045); }
        .nb-practice-problem:focus-visible { outline: 2px solid var(--pen-blue); outline-offset: -2px; }
        .nb-practice-problem.teacher { grid-template-columns: 29px minmax(0, 1fr) auto auto; }
        .nb-practice-problem-index { color: var(--slate); font: 600 10px 'JetBrains Mono', monospace; text-align: center; }
        .nb-practice-problem-main { min-width: 0; }
        .nb-practice-problem-titleline { display: flex; align-items: center; gap: 8px; }
        .nb-practice-problem h4 { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; }
        .nb-practice-problem-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 4px; color: var(--slate); font-size: 10.5px; }
        .nb-practice-problem-meta i { width: 3px; height: 3px; border-radius: 50%; background: #B6BEC9; }
        .nb-practice-status { flex-shrink: 0; padding: 2px 6px; border-radius: 99px; font: 600 9px 'JetBrains Mono', monospace; }
        .nb-practice-status.todo { color: #607795; background: #EFF2F5; }
        .nb-practice-status.in-progress { color: #9B5C00; background: rgba(185,130,47,0.14); }
        .nb-practice-status.done { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-practice-problem-score { display: flex; align-items: center; justify-content: flex-end; gap: 9px; min-width: 106px; }
        .nb-practice-problem-score strong { color: var(--pen-blue); font: 700 11px 'JetBrains Mono', monospace; }
        .nb-practice-problem-score > span { display: inline-flex; align-items: center; gap: 3px; color: var(--pen-blue); font-size: 10px; }
        .nb-practice-problem-actions { display: flex; align-items: center; gap: 5px; padding-left: 5px; border-left: 1px solid var(--paper-line); }
        .nb-practice-manage-action { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border: 1px solid var(--paper-line); border-radius: 6px; background: #fff; color: var(--pen-blue); cursor: pointer; font: 600 10px inherit; transition: background .12s, border-color .12s; }
        .nb-practice-manage-action:hover { border-color: var(--pen-blue); background: rgba(4,166,199,0.07); }
        .nb-practice-manage-action.delete { color: var(--red-pen); }
        .nb-practice-manage-action.delete:hover { border-color: rgba(37,99,235,0.4); background: rgba(37,99,235,0.08); }
        .nb-practice-group-actions { padding-top: 10px; }
        .nb-practice-group-actions .nb-btn { padding: 6px 10px; font-size: 11px; }
        .nb-practice-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 43px 15px 25px; color: var(--slate); text-align: center; }
        .nb-practice-empty strong { color: var(--ink); font-size: 13px; }
        .nb-practice-empty span { font-size: 11px; }
        .nb-management-panel { margin-bottom: 16px; }
        .nb-management-head, .nb-editor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .nb-management-list { display: flex; flex-direction: column; margin-top: 12px; }
        .nb-management-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid var(--paper-line); }
        .nb-management-info { min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .nb-management-info strong { font-size: 13.5px; }
        .nb-management-info .nb-eyebrow { margin: 0; }
        .nb-management-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .nb-btn-danger { background: rgba(37,99,235,0.08); color: var(--red-pen); border: 1px solid rgba(37,99,235,0.22); }
        .nb-problem-editor { gap: 12px; }
        .nb-form-section-label { color: var(--ink); font-size: 12px; font-weight: 700; margin-top: 3px; }
        .nb-image-upload-panel { display: flex; flex-direction: column; gap: 10px; }
        .nb-upload-drop { display: flex; align-items: center; gap: 10px; border: 1px dashed var(--pen-blue); background: rgba(4,166,199,0.05); color: var(--pen-blue); border-radius: 9px; padding: 13px; cursor: pointer; }
        .nb-upload-drop input { display: none; }
        .nb-upload-drop span { display: flex; flex-direction: column; gap: 3px; }
        .nb-upload-drop small { color: var(--slate); font-size: 11px; }
        .nb-image-preview-wrap { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
        .nb-image-preview { max-width: 100%; max-height: 220px; object-fit: contain; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; padding: 4px; }
        .nb-testcase-editor { display: flex; flex-direction: column; gap: 10px; }
        .nb-testcase-card { border: 1px solid var(--paper-line); border-radius: 9px; padding: 10px; background: #F8FBFF; }
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
        .nb-pill-wa { background: rgba(37,99,235,0.1); color: var(--red-pen); }
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
        .nb-lesson-catalog-item.active { background: rgba(4,166,199,0.07); box-shadow: inset 3px 0 var(--pen-blue); }
        .nb-lesson-catalog-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; padding: 13px 12px 13px 16px; border: none; background: transparent; text-align: left; cursor: pointer; font-family: inherit; }
        .nb-lesson-index { width: 28px; color: var(--slate); font: 600 11px 'JetBrains Mono', monospace; }
        .nb-lesson-catalog-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .nb-lesson-catalog-text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
        .nb-lesson-catalog-text small { color: var(--slate); font-size: 11px; }
        .nb-lesson-item-actions { display: flex; align-items: center; gap: 2px; padding-right: 7px; }
        .nb-lesson-reader { min-height: 520px; padding: 26px 30px 30px; }
        .nb-lesson-reader-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .nb-lesson-reader-title { font-size: 30px; line-height: 1.2; margin: 10px 0 18px; max-width: 760px; }
        .nb-lesson-callout { display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px; border-left: 3px solid var(--pen-blue); background: rgba(4,166,199,0.07); color: var(--pen-blue); border-radius: 0 8px 8px 0; margin-bottom: 22px; }
        .nb-lesson-callout p { margin: 0; color: var(--ink); font-size: 13.5px; line-height: 1.6; }
        .nb-lesson-content { color: #26364D; font-size: 14px; line-height: 1.8; margin-bottom: 24px; }
        .nb-lesson-content p { margin: 0 0 16px; white-space: pre-wrap; }
        .nb-lesson-status-badges { display: flex; flex-wrap: wrap; gap: 5px; }
        .nb-lesson-progress-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-bottom: 24px; border-bottom: 1px solid var(--paper-line); }
        .nb-lesson-discussion { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--paper-line); }
        .nb-lesson-discussion-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
        .nb-lesson-question-form { display: flex; gap: 8px; align-items: flex-end; margin-bottom: 16px; }
        .nb-lesson-question-form .nb-input { flex: 1; }
        .nb-lesson-thread-list { display: flex; flex-direction: column; gap: 12px; }
        .nb-lesson-thread { padding: 13px; border: 1px solid var(--paper-line); border-radius: 9px; background: #F8FBFF; }
        .nb-lesson-form-grid { display: grid; grid-template-columns: 0.8fr 2fr 1fr; gap: 10px; }
        .nb-lesson-editor { gap: 12px; }
        .nb-lesson-empty { min-height: 460px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--slate); text-align: center; }

        .nb-filter-row { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
        .nb-chip { font-size: 12.5px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--paper-line); background: #fff; cursor: pointer; font-family: inherit; color: var(--slate); }
        .nb-chip.active { background: var(--pen-blue); color: #fff; border-color: var(--pen-blue); }

        .nb-problem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        .nb-problem-card { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 14px; text-align: left; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 10px; transition: transform .12s, box-shadow .12s; }
        .nb-problem-card:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(11,23,54,0.08); }
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
        .nb-input { border: 1px solid var(--paper-line); border-radius: 7px; padding: 9px 11px; font-size: 13.5px; font-family: inherit; background: #F8FBFF; width: 100%; box-sizing: border-box; }
        .nb-checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--slate); }
        .nb-checklist { max-height: 170px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--paper-line); border-radius: 8px; padding: 10px; background: #F8FBFF; }

        .nb-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(11,23,54,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
          overflow: auto;
          touch-action: pan-y;
          overscroll-behavior: contain;
        }
        .nb-modal {
          background: var(--paper);
          border-radius: 12px;
          max-width: 820px;
          width: 100%;
          max-height: calc(100dvh - 32px);
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          scrollbar-gutter: stable;
        }
        .nb-modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 22px; border-bottom: 1px solid var(--paper-line); }
        .nb-modal-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; padding: 20px 22px; }
        .nb-solver-modal { display: flex; flex-direction: column; min-height: 0; }
        .nb-solver-modal-body { min-width: 0; }
        .nb-solver-editor-anchor { scroll-margin: 18px; }
        .nb-modal-col { min-width: 0; }

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
        .nb-thonny-editor { border: 1px solid #173562; border-radius: 9px; overflow: hidden; background: #0B2347; box-shadow: 0 6px 16px rgba(16,32,47,0.16); }
        .nb-editor-toolbar, .nb-editor-status { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 10px; color: #9CB4D2; background: #12315C; font: 11px/1.2 'JetBrains Mono', monospace; }
        .nb-editor-toolbar span:first-child { display: flex; align-items: center; gap: 6px; color: #E7F0FC; font-weight: 600; }
        .nb-editor-status { color: #7894B8; background: #0F294F; border-top: 1px solid #173562; font-size: 10px; }
        .nb-editor-workspace { display: flex; position: relative; min-height: 330px; max-height: 480px; overflow: hidden; background: #0B2347; }
        .nb-editor-gutter { flex: 0 0 46px; padding: 14px 7px 14px 0; color: #5D7597; background: #081A36; text-align: right; user-select: none; font: 13px/1.55 'JetBrains Mono', monospace; }
        .nb-editor-gutter span { display: block; height: 20px; }
        .nb-editor-code-layer { position: relative; flex: 1; min-width: 0; overflow: hidden; }
        .nb-code-highlight, .nb-code-input { position: absolute; inset: 0; width: max-content; min-width: 100%; min-height: 100%; margin: 0; padding: 14px 16px; border: 0; box-sizing: border-box; font: 13px/1.55 'JetBrains Mono', monospace; letter-spacing: 0; tab-size: 4; white-space: pre; }
        .nb-code-highlight { pointer-events: none; color: #E8F1FC; background: transparent; }
        .nb-code-highlight code { font: inherit; }
        .nb-code-input { z-index: 2; resize: none; overflow: auto; color: transparent; caret-color: #F7C873; background: transparent; outline: none; -webkit-text-fill-color: transparent; }
        .nb-code-input::selection { background: rgba(92, 155, 213, 0.38); }
        .nb-syntax-comment { color: #6FA47C; font-style: italic; }
        .nb-syntax-string { color: #E6B36A; }
        .nb-syntax-number { color: #C99BE8; }
        .nb-syntax-keyword { color: #7DB7E8; font-weight: 600; }
        .nb-syntax-function { color: #82D4C1; }
        .nb-modal-actions {
          position: sticky;
          bottom: 0;
          z-index: 3;
          margin-top: 10px;
          display: flex;
          padding: 10px 0 max(2px, env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(244,248,253,0), var(--paper) 28%);
        }
        .nb-modal-actions .nb-btn { min-height: 42px; }
        .nb-modal-actions .nb-btn-primary { box-shadow: 0 5px 14px rgba(4,166,199,0.24); }
        /* Responsive solver surface: header stays visible while content scrolls. */
        .nb-solver-modal { width: min(1180px, 100%); max-width: 1180px; max-height: min(900px, calc(100dvh - 32px)); overflow: hidden; }
        .nb-solver-modal .nb-modal-head { flex: 0 0 auto; min-width: 0; }
        .nb-solver-modal .nb-modal-head > div { min-width: 0; }
        .nb-solver-modal .nb-modal-head .nb-h3 { overflow-wrap: anywhere; }
        .nb-solver-modal-body { flex: 1 1 auto; min-height: 0; width: 100%; overflow-y: auto; overscroll-behavior: contain; align-items: start; }
        .nb-solver-modal-body > .nb-modal-col { min-width: 0; width: 100%; }
        .nb-problem-statement { overflow-wrap: anywhere; }
        .nb-problem-statement-image { width: auto; height: auto; max-width: 100%; }
        .nb-editor-toolbar, .nb-editor-status { min-width: 0; flex-wrap: wrap; }
        .nb-editor-toolbar span, .nb-editor-status span { min-width: 0; overflow-wrap: anywhere; }
        .nb-editor-workspace { min-width: 0; height: clamp(260px, 42dvh, 520px); max-height: none; }
        .nb-editor-code-layer { overflow: hidden; }
        .nb-code-input { width: 100%; min-width: 100%; }
        .nb-code-highlight { min-width: max-content; }
        .nb-modal-actions { margin-top: 12px; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
        .nb-modal-actions .nb-btn { touch-action: manipulation; }
        .nb-solver-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 12px; color: var(--slate); font-size: 11.5px; }
        .nb-solver-meta strong { color: var(--ink); font-family: 'JetBrains Mono', monospace; }
        .nb-history-panel { margin-top: 14px; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; overflow: hidden; }
        .nb-history-toggle { width: 100%; display: flex; align-items: center; gap: 7px; padding: 10px 11px; background: transparent; border: none; color: var(--pen-blue); font: 600 12px inherit; cursor: pointer; text-align: left; }
        .nb-history-chevron { margin-left: auto; transition: transform .15s; }
        .nb-history-chevron.open { transform: rotate(90deg); }
        .nb-history-body { border-top: 1px solid var(--paper-line); padding: 9px; }
        .nb-history-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
        .nb-history-item { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 8px; border: 1px solid transparent; border-radius: 6px; background: #F8F8F4; text-align: left; cursor: pointer; font-family: inherit; }
        .nb-history-item:hover, .nb-history-item.active { border-color: var(--pen-blue); background: rgba(4,166,199,0.06); }
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
        .nb-testdot.fail { color: var(--red-pen); background: rgba(37,99,235,0.1); }
        .nb-spin { animation: nb-spin 0.9s linear infinite; }
        @keyframes nb-spin { to { transform: rotate(360deg); } }

        .nb-contest-list { display: flex; flex-direction: column; gap: 14px; }
        .nb-contest-card { display: flex; flex-direction: column; gap: 10px; }
        .nb-contest-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .nb-mini-leaderboard { border-top: 1px solid var(--paper-line); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
        .nb-mini-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .nb-contest-bar { display: flex; align-items: center; gap: 18px; margin-bottom: 12px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 12px 16px; flex-wrap: wrap; }
        .nb-contest-timer { font-family: 'JetBrains Mono', monospace; font-weight: 700; display: flex; align-items: center; gap: 6px; color: var(--red-pen); }
        .nb-locked-banner { display: flex; align-items: center; gap: 8px; background: rgba(37,99,235,0.08); color: var(--red-pen); font-size: 12.5px; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }

        .nb-ranking-page { display: flex; flex-direction: column; gap: 18px; }
        .nb-ranking-hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 24px 26px; border-radius: 14px; color: #fff; background: linear-gradient(120deg, #183A5A 0%, #04a6c7 58%, #5B84D8 100%); box-shadow: 0 10px 24px rgba(4,166,199,0.18); }
        .nb-ranking-title { margin: 6px 0 7px; font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; }
        .nb-ranking-sub { margin: 0; color: rgba(255,255,255,0.72); font-size: 13px; line-height: 1.5; }
        .nb-ranking-hero .nb-eyebrow { color: #D5E5FF; }
        .nb-ranking-hero-badge { display: flex; align-items: center; gap: 10px; padding: 10px 13px; border: 1px solid rgba(255,255,255,0.22); border-radius: 10px; background: rgba(255,255,255,0.1); }
        .nb-ranking-hero-badge span { display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-hero-badge strong { font: 700 18px 'JetBrains Mono', monospace; }
        .nb-ranking-hero-badge small { color: rgba(255,255,255,0.68); font-size: 10px; }
        .nb-ranking-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .nb-ranking-stat { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 14px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-ranking-stat-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; }
        .nb-ranking-stat-icon.blue { color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-ranking-stat-icon.gold { color: var(--gold); background: rgba(185,130,47,0.13); }
        .nb-ranking-stat-icon.green { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-ranking-stat-icon.ink { color: var(--ink); background: rgba(11,23,54,0.08); }
        .nb-ranking-stat div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-stat strong { color: var(--ink); font: 700 20px 'JetBrains Mono', monospace; }
        .nb-ranking-stat small { color: var(--slate); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nb-ranking-podium { display: grid; grid-template-columns: 1fr 1.1fr 1fr; align-items: end; gap: 12px; min-height: 220px; }
        .nb-podium-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 20px 14px 17px; background: #fff; border: 1px solid var(--paper-line); border-radius: 12px; text-align: center; box-shadow: 0 5px 14px rgba(11,23,54,0.05); }
        .nb-podium-card.rank-1 { min-height: 220px; padding-top: 24px; border-color: rgba(185,130,47,0.55); box-shadow: 0 10px 22px rgba(185,130,47,0.14); }
        .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 184px; }
        .nb-podium-card.is-me { outline: 2px solid var(--red-pen); outline-offset: 2px; }
        .nb-podium-rank { display: flex; align-items: center; gap: 5px; color: var(--gold); font: 700 13px 'JetBrains Mono', monospace; }
        .nb-podium-card.rank-2 .nb-podium-rank { color: #6B82A4; }
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
        .nb-ranking-progress span, .nb-row-progress > div span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #68D7E7); }
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
        .nb-ranking-table tr.me { background: rgba(4,166,199,0.07); }
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
        .nb-table tr.me { background: rgba(37,99,235,0.05); }

        .nb-thread-list { display: flex; flex-direction: column; gap: 14px; }
        .nb-thread-head { display: flex; align-items: center; gap: 10px; }
        .nb-reply-list { display: flex; flex-direction: column; gap: 10px; padding-left: 8px; border-left: 2px solid var(--paper-line); margin-left: 4px; }
        .nb-reply { display: flex; gap: 8px; }
        .nb-reply-form { display: flex; gap: 8px; margin-top: 12px; }
        .nb-reply-form .nb-input { flex: 1; }

        .nb-boot-loading { width: 100%; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #9FB2CC; }

        .nb-login-wrap { width: 100%; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .nb-login-card { background: #fff; border-radius: 14px; padding: 32px 28px; width: 100%; max-width: 360px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
        .nb-field-label { display: block; font-size: 12px; font-weight: 600; color: var(--slate); margin-bottom: 6px; }
        .nb-password-row { display: flex; gap: 6px; align-items: center; }
        .nb-password-row .nb-input { flex: 1; }
        .nb-login-error { display: flex; align-items: center; gap: 6px; color: var(--red-pen); font-size: 12.5px; background: rgba(37,99,235,0.08); padding: 8px 10px; border-radius: 7px; margin-top: 4px; }

        .nb-bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; background: var(--ink); border-top: 1px solid rgba(255,255,255,0.08); padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px)); gap: 2px; z-index: 20; overflow-x: auto; }
        .nb-bottom-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: transparent; border: none; color: #9FB2CC; font-size: 10px; font-family: inherit; padding: 6px 2px; border-radius: 8px; white-space: nowrap; }
        .nb-bottom-nav-item.active { color: #fff; background: var(--pen-blue); }

        @media (max-width: 980px) and (max-height: 760px) {
          .nb-solver-modal-body { grid-template-columns: minmax(0, 1fr); gap: 16px; }
          .nb-solver-modal .nb-modal-col { width: 100%; }
          .nb-solver-modal .nb-editor-workspace { min-height: 260px; max-height: 44dvh; }
        }

        @media (max-width: 860px) {
          .nb-only-desktop { display: none !important; }
          .nb-only-mobile { display: flex !important; }
          .nb-root { flex-direction: column; }
          .nb-main::before { display: none; }
          .nb-topbar { padding: 12px 14px; }
          .nb-content { padding: 16px 14px 92px 14px; }
          .nb-storage-banner { margin: -8px -14px 16px -14px; padding-left: 14px; }
          .nb-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .nb-exam-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .nb-exam-form-grid { grid-template-columns: 1fr 1fr; }
          .nb-exam-form-grid label:first-child { grid-column: 1 / -1; }
          .nb-exam-problem-checklist { grid-template-columns: 1fr; }
          .nb-exam-room-layout { grid-template-columns: 1fr; }
          .nb-exam-navigator { order: 2; }
          .nb-exam-room-main { order: 1; }
          .nb-home-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .nb-home-main-grid, .nb-home-lower-grid { grid-template-columns: 1fr; }
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
          .nb-practice-progress-board { grid-template-columns: 1fr; }
          .nb-practice-toolbar { align-items: stretch; }
          .nb-practice-search { flex-basis: 100%; }
          .nb-practice-filter-stack { width: 100%; }
          .nb-practice-filter-stack .nb-filter-row { width: 100%; }
          .nb-practice-filter-stack .nb-chip { flex: 1; padding-left: 7px; padding-right: 7px; }
          .nb-practice-teacher-board { grid-template-columns: 1fr; gap: 12px; }
          .nb-practice-teacher-stats { justify-content: space-between; }
          .nb-practice-teacher-board .nb-btn { justify-content: center; }
          .nb-practice-roadmap { padding: 15px 12px; }
          .nb-practice-group { grid-template-columns: 27px minmax(0, 1fr); gap: 7px; }
          .nb-practice-group-head { align-items: flex-start; flex-direction: column; gap: 5px; }
          .nb-practice-group-summary { text-align: left; }
          .nb-practice-group-summary > div { margin-left: 0; }
          .nb-practice-problem { grid-template-columns: 23px minmax(0, 1fr); gap: 7px; padding-right: 0; }
          .nb-practice-problem-score { grid-column: 2; justify-content: flex-start; min-width: 0; }
          .nb-practice-problem.teacher { grid-template-columns: 23px minmax(0, 1fr); }
          .nb-practice-problem.teacher .nb-practice-problem-actions { grid-column: 2; justify-content: flex-start; padding: 7px 0 0; border: 0; }
          .nb-practice-problem h4 { white-space: normal; }
          .nb-management-row { align-items: flex-start; flex-direction: column; }
          .nb-management-actions { width: 100%; }
          .nb-management-actions .nb-btn { flex: 1; justify-content: center; }
          .nb-testcase-grid { grid-template-columns: 1fr; }
          .nb-sample-grid { grid-template-columns: 1fr; }
          .nb-two-col, .nb-modal-body { grid-template-columns: 1fr; }
          .nb-exam-hero { align-items: flex-start; padding: 20px; }
          .nb-exam-title { font-size: 24px; }
          .nb-exam-hero-icon { display: none; }
          .nb-exam-toolbar { align-items: stretch; }
          .nb-exam-search { flex-basis: 100%; }
          .nb-exam-room-head { grid-template-columns: 1fr auto; gap: 10px; }
          .nb-exam-room-head > .nb-btn { grid-column: 1 / -1; }
          .nb-ranking-hero { align-items: flex-start; padding: 20px; }
          .nb-ranking-title { font-size: 24px; }
          .nb-ranking-toolbar { align-items: stretch; }
          .nb-ranking-search { flex-basis: 100%; }
          .nb-ranking-controls { width: 100%; justify-content: space-between; }
          .nb-ranking-controls .nb-input { flex: 1; }
          .nb-modal {
            max-height: calc(100dvh - 8px);
            width: 100%;
            border-radius: 16px 16px 0 0;
            overscroll-behavior: contain;
          }
          .nb-solver-modal .nb-modal-head { padding: 14px 16px; }
          .nb-solver-modal .nb-modal-body { padding: 16px; gap: 16px; }
          .nb-solver-modal .nb-sample-grid { grid-template-columns: 1fr; }
          .nb-solver-modal .nb-editor-workspace { min-height: 230px; max-height: 42dvh; }
          .nb-solver-modal .nb-code-block pre { max-height: 180px; }
          .nb-exam-stat-grid { gap: 8px; }
          .nb-exam-stat { padding: 11px; }
          .nb-exam-stat strong { font-size: 16px; }
          .nb-exam-form-grid { grid-template-columns: 1fr; }
          .nb-exam-form-grid label:first-child { grid-column: auto; }
          .nb-exam-manage-head { flex-direction: column; align-items: stretch; }
          .nb-exam-manage-head .nb-btn { justify-content: center; }
          .nb-exam-card { padding-left: 18px; }
          .nb-exam-card-head h3 { font-size: 16px; }
          .nb-exam-card-meta { gap: 8px; }
          .nb-exam-card-actions .nb-btn { flex: 1; justify-content: center; }
          .nb-exam-room-meta { gap: 8px; }
          .nb-exam-room-meta > .nb-exam-progress { flex-basis: 100%; max-width: none; }
          .nb-home-hero { align-items: flex-start; padding: 20px; }
          .nb-home-hero h1 { font-size: 24px; }
          .nb-home-hero-rank { display: none; }
          .nb-home-stat { padding: 11px; }
          .nb-home-stat strong { font-size: 16px; }
          .nb-home-progress-card, .nb-home-class-card, .nb-home-contest-card { padding: 17px; }
          .nb-home-progress-foot { flex-direction: column; gap: 4px; }
          .nb-home-actions .nb-btn { flex: 1; justify-content: center; }
          .nb-home-section-head { align-items: center; }
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
          .nb-modal-actions { margin-left: -16px; margin-right: -16px; padding-left: 16px; padding-right: 16px; }
          .nb-modal-actions .nb-btn-primary { flex: 1; justify-content: center; }
        }

        @media (max-width: 860px) {
          .nb-solver-modal { max-height: calc(100dvh - 20px); }
          .nb-solver-modal-body { grid-template-columns: minmax(0, 1fr); gap: 18px; }
          .nb-solver-modal .nb-editor-workspace { height: clamp(260px, 46dvh, 500px); }
          .nb-solver-modal .nb-modal-actions { position: sticky; bottom: 0; }
        }
        @media (max-width: 600px) {
          .nb-solver-modal { max-height: 100dvh; border-radius: 18px 18px 0 0; }
          .nb-solver-modal .nb-modal-head { padding: 14px 16px 12px; }
          .nb-solver-modal .nb-modal-body { padding: 14px 16px max(16px, env(safe-area-inset-bottom)); gap: 18px; }
          .nb-solver-modal .nb-editor-workspace { height: clamp(230px, 43dvh, 420px); }
          .nb-solver-modal .nb-editor-toolbar, .nb-solver-modal .nb-editor-status { align-items: flex-start; gap: 5px 8px; }
          .nb-solver-modal .nb-editor-toolbar span:last-child, .nb-solver-modal .nb-editor-status span:last-child { margin-left: auto; }
          .nb-solver-modal .nb-modal-actions { margin-left: -16px; margin-right: -16px; padding-left: 16px; padding-right: 16px; }
          .nb-solver-modal .nb-modal-actions .nb-btn { width: 100%; justify-content: center; }
        }
        .nb-code-input:focus-visible { outline: 2px solid #7DB7E8; outline-offset: -2px; }
        /* ------------------------------------------------------------------
           Motion & UX polish: subtle, purposeful, accessible interactions
        ------------------------------------------------------------------ */
        .nb-nav-item,
        .nb-bottom-nav-item,
        .nb-btn,
        .nb-icon-btn,
        .nb-chip,
        .nb-practice-manage-action {
          transition:
            color 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease,
            opacity 180ms ease;
        }
        .nb-nav-item:hover,
        .nb-bottom-nav-item:hover {
          transform: translateX(2px);
        }
        .nb-nav-item.active,
        .nb-bottom-nav-item.active {
          box-shadow: 0 6px 16px rgba(4,166,199,0.22);
        }
        .nb-nav-item:focus-visible,
        .nb-bottom-nav-item:focus-visible,
        .nb-btn:focus-visible,
        .nb-icon-btn:focus-visible,
        .nb-chip:focus-visible {
          outline: 3px solid rgba(4,166,199,0.28);
          outline-offset: 2px;
        }

        @keyframes nb-page-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nb-content { animation: nb-page-enter 320ms ease both; }

        .nb-problem-card,
        .nb-exam-card,
        .nb-home-progress-card,
        .nb-home-class-card,
        .nb-home-contest-card {
          transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
        }
        .nb-problem-card:hover,
        .nb-exam-card:hover,
        .nb-home-progress-card:hover,
        .nb-home-class-card:hover,
        .nb-home-contest-card:hover {
          transform: translateY(-3px);
          border-color: rgba(4,166,199,0.55);
          box-shadow: 0 14px 30px rgba(11,23,54,0.11);
        }
        .nb-problem-card:active,
        .nb-exam-card:active {
          transform: translateY(-1px) scale(0.995);
        }

        .nb-home-progress span,
        .nb-exam-progress span,
        .nb-practice-track i {
          position: relative;
          overflow: hidden;
        }
        .nb-home-progress span::after,
        .nb-exam-progress span::after,
        .nb-practice-track i::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 42%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.38), transparent);
          transform: translateX(-150%);
          animation: nb-progress-shine 3.2s ease-in-out infinite;
        }
        @keyframes nb-progress-shine {
          0%, 35% { transform: translateX(-150%); }
          75%, 100% { transform: translateX(300%); }
        }

        .nb-modal-overlay { animation: nb-overlay-in 180ms ease both; }
        .nb-modal { animation: nb-modal-in 240ms cubic-bezier(0.2,0.8,0.2,1) both; }
        @keyframes nb-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nb-modal-in {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .nb-btn:not(:disabled):active,
        .nb-icon-btn:not(:disabled):active {
          transform: translateY(1px) scale(0.98);
        }
        .nb-btn:disabled,
        .nb-icon-btn:disabled {
          cursor: not-allowed;
          opacity: 0.58;
          transform: none !important;
        }

        .nb-skeleton {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          background: #E7F3F7;
        }
        .nb-skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent);
          animation: nb-skeleton-shimmer 1.4s infinite;
        }
        @keyframes nb-skeleton-shimmer {
          to { transform: translateX(100%); }
        }

        @media (max-width: 600px) {
          .nb-content { padding: 18px 14px 88px; }
          .nb-main::before { display: none; }
          .nb-home-hero,
          .nb-exam-hero { align-items: flex-start; flex-direction: column; padding: 20px; }
          .nb-home-hero-rank,
          .nb-exam-hero-icon { width: 100%; }
          .nb-h2 { font-size: 21px; }
          .nb-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .nb-table { min-width: 620px; }
          .nb-modal-body { display: flex; flex-direction: column; gap: 16px; }
          .nb-modal-overlay {
            align-items: flex-end;
            padding: max(0px, env(safe-area-inset-top)) max(0px, env(safe-area-inset-right)) max(0px, env(safe-area-inset-bottom)) max(0px, env(safe-area-inset-left));
          }
          .nb-modal {
            max-height: 92vh;
            border-radius: 18px 18px 0 0;
            animation-name: nb-sheet-in;
          }
        }
        @keyframes nb-sheet-in {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
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
              <div className="nb-brand-text"><b>Tin học thầy Lợi</b><span>ÔN THI HSG · 2026</span></div>
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
                  <div className="nb-sub" style={{ color: "#6C82A5" }}>{accountRoleLabel(currentUser.role)}</div>
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
              <StorageBanner
                visible={storageError}
                message={storageError}
                onRetry={refreshNow}
                onDismiss={() => setStorageError(false)}
              />

              {tab === "overview" && (
                <OverviewView
                  currentUser={currentUser} students={students} submissions={submissions}
                  points={points} solvedCount={solvedCount} contests={contests} discussions={discussions}
                  problemsCount={problems.length} onNavigate={setTab}
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
                  addContest={addContest} setContestStatus={setContestStatus} updateContest={updateContest} removeContest={removeContest}
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
                <AccountsView accounts={accounts} resetPassword={resetPassword} addAccount={addAccount} removeAccount={removeAccount} currentUser={currentUser} isAdmin={isAdmin} />
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
