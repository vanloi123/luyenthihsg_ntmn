import React, { useState, useMemo, useEffect, useRef, useCallback, useReducer } from "react";
import { createRoot } from "react-dom/client";
import {
  Home, BookOpen, Code2, Trophy, MessageSquare, Clock, Users, Plus,
  Send, CheckCircle2, XCircle, Loader2, Flame, ChevronRight, ChevronLeft, Search,
  Award, TrendingUp, AlertCircle, X, Play, Lock, GraduationCap, ListChecks,
  RefreshCw, Eye, EyeOff, LogOut, Pencil, Trash2, Save, UploadCloud, ExternalLink, Keyboard,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SISTER_SITE_URL, SISTER_SITE_LABEL } from "./config.js";

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
    createdAt: row.created_at || row.createdAt || (/^PX\d{10,}$/.test(String(row.id || "")) ? new Date(Number(String(row.id).slice(2))).toISOString() : null),
    testCases: normalizeTestCases(row.test_cases),
  };
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
function mapAssignment(row) {
  return {
    id: row.id,
    problemId: row.problem_id,
    studentId: row.student_id,
    assignedBy: row.assigned_by || "",
    note: row.note || "",
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

// Tải TOÀN BỘ dòng của một bảng bằng cách gọi nhiều trang (range) liên tiếp,
// tránh bị cắt mất dữ liệu khi bảng vượt quá giới hạn "Max Rows" của Supabase
// (mặc định 1000 dòng/lần gọi), bất kể sau này bảng phình to đến đâu.
async function fetchAllRows(table, { order, pageSize = 1000, columns = "*", gte = null } = {}) {
  let allRows = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (gte) query = query.gte(gte.column, gte.value);
    if (order) query = query.order(order.column, { ascending: order.ascending });
    const { data, error } = await query;
    if (error) return { data: null, error };
    allRows = allRows.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: allRows, error: null };
}

const SUBMISSION_LIST_COLUMNS = "id,student_id,problem_id,verdict,score,passed_tests,total_tests,problem_title,problem_points,created_at";
// Giữ lại source code đã có trong bộ nhớ (bài vừa nộp / đã tải) khi danh sách mới về không kèm code.
function mergeLocalCode(prev, next) {
  const codeById = new Map((prev || []).filter((x) => x.sourceCode).map((x) => [x.id, x.sourceCode]));
  return next.map((x) => (codeById.has(x.id) ? { ...x, sourceCode: codeById.get(x.id) } : x));
}
async function fetchSourceCode(submissionId) {
  const { data, error } = await supabase.from("submissions").select("source_code").eq("id", submissionId).maybeSingle();
  if (error) throw error;
  return data?.source_code || "";
}
// light=true: bỏ qua topics + problems (nặng, ít thay đổi) để tiết kiệm băng thông; trả về null cho 2 mục đó.
// scope: "full" = tất cả; "medium" = bài nộp mới + tài khoản/thảo luận/bài giao + danh sách đề;
// "fast" = chỉ bài nộp mới + danh sách đề. Bài giảng/đề bài (nặng) chỉ tải ở "full".
// since: chỉ lấy bài nộp từ mốc này trở đi (tải gia tăng) — dùng cho "fast"/"medium".
async function fetchAll({ scope = "full", since = null } = {}) {
  const full = scope === "full";
  const medium = scope !== "fast";
  const skipped = { data: null, error: null };
  const [topicsR, problemsR, examsR, submissionsR, discussionsR, repliesR, accountsR, assignmentsR] = await Promise.all([
    full ? supabase.from("topics").select("*") : skipped,
    full ? supabase.from("problems").select("*") : skipped,
    supabase.from("exams").select(EXAM_LIST_COLUMNS).order("created_at", { ascending: false }),
    fetchAllRows("submissions", { order: { column: "created_at", ascending: true }, columns: SUBMISSION_LIST_COLUMNS, gte: !full && since ? { column: "created_at", value: since } : null }),
    medium ? supabase.from("discussions").select("*").order("created_at", { ascending: false }) : skipped,
    medium ? fetchAllRows("discussion_replies", { order: { column: "created_at", ascending: true } }) : skipped,
    medium ? supabase.from("accounts").select("*") : skipped,
    medium ? fetchAllRows("assignments", { order: { column: "created_at", ascending: true } }) : skipped,
  ]);
  const results = [topicsR, problemsR, submissionsR, discussionsR, repliesR, accountsR, assignmentsR];
  const firstError = results.find((r) => r.error);
  if (firstError) throw firstError.error;

  let discussions = null;
  if (discussionsR.data) {
    const repliesByThread = {};
    (repliesR.data || []).forEach((r) => {
      if (!repliesByThread[r.thread_id]) repliesByThread[r.thread_id] = [];
      repliesByThread[r.thread_id].push({ author: r.author, role: r.role, content: r.content });
    });
    discussions = discussionsR.data.map((d) => ({
      id: d.id, author: d.author, role: d.role, topicRef: d.topic_ref, content: d.content,
      replies: repliesByThread[d.id] || [],
    }));
  }
  const rows = submissionsR.data || [];
  const cursor = rows.reduce((max, r) => (r.created_at && (!max || r.created_at > max) ? r.created_at : max), null);

  return {
    topics: topicsR.data ? topicsR.data.map(mapTopic) : null,
    problems: problemsR.data ? problemsR.data.map(mapProblem) : null,
    exams: (examsR.data || []).map(mapExam),
    examsMissing: !!examsR.error,
    submissions: rows.map(mapSubmission),
    partial: !full,
    cursor,
    discussions,
    accounts: accountsR.data ? accountsR.data.map(mapAccount) : null,
    assignments: assignmentsR.data ? assignmentsR.data.map(mapAssignment) : null,
  };
}
// Gộp bài nộp mới vào danh sách hiện có (theo id), giữ source code đã có và thứ tự thời gian.
function mergeIncremental(prev, incoming) {
  if (!incoming.length) return prev;
  const byId = new Map((prev || []).map((x) => [x.id, x]));
  incoming.forEach((x) => {
    const old = byId.get(x.id);
    byId.set(x.id, old && old.sourceCode && !x.sourceCode ? { ...x, sourceCode: old.sourceCode } : x);
  });
  return [...byId.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
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
    id: p.id, title: p.title, topic: p.topic || null, difficulty: p.difficulty, points: p.points,
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
    title: p.title, topic: p.topic || null, difficulty: p.difficulty, points: p.points,
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

async function dbAddAssignments(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from("assignments").upsert(
    rows.map((a) => ({ id: a.id, problem_id: a.problemId, student_id: a.studentId, assigned_by: a.assignedBy || null, note: a.note || null })),
    { onConflict: "problem_id,student_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}
async function dbRemoveAssignment(id) {
  const { error } = await supabase.from("assignments").delete().eq("id", id);
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
/* ---------- ĐỀ THI THỬ: lớp dữ liệu (bảng exams / exam_attempts / exam_submissions) ---------- */
const EXAM_LIST_COLUMNS = "id,title,description,status,date,duration,assigned_to,problem_count,total_points,created_at";
const EXAM_SUB_LIGHT_COLUMNS = "id,exam_id,student_id,problem_id,verdict,score,passed_tests,total_tests,problem_title,problem_points,created_at";
// Cột mới (schema-exams-v2.sql). Nếu chưa chạy SQL, tự rơi về cách cũ để hệ thống vẫn chạy bình thường.
let examLanguageColumn = true;
const isMissingColumnError = (error, name) => !!error && (error.code === "42703" || error.code === "PGRST204" || new RegExp(name, "i").test(String(error.message || "")));
const EXAM_STATUS = ["draft", "upcoming", "active", "completed"];

function mapExam(row) {
  return {
    id: row.id, title: row.title || "", description: row.description || "",
    status: EXAM_STATUS.includes(row.status) ? row.status : "draft",
    date: row.date || "", duration: Number(row.duration) || 90,
    assignedTo: Array.isArray(row.assigned_to) ? row.assigned_to : [],
    problemCount: Number(row.problem_count) || 0, totalPoints: Number(row.total_points) || 0,
    createdAt: row.created_at || null,
  };
}
function normalizeExamProblem(raw, index = 0) {
  const language = normalizeLanguage(raw?.language, raw?.isPython);
  return {
    id: String(raw?.id || `Q${index + 1}`), title: String(raw?.title || ""),
    difficulty: DIFFICULTIES.includes(raw?.difficulty) ? raw.difficulty : "Dễ",
    points: Math.max(1, Number(raw?.points) || 100),
    language, isPython: language === "python",
    statement: String(raw?.statement || ""), imageUrl: String(raw?.imageUrl || raw?.statement_image_url || ""),
    sample: { input: String(raw?.sample?.input ?? "—"), output: String(raw?.sample?.output ?? "—") },
    testCases: normalizeTestCases(raw?.testCases ?? raw?.test_cases),
  };
}
function newExamProblemId() {
  return "Q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function examRow(exam, problems) {
  return {
    title: exam.title, description: exam.description || null, status: exam.status, date: exam.date || null,
    duration: exam.duration, assigned_to: exam.assignedTo || [],
    problems, problem_count: problems.length,
    total_points: problems.reduce((sum, p) => sum + (Number(p.points) || 0), 0),
  };
}
async function dbExamGetProblems(examId) {
  const { data, error } = await supabase.from("exams").select("problems").eq("id", examId).maybeSingle();
  if (error) throw error;
  return (Array.isArray(data?.problems) ? data.problems : []).map(normalizeExamProblem);
}
async function dbExamSave(exam, problems, isNew, createdBy) {
  const row = examRow(exam, problems);
  const query = isNew
    ? supabase.from("exams").insert({ id: exam.id, ...row, created_by: createdBy || null })
    : supabase.from("exams").update(row).eq("id", exam.id);
  const { error } = await query;
  if (error) throw error;
}
async function dbExamSetStatus(id, status) {
  const { error } = await supabase.from("exams").update({ status }).eq("id", id);
  if (error) throw error;
}
async function dbExamRemove(id) {
  const { error } = await supabase.from("exams").delete().eq("id", id);
  if (error) throw error;
}
function mapExamSubmission(row) {
  return {
    id: row.id, examId: row.exam_id, studentId: row.student_id, problemId: row.problem_id,
    verdict: row.verdict, score: Number(row.score) || 0,
    passedTests: row.passed_tests ?? null, totalTests: row.total_tests ?? null,
    problemTitle: row.problem_title, problemPoints: row.problem_points,
    sourceCode: row.source_code || "", createdAt: row.created_at || null, language: row.language || "",
  };
}
// Lấy bài nộp đề thi: không kèm code (nhẹ), trừ khi withCode (chỉ dùng cho bài của chính học sinh)
async function dbExamFetchSubmissions({ examId, studentId, withCode = false } = {}) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const columns = EXAM_SUB_LIGHT_COLUMNS + (examLanguageColumn ? ",language" : "") + (withCode ? ",source_code" : "");
    let q = supabase.from("exam_submissions").select(columns).order("created_at", { ascending: true }).range(from, from + 999);
    if (examId) q = q.eq("exam_id", examId);
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error && examLanguageColumn && isMissingColumnError(error, "language")) { examLanguageColumn = false; from -= 1000; continue; }
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows.map(mapExamSubmission);
}
async function dbExamSourceCode(submissionId) {
  const { data, error } = await supabase.from("exam_submissions").select("source_code").eq("id", submissionId).maybeSingle();
  if (error) throw error;
  return data?.source_code || "";
}
async function dbExamAddSubmission(sub) {
  const row = {
    id: sub.id, exam_id: sub.examId, student_id: sub.studentId, problem_id: sub.problemId, verdict: sub.verdict,
    score: sub.score, passed_tests: sub.passedTests, total_tests: sub.totalTests,
    problem_title: sub.problemTitle, problem_points: sub.problemPoints, source_code: sub.sourceCode || null,
  };
  if (examLanguageColumn && sub.language) row.language = sub.language;
  let { error } = await supabase.from("exam_submissions").insert(row);
  if (error && "language" in row && isMissingColumnError(error, "language")) {
    examLanguageColumn = false;
    delete row.language;
    ({ error } = await supabase.from("exam_submissions").insert(row));
  }
  if (error) throw error;
}
function mapExamAttempt(row) {
  return {
    id: row.id, examId: row.exam_id, studentId: row.student_id,
    startedAt: row.started_at, finishedAt: row.finished_at || null, extraMinutes: Number(row.extra_minutes) || 0,
    violations: Number(row.violations) || 0, pausedMs: Number(row.paused_ms) || 0, pausedAt: row.paused_at || null,
    pauseSupported: "violations" in row,
  };
}
async function dbExamFetchAttempts({ examId, studentId } = {}) {
  let q = supabase.from("exam_attempts").select("*");
  if (examId) q = q.eq("exam_id", examId);
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapExamAttempt);
}
async function dbExamStartAttempt(examId, studentId) {
  const id = `${examId}:${studentId}`;
  const { error } = await supabase.from("exam_attempts").upsert(
    { id, exam_id: examId, student_id: studentId }, { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw error;
  const { data, error: readError } = await supabase.from("exam_attempts").select("*").eq("id", id).maybeSingle();
  if (readError) throw readError;
  return data ? mapExamAttempt(data) : null;
}
async function dbExamUpdateAttempt(id, patch) {
  const row = {};
  if ("finishedAt" in patch) row.finished_at = patch.finishedAt;
  if ("extraMinutes" in patch) row.extra_minutes = patch.extraMinutes;
  if ("violations" in patch) row.violations = patch.violations;
  if ("pausedMs" in patch) row.paused_ms = Math.max(0, Math.round(patch.pausedMs));
  if ("pausedAt" in patch) row.paused_at = patch.pausedAt;
  const { error } = await supabase.from("exam_attempts").update(row).eq("id", id);
  if (error) throw error;
}
// Độ lệch giữa đồng hồ máy học sinh và máy chủ (ms): serverTime ≈ Date.now() + offset
async function dbServerClockOffset() {
  try {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc("server_now");
    if (error || !data) return 0;
    const t1 = Date.now();
    return new Date(data).getTime() - (t0 + t1) / 2;
  } catch (e) { return 0; }
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

async function judgeSourceCode(problem, code, languageOverride) {
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

  const language = languageOverride ? normalizeLanguage(languageOverride) : problemLanguage(problem);
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

function BrandLogoSvg() {
  return (
    <svg viewBox="615 385 615 615" role="img" aria-label="Logo Lợi" xmlns="http://www.w3.org/2000/svg">
      <path d="M665 437 V960 H1192" fill="none" stroke="#00D4FF" strokeWidth="60" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M815 698 L1003 453 L1192 698" fill="none" stroke="#10B981" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="1003" cy="453" r="39" fill="#00D4FF" />
    </svg>
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
              style={{ "--pct": (max ? (d.pts / max) * 100 : 0) + "%" }}
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
        <div className="nb-brand-mark nb-brand-logo" style={{ width: 52, height: 52, margin: "0 auto 14px" }}><BrandLogoSvg /></div>
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

/* ---------- Hiển thị đề bài: đoạn văn, tiêu đề, danh sách, bảng, mã, số mũ / chỉ số dưới ---------- */
function prettyMath(text) {
  return String(text).replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠");
}
function renderStatementInline(text, keyBase = "i") {
  const source = String(text ?? "");
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\^\{[^}\n]+\})|(\^-?(?:\d+|[A-Za-z]))|(_\{[^}\n]+\})|(_[A-Za-z0-9]{1,2}(?![A-Za-z0-9_]))/g;
  const out = [];
  let cursor = 0;
  let m;
  let n = 0;
  const pushText = (t) => { if (t) out.push(<React.Fragment key={`${keyBase}t${n++}`}>{prettyMath(t)}</React.Fragment>); };
  while ((m = pattern.exec(source))) {
    const token = m[0];
    const prev = m.index > 0 ? source[m.index - 1] : "";
    const isScript = token[0] === "^" || token[0] === "_";
    // ^ và _ chỉ là số mũ / chỉ số khi đứng ngay sau một ký tự (vd 10^9, a_i), không phải đầu từ
    if (isScript && (!prev || /\s/.test(prev))) continue;
    if (token[0] === "_" && !/[A-Za-z0-9)\]}]/.test(prev)) continue;
    pushText(source.slice(cursor, m.index));
    cursor = m.index + token.length;
    const key = `${keyBase}x${n++}`;
    if (token[0] === "`") out.push(<code key={key} className="nb-st-code">{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) out.push(<strong key={key}>{prettyMath(token.slice(2, -2))}</strong>);
    else if (token[0] === "^") out.push(<sup key={key} className="nb-st-sup">{prettyMath(token[1] === "{" ? token.slice(2, -1) : token.slice(1))}</sup>);
    else out.push(<sub key={key} className="nb-st-sub">{prettyMath(token[1] === "{" ? token.slice(2, -1) : token.slice(1))}</sub>);
  }
  pushText(source.slice(cursor));
  return out;
}

const STATEMENT_LABELS = /^(input|output|dữ liệu vào|dữ liệu ra|dữ liệu|kết quả|ràng buộc|giới hạn|ví dụ|giải thích|yêu cầu|subtask\s*\d*|lưu ý|gợi ý|ghi chú|bài toán|mô tả|định dạng)\s*:?\s*$/i;
const STATEMENT_INLINE_LABELS = /^(input|output|dữ liệu vào|dữ liệu ra|ràng buộc|giới hạn|yêu cầu|lưu ý|gợi ý|ghi chú)\s*:\s+(.+)$/i;

function parseStatementBlocks(statement) {
  const lines = String(statement || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const isBlank = (s) => !s.trim();
  const isBullet = (s) => /^\s*[-*•]\s+\S/.test(s);
  const isOrdered = (s) => /^\s*\d{1,3}[.)]\s+\S/.test(s);
  const isTableRow = (s) => /^\s*\|.*\|\s*$/.test(s);
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); i++; continue; }
    if (STATEMENT_LABELS.test(line.trim())) { blocks.push({ type: "label", text: line.trim().replace(/:\s*$/, "") }); i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const split = (s) => s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const head = split(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(split(lines[i++]));
      blocks.push({ type: "table", head, rows });
      continue;
    }
    if (isBullet(line) || isOrdered(line)) {
      const ordered = isOrdered(line);
      const items = [];
      while (i < lines.length && (ordered ? isOrdered(lines[i]) : isBullet(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\s*\d{1,3}[.)]\s+/ : /^\s*[-*•]\s+/, ""));
        i++;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^\s*```/.test(lines[i]) && !(buf.length && (isBullet(lines[i]) || isOrdered(lines[i]) || /^\s{0,3}#{1,3}\s/.test(lines[i]) || STATEMENT_LABELS.test(lines[i].trim())))) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    blocks.push({ type: "p", text: buf.join("\n") });
  }
  return blocks;
}

function ProblemStatement({ problem }) {
  const blocks = useMemo(() => parseStatementBlocks(problem.statement), [problem.statement]);
  return (
    <div className="nb-problem-statement nb-st">
      {problem.imageUrl && <img className="nb-problem-statement-image" src={problem.imageUrl} alt={`Hình minh họa cho ${problem.title}`} />}
      {blocks.map((b, k) => {
        const key = `b${k}`;
        if (b.type === "heading") {
          const Tag = b.level === 1 ? "h3" : b.level === 2 ? "h4" : "h5";
          return <Tag key={key} className={`nb-st-h nb-st-h${b.level}`}>{renderStatementInline(b.text, key)}</Tag>;
        }
        if (b.type === "label") return <div key={key} className="nb-st-label"><span>{b.text}</span></div>;
        if (b.type === "code") return <pre key={key} className="nb-st-pre">{b.text}</pre>;
        if (b.type === "ul") return <ul key={key} className="nb-st-list">{b.items.map((it, j) => <li key={j}>{renderStatementInline(it, `${key}-${j}`)}</li>)}</ul>;
        if (b.type === "ol") return <ol key={key} className="nb-st-list ordered">{b.items.map((it, j) => <li key={j}>{renderStatementInline(it, `${key}-${j}`)}</li>)}</ol>;
        if (b.type === "table") {
          return (
            <div key={key} className="nb-st-table-wrap"><table className="nb-st-table">
              <thead><tr>{b.head.map((c, j) => <th key={j}>{renderStatementInline(c, `${key}h${j}`)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, q) => <td key={q}>{renderStatementInline(c, `${key}r${j}c${q}`)}</td>)}</tr>)}</tbody>
            </table></div>
          );
        }
        const inline = b.text.match(STATEMENT_INLINE_LABELS);
        if (inline && !b.text.includes("\n")) {
          return <p key={key} className="nb-st-p nb-st-inline-label"><span className="nb-st-tag">{inline[1]}</span>{renderStatementInline(inline[2], key)}</p>;
        }
        return <p key={key} className="nb-st-p">{renderStatementInline(b.text, key)}</p>;
      })}
    </div>
  );
}

function StatementHelp({ statement, problem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nb-st-help">
      <div className="nb-st-help-row">
        <span>Mẹo trình bày: <code>10^9</code> → 10<sup>9</sup> · <code>2^{"{n+1}"}</code> · <code>a_i</code> → a<sub>i</sub> · <code>{"`code`"}</code> · <code>**đậm**</code> · <code>- gạch đầu dòng</code> · <code>1. đánh số</code> · <code>&lt;=</code> → ≤ · khối mã bằng <code>```</code></span>
        <button type="button" className="nb-btn nb-btn-ghost" onClick={() => setOpen((v) => !v)}><Eye size={14} /> {open ? "Ẩn xem trước" : "Xem trước đề"}</button>
      </div>
      {open && <div className="nb-st-preview"><ProblemStatement problem={{ ...problem, statement }} /></div>}
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
  const commentPattern = language === "python" ? "#.*" : "\\/\\/.*";
  const tokenPattern = new RegExp(
    `(${commentPattern}|\\"(?:\\\\.|[^\\"])*\\"|'(?:\\\\.|[^'])*'|\\b\\d+(?:\\.\\d+)?\\b|\\b[A-Za-z_][A-Za-z0-9_]*\\b|==|!=|<=|>=|&&|\\|\\||\\+\\+|--|\\+=|-=|\\*=|\\/=|%=|->|::|\\/\\/|[+\\-*/%=<>!&|^~])`,
    "g"
  );
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(line))) {
    if (match.index > cursor) parts.push({ value: line.slice(cursor, match.index), className: "" });
    const token = match[0];
    let className = "";
    if ((language === "python" && token.startsWith("#")) || (language !== "python" && token.startsWith("//"))) className = "nb-syntax-comment";
    else if (token.startsWith("\"") || token.startsWith("'")) className = "nb-syntax-string";
    else if (/^\d/.test(token)) className = "nb-syntax-number";
    else if (keywords.has(token)) className = "nb-syntax-keyword";
    else if (/^(print|input|len|range|int|float|str|sum|cout|cin|std)$/.test(token)) className = "nb-syntax-function";
    else if (/^(==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|->|::|\/\/|[+\-*/%=<>!&|^~])$/.test(token)) className = "nb-syntax-operator";
    parts.push({ value: token, className });
    cursor = match.index + token.length;
  }
  if (cursor < line.length) parts.push({ value: line.slice(cursor), className: "" });
  return parts.map((part, index) => part.className ? <span key={index} className={part.className}>{part.value}</span> : <React.Fragment key={index}>{part.value}</React.Fragment>);
}

function CodeEditor({ code, onChange, language, onSubmit, readOnly }) {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [activeLine, setActiveLine] = useState(0);
  const lines = String(code || "").split("\n");
  const textareaRef = useRef(null);
  const INDENT = "    ";
  const LINE_HEIGHT = 22;

  function syncActiveLine(event) {
    const target = event.currentTarget;
    const before = target.value.slice(0, target.selectionStart);
    setActiveLine(before.split("\n").length - 1);
  }

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
        <div className="nb-editor-gutter" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{lines.map((_, index) => <span key={index} className={index === activeLine ? "active" : ""}>{index + 1}</span>)}</div>
        <div className="nb-editor-code-layer">
          <div className="nb-editor-active-line" style={{ transform: `translateY(${activeLine * LINE_HEIGHT - scroll.top}px)` }} aria-hidden="true" />
          <pre className="nb-code-highlight" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }} aria-hidden="true"><code>{lines.map((line, index) => <React.Fragment key={index}>{highlightCodeLine(line, language)}{index < lines.length - 1 ? "\n" : ""}</React.Fragment>)}</code></pre>
          <textarea ref={textareaRef} className="nb-code-input" value={code} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onKeyUp={syncActiveLine} onClick={syncActiveLine} onSelect={syncActiveLine} onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })} spellCheck={false} readOnly={readOnly} aria-label="Trình soạn thảo mã nguồn" />
        </div>
      </div>
      <div className="nb-editor-status"><span>{readOnly ? "Chế độ chỉ xem" : "Enter sau : tự thụt 4 khoảng · Shift+Tab lùi dòng · Ctrl/Cmd + Enter nộp bài"}</span><span>{(LANGUAGE_META[language] || LANGUAGE_META.cpp).label}</span></div>
    </div>
  );
}

let examDialogQuietUntil = 0;
function examConfirm(message) {
  examDialogQuietUntil = Date.now() + 60000; // hộp thoại confirm làm cửa sổ mất focus: không tính là rời màn hình
  const ok = window.confirm(message);
  examDialogQuietUntil = Date.now() + 800;
  return ok;
}

function ProblemSolverModal({ problem, onClose, onVerdict, readOnly, disabledLabel, alreadySolved, bestScore = 0, attemptCount = 0, submissionHistory = [], chooseLanguage = false, defaultLanguage = "", onLanguageChange }) {
  // Trong đề thi: học sinh tự chọn ngôn ngữ trước khi gõ code (chooseLanguage). Luyện tập: theo cấu hình bài.
  const [chosenLanguage, setChosenLanguage] = useState(() => (chooseLanguage && LANGUAGE_META[defaultLanguage] ? defaultLanguage : ""));
  const needsLanguage = chooseLanguage && !chosenLanguage;
  const editorLanguage = chooseLanguage ? (chosenLanguage || "cpp") : problemLanguage(problem);
  const editorMeta = LANGUAGE_META[editorLanguage] || LANGUAGE_META.cpp;
  const [code, setCode] = useState(() => (chooseLanguage ? (LANGUAGE_META[defaultLanguage]?.starter || "") : editorMeta.starter));
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const orderedHistory = submissionHistory.filter((submission) => submission.problemId === problem.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const selectedHistory = orderedHistory.find((submission) => submission.id === selectedHistoryId) || orderedHistory[0] || null;

  function pickLanguage(lang) {
    if (lang === chosenLanguage) return;
    const untouched = !code.trim() || LANGUAGE_OPTIONS.some((o) => o.starter === code);
    if (chosenLanguage && !untouched && !examConfirm("Đổi ngôn ngữ sẽ thay code đang gõ bằng mẫu trống của ngôn ngữ mới. Em vẫn muốn đổi?")) return;
    setChosenLanguage(lang);
    setCode(LANGUAGE_META[lang].starter);
    setResult(null);
    onLanguageChange && onLanguageChange(lang);
  }

  async function handleSubmit() {
    if (readOnly || judging || needsLanguage) return;
    setJudging(true);
    setResult(null);
    try {
      const r = await judgeSourceCode(problem, code, chooseLanguage ? chosenLanguage : undefined);
      setResult(r);
      onVerdict && onVerdict(problem.id, r, code, chooseLanguage ? chosenLanguage : problemLanguage(problem));
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
            <div className="nb-eyebrow">{problem.id} · {needsLanguage ? "Chọn ngôn ngữ" : editorMeta.label} · {problem.points} điểm</div>
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
                {selectedHistory && <div className="nb-history-viewer"><div className="nb-history-viewer-head"><strong>Code của lần nộp</strong><button type="button" className="nb-btn nb-btn-ghost" onClick={async () => { try { const c = selectedHistory.sourceCode || await fetchSourceCode(selectedHistory.id); if (c) { if (chooseLanguage && LANGUAGE_META[selectedHistory.language]) setChosenLanguage(selectedHistory.language); setCode(c); setResult(null); setHistoryOpen(false); } } catch (e) { /* ignore */ } }}><Code2 size={14} /> Khôi phục vào editor</button></div><LazySourceCode submission={selectedHistory} emptyMessage="Lượt nộp này được tạo trước khi hệ thống lưu source code." /></div>}
              </div>}
            </div>}
          </div>

          <div className="nb-modal-col">
            {needsLanguage ? (
              <div className="nb-lang-picker" role="group" aria-label="Chọn ngôn ngữ lập trình">
                <div className="nb-eyebrow">Trước khi gõ code</div>
                <h4>Em muốn làm bài bằng ngôn ngữ nào?</h4>
                <p className="nb-sub">Chọn ngôn ngữ em quen nhất. Mỗi bài có thể chọn một ngôn ngữ khác nhau; bài nộp sẽ được chấm theo ngôn ngữ em chọn.</p>
                <div className="nb-lang-grid">
                  {LANGUAGE_OPTIONS.map((o) => (
                    <button type="button" key={o.value} className={`nb-lang-card lang-${o.value}`} onClick={() => pickLanguage(o.value)}>
                      <span className="nb-lang-mark">{o.value === "python" ? "Py" : o.value === "c" ? "C" : "C++"}</span>
                      <strong>{o.label}</strong>
                      <small>Tệp {o.extension}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {chooseLanguage && (
                  <div className="nb-lang-bar" role="radiogroup" aria-label="Ngôn ngữ">
                    <span>Ngôn ngữ</span>
                    {LANGUAGE_OPTIONS.map((o) => <button type="button" role="radio" aria-checked={o.value === chosenLanguage} key={o.value} className={o.value === chosenLanguage ? "active" : ""} onClick={() => pickLanguage(o.value)}>{o.label}</button>)}
                  </div>
                )}
                <CodeEditor code={code} onChange={setCode} language={editorLanguage} onSubmit={handleSubmit} readOnly={readOnly} />
              </>
            )}
            <p className="nb-sub" style={{ marginTop: 6 }}>
              Mã được biên dịch và chạy trong môi trường cô lập; kết quả được đối chiếu với test case của bài.
            </p>
            <div className="nb-modal-actions">
              <button className="nb-btn nb-btn-primary" onClick={handleSubmit} disabled={judging || readOnly || needsLanguage}>
                {judging ? <Loader2 size={16} className="nb-spin" /> : <Play size={16} />}
                {judging ? "Đang chấm…" : readOnly ? (disabledLabel || "Không thể nộp bài") : needsLanguage ? "Chọn ngôn ngữ để bắt đầu" : "Nộp bài & Chấm"}
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

function SisterSiteBanner() {
  if (!SISTER_SITE_URL) return null;
  return (
    <a className="nb-sister-link" href={SISTER_SITE_URL} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={14} />
      <span>{SISTER_SITE_LABEL || "Mở trang liên kết"}</span>
    </a>
  );
}

function localDayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDayLabel(key) {
  const [y, m, d] = key.split("-");
  return `${d}/${m}`;
}
function formatTimeOnly(value) {
  try { return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
  catch (e) { return ""; }
}

function DailyActivityPanel({ submissions, students }) {
  const todayKey = localDayKey(Date.now());
  const [range, setRange] = useState(14);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [openStudent, setOpenStudent] = useState(null);
  const [openSubId, setOpenSubId] = useState(null);
  const chartRef = useRef(null);
  useEffect(() => { const el = chartRef.current; if (el) el.scrollLeft = el.scrollWidth; }, [range]);

  const studentById = useMemo(() => new Map(students.map((st) => [st.id, st])), [students]);

  const byDay = useMemo(() => {
    const map = new Map();
    submissions.forEach((sub) => {
      const key = localDayKey(sub.createdAt);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(sub);
    });
    return map;
  }, [submissions]);

  const days = useMemo(() => {
    const list = [];
    for (let i = range - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      const subs = byDay.get(key) || [];
      list.push({ key, count: subs.length, active: new Set(subs.map((x) => x.studentId)).size });
    }
    return list;
  }, [byDay, range]);
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  const daySubs = byDay.get(selectedDay) || [];
  const perStudent = useMemo(() => {
    const map = new Map();
    daySubs.forEach((sub) => {
      if (!map.has(sub.studentId)) map.set(sub.studentId, []);
      map.get(sub.studentId).push(sub);
    });
    return Array.from(map.entries()).map(([studentId, subs]) => {
      const ordered = subs.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      return {
        studentId,
        student: studentById.get(studentId),
        subs: ordered,
        problems: new Set(ordered.map((x) => x.problemId)).size,
        solved: new Set(ordered.filter((x) => x.verdict === "AC").map((x) => x.problemId)).size,
      };
    }).sort((a, b) => b.subs.length - a.subs.length || String(a.student?.name || "").localeCompare(String(b.student?.name || ""), "vi"));
  }, [daySubs, studentById]);

  const activeCount = perStudent.length;
  const avgPerStudent = activeCount ? (daySubs.length / activeCount).toFixed(1) : "0";
  const inactiveCount = Math.max(0, students.length - activeCount);

  function pickDay(key) {
    setSelectedDay(key);
    setOpenStudent(null);
    setOpenSubId(null);
  }

  return (
    <section className="nb-panel nb-daily-panel">
      <div className="nb-home-section-head">
        <div><div className="nb-eyebrow">Thống kê theo ngày</div><h2>Số lượt làm bài mỗi ngày</h2></div>
        <div className="nb-filter-row" style={{ margin: 0 }}>
          {[7, 14, 30].map((n) => <button key={n} type="button" className={`nb-chip ${range === n ? "active" : ""}`} onClick={() => setRange(n)}>{n} ngày</button>)}
        </div>
      </div>

      <div className="nb-daily-chart" ref={chartRef} role="group" aria-label="Biểu đồ số lượt nộp theo ngày">
        {days.map((d) => (
          <button key={d.key} type="button" className={`nb-daily-col ${selectedDay === d.key ? "selected" : ""}`} onClick={() => pickDay(d.key)} title={`${formatDayLabel(d.key)}: ${d.count} lượt nộp, ${d.active} học sinh`}>
            <span className="nb-daily-count nb-mono">{d.count}</span>
            <span className="nb-daily-bar-track"><span className="nb-daily-bar" style={{ height: `${(d.count / maxCount) * 100}%` }} /></span>
            <span className="nb-daily-label">{formatDayLabel(d.key)}</span>
          </button>
        ))}
      </div>

      <div className="nb-daily-toolbar">
        <label className="nb-daily-date"><span>Xem ngày</span><input type="date" className="nb-input" value={selectedDay} max={todayKey} onChange={(e) => e.target.value && pickDay(e.target.value)} /></label>
        <div className="nb-daily-stats">
          <div><strong>{daySubs.length}</strong><span>Lượt nộp</span></div>
          <div><strong>{activeCount}/{students.length}</strong><span>Học sinh làm bài</span></div>
          <div><strong>{avgPerStudent}</strong><span>Lượt nộp / học sinh</span></div>
        </div>
      </div>

      {perStudent.length === 0 ? (
        <p className="nb-sub" style={{ padding: "6px 2px 2px" }}>Ngày {formatDayLabel(selectedDay)} chưa có học sinh nào nộp bài.</p>
      ) : (
        <div className="nb-daily-list">
          {perStudent.map((row) => {
            const isOpen = openStudent === row.studentId;
            return (
              <div className="nb-daily-student" key={row.studentId}>
                <button type="button" className="nb-daily-student-head" aria-expanded={isOpen} onClick={() => { setOpenStudent(isOpen ? null : row.studentId); setOpenSubId(null); }}>
                  <Avatar name={row.student?.name || row.studentId} size={30} />
                  <span className="nb-daily-student-info"><strong>{row.student?.name || row.studentId}</strong><small>{row.problems} bài khác nhau · {row.solved} bài đạt</small></span>
                  <span className="nb-daily-student-count nb-mono">{row.subs.length} lượt</span>
                  <ChevronRight size={16} className={`nb-review-item-chevron ${isOpen ? "open" : ""}`} />
                </button>
                {isOpen && (
                  <div className="nb-daily-subs">
                    {row.subs.map((sub) => {
                      const subOpen = openSubId === sub.id;
                      return (
                        <div className="nb-daily-sub" key={sub.id}>
                          <button type="button" className="nb-daily-sub-head" aria-expanded={subOpen} onClick={() => setOpenSubId(subOpen ? null : sub.id)}>
                            <span className="nb-daily-sub-time nb-mono">{formatTimeOnly(sub.createdAt)}</span>
                            <span className="nb-daily-sub-title">{sub.problemTitle || sub.problemId}</span>
                            <VerdictPill verdict={sub.verdict} />
                            <span className="nb-daily-sub-score nb-mono">{sub.score ?? 0}đ</span>
                            <Code2 size={14} className="nb-daily-sub-code-icon" />
                          </button>
                          {subOpen && <div className="nb-history-code-wrap"><LazySourceCode submission={sub} emptyMessage="Lượt nộp này không có lưu source code." /></div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {inactiveCount > 0 && perStudent.length > 0 && <p className="nb-sub nb-daily-foot">{inactiveCount} học sinh chưa nộp bài trong ngày này.</p>}
    </section>
  );
}

function OverviewView({ currentUser, students, submissions, points, solvedCount, contests, discussions, problemsCount, problems, onNavigate }) {
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
        <SisterSiteBanner />
        <div className="nb-home-hero student"><div><div className="nb-eyebrow">Bảng điều khiển cá nhân · Đội tuyển Tin học</div><h1>Chào {firstName}</h1><p>Tiếp tục nhịp học hôm nay và tiến gần hơn đến mục tiêu của em.</p></div><div className="nb-home-hero-rank"><Award size={21} /><span><strong>#{rank > 0 ? rank : "—"}</strong><small>thứ hạng hiện tại</small></span></div></div>
        <div className="nb-home-stat-grid"><div className="nb-home-stat"><span className="blue"><TrendingUp size={17} /></span><div><strong>{points(currentUser.id)}</strong><small>Tổng điểm</small></div></div><div className="nb-home-stat"><span className="gold"><Award size={17} /></span><div><strong>#{rank > 0 ? rank : "—"}</strong><small>Xếp hạng lớp</small></div></div><div className="nb-home-stat"><span className="green"><ListChecks size={17} /></span><div><strong>{solved}/{problemsCount}</strong><small>Bài đã giải</small></div></div><div className="nb-home-stat"><span className="red"><Flame size={17} /></span><div><strong>{currentUser.streak || 0}</strong><small>Ngày liên tục</small></div></div></div>

        <div className="nb-home-main-grid"><section className="nb-home-progress-card"><div className="nb-home-card-head"><div><div className="nb-eyebrow">Mục tiêu học tập</div><h2>Tiến độ luyện tập</h2></div><span className="nb-home-percent">{progress}%</span></div><p className="nb-sub">Em đã hoàn thành {solved} trên tổng số {problemsCount} bài tập trong ngân hàng.</p><div className="nb-home-progress"><span style={{ width: `${progress}%` }} /></div><div className="nb-home-progress-foot"><span>Tiếp tục duy trì nhịp học đều đặn</span><strong>{problemsCount - solved > 0 ? `${problemsCount - solved} bài còn lại` : "Đã hoàn thành tất cả"}</strong></div><div className="nb-home-actions"><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Luyện tập ngay</button><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("lessons")}><BookOpen size={15} /> Xem bài giảng</button></div></section><section className={`nb-home-contest-card ${activeContest ? "live" : ""}`}><div className="nb-home-card-head"><div><div className="nb-eyebrow">Đề thi thử</div><h2>{activeContest ? "Kỳ thi đang mở" : "Sẵn sàng cho thử thách?"}</h2></div><span className={activeContest ? "nb-home-live-dot" : "nb-home-clock-icon"}>{activeContest ? <span /> : <Clock size={19} />}</span></div>{activeContest ? <><h3>{activeContest.title}</h3><div className="nb-home-contest-meta"><span><Clock size={13} /> {activeContest.duration} phút</span><span><ListChecks size={13} /> {activeContest.problemCount} bài</span></div><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("contests")}><Play size={15} /> Vào thi thử</button></> : <><p className="nb-sub">Hiện chưa có đề đang mở. Em có thể xem lịch và chuẩn bị trước cho kỳ thi tiếp theo.</p><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("contests")}><Clock size={15} /> Xem lịch đề thi</button></>}</section></div>

        <div className="nb-home-lower-grid"><section className="nb-panel nb-home-activity"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Nhật ký học tập</div><h2>Hoạt động gần đây</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("problems")}>Xem tất cả <ChevronRight size={14} /></button></div>{recentActivity.length === 0 ? <div className="nb-home-empty"><Code2 size={22} /><strong>Chưa có hoạt động</strong><span>Bắt đầu giải bài đầu tiên để theo dõi tiến độ.</span></div> : <div className="nb-home-activity-list">{recentActivity.map((submission, index) => <div className="nb-home-activity-item" key={submission.id || index}><span className={`nb-home-activity-icon ${submission.verdict === "AC" ? "success" : "warning"}`}>{submission.verdict === "AC" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</span><div><strong>{submission.verdict === "AC" ? "Đã giải thành công" : "Đã nộp bài"}</strong><small>{submission.problemTitle || submission.problemId} · {submission.passedTests != null && submission.totalTests != null ? `${submission.passedTests}/${submission.totalTests} test` : submission.verdict}</small></div><span className="nb-home-activity-score">{submission.score ?? 0}đ</span></div>)}</div>}</section><section className="nb-panel nb-home-next"><div className="nb-eyebrow">Gợi ý tiếp theo</div><h2>{bestRecent ? "Duy trì đà tiến bộ" : "Bắt đầu hành trình"}</h2><p className="nb-sub">{bestRecent ? `Bài gần nhất em giải tốt là ${bestRecent.problemTitle || bestRecent.problemId}. Hãy thử một bài khó hơn.` : "Hãy chọn một bài giảng hoặc bài tập để bắt đầu xây dựng thành tích."}</p><div className="nb-home-next-links"><button onClick={() => onNavigate?.("problems")}><span><Code2 size={15} /> Bài tập đề xuất</span><ChevronRight size={15} /></button><button onClick={() => onNavigate?.("lessons")}><span><BookOpen size={15} /> Học lý thuyết</span><ChevronRight size={15} /></button><button onClick={() => onNavigate?.("leaderboard")}><span><Trophy size={15} /> Xem bảng xếp hạng</span><ChevronRight size={15} /></button></div></section></div>
      </div>
    );
  }

  const safeProblems = problems || [];
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);
  const avgPoints = students.length ? Math.round(students.reduce((sum, student) => sum + points(student.id), 0) / students.length) : 0;
  const topThree = [...students].sort((a, b) => (points(b.id) - points(a.id)) || (solvedCount(b.id) - solvedCount(a.id))).slice(0, 3);
  const openThreads = discussions.filter((discussion) => (discussion.replies || []).length === 0);
  const activeContest = contests.find((contest) => contest.status === "active");
  const weeklySubmissions = submissions.filter((submission) => {
    const timestamp = new Date(submission.createdAt || 0).getTime();
    return timestamp >= sevenDaysAgo;
  });
  const weeklyActiveStudents = new Set(weeklySubmissions.map((submission) => submission.studentId)).size;
  const totalSolved = students.reduce((sum, student) => sum + solvedCount(student.id), 0);
  const activityByStudent = new Map();
  const activityByProblem = new Map();
  submissions.forEach((submission) => {
    if (!activityByStudent.has(submission.studentId)) activityByStudent.set(submission.studentId, []);
    activityByStudent.get(submission.studentId).push(submission);
    if (!activityByProblem.has(submission.problemId)) activityByProblem.set(submission.problemId, []);
    activityByProblem.get(submission.problemId).push(submission);
  });
  const problemInsights = safeProblems.map((problem) => {
    const attempts = activityByProblem.get(problem.id) || [];
    const accepted = attempts.filter((submission) => submission.verdict === "AC").length;
    return {
      problem,
      attempts: attempts.length,
      accepted,
      successRate: attempts.length ? Math.round((accepted / attempts.length) * 100) : 0,
    };
  }).filter((item) => item.attempts > 0)
    .sort((a, b) => (a.successRate - b.successRate) || (b.attempts - a.attempts))
    .slice(0, 5);
  const studentSignals = students.map((student) => {
    const studentSubmissions = activityByStudent.get(student.id) || [];
    const recentSubmissions = studentSubmissions.filter((submission) => new Date(submission.createdAt || 0).getTime() >= fourteenDaysAgo);
    const lastSubmission = studentSubmissions.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    const label = recentSubmissions.length === 0 ? "14 ngày chưa hoạt động" : `${solvedCount(student.id)} bài đã giải`;
    return { student, attempts: studentSubmissions.length, recentAttempts: recentSubmissions.length, lastSubmission, label };
  }).sort((a, b) => (a.recentAttempts - b.recentAttempts) || (solvedCount(a.student.id) - solvedCount(b.student.id)) || (a.attempts - b.attempts))
    .slice(0, 5);
  const studentNameById = new Map(students.map((s) => [s.id, s.name]));
  const recentClassActivity = submissions.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 10);

  return (
    <div className="nb-home-page">
      <SisterSiteBanner />
      <div className="nb-home-hero teacher">
        <div>
          <div className="nb-eyebrow">Bảng điều khiển giáo viên · Đội tuyển Tin học</div>
          <h1>Tổng quan đội tuyển</h1>
          <p>Theo dõi nhịp học, phát hiện điểm nghẽn và xử lý việc cần làm trong một màn hình.</p>
        </div>
        <div className="nb-home-hero-tools">
          <button className="nb-home-hero-action" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Quản lý bài</button>
          <button className="nb-home-hero-action" onClick={() => onNavigate?.("contests")}><Clock size={15} /> Tạo đề thi</button>
        </div>
      </div>

      <div className="nb-home-stat-grid">
        <div className="nb-home-stat"><span className="blue"><Users size={17} /></span><div><strong>{students.length}</strong><small>Học sinh</small><em>{weeklyActiveStudents} hoạt động 7 ngày</em></div></div>
        <div className="nb-home-stat"><span className="green"><TrendingUp size={17} /></span><div><strong>{weeklySubmissions.length}</strong><small>Lượt nộp tuần này</small><em>{weeklyActiveStudents} học sinh tham gia</em></div></div>
        <div className="nb-home-stat"><span className="gold"><Award size={17} /></span><div><strong>{avgPoints}</strong><small>Điểm trung bình</small><em>{totalSolved} lượt giải đúng</em></div></div>
        <div className="nb-home-stat"><span className="red"><MessageSquare size={17} /></span><div><strong>{openThreads.length}</strong><small>Câu hỏi chờ trả lời</small><em>{problemInsights.length} bài cần xem</em></div></div>
      </div>

      <div className="nb-home-main-grid">
        <section className="nb-home-class-card">
          <div className="nb-home-card-head"><div><div className="nb-eyebrow">Theo dõi 7 ngày</div><h2>Nhịp luyện tập của lớp</h2></div><span className="nb-home-percent">{students.length ? Math.round((weeklyActiveStudents / students.length) * 100) : 0}%</span></div>
          <p className="nb-sub">{weeklyActiveStudents}/{students.length} học sinh đã có hoạt động trong 7 ngày qua.</p>
          <div className="nb-home-progress"><span style={{ width: `${students.length ? (weeklyActiveStudents / students.length) * 100 : 0}%` }} /></div>
          <div className="nb-home-progress-foot"><span>{weeklySubmissions.length} lượt nộp trong tuần</span><strong>{students.length - weeklyActiveStudents} học sinh chưa hoạt động</strong></div>
          <div className="nb-home-actions"><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Xem bài tập</button><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("leaderboard")}><Trophy size={15} /> Xem bảng xếp hạng</button></div>
        </section>
        <section className={`nb-home-contest-card ${activeContest ? "live" : ""}`}>
          <div className="nb-home-card-head"><div><div className="nb-eyebrow">Trạng thái kỳ thi</div><h2>{activeContest ? "Đang có đề mở" : "Chưa có đề đang mở"}</h2></div><Clock size={19} /></div>
          {activeContest ? <><h3>{activeContest.title}</h3><div className="nb-home-contest-meta"><span><Clock size={13} /> {activeContest.duration} phút</span><span><ListChecks size={13} /> {activeContest.problemCount} bài</span></div><button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("contests")}><Eye size={15} /> Quản lý kỳ thi</button></> : <><p className="nb-sub">Tạo hoặc mở một kỳ thi để học sinh bắt đầu thử sức.</p><button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("contests")}><Plus size={15} /> Mở khu vực đề thi</button></>}
        </section>
      </div>

      <DailyActivityPanel submissions={submissions} students={students} />

      <div className="nb-home-insight-grid">
        <section className="nb-panel nb-home-insight-card">
          <div className="nb-home-section-head"><div><div className="nb-eyebrow">Phân tích bài tập</div><h2>Bài có tỷ lệ đúng thấp</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("problems")}>Mở kho bài <ChevronRight size={14} /></button></div>
          {problemInsights.length === 0 ? <div className="nb-home-empty"><Code2 size={22} /><strong>Chưa đủ dữ liệu</strong><span>Cần có lượt nộp bài để bắt đầu phân tích.</span></div> : <div className="nb-home-insight-list">{problemInsights.map((item) => <div className="nb-home-insight-row" key={item.problem.id}><span className={`nb-home-insight-icon ${item.successRate < 50 ? "warning" : "steady"}`}>{item.successRate < 50 ? <AlertCircle size={15} /> : <TrendingUp size={15} />}</span><div><strong>{item.problem.title}</strong><small>{item.accepted}/{item.attempts} lượt AC · {item.attempts} lượt nộp</small><div className="nb-home-insight-track"><span style={{ width: `${item.successRate}%` }} /></div></div><b>{item.successRate}%</b></div>)}</div>}
        </section>
        <section className="nb-panel nb-home-insight-card">
          <div className="nb-home-section-head"><div><div className="nb-eyebrow">Theo dõi cá nhân</div><h2>Học sinh cần hỗ trợ</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("leaderboard")}>Xem lớp <ChevronRight size={14} /></button></div>
          {studentSignals.length === 0 ? <div className="nb-home-empty"><Users size={22} /><strong>Chưa có học sinh</strong><span>Dữ liệu sẽ xuất hiện khi lớp được thêm vào.</span></div> : <div className="nb-home-signal-list">{studentSignals.map((signal) => <div className="nb-home-signal-row" key={signal.student.id}><Avatar name={signal.student.name} size={30} /><div><strong>{signal.student.name}</strong><small>{signal.label}</small></div><span className={signal.recentAttempts === 0 ? "risk" : "watch"}>{signal.recentAttempts === 0 ? "Cần nhắc" : "Theo dõi"}</span></div>)}</div>}
        </section>
      </div>

      <div className="nb-home-lower-grid">
        <section className="nb-panel nb-home-activity"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Thành tích lớp</div><h2>Học sinh nổi bật</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("leaderboard")}>Xem bảng đầy đủ <ChevronRight size={14} /></button></div>{topThree.length === 0 ? <div className="nb-home-empty"><Users size={22} /><strong>Chưa có dữ liệu</strong><span>Thành tích sẽ xuất hiện khi học sinh bắt đầu nộp bài.</span></div> : <div className="nb-home-student-list">{topThree.map((student, index) => <div className="nb-home-student-row" key={student.id}><span className={`nb-home-rank rank-${index + 1}`}>{index + 1}</span><Avatar name={student.name} size={32} /><div><strong>{student.name}</strong><small>{solvedCount(student.id)} bài đã giải · {points(student.id)} điểm</small></div><b>{points(student.id)}<small>đ</small></b></div>)}</div>}</section>
        <section className="nb-panel nb-home-questions"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Hộp việc cần làm</div><h2>Câu hỏi chờ trả lời</h2></div><button className="nb-link-button" onClick={() => onNavigate?.("discussion")}>Mở thảo luận <ChevronRight size={14} /></button></div>{openThreads.length === 0 ? <div className="nb-home-empty"><CheckCircle2 size={22} /><strong>Đã xử lý hết</strong><span>Hiện không có câu hỏi nào đang chờ giáo viên.</span></div> : <div className="nb-home-question-list">{openThreads.slice(0, 4).map((discussion) => <button className="nb-home-question-row" key={discussion.id} onClick={() => onNavigate?.("discussion")}><span className="nb-home-question-icon"><MessageSquare size={14} /></span><span><strong>{discussion.author}</strong><small>{String(discussion.content || "").slice(0, 72)}{String(discussion.content || "").length > 72 ? "…" : ""}</small></span><ChevronRight size={15} /></button>)}</div>}</section>
      </div>

      <section className="nb-panel nb-home-class-activity"><div className="nb-home-section-head"><div><div className="nb-eyebrow">Theo thời gian thực</div><h2>Hoạt động gần đây của lớp</h2></div><span className="nb-pill nb-pill-ac">{recentClassActivity.length} cập nhật</span></div>{recentClassActivity.length === 0 ? <p className="nb-sub">Chưa có lượt nộp bài gần đây.</p> : <div className="nb-home-class-feed">{recentClassActivity.map((submission, index) => <div key={submission.id || index}><span className={`nb-home-activity-icon ${submission.verdict === "AC" ? "success" : "warning"}`}>{submission.verdict === "AC" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</span><span><strong>{studentNameById.get(submission.studentId) || submission.studentId}</strong> đã nộp <b>{submission.problemTitle || submission.problemId}</b><small>{submission.verdict} · {submission.score ?? 0} điểm · {formatSubmissionDate(submission.createdAt)}</small></span></div>)}</div>}</section>
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
  const lessonEditorRef = useRef(null);
  const lessonReaderRef = useRef(null);
  const safeProgress = progress || {};

  useEffect(() => {
    if (!topics.some((topic) => topic.id === selectedId)) setSelectedId(topics[0]?.id || null);
  }, [topics, selectedId]);

  useEffect(() => {
    if (!isTeacher || !showForm) return undefined;
    const frame = window.requestAnimationFrame(() => {
      lessonEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTeacher, showForm, editingId]);

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

  function handleSelectTopic(topicId) {
    setSelectedId(topicId);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          lessonReaderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
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
      <SectionHeading eyebrow="Không gian học tập" title="Bài giảng & tài liệu" />
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
      <div className="nb-lesson-mobile-hint"><Eye size={14} /> <span>Trên điện thoại, sau khi chọn chuyên đề, nội dung sẽ tự động cuộn lên vùng đọc.</span></div>
      {isTeacher && showForm && <form ref={lessonEditorRef} onSubmit={submit} className="nb-panel nb-form nb-lesson-editor" style={{ marginBottom: 18, scrollMarginTop: 24 }}><div className="nb-editor-head"><div><div className="nb-eyebrow">{editingId ? "Chỉnh sửa" : "Tạo mới"}</div><h3 className="nb-h3">{editingId ? "Cập nhật bài giảng" : "Thêm bài giảng"}</h3></div><button type="button" className="nb-icon-btn" onClick={() => { resetForm(); setShowForm(false); }} aria-label="Đóng"><X size={18} /></button></div><div className="nb-lesson-form-grid"><input className="nb-input" placeholder="Mã chuyên đề" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><input className="nb-input" placeholder="Tên bài giảng" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input className="nb-input" placeholder="Lịch học" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} /></div><input className="nb-input" placeholder="Mô tả ngắn / mục tiêu bài học" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /><textarea className="nb-input" rows={10} placeholder="Nội dung bài giảng" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />{formError && <div className="nb-login-error"><AlertCircle size={14} /> {formError}</div>}<div className="nb-editor-actions"><button className="nb-btn nb-btn-primary" type="submit"><Save size={15} /> {editingId ? "Lưu thay đổi" : "Tạo bài giảng"}</button><button className="nb-btn nb-btn-ghost" type="button" onClick={() => { resetForm(); setShowForm(false); }}>Hủy</button></div></form>}
      <div className="nb-lesson-layout">
        <aside className="nb-lesson-catalog"><div className="nb-lesson-catalog-head"><div><div className="nb-eyebrow">Lộ trình</div><h3 className="nb-h3">Danh mục bài học</h3></div><span className="nb-sub">{filteredTopics.length}/{topics.length}</span></div><div className="nb-lesson-catalog-list">{filteredTopics.map((topic, index) => <div key={topic.id} className={"nb-lesson-catalog-item " + (selectedTopic?.id === topic.id ? "active" : "")}><button className="nb-lesson-catalog-main" onClick={() => handleSelectTopic(topic.id)}><span className="nb-lesson-index">{String(index + 1).padStart(2, "0")}</span><span className="nb-lesson-catalog-text"><strong>{topic.title}</strong><small>{topic.code} · {topic.weeks}</small></span>{safeProgress[topic.id]?.isCompleted && <CheckCircle2 size={15} style={{ color: "var(--ac-green)" }} />}</button>{isTeacher && <div className="nb-lesson-item-actions"><button className="nb-icon-btn" onClick={() => beginEdit(topic)} title="Sửa bài giảng" aria-label="Sửa bài giảng"><Pencil size={14} /></button><button className="nb-icon-btn" onClick={() => handleDelete(topic)} title="Xóa bài giảng" aria-label="Xóa bài giảng"><Trash2 size={14} /></button></div>}</div>)}{filteredTopics.length === 0 && <p className="nb-sub" style={{ padding: 14 }}>Không tìm thấy bài giảng phù hợp.</p>}</div></aside>
        <article ref={lessonReaderRef} className="nb-lesson-reader">{selectedTopic ? <><div className="nb-lesson-reader-top"><span className="nb-eyebrow">{selectedTopic.code} · {selectedTopic.weeks}</span><div className="nb-lesson-status-badges">{safeProgress[selectedTopic.id]?.isRead && <span className="nb-pill nb-pill-pending">Đã đọc</span>}{safeProgress[selectedTopic.id]?.isCompleted && <span className="nb-pill nb-pill-ac">Đã hoàn thành</span>}</div></div><h1 className="nb-lesson-reader-title">{selectedTopic.title}</h1><div className="nb-lesson-callout"><BookOpen size={17} /><p>{selectedTopic.summary}</p></div><div className="nb-lesson-content">{String(selectedTopic.content || "").split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{!isTeacher && <div className="nb-lesson-progress-actions"><button className={"nb-btn " + (safeProgress[selectedTopic.id]?.isRead ? "nb-btn-ghost" : "nb-btn-primary")} onClick={() => markRead(selectedTopic.id)}>{safeProgress[selectedTopic.id]?.isRead ? <><RefreshCw size={15} /> Bỏ đánh dấu đã đọc</> : <><Eye size={15} /> Đánh dấu đã đọc</>}</button><button className={"nb-btn " + (safeProgress[selectedTopic.id]?.isCompleted ? "nb-btn-ghost" : "nb-btn-primary")} onClick={() => markCompleted(selectedTopic.id)}>{safeProgress[selectedTopic.id]?.isCompleted ? <><RefreshCw size={15} /> Bỏ hoàn thành</> : <><CheckCircle2 size={15} /> Đánh dấu hoàn thành</>}</button></div>}<LessonDiscussion topic={selectedTopic} discussions={discussions} currentUser={currentUser} addThread={addThread} addReply={addReply} /></> : <div className="nb-lesson-empty"><BookOpen size={30} /><h3 className="nb-h3">Chưa có bài giảng</h3><p className="nb-sub">Hãy chọn một bài trong danh mục hoặc tạo bài giảng mới.</p></div>}</article>
      </div>
    </div>
  );
}

function ProblemsView({ isTeacher, currentUser, problems, submissions, points, addProblem, updateProblem, removeProblem, solvedByCurrent, onVerdict, topics, students }) {
  const [languageFilter, setLanguageFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);
  const [reviewProblem, setReviewProblem] = useState(null);
  const [collapsedMonths, setCollapsedMonths] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const imageObjectUrlRef = useRef(null);
  const problemEditorRef = useRef(null);
  const [form, setForm] = useState(() => createProblemForm(topics[0]?.id));

  useEffect(() => {
    if (!isTeacher || !showForm) return undefined;
    const frame = window.requestAnimationFrame(() => {
      problemEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTeacher, showForm, editingId]);

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

  const practiceGroups = useMemo(() => {
    const groups = topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      subtitle: `${topic.code || "Chuyên đề"}${topic.weeks ? ` · ${topic.weeks}` : ""}`,
      problems: filtered.filter((problem) => problem.topic === topic.id),
    })).filter((group) => group.problems.length > 0);
    const uncategorized = filtered.filter((problem) => !topicById.has(problem.topic));
    if (uncategorized.length > 0) groups.push({ id: "uncategorized", title: "Chưa phân chuyên đề", subtitle: "Cần giáo viên sắp xếp", problems: uncategorized });
    return groups;
  }, [topics, filtered, topicById]);

  const practiceMonthGroups = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" });
    const monthMap = new Map();

    practiceGroups.forEach((group) => {
      group.problems.forEach((problem) => {
        const parsedDate = problem.createdAt ? new Date(problem.createdAt) : null;
        const hasValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
        const monthKey = hasValidDate
          ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`
          : "undated";
        const monthLabel = hasValidDate ? monthFormatter.format(parsedDate) : "Chưa xác định tháng";
        let month = monthMap.get(monthKey);

        if (!month) {
          month = { key: monthKey, label: monthLabel, sortValue: hasValidDate ? parsedDate.getTime() : -Infinity, groups: [] };
          monthMap.set(monthKey, month);
        }

        let monthTopicGroup = month.groups.find((item) => item.id === group.id);
        if (!monthTopicGroup) {
          monthTopicGroup = { ...group, problems: [] };
          month.groups.push(monthTopicGroup);
        }
        monthTopicGroup.problems.push(problem);
      });
    });

    return Array.from(monthMap.values())
      .map((month) => ({
        ...month,
        problems: month.groups.reduce((total, group) => total + group.problems.length, 0),
        attempts: month.groups.reduce((total, group) => total + group.problems.reduce((sum, problem) => sum + (isTeacher ? teacherProblemStats(problem.id).attempts : problemStats(problem.id).attempts), 0), 0),
      }))
      .sort((a, b) => b.sortValue - a.sortValue);
  }, [practiceGroups, isTeacher, submissions, currentSubmissions, solvedByCurrent]);

  function toggleGroup(groupKey) {
    setCollapsedGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  }
  function setAllCollapsed(collapsed) {
    const groups = {};
    const months = {};
    practiceMonthGroups.forEach((month) => {
      months[month.key] = false;
      month.groups.forEach((group) => { groups[`${month.key}-${group.id}`] = collapsed; });
    });
    setCollapsedMonths(months);
    setCollapsedGroups(groups);
  }
  function toggleMonth(monthKey) {
    setCollapsedMonths((current) => ({ ...current, [monthKey]: !current[monthKey] }));
  }

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
        {isTeacher && <div className="nb-practice-problem-actions"><button type="button" className="nb-practice-manage-action" onClick={(event) => { event.stopPropagation(); setReviewProblem(problem); }}><Eye size={14} /> Bài nộp</button><button type="button" className="nb-practice-manage-action edit" onClick={(event) => { event.stopPropagation(); beginEdit(problem); }}><Pencil size={14} /> Sửa</button><button type="button" className="nb-practice-manage-action delete" onClick={(event) => { event.stopPropagation(); handleDelete(problem); }}><Trash2 size={14} /> Xóa</button></div>}
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
      const originalProblem = editingId ? problems.find((item) => item.id === editingId) : null;
      const problem = {
        id: editingId || ("PX" + Date.now()),
        createdAt: originalProblem?.createdAt || new Date().toISOString(),
        title: form.title.trim(),
        topic: form.topic || topics[0]?.id || "",
        difficulty: form.difficulty,
        points: pointsValue,
        language: normalizeLanguage(form.language, form.isPython),
        isPython: normalizeLanguage(form.language, form.isPython) === "python",
        statement: form.statement.trim(),
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
        sub="  " />

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
        <form ref={problemEditorRef} onSubmit={submit} className="nb-form nb-panel nb-problem-editor" style={{ marginBottom: 16, scrollMarginTop: 24 }}>
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
          <StatementHelp statement={form.statement} problem={{ title: form.title, imageUrl: "" }} />
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
        <div className="nb-practice-roadmap-head"><div><div className="nb-eyebrow">Lộ trình hiện tại</div><h3 className="nb-h3">Bài tập theo tháng & chuyên đề</h3><p className="nb-sub" style={{ marginTop: 4 }}>Bấm vào từng tháng hoặc từng chuyên đề để ẩn hoặc hiện danh sách bài tập.</p></div><div className="nb-practice-roadmap-tools"><span className="nb-sub">{filtered.length}/{problems.length} bài đang hiển thị</span><div><button type="button" className="nb-btn nb-btn-ghost" onClick={() => setAllCollapsed(true)}>Thu gọn tất cả chuyên đề</button><button type="button" className="nb-btn nb-btn-ghost" onClick={() => setAllCollapsed(false)}>Mở tất cả</button></div></div></div>
        {practiceMonthGroups.map((month, monthIndex) => {
          const isCollapsed = Boolean(collapsedMonths[month.key]);
          return <section className="nb-practice-month-group" key={month.key}>
            <button
              type="button"
              className="nb-practice-month-head"
              aria-expanded={!isCollapsed}
              aria-controls={`nb-practice-month-${month.key}`}
              onClick={() => toggleMonth(month.key)}
            >
              <span className="nb-practice-month-marker">{String(monthIndex + 1).padStart(2, "0")}</span>
              <span className="nb-practice-month-title"><span>Kho bài theo thời gian</span><strong>{month.label}</strong></span>
              <span className="nb-practice-month-summary">{month.problems} bài{isTeacher ? ` · ${month.attempts} lượt nộp` : ""}</span>
              <ChevronRight size={17} className="nb-practice-month-chevron" />
            </button>
            {!isCollapsed && <div className="nb-practice-month-content" id={`nb-practice-month-${month.key}`}>
              {month.groups.map((group, groupIndex) => {
                const groupSolved = group.problems.filter((problem) => solvedByCurrent(problem.id)).length;
                const groupAttempts = group.problems.reduce((total, problem) => total + (isTeacher ? teacherProblemStats(problem.id).attempts : problemStats(problem.id).attempts), 0);
                const groupKey = `${month.key}-${group.id}`;
                const groupCollapsed = Boolean(collapsedGroups[groupKey]);
                return <section className="nb-practice-group" key={groupKey}>
                  <div className="nb-practice-group-rail"><span>{String(groupIndex + 1).padStart(2, "0")}</span><i /></div>
                  <div className="nb-practice-group-content">
                    <button type="button" className="nb-practice-group-head nb-practice-group-toggle" aria-expanded={!groupCollapsed} onClick={() => toggleGroup(groupKey)}><div><p>{group.subtitle}</p><h3>{group.title}</h3></div><div className="nb-practice-group-summary">{isTeacher ? <span>{group.problems.length} bài · {groupAttempts} lượt nộp</span> : <><span>{groupSolved}/{group.problems.length} đã xong</span><div><i style={{ width: `${group.problems.length ? Math.round(groupSolved / group.problems.length * 100) : 0}%` }} /></div></>}</div><ChevronRight size={16} className={`nb-practice-group-chevron ${groupCollapsed ? "" : "open"}`} /></button>
                    {!groupCollapsed && <div className="nb-practice-problem-list">{group.problems.map(renderPracticeProblem)}</div>}
                    {isTeacher && !groupCollapsed && <div className="nb-practice-group-actions"><button className="nb-btn nb-btn-ghost" type="button" onClick={() => beginAdd(group.id === "uncategorized" ? undefined : group.id)}><Plus size={14} /> Thêm bài vào chuyên đề</button></div>}
                  </div>
                </section>;
              })}
            </div>}
          </section>;
        })}
        {practiceMonthGroups.length === 0 && <div className="nb-practice-empty"><Search size={20} /><strong>Không tìm thấy bài tập phù hợp</strong><span>Hãy đổi bộ lọc, từ khóa tìm kiếm hoặc thêm bài mới.</span></div>}
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

      {reviewProblem && (
        <SubmissionReviewModal
          problem={reviewProblem}
          submissions={submissions.filter((s) => s.problemId === reviewProblem.id)}
          students={students}
          onClose={() => setReviewProblem(null)}
        />
      )}
    </div>
  );
}

function LazySourceCode({ submission, emptyMessage }) {
  const [code, setCode] = useState(submission.sourceCode || "");
  const [state, setState] = useState(submission.sourceCode ? "ready" : "loading");
  useEffect(() => {
    if (submission.sourceCode) { setCode(submission.sourceCode); setState("ready"); return undefined; }
    let cancelled = false;
    setState("loading");
    fetchSourceCode(submission.id)
      .then((c) => { if (!cancelled) { setCode(c); setState("ready"); } })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [submission.id, submission.sourceCode]);
  if (state === "loading") return <p className="nb-sub" style={{ padding: "0 14px 14px" }}>Đang tải code…</p>;
  if (state === "error") return <p className="nb-sub" style={{ padding: "0 14px 14px" }}>Không tải được code, thử lại sau.</p>;
  return code ? <pre className="nb-history-code">{code}</pre> : <p className="nb-sub" style={{ padding: "0 14px 14px" }}>{emptyMessage}</p>;
}

function SubmissionReviewModal({ problem, submissions, students, onClose }) {
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [openId, setOpenId] = useState(null);

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const sorted = useMemo(() => {
    return [...submissions]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .filter((s) => verdictFilter === "all" || s.verdict === verdictFilter)
      .filter((s) => {
        if (!query.trim()) return true;
        const student = studentById.get(s.studentId);
        const text = `${student?.name || ""} ${student?.username || ""} ${s.studentId}`.toLocaleLowerCase("vi-VN");
        return text.includes(query.trim().toLocaleLowerCase("vi-VN"));
      });
  }, [submissions, verdictFilter, query, studentById]);

  const verdictOptions = useMemo(() => {
    const set = new Set(submissions.map((s) => s.verdict));
    return ["all", ...Array.from(set)];
  }, [submissions]);

  return (
    <div className="nb-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Bài nộp — ${problem.title}`}>
      <div className="nb-modal nb-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div>
            <div className="nb-eyebrow">Kiểm tra bài nộp</div>
            <h3 className="nb-h3">{problem.title}</h3>
            <p className="nb-sub">{submissions.length} lượt nộp · {new Set(submissions.map((s) => s.studentId)).size} học sinh đã nộp</p>
          </div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="nb-review-toolbar">
          <label className="nb-practice-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc tài khoản học sinh…" /></label>
          <div className="nb-filter-row" style={{ margin: 0 }}>
            {verdictOptions.map((v) => <button key={v} className={`nb-chip ${verdictFilter === v ? "active" : ""}`} onClick={() => setVerdictFilter(v)}>{v === "all" ? "Tất cả" : v}</button>)}
          </div>
        </div>

        <div className="nb-review-list">
          {sorted.length === 0 && <p className="nb-sub" style={{ padding: 14 }}>Không có lượt nộp nào phù hợp.</p>}
          {sorted.map((submission) => {
            const student = studentById.get(submission.studentId);
            const isOpen = openId === submission.id;
            return (
              <div className="nb-review-item" key={submission.id}>
                <button type="button" className="nb-review-item-head" onClick={() => setOpenId(isOpen ? null : submission.id)}>
                  <Avatar name={student?.name || submission.studentId} size={30} />
                  <div className="nb-review-item-info">
                    <strong>{student?.name || submission.studentId}</strong>
                    <small>{student?.username ? `@${student.username} · ` : ""}{formatSubmissionDate(submission.createdAt)}</small>
                  </div>
                  <VerdictPill verdict={submission.verdict} />
                  <span className="nb-review-item-score">{submission.score ?? 0}đ</span>
                  <ChevronRight size={16} className={`nb-review-item-chevron ${isOpen ? "open" : ""}`} />
                </button>
                {isOpen && (
                  <div className="nb-history-code-wrap">
                    <LazySourceCode submission={submission} emptyMessage="Lượt nộp này không có lưu source code (nộp trước khi tính năng lưu code được bật)." />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="nb-modal-actions"><button className="nb-btn nb-btn-ghost" onClick={onClose}>Đóng</button></div>
      </div>
    </div>
  );
}

function assignmentStatus(submissions, studentId, problemId) {
  const subs = submissions.filter((s) => s.studentId === studentId && s.problemId === problemId);
  if (subs.some((s) => s.verdict === "AC")) return "done";
  if (subs.length > 0) return "attempted";
  return "todo";
}

const ASSIGNMENT_STATUS_META = {
  todo: { label: "Chưa làm", cls: "nb-pill-pending" },
  attempted: { label: "Đã nộp, chưa đạt", cls: "nb-pill-wa" },
  done: { label: "Đã hoàn thành", cls: "nb-pill-ac" },
};

function AssignedView({ isTeacher, currentUser, problems, students, assignments, submissions, addAssignments, removeAssignment, solvedByCurrent, onVerdict, topics }) {
  const [active, setActive] = useState(null);
  const problemById = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  if (!isTeacher) {
    const myAssignments = assignments
      .filter((a) => a.studentId === currentUser.id)
      .map((a) => ({ ...a, problem: problemById.get(a.problemId), status: assignmentStatus(submissions, currentUser.id, a.problemId) }))
      .filter((a) => a.problem)
      .sort((a, b) => (a.status === "done") - (b.status === "done") || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const todoCount = myAssignments.filter((a) => a.status !== "done").length;
    const mySubmissions = submissions.filter((s) => s.studentId === currentUser.id);

    function problemStatsFor(problemId) {
      const attempts = mySubmissions.filter((s) => s.problemId === problemId);
      return { attempts: attempts.length, bestScore: attempts.reduce((best, s) => Math.max(best, Number(s.score ?? (s.verdict === "AC" ? s.problemPoints : 0))), 0) };
    }

    return (
      <div>
        <SectionHeading eyebrow="Nhiệm vụ cá nhân" title="Bài được giao" sub={myAssignments.length === 0 ? "Giáo viên chưa giao riêng bài nào cho em." : `Còn ${todoCount} bài chưa hoàn thành trên tổng số ${myAssignments.length} bài được giao.`} />
        {myAssignments.length === 0 ? (
          <div className="nb-practice-empty"><ListChecks size={20} /><strong>Chưa có bài được giao riêng</strong><span>Em vẫn có thể luyện tập tự do ở mục Luyện tập &amp; Python.</span></div>
        ) : (
          <div className="nb-assigned-list">
            {myAssignments.map((a) => {
              const meta = ASSIGNMENT_STATUS_META[a.status];
              const language = LANGUAGE_META[problemLanguage(a.problem)] || LANGUAGE_META.cpp;
              return (
                <button type="button" key={a.id} className="nb-assigned-row" onClick={() => setActive(a.problem)}>
                  <div className="nb-assigned-row-main">
                    <strong>{a.problem.title}</strong>
                    <small>{language.label} · {a.problem.points} điểm{a.assignedBy ? ` · Giao bởi ${a.assignedBy}` : ""}</small>
                  </div>
                  <span className={`nb-pill ${meta.cls}`}>{meta.label}</span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        )}
        {active && (
          <ProblemSolverModal
            problem={active}
            onClose={() => setActive(null)}
            alreadySolved={solvedByCurrent(active.id)}
            bestScore={problemStatsFor(active.id).bestScore}
            attemptCount={problemStatsFor(active.id).attempts}
            submissionHistory={mySubmissions}
            onVerdict={(problemId, result, sourceCode) => onVerdict(problemId, result, sourceCode)}
          />
        )}
      </div>
    );
  }

  return <TeacherAssignmentConsole problems={problems} students={students} assignments={assignments} submissions={submissions} addAssignments={addAssignments} removeAssignment={removeAssignment} problemById={problemById} studentById={studentById} topicById={topicById} />;
}

function TeacherAssignmentConsole({ problems, students, assignments, submissions, addAssignments, removeAssignment, problemById, studentById, topicById }) {
  const [mode, setMode] = useState("byProblem");
  const [selectedProblem, setSelectedProblem] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [pickedStudents, setPickedStudents] = useState(() => new Set());
  const [pickedProblems, setPickedProblems] = useState(() => new Set());
  const [confirmMsg, setConfirmMsg] = useState("");
  const [filterStudent, setFilterStudent] = useState("all");
  const [filterProblem, setFilterProblem] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [reviewRow, setReviewRow] = useState(null);

  const assignedKeySet = useMemo(() => new Set(assignments.map((a) => `${a.problemId}::${a.studentId}`)), [assignments]);

  function toggleStudent(id) {
    setPickedStudents((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleProblem(id) {
    setPickedProblems((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function submitByProblem() {
    if (!selectedProblem || pickedStudents.size === 0) return;
    addAssignments([...pickedStudents].map((studentId) => ({ problemId: selectedProblem, studentId })));
    setConfirmMsg(`Đã giao bài cho ${pickedStudents.size} học sinh.`);
    setPickedStudents(new Set());
  }
  function submitByStudent() {
    if (!selectedStudent || pickedProblems.size === 0) return;
    addAssignments([...pickedProblems].map((problemId) => ({ problemId, studentId: selectedStudent })));
    setConfirmMsg(`Đã giao ${pickedProblems.size} bài tập.`);
    setPickedProblems(new Set());
  }

  const rows = useMemo(() => {
    return assignments
      .map((a) => ({ ...a, problem: problemById.get(a.problemId), student: studentById.get(a.studentId), status: assignmentStatus(submissions, a.studentId, a.problemId) }))
      .filter((a) => a.problem && a.student)
      .filter((a) => filterStudent === "all" || a.studentId === filterStudent)
      .filter((a) => filterProblem === "all" || a.problemId === filterProblem)
      .filter((a) => filterStatus === "all" || a.status === filterStatus)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [assignments, problemById, studentById, submissions, filterStudent, filterProblem, filterStatus]);

  const totalCount = assignments.length;
  const doneCount = assignments.filter((a) => assignmentStatus(submissions, a.studentId, a.problemId) === "done").length;

  return (
    <div>
      <SectionHeading eyebrow="Theo dõi nhận thức từng học sinh" title="Giao bài riêng" sub="Chọn bài tập để giao cho nhiều học sinh, hoặc chọn học sinh để giao nhiều bài tập cùng lúc." />

      <div className="nb-assign-stats">
        <div><strong>{totalCount}</strong><span>Lượt giao bài</span></div>
        <div><strong>{doneCount}</strong><span>Đã hoàn thành</span></div>
        <div><strong>{totalCount ? Math.round((doneCount / totalCount) * 100) : 0}%</strong><span>Tỉ lệ hoàn thành</span></div>
      </div>

      <div className="nb-assign-mode-toggle">
        <button type="button" className={mode === "byProblem" ? "active" : ""} onClick={() => setMode("byProblem")}>Theo bài tập</button>
        <button type="button" className={mode === "byStudent" ? "active" : ""} onClick={() => setMode("byStudent")}>Theo học sinh</button>
      </div>

      {mode === "byProblem" ? (
        <div className="nb-panel nb-assign-panel">
          <label className="nb-field-label">Chọn bài tập</label>
          <select className="nb-input" value={selectedProblem} onChange={(e) => { setSelectedProblem(e.target.value); setPickedStudents(new Set()); setConfirmMsg(""); }}>
            <option value="">— Chọn một bài tập —</option>
            {problems.map((p) => <option key={p.id} value={p.id}>{p.title} ({topicById.get(p.topic)?.title || "Chưa phân chuyên đề"})</option>)}
          </select>
          {selectedProblem && (
            <>
              <label className="nb-field-label" style={{ marginTop: 12 }}>Chọn học sinh nhận bài</label>
              <div className="nb-assign-checklist">
                {students.map((s) => {
                  const already = assignedKeySet.has(`${selectedProblem}::${s.id}`);
                  return (
                    <label key={s.id} className={`nb-assign-check ${pickedStudents.has(s.id) ? "selected" : ""} ${already ? "already" : ""}`}>
                      <input type="checkbox" checked={pickedStudents.has(s.id)} disabled={already} onChange={() => toggleStudent(s.id)} />
                      <Avatar name={s.name} size={26} />
                      <span>{s.name}</span>
                      {already && <small>Đã giao</small>}
                    </label>
                  );
                })}
              </div>
              <div className="nb-editor-actions">
                <button className="nb-btn nb-btn-primary" type="button" disabled={pickedStudents.size === 0} onClick={submitByProblem}><Send size={14} /> Giao cho {pickedStudents.size || ""} học sinh</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="nb-panel nb-assign-panel">
          <label className="nb-field-label">Chọn học sinh</label>
          <select className="nb-input" value={selectedStudent} onChange={(e) => { setSelectedStudent(e.target.value); setPickedProblems(new Set()); setConfirmMsg(""); }}>
            <option value="">— Chọn một học sinh —</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} (@{s.username})</option>)}
          </select>
          {selectedStudent && (
            <>
              <label className="nb-field-label" style={{ marginTop: 12 }}>Chọn bài tập giao</label>
              <div className="nb-assign-checklist">
                {problems.map((p) => {
                  const already = assignedKeySet.has(`${p.id}::${selectedStudent}`);
                  return (
                    <label key={p.id} className={`nb-assign-check ${pickedProblems.has(p.id) ? "selected" : ""} ${already ? "already" : ""}`}>
                      <input type="checkbox" checked={pickedProblems.has(p.id)} disabled={already} onChange={() => toggleProblem(p.id)} />
                      <span><strong>{p.title}</strong><small>{topicById.get(p.topic)?.title || "Chưa phân chuyên đề"} · {p.points} điểm</small></span>
                      {already && <small>Đã giao</small>}
                    </label>
                  );
                })}
              </div>
              <div className="nb-editor-actions">
                <button className="nb-btn nb-btn-primary" type="button" disabled={pickedProblems.size === 0} onClick={submitByStudent}><Send size={14} /> Giao {pickedProblems.size || ""} bài tập</button>
              </div>
            </>
          )}
        </div>
      )}
      {confirmMsg && <div className="nb-login-error" style={{ color: "var(--ac-green)", background: "rgba(46,158,109,0.1)", marginTop: 10 }}><CheckCircle2 size={14} /> {confirmMsg}</div>}

      <div className="nb-assign-overview">
        <div className="nb-editor-head" style={{ padding: 0, border: 0, marginTop: 26, marginBottom: 10 }}>
          <h3 className="nb-h3">Tổng quan bài đã giao</h3>
        </div>
        <div className="nb-assign-filters">
          <select className="nb-input" value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)}>
            <option value="all">Tất cả học sinh</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="nb-input" value={filterProblem} onChange={(e) => setFilterProblem(e.target.value)}>
            <option value="all">Tất cả bài tập</option>
            {problems.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <div className="nb-filter-row" style={{ margin: 0 }}>
            {[["all", "Tất cả"], ["todo", "Chưa làm"], ["attempted", "Chưa đạt"], ["done", "Hoàn thành"]].map(([key, label]) => (
              <button key={key} className={`nb-chip ${filterStatus === key ? "active" : ""}`} onClick={() => setFilterStatus(key)}>{label}</button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="nb-sub" style={{ padding: 14 }}>Chưa có bài nào được giao phù hợp bộ lọc.</p>
        ) : (
          <div className="nb-assign-rows">
            {rows.map((row) => {
              const meta = ASSIGNMENT_STATUS_META[row.status];
              return (
                <div className="nb-assign-row" key={row.id}>
                  <Avatar name={row.student.name} size={28} />
                  <div className="nb-assign-row-info">
                    <strong>{row.student.name}</strong>
                    <small>{row.problem.title}</small>
                  </div>
                  <span className={`nb-pill ${meta.cls}`}>{meta.label}</span>
                  <button type="button" className="nb-icon-btn" title="Xem bài nộp" aria-label="Xem bài nộp" onClick={() => setReviewRow(row)}><Eye size={14} /></button>
                  <button type="button" className="nb-icon-btn nb-danger-icon" title="Hủy giao bài" aria-label="Hủy giao bài" onClick={() => removeAssignment(row.id)}><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reviewRow && (
        <SubmissionReviewModal
          problem={reviewRow.problem}
          submissions={submissions.filter((s) => s.problemId === reviewRow.problemId && s.studentId === reviewRow.studentId)}
          students={[reviewRow.student]}
          onClose={() => setReviewRow(null)}
        />
      )}
    </div>
  );
}


/* ====================================================================== */
/*  ĐỀ THI THỬ — đề riêng, giao theo học sinh, xem bài làm                 */
/* ====================================================================== */

const EXAM_STATUS_META = {
  draft: { label: "Bản nháp", cls: "nb-pill-pending", tone: "draft" },
  upcoming: { label: "Sắp diễn ra", cls: "nb-pill-pending", tone: "upcoming" },
  active: { label: "Đang mở", cls: "nb-pill-ac", tone: "active" },
  completed: { label: "Đã kết thúc", cls: "nb-pill-wa", tone: "completed" },
};
const ATTEMPT_PHASE_LABEL = { none: "Chưa vào thi", running: "Đang làm bài", finished: "Đã nộp bài", timeup: "Hết giờ" };

function examLimitMs(exam, attempt) {
  return ((Number(exam.duration) || 0) + (Number(attempt?.extraMinutes) || 0)) * 60000;
}
// Thời gian đã làm bài thực tế = từ lúc bắt đầu, trừ thời gian học sinh rời màn hình (đồng hồ tạm dừng).
function attemptElapsedMs(attempt, nowMs) {
  if (!attempt) return 0;
  const startMs = new Date(attempt.startedAt).getTime();
  const pausedNow = attempt.pausedAt ? Math.max(0, nowMs - new Date(attempt.pausedAt).getTime()) : 0;
  return Math.max(0, nowMs - startMs - (attempt.pausedMs || 0) - pausedNow);
}
function attemptRemainingMs(exam, attempt, nowMs) {
  return examLimitMs(exam, attempt) - attemptElapsedMs(attempt, nowMs);
}
function attemptPhase(exam, attempt, nowMs) {
  if (!attempt) return "none";
  if (attempt.finishedAt) return "finished";
  return attemptRemainingMs(exam, attempt, nowMs) <= 0 ? "timeup" : "running";
}
function examVisibleTo(exam, userId) {
  return exam.status !== "draft" && (exam.assignedTo.length === 0 || exam.assignedTo.includes(userId));
}
function bestScoreMap(subs) {
  const map = new Map();
  subs.forEach((s) => map.set(s.problemId, Math.max(map.get(s.problemId) || 0, Number(s.score) || 0)));
  return map;
}
function sumMap(map) {
  let total = 0;
  map.forEach((v) => { total += v; });
  return total;
}
function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}
function formatSpan(ms) {
  const minutes = Math.round(Math.max(0, ms) / 60000);
  if (minutes < 60) return `${minutes} phút`;
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}
function sortByName(list) {
  return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), "vi"));
}

/* ---------- Xem code bài nộp (dùng cho giáo viên và học sinh xem lại) ---------- */
function ExamCode({ submission }) {
  const [code, setCode] = useState(submission.sourceCode || "");
  const [state, setState] = useState(submission.sourceCode ? "ready" : "loading");
  useEffect(() => {
    if (submission.sourceCode) { setCode(submission.sourceCode); setState("ready"); return undefined; }
    let cancelled = false;
    setState("loading");
    dbExamSourceCode(submission.id)
      .then((c) => { if (!cancelled) { setCode(c); setState("ready"); } })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [submission.id, submission.sourceCode]);
  if (state === "loading") return <p className="nb-sub" style={{ padding: 14 }}>Đang tải code…</p>;
  if (state === "error") return <p className="nb-sub" style={{ padding: 14 }}>Không tải được code, thử lại sau.</p>;
  return code ? <pre className="nb-history-code">{code}</pre> : <p className="nb-sub" style={{ padding: 14 }}>Lượt nộp này không có mã nguồn được lưu.</p>;
}

function ExamSubmissionViewer({ title, subtitle, problems, submissions, initialProblemId, onClose }) {
  const [problemId, setProblemId] = useState(initialProblemId || problems[0]?.id);
  const [openId, setOpenId] = useState(null);
  const best = useMemo(() => bestScoreMap(submissions), [submissions]);
  const list = useMemo(
    () => submissions.filter((s) => s.problemId === problemId).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [submissions, problemId]
  );
  const problem = problems.find((p) => p.id === problemId);
  const selected = list.find((s) => s.id === openId) || list[0] || null;
  return (
    <div className="nb-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="nb-modal nb-xm-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div><div className="nb-eyebrow">Bài làm trong đề thi</div><h3 className="nb-h3">{title}</h3>{subtitle && <p className="nb-sub">{subtitle}</p>}</div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="nb-xm-tabs">
          {problems.map((p, i) => (
            <button key={p.id} type="button" className={`nb-xm-tab ${p.id === problemId ? "active" : ""}`} onClick={() => { setProblemId(p.id); setOpenId(null); }}>
              <span>Bài {i + 1}</span><strong>{best.get(p.id) || 0}/{p.points}</strong>
            </button>
          ))}
        </div>
        {problem && (
          <details className="nb-xm-statement">
            <summary>Đề bài: {problem.title}</summary>
            <ProblemStatement problem={problem} />
          </details>
        )}
        <div className="nb-xm-viewer-body">
          <div className="nb-xm-sub-list">
            {list.length === 0 && <p className="nb-sub" style={{ padding: 14 }}>Chưa có lượt nộp nào cho bài này.</p>}
            {list.map((s, index) => (
              <button type="button" key={s.id} className={`nb-xm-sub-item ${selected?.id === s.id ? "active" : ""}`} onClick={() => setOpenId(s.id)}>
                <div><VerdictPill verdict={s.verdict} /><span className="nb-history-date">{formatSubmissionDate(s.createdAt)}</span></div>
                <strong>{s.score}/{s.problemPoints ?? problem?.points}đ</strong>
                <small>{s.language && LANGUAGE_META[s.language] ? `${LANGUAGE_META[s.language].label} · ` : ""}Lần {list.length - index}{s.passedTests != null && s.totalTests != null ? ` · ${s.passedTests}/${s.totalTests} test đạt` : ""}</small>
              </button>
            ))}
          </div>
          <div className="nb-xm-code">{selected ? <ExamCode key={selected.id} submission={selected} /> : <p className="nb-sub" style={{ padding: 14 }}>Chọn một lượt nộp để xem code.</p>}</div>
        </div>
        <div className="nb-modal-actions"><button className="nb-btn nb-btn-ghost" onClick={onClose}>Đóng</button></div>
      </div>
    </div>
  );
}

/* ---------- Soạn một bài tập nằm trong đề ---------- */
function ExamProblemEditor({ initial, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || "", difficulty: initial?.difficulty || "Dễ", points: initial?.points || 100,
    language: initial ? problemLanguage(initial) : "cpp", statement: initial?.statement || "",
    imageUrl: initial?.imageUrl || "", imageFile: null,
    sampleInput: initial?.sample?.input === "—" ? "" : (initial?.sample?.input || ""),
    sampleOutput: initial?.sample?.output === "—" ? "" : (initial?.sample?.output || ""),
    testCases: initial && initial.testCases.length ? initial.testCases.map((t) => ({ ...t })) : [createEmptyTestCase()],
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(initial?.imageUrl || "");
  const objectUrlRef = useRef(null);
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  function setTest(id, field, value) {
    setForm((f) => ({ ...f, testCases: f.testCases.map((t) => (t.id === id ? { ...t, [field]: value } : t)) }));
  }
  function onImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Chỉ được tải tệp hình ảnh."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Ảnh không được vượt quá 5 MB."); return; }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setPreview(objectUrlRef.current);
    setForm((f) => ({ ...f, imageFile: file }));
    setError("");
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.statement.trim()) { setError("Cần nhập tên bài và đề bài."); return; }
    const tests = form.testCases
      .map((t) => ({ ...t, input: String(t.input || ""), output: String(t.output || "") }))
      .filter((t) => t.input.trim() || t.output.trim());
    if (tests.some((t) => !t.output.trim())) { setError("Mỗi test case đã nhập phải có output kỳ vọng."); return; }
    if (tests.length === 0) { setError("Bài trong đề thi cần ít nhất một test case để chấm điểm."); return; }
    setBusy(true);
    try {
      const imageUrl = form.imageFile ? await uploadProblemImage(form.imageFile) : form.imageUrl.trim();
      onSave(normalizeExamProblem({
        id: initial?.id || newExamProblemId(), title: form.title.trim(), difficulty: form.difficulty,
        points: Math.max(1, Number(form.points) || 100), language: form.language, statement: form.statement.trim(), imageUrl,
        sample: { input: form.sampleInput.trim() || "—", output: form.sampleOutput.trim() || "—" }, testCases: tests,
      }));
    } catch (err) {
      setError(err?.message || "Không thể tải ảnh hoặc lưu bài.");
      setBusy(false);
    }
  }
  return (
    <div className="nb-modal-overlay" role="dialog" aria-modal="true" aria-label="Soạn bài trong đề thi">
      <form className="nb-modal nb-xm-problem-modal nb-form" onSubmit={submit}>
        <div className="nb-modal-head">
          <div><div className="nb-eyebrow">Bài chỉ thuộc đề thi này</div><h3 className="nb-h3">{initial ? "Sửa bài trong đề" : "Thêm bài vào đề"}</h3></div>
          <button type="button" className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <label className="nb-xm-field"><span>Tên bài</span>
          <input className="nb-input" placeholder="Ví dụ: Tổng hai số" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <div className="nb-xm-row">
          <label><span className="nb-field-label">Độ khó</span>
            <select className="nb-input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label><span className="nb-field-label">Điểm</span>
            <input className="nb-input" type="number" min="1" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
          <div className="nb-xm-lang-note"><span className="nb-field-label">Ngôn ngữ</span><strong>Học sinh tự chọn</strong><small>Python · C · C++ khi làm bài</small></div>
        </div>
        <label className="nb-xm-field"><span>Đề bài (mô tả, ràng buộc, định dạng input/output)</span>
          <textarea className="nb-input nb-xm-statement-input" rows={10} placeholder={"Nhập nội dung đề bài. Để trống một dòng giữa các đoạn để tách đoạn.\n\nInput: …\nOutput: …"} value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} /></label>
        <StatementHelp statement={form.statement} problem={{ title: form.title, imageUrl: "" }} />
        <div className="nb-form-section-label">Hình minh họa (không bắt buộc)</div>
        <div className="nb-image-upload-panel">
          <label className="nb-upload-drop"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onImage} /><UploadCloud size={20} /><span><strong>Chọn ảnh đề bài</strong><small>PNG, JPG, WEBP, GIF · tối đa 5 MB</small></span></label>
          {preview && <div className="nb-image-preview-wrap"><img src={preview} className="nb-image-preview" alt="Xem trước" /><button type="button" className="nb-btn nb-btn-danger" onClick={() => { setPreview(""); setForm({ ...form, imageFile: null, imageUrl: "" }); }}><Trash2 size={14} /> Xóa ảnh</button></div>}
        </div>
        <div className="nb-form-section-label">Ví dụ hiển thị cho học sinh</div>
        <div className="nb-xm-row two">
          <textarea className="nb-input nb-mono" rows={4} placeholder="Input mẫu" value={form.sampleInput} onChange={(e) => setForm({ ...form, sampleInput: e.target.value })} />
          <textarea className="nb-input nb-mono" rows={4} placeholder="Output mẫu" value={form.sampleOutput} onChange={(e) => setForm({ ...form, sampleOutput: e.target.value })} />
        </div>
        <div className="nb-form-section-label">Test case chấm điểm ({form.testCases.length})</div>
        <div className="nb-testcase-editor">
          {form.testCases.map((t, i) => (
            <div className="nb-testcase-card" key={t.id}>
              <div className="nb-testcase-head"><strong>Test {i + 1}</strong>
                <button type="button" className="nb-icon-btn" aria-label={`Xóa test ${i + 1}`} onClick={() => setForm((f) => ({ ...f, testCases: f.testCases.length > 1 ? f.testCases.filter((x) => x.id !== t.id) : [createEmptyTestCase()] }))}><Trash2 size={15} /></button></div>
              <div className="nb-testcase-grid">
                <textarea className="nb-input nb-mono" rows={4} placeholder="Input" value={t.input} onChange={(e) => setTest(t.id, "input", e.target.value)} />
                <textarea className="nb-input nb-mono" rows={4} placeholder="Output kỳ vọng" value={t.output} onChange={(e) => setTest(t.id, "output", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="nb-btn nb-btn-ghost" onClick={() => setForm((f) => ({ ...f, testCases: [...f.testCases, createEmptyTestCase()] }))}><Plus size={15} /> Thêm test case</button>
        {error && <div className="nb-login-error"><AlertCircle size={14} /> {error}</div>}
        <div className="nb-modal-actions">
          <button className="nb-btn nb-btn-primary" type="submit" disabled={busy}><Save size={15} /> {busy ? "Đang lưu…" : "Lưu bài vào đề"}</button>
          <button className="nb-btn nb-btn-ghost" type="button" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </div>
  );
}

function PracticePickerModal({ practiceProblems, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi-VN");
    return practiceProblems.filter((p) => !q || `${p.id} ${p.title}`.toLocaleLowerCase("vi-VN").includes(q));
  }, [practiceProblems, query]);
  return (
    <div className="nb-modal-overlay" role="dialog" aria-modal="true" aria-label="Lấy bài từ kho luyện tập" onClick={onClose}>
      <div className="nb-modal nb-xm-picker" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div><div className="nb-eyebrow">Sao chép từ kho luyện tập</div><h3 className="nb-h3">Chọn bài để thêm vào đề</h3>
            <p className="nb-sub">Bài được sao chép thành bản riêng của đề thi; sửa ở đây không ảnh hưởng kho luyện tập và ngược lại.</p></div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <label className="nb-practice-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc mã bài…" /></label>
        <div className="nb-xm-picker-list">
          {filtered.map((p) => (
            <label key={p.id} className={`nb-exam-check ${picked.includes(p.id) ? "selected" : ""}`}>
              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} />
              <span><strong>{p.title}</strong><small>{p.points} điểm · {p.difficulty} · {getProblemTestCases(p).length} test</small></span>
              <CheckCircle2 size={16} />
            </label>
          ))}
          {filtered.length === 0 && <p className="nb-sub" style={{ padding: 14 }}>Không có bài phù hợp.</p>}
        </div>
        <div className="nb-modal-actions">
          <button className="nb-btn nb-btn-primary" disabled={picked.length === 0} onClick={() => onPick(practiceProblems.filter((p) => picked.includes(p.id)))}><Plus size={15} /> Thêm {picked.length} bài vào đề</button>
          <button className="nb-btn nb-btn-ghost" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Trình tạo / chỉnh sửa đề thi (giáo viên) ---------- */
function ExamBuilder({ exam, students, practiceProblems, currentUser, onClose, onSaved }) {
  const isNew = !exam;
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(() => ({
    title: exam?.title || "", description: exam?.description || "", date: exam?.date || "", duration: exam?.duration || 90,
    scope: exam && exam.assignedTo.length > 0 ? "selected" : "all", assignedTo: exam ? [...exam.assignedTo] : [],
  }));
  const [problems, setProblems] = useState([]);
  const [editor, setEditor] = useState(null);
  const [picker, setPicker] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    dbExamGetProblems(exam.id)
      .then((list) => { if (!cancelled) { setProblems(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError("Không tải được bài tập của đề. Hãy đóng và thử lại."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [exam?.id, isNew]);

  const sortedStudents = useMemo(() => sortByName(students), [students]);
  const classNames = useMemo(() => [...new Set(students.map((s) => s.className).filter(Boolean))].sort(), [students]);
  const shownStudents = useMemo(() => {
    const q = studentQuery.trim().toLocaleLowerCase("vi-VN");
    return sortedStudents.filter((s) => (classFilter === "all" || s.className === classFilter)
      && (!q || `${s.name} ${s.username}`.toLocaleLowerCase("vi-VN").includes(q)));
  }, [sortedStudents, studentQuery, classFilter]);
  const totalPoints = problems.reduce((sum, p) => sum + (Number(p.points) || 0), 0);

  function toggleStudent(id) {
    setForm((f) => ({ ...f, assignedTo: f.assignedTo.includes(id) ? f.assignedTo.filter((x) => x !== id) : [...f.assignedTo, id] }));
  }
  function selectShown(select) {
    const ids = shownStudents.map((s) => s.id);
    setForm((f) => ({ ...f, assignedTo: select ? [...new Set([...f.assignedTo, ...ids])] : f.assignedTo.filter((id) => !ids.includes(id)) }));
  }
  function move(index, delta) {
    setProblems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function saveProblem(problem) {
    setProblems((list) => (list.some((p) => p.id === problem.id) ? list.map((p) => (p.id === problem.id ? problem : p)) : [...list, problem]));
    setEditor(null);
  }
  function importProblems(picked) {
    const copies = picked.map((p, i) => normalizeExamProblem({
      id: newExamProblemId() + i, title: p.title, difficulty: p.difficulty, points: p.points, language: problemLanguage(p),
      statement: p.statement, imageUrl: p.imageUrl, sample: p.sample, testCases: getProblemTestCases(p).map((t, k) => ({ id: `t${k + 1}`, input: t.input, output: t.output })),
    }));
    setProblems((list) => [...list, ...copies]);
    setPicker(false);
  }
  async function save(publish) {
    setError("");
    if (!form.title.trim()) { setError("Cần nhập tên đề thi."); return; }
    if (problems.length === 0) { setError("Đề thi cần ít nhất một bài tập."); return; }
    if (form.scope === "selected" && form.assignedTo.length === 0) { setError("Hãy chọn ít nhất một học sinh, hoặc chuyển sang giao cho cả lớp."); return; }
    const status = isNew ? (publish ? "upcoming" : "draft") : (publish && exam.status === "draft" ? "upcoming" : exam.status);
    const payload = {
      id: exam?.id || `ex${Date.now()}`, title: form.title.trim(), description: form.description.trim(), status,
      date: form.date.trim() || "Chưa xếp lịch", duration: Math.min(300, Math.max(10, Number(form.duration) || 60)),
      assignedTo: form.scope === "all" ? [] : form.assignedTo,
    };
    setSaving(true);
    try {
      await dbExamSave(payload, problems, isNew, currentUser?.id);
      onSaved(isNew ? "Đã tạo đề thi." : "Đã lưu thay đổi.");
    } catch (e) {
      setError(e?.message ? `Không lưu được đề thi: ${e.message}` : "Không lưu được đề thi. Hãy thử lại.");
      setSaving(false);
    }
  }

  return (
    <div className="nb-xm-builder">
      <div className="nb-contest-bar">
        <button className="nb-btn nb-btn-ghost" onClick={onClose}><ChevronLeft size={16} /> Danh sách đề thi</button>
        <div className="nb-xm-bar-title">{isNew ? "Tạo đề thi mới" : "Chỉnh sửa đề thi"}</div>
      </div>
      {loading ? <p className="nb-sub" style={{ padding: 20 }}>Đang tải đề…</p> : loadError ? <div className="nb-login-error"><AlertCircle size={14} /> {loadError}</div> : (
        <>
          {!isNew && exam.status === "active" && <div className="nb-locked-banner"><AlertCircle size={15} /> Đề đang mở: thay đổi đề bài, điểm hoặc test sẽ áp dụng ngay cho học sinh đang làm bài.</div>}
          <section className="nb-xm-section">
            <div className="nb-xm-section-head"><span>1</span><div><h3>Thông tin đề thi</h3><p>Tên, thời gian và mô tả hiển thị cho học sinh.</p></div></div>
            <div className="nb-exam-form-grid">
              <label><span>Tên đề thi</span><input className="nb-input" placeholder="Ví dụ: Kiểm tra giữa kỳ 1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label><span>Ngày thi (hiển thị)</span><input className="nb-input" placeholder="20/11/2026 · 08:00" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label><span>Thời gian làm bài (phút)</span><input className="nb-input" type="number" min="10" max="300" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></label>
            </div>
            <label className="nb-xm-field"><span>Mô tả / lưu ý cho học sinh (không bắt buộc)</span>
              <textarea className="nb-input nb-xm-desc-input" rows={4} placeholder="Ví dụ: Được dùng Python hoặc C++, không trao đổi bài, nộp nhiều lần lấy điểm cao nhất." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </section>

          <section className="nb-xm-section">
            <div className="nb-xm-section-head"><span>2</span><div><h3>Đối tượng làm bài</h3><p>Giao cho cả lớp hoặc chỉ những học sinh được chọn. Học sinh khác sẽ không thấy đề này.</p></div></div>
            <div className="nb-xm-scope">
              <button type="button" className={`nb-xm-scope-opt ${form.scope === "all" ? "active" : ""}`} onClick={() => setForm({ ...form, scope: "all" })}><Users size={17} /><strong>Cả lớp</strong><small>{students.length} học sinh</small></button>
              <button type="button" className={`nb-xm-scope-opt ${form.scope === "selected" ? "active" : ""}`} onClick={() => setForm({ ...form, scope: "selected" })}><ListChecks size={17} /><strong>Học sinh được chọn</strong><small>{form.assignedTo.length} đã chọn</small></button>
            </div>
            {form.scope === "selected" && (
              <div className="nb-xm-students">
                <div className="nb-xm-students-tools">
                  <label className="nb-practice-search"><Search size={16} /><input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Tìm học sinh…" /></label>
                  {classNames.length > 0 && <div className="nb-filter-row" style={{ margin: 0 }}>{["all", ...classNames].map((c) => <button type="button" key={c} className={`nb-chip ${classFilter === c ? "active" : ""}`} onClick={() => setClassFilter(c)}>{c === "all" ? "Tất cả lớp" : c}</button>)}</div>}
                  <div className="nb-xm-students-bulk"><button type="button" className="nb-btn nb-btn-ghost" onClick={() => selectShown(true)}>Chọn tất cả đang hiện</button><button type="button" className="nb-btn nb-btn-ghost" onClick={() => selectShown(false)}>Bỏ chọn</button></div>
                </div>
                <div className="nb-xm-student-grid">
                  {shownStudents.map((s) => (
                    <label key={s.id} className={`nb-exam-check ${form.assignedTo.includes(s.id) ? "selected" : ""}`}>
                      <input type="checkbox" checked={form.assignedTo.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                      <span><strong>{s.name}</strong><small>@{s.username}{s.className ? ` · ${s.className}` : ""}</small></span><CheckCircle2 size={16} />
                    </label>
                  ))}
                  {shownStudents.length === 0 && <p className="nb-sub" style={{ padding: 10 }}>Không có học sinh phù hợp.</p>}
                </div>
              </div>
            )}
          </section>

          <section className="nb-xm-section">
            <div className="nb-xm-section-head"><span>3</span><div><h3>Bài tập trong đề</h3><p>Bài của đề thi nằm riêng, không xuất hiện trong phần Luyện tập.</p></div>
              <div className="nb-xm-section-tools"><strong>{problems.length} bài · {totalPoints} điểm</strong></div></div>
            <div className="nb-xm-problem-list">
              {problems.map((p, i) => (
                <div key={p.id} className="nb-xm-problem-row">
                  <span className="nb-xm-problem-no">{i + 1}</span>
                  <div className="nb-xm-problem-main"><strong>{p.title}</strong><small>{p.points} điểm · {p.difficulty} · {p.testCases.length} test</small></div>
                  <div className="nb-xm-problem-actions">
                    <button type="button" className="nb-icon-btn" title="Lên" aria-label="Chuyển lên" disabled={i === 0} onClick={() => move(i, -1)}><ChevronRight size={15} style={{ transform: "rotate(-90deg)" }} /></button>
                    <button type="button" className="nb-icon-btn" title="Xuống" aria-label="Chuyển xuống" disabled={i === problems.length - 1} onClick={() => move(i, 1)}><ChevronRight size={15} style={{ transform: "rotate(90deg)" }} /></button>
                    <button type="button" className="nb-icon-btn" title="Sửa" aria-label="Sửa bài" onClick={() => setEditor({ problem: p })}><Pencil size={15} /></button>
                    <button type="button" className="nb-icon-btn nb-danger-icon" title="Xóa" aria-label="Xóa bài" onClick={() => { if (window.confirm(`Xóa bài “${p.title}” khỏi đề?`)) setProblems((l) => l.filter((x) => x.id !== p.id)); }}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
              {problems.length === 0 && <div className="nb-exam-empty" style={{ padding: 28 }}><ListChecks size={22} /><strong>Chưa có bài nào</strong><span>Tạo bài mới hoặc sao chép từ kho luyện tập.</span></div>}
            </div>
            <div className="nb-xm-add-row">
              <button type="button" className="nb-btn nb-btn-primary" onClick={() => setEditor({ problem: null })}><Plus size={15} /> Tạo bài mới</button>
              <button type="button" className="nb-btn nb-btn-ghost" onClick={() => setPicker(true)}><Code2 size={15} /> Lấy từ kho luyện tập</button>
            </div>
          </section>

          {error && <div className="nb-login-error"><AlertCircle size={14} /> {error}</div>}
          <div className="nb-xm-footer">
            <button className="nb-btn nb-btn-ghost" onClick={onClose} disabled={saving}>Hủy</button>
            {(isNew || exam.status === "draft") ? (
              <>
                <button className="nb-btn nb-btn-ghost" onClick={() => save(false)} disabled={saving}><Save size={15} /> Lưu bản nháp</button>
                <button className="nb-btn nb-btn-primary" onClick={() => save(true)} disabled={saving}><Send size={15} /> {saving ? "Đang lưu…" : "Lưu & công bố"}</button>
              </>
            ) : (
              <button className="nb-btn nb-btn-primary" onClick={() => save(false)} disabled={saving}><Save size={15} /> {saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
            )}
          </div>
        </>
      )}
      {editor && <ExamProblemEditor initial={editor.problem} onSave={saveProblem} onClose={() => setEditor(null)} />}
      {picker && <PracticePickerModal practiceProblems={practiceProblems} onPick={importProblems} onClose={() => setPicker(false)} />}
    </div>
  );
}

/* ---------- Phòng thi (học sinh làm bài / giáo viên xem trước) ---------- */
function ExamRunner({ exam, currentUser, isTeacher, onExit }) {
  const [problems, setProblems] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [mySubs, setMySubs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [active, setActive] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");
  const [langPref, setLangPref] = useState("");
  const [awayNotice, setAwayNotice] = useState(null);
  const attemptRef = useRef(null);
  const offsetRef = useRef(0);
  const awayRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, attempts, subs, clock] = await Promise.all([
          dbExamGetProblems(exam.id),
          isTeacher ? Promise.resolve([]) : dbExamFetchAttempts({ examId: exam.id, studentId: currentUser.id }),
          isTeacher ? Promise.resolve([]) : dbExamFetchSubmissions({ examId: exam.id, studentId: currentUser.id, withCode: true }),
          dbServerClockOffset(),
        ]);
        if (cancelled) return;
        setProblems(list); setAttempt(attempts[0] || null); setMySubs(subs); setOffset(clock);
      } catch (e) {
        if (!cancelled) setLoadError("Không tải được đề thi. Hãy kiểm tra kết nối và thử lại.");
      }
    })();
    return () => { cancelled = true; };
  }, [exam.id, isTeacher, currentUser.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const serverNow = now + offset;
  const phase = isTeacher ? "preview" : attemptPhase(exam, attempt, serverNow);
  const examOpen = exam.status === "active";
  const canWork = !isTeacher && phase === "running" && examOpen;
  const remaining = attempt ? attemptRemainingMs(exam, attempt, serverNow) : 0;
  attemptRef.current = attempt;
  offsetRef.current = offset;

  // Phát hiện học sinh rời màn hình thi: +1 lỗi (không trừ điểm) và tạm dừng đồng hồ đến khi quay lại.
  const monitoring = !isTeacher && canWork;
  useEffect(() => {
    if (!monitoring) return undefined;
    const serverMs = () => Date.now() + offsetRef.current;
    function leave() {
      const a = attemptRef.current;
      if (Date.now() < examDialogQuietUntil || awayRef.current || !a || a.finishedAt) return;
      awayRef.current = true;
      const at = new Date(serverMs()).toISOString();
      const next = { ...a, violations: (a.violations || 0) + 1, pausedAt: a.pauseSupported ? (a.pausedAt || at) : null };
      attemptRef.current = next;
      setAttempt(next);
      if (a.pauseSupported) dbExamUpdateAttempt(a.id, { violations: next.violations, pausedAt: next.pausedAt }).catch(() => {});
    }
    function back() {
      const a = attemptRef.current;
      if (!a || a.finishedAt) return;
      if (document.visibilityState === "hidden" || !document.hasFocus()) return;
      const wasAway = awayRef.current;
      awayRef.current = false;
      if (a.pausedAt) {
        const add = Math.max(0, serverMs() - new Date(a.pausedAt).getTime());
        const next = { ...a, pausedMs: (a.pausedMs || 0) + add, pausedAt: null };
        attemptRef.current = next;
        setAttempt(next);
        dbExamUpdateAttempt(a.id, { pausedMs: next.pausedMs, pausedAt: null }).catch(() => {});
        setAwayNotice({ count: a.violations || 0, supported: true, sec: Math.round(add / 1000) });
      } else if (wasAway) {
        setAwayNotice({ count: a.violations || 0, supported: false, sec: 0 });
      }
    }
    let blurTimer = null;
    const onVisibility = () => { if (document.visibilityState === "hidden") leave(); else back(); };
    const onBlur = () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => { if (!document.hasFocus()) leave(); }, 350); };
    const onFocus = () => { clearTimeout(blurTimer); back(); };
    const onHide = () => leave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onHide);
    back(); // vào lại phòng thi khi đồng hồ còn đang tạm dừng từ lần trước
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onHide);
    };
  }, [monitoring]);
  useEffect(() => {
    if (!awayNotice) return undefined;
    const t = setTimeout(() => setAwayNotice(null), 20000);
    return () => clearTimeout(t);
  }, [awayNotice]);
  const best = useMemo(() => bestScoreMap(mySubs), [mySubs]);
  const total = sumMap(best);
  const maxScore = (problems || []).reduce((s, p) => s + p.points, 0);

  async function begin() {
    setStarting(true); setNotice("");
    try {
      const created = await dbExamStartAttempt(exam.id, currentUser.id);
      setAttempt(created);
      setOffset(await dbServerClockOffset());
    } catch (e) {
      setNotice("Không bắt đầu được bài thi. Hãy kiểm tra kết nối rồi thử lại.");
    }
    setStarting(false);
  }
  async function finish() {
    if (!examConfirm("Kết thúc bài thi? Sau khi kết thúc em sẽ không thể nộp thêm.")) return;
    try {
      const at = new Date(Date.now() + offset).toISOString();
      await dbExamUpdateAttempt(attempt.id, { finishedAt: at });
      setAttempt({ ...attempt, finishedAt: at });
    } catch (e) { setNotice("Chưa kết thúc được bài thi, hãy thử lại."); }
  }
  function handleVerdict(problemId, result, code, language) {
    if (isTeacher || !attempt) return;
    if (attempt.finishedAt || !examOpen || attemptRemainingMs(exam, attempt, Date.now() + offset) < -45000) {
      setNotice("Đã hết giờ nên bài nộp này không được ghi nhận."); return;
    }
    const p = (problems || []).find((x) => x.id === problemId);
    const verdict = typeof result === "string" ? result : result?.verdict;
    if (!verdict || !p) return;
    const score = typeof result === "object" ? Math.max(0, Math.min(p.points, Number(result.score) || 0)) : (verdict === "AC" ? p.points : 0);
    const sub = {
      id: "xs" + Date.now() + Math.random().toString(36).slice(2, 6), examId: exam.id, studentId: currentUser.id, problemId, verdict, score,
      passedTests: typeof result === "object" ? result.passedTests ?? null : null, totalTests: typeof result === "object" ? result.totalTests ?? null : null,
      problemTitle: p.title, problemPoints: p.points, sourceCode: String(code || ""), createdAt: new Date().toISOString(), language: language || "",
    };
    setMySubs((prev) => [...prev, sub]);
    dbExamAddSubmission(sub).catch(() => setNotice("Chưa lưu được bài nộp lên máy chủ. Hãy kiểm tra mạng và nộp lại."));
  }

  const header = (
    <div className="nb-contest-bar">
      <button className="nb-btn nb-btn-ghost" onClick={onExit}><ChevronLeft size={16} /> {canWork ? "Rời phòng thi (đồng hồ vẫn chạy)" : "Danh sách đề thi"}</button>
      {isTeacher ? <div className="nb-contest-timer">Chế độ xem trước (GV)</div>
        : phase === "running" ? <div className={`nb-exam-timer ${remaining < 300000 ? "warning" : ""}`}><Clock size={15} /> {formatClock(remaining)}</div>
        : phase !== "none" ? <div className="nb-contest-timer" style={{ color: "var(--slate)" }}>{ATTEMPT_PHASE_LABEL[phase]}</div> : null}
      {problems && !isTeacher && phase !== "none" && <div className="nb-sub">{total}/{maxScore} điểm</div>}
      {!isTeacher && attempt && phase === "running" && <div className={`nb-xm-viol-chip ${attempt.violations > 0 ? "has" : ""}`} title="Mỗi lần rời màn hình thi được ghi 1 lỗi. Lỗi này không trừ điểm."><Eye size={13} /> Rời màn hình: {attempt.violations || 0} lần</div>}
    </div>
  );

  if (loadError) return <div>{header}<div className="nb-login-error"><AlertCircle size={14} /> {loadError}</div></div>;
  if (!problems) return <div>{header}<p className="nb-sub" style={{ padding: 20 }}>Đang tải đề thi…</p></div>;

  if (!isTeacher && phase === "none") {
    return (
      <div>
        {header}
        <section className="nb-xm-intro">
          <div className="nb-eyebrow">Phòng thi</div>
          <h2>{exam.title}</h2>
          {exam.description && <p className="nb-xm-intro-desc">{exam.description}</p>}
          <div className="nb-xm-intro-meta">
            <span><Clock size={15} /> {exam.duration} phút</span><span><ListChecks size={15} /> {problems.length} bài</span><span><Award size={15} /> {maxScore} điểm</span>
          </div>
          <ul className="nb-xm-rules">
            <li>Đồng hồ bắt đầu tính khi em bấm “Bắt đầu làm bài”. Nếu em <strong>rời khỏi màn hình thi</strong> (chuyển tab, mở ứng dụng khác), hệ thống ghi <strong>+1 lỗi</strong> để thầy cô biết — lỗi này <strong>không trừ điểm</strong> — và <strong>tạm dừng đồng hồ</strong> cho đến khi em quay lại.</li>
            <li>Mỗi bài em tự chọn ngôn ngữ lập trình (Python, C hoặc C++) trước khi gõ code.</li>
            <li>Mỗi bài có thể nộp nhiều lần, điểm của bài là điểm cao nhất trong các lần nộp.</li>
            <li>Hết giờ hệ thống tự khóa; em có thể bấm “Kết thúc bài thi” sớm nếu đã làm xong.</li>
          </ul>
          {!examOpen && <div className="nb-locked-banner"><Lock size={15} /> {exam.status === "completed" ? "Kỳ thi đã kết thúc, em không tham gia kỳ này." : "Kỳ thi chưa mở. Em quay lại khi giáo viên mở đề."}</div>}
          {notice && <div className="nb-login-error"><AlertCircle size={14} /> {notice}</div>}
          <button className="nb-btn nb-btn-primary" disabled={!examOpen || starting} onClick={begin}><Play size={16} /> {starting ? "Đang bắt đầu…" : "Bắt đầu làm bài"}</button>
        </section>
      </div>
    );
  }

  const reviewMode = !isTeacher && !canWork;
  return (
    <div>
      {header}
      {isTeacher && <div className="nb-locked-banner"><Eye size={15} /> Đây là bản xem trước. Giáo viên có thể đọc đề nhưng không nộp bài.</div>}
      {reviewMode && (
        <div className="nb-xm-result-banner">
          <div><div className="nb-eyebrow">{!examOpen && phase === "running" ? "Giáo viên đã đóng đề" : phase === "timeup" ? "Đã hết giờ" : "Đã kết thúc bài thi"}</div>
            <strong>Kết quả của em: {total}/{maxScore} điểm</strong></div>
          <span>Bấm vào từng bài để xem lại các lần nộp và code của em.</span>
        </div>
      )}
      {notice && <div className="nb-login-error" style={{ marginBottom: 10 }}><AlertCircle size={14} /> {notice}</div>}
      {awayNotice && (
        <div className="nb-xm-away" role="alert">
          <AlertCircle size={18} />
          <div><strong>Em vừa rời khỏi màn hình thi · +1 lỗi (tổng {awayNotice.count} lần)</strong>
            <span>Lỗi này chỉ để ghi nhận, <b>không trừ điểm</b>.{awayNotice.supported ? ` Đồng hồ đã tạm dừng trong ${awayNotice.sec < 60 ? `${awayNotice.sec} giây` : `${Math.round(awayNotice.sec / 60)} phút`} em vắng mặt và đang chạy tiếp.` : ""}</span></div>
          <button type="button" className="nb-btn nb-btn-ghost" onClick={() => setAwayNotice(null)}>Đã hiểu</button>
        </div>
      )}
      <div className="nb-problem-grid">
        {problems.map((p, i) => {
          const mine = mySubs.filter((s) => s.problemId === p.id);
          const last = [...mine].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
          const score = best.get(p.id) || 0;
          return (
            <button key={p.id} className="nb-problem-card nb-xm-problem-card" onClick={() => (reviewMode ? setViewing(p.id) : setActive(p))}>
              <div className="nb-problem-top"><span className="nb-eyebrow">Bài {i + 1}</span>{score >= p.points && <CheckCircle2 size={16} style={{ color: "var(--ac-green)" }} />}</div>
              <div className="nb-problem-title">{p.title}</div>
              <div className="nb-xm-card-score"><div className="nb-exam-progress"><span style={{ width: `${Math.min(100, Math.round(score / p.points * 100))}%` }} /></div><strong>{isTeacher ? p.points : score}{isTeacher ? "đ" : `/${p.points}`}</strong></div>
              <div className="nb-problem-bottom"><DifficultyTag level={p.difficulty} /><span className="nb-sub">{isTeacher ? `${p.testCases.length} test` : last ? `${mine.length} lần nộp` : "Chưa nộp"}</span></div>
            </button>
          );
        })}
      </div>
      {canWork && <div className="nb-xm-finish"><button className="nb-btn nb-btn-ghost" onClick={finish}><CheckCircle2 size={15} /> Kết thúc bài thi</button><span className="nb-sub">Chỉ bấm khi đã làm xong; sau đó không thể nộp thêm.</span></div>}
      {active && (
        <ProblemSolverModal
          problem={active} onClose={() => setActive(null)} readOnly={!canWork}
          disabledLabel={isTeacher ? "Chỉ xem trước (GV)" : "Đã hết giờ"}
          alreadySolved={(best.get(active.id) || 0) >= active.points}
          bestScore={best.get(active.id) || 0} attemptCount={mySubs.filter((s) => s.problemId === active.id).length}
          submissionHistory={mySubs} onVerdict={handleVerdict}
          chooseLanguage defaultLanguage={langPref} onLanguageChange={setLangPref}
        />
      )}
      {viewing && (
        <ExamSubmissionViewer title={exam.title} subtitle={`${total}/${maxScore} điểm`} problems={problems} submissions={mySubs} initialProblemId={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/* ---------- Kết quả & bài làm của học sinh (giáo viên) ---------- */
function ExamResults({ exam, students, onExit }) {
  const [problems, setProblems] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [subs, setSubs] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("score");
  const [detail, setDetail] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [list, a, s] = await Promise.all([dbExamGetProblems(exam.id), dbExamFetchAttempts({ examId: exam.id }), dbExamFetchSubmissions({ examId: exam.id })]);
      setProblems(list); setAttempts(a); setSubs(s); setError("");
    } catch (e) { setError("Không tải được kết quả. Hãy thử làm mới."); }
    setRefreshing(false);
  }, [exam.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [load]);

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const rows = useMemo(() => {
    const ids = new Set(exam.assignedTo.length ? exam.assignedTo : students.map((s) => s.id));
    attempts.forEach((a) => ids.add(a.studentId));
    subs.forEach((s) => ids.add(s.studentId));
    return [...ids].map((id) => {
      const student = studentById.get(id);
      if (!student) return null;
      const attempt = attempts.find((a) => a.studentId === id) || null;
      const own = subs.filter((s) => s.studentId === id);
      const best = bestScoreMap(own);
      const phase = attemptPhase(exam, attempt, now);
      const spent = attempt ? Math.min(attemptElapsedMs(attempt, attempt.finishedAt ? new Date(attempt.finishedAt).getTime() : now), examLimitMs(exam, attempt)) : 0;
      return { student, attempt, own, best, phase, total: sumMap(best), spent };
    }).filter(Boolean);
  }, [exam, students, attempts, subs, now, studentById]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi-VN");
    return rows
      .filter((r) => (filter === "all" || r.phase === filter) && (!q || `${r.student.name} ${r.student.username}`.toLocaleLowerCase("vi-VN").includes(q)))
      .sort((a, b) => (sortKey === "name" ? String(a.student.name).localeCompare(String(b.student.name), "vi") : b.total - a.total || String(a.student.name).localeCompare(String(b.student.name), "vi")));
  }, [rows, query, filter, sortKey]);

  const joined = rows.filter((r) => r.phase !== "none");
  const avg = joined.length ? Math.round(joined.reduce((s, r) => s + r.total, 0) / joined.length * 10) / 10 : 0;
  const top = joined.reduce((m, r) => Math.max(m, r.total), 0);
  const maxScore = (problems || []).reduce((s, p) => s + p.points, 0);

  const [extendFor, setExtendFor] = useState(null);
  const [extendMinutes, setExtendMinutes] = useState("15");
  async function extend(row, minutes) {
    const add = Math.round(Number(minutes));
    if (!Number.isFinite(add) || add === 0 || Math.abs(add) > 600) { setError("Số phút cộng thêm không hợp lệ (nhập từ 1 đến 600)."); return; }
    try {
      await dbExamUpdateAttempt(row.attempt.id, { extraMinutes: Math.max(0, row.attempt.extraMinutes + add) });
      setExtendFor(null);
      await load();
    } catch (e) { setError("Chưa gia hạn được, hãy thử lại."); }
  }
  async function reopen(row) {
    try { await dbExamUpdateAttempt(row.attempt.id, { finishedAt: null }); await load(); }
    catch (e) { setError("Chưa mở lại được bài thi, hãy thử lại."); }
  }
  function exportCsv() {
    if (!problems) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Họ tên", "Tài khoản", "Lớp", "Trạng thái", "Bắt đầu", "Thời gian làm (phút)", "Số lần rời màn hình", "Giờ cộng thêm (phút)", ...problems.map((p, i) => `Bài ${i + 1}: ${p.title} (/${p.points})`), `Tổng (/${maxScore})`];
    const lines = [head, ...sortByName(rows.map((r) => r.student)).map((st) => {
      const r = rows.find((x) => x.student.id === st.id);
      return [st.name, st.username, st.className || "", ATTEMPT_PHASE_LABEL[r.phase], r.attempt ? formatSubmissionDate(r.attempt.startedAt) : "", r.attempt ? Math.round(r.spent / 60000) : "", r.attempt ? r.attempt.violations : "", r.attempt ? r.attempt.extraMinutes : "", ...problems.map((p) => r.best.get(p.id) || 0), r.total];
    })].map((line) => line.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `ket-qua-${exam.id}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const phaseTone = { none: "idle", running: "run", finished: "done", timeup: "late" };
  return (
    <div className="nb-xm-results">
      <div className="nb-contest-bar">
        <button className="nb-btn nb-btn-ghost" onClick={onExit}><ChevronLeft size={16} /> Danh sách đề thi</button>
        <div className="nb-xm-bar-title">{exam.title}</div>
        <div className="nb-xm-bar-actions">
          <button className="nb-btn nb-btn-ghost" onClick={load} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "nb-spin" : ""} /> Làm mới</button>
          <button className="nb-btn nb-btn-ghost" onClick={exportCsv} disabled={!problems}><ExternalLink size={15} /> Xuất CSV</button>
        </div>
      </div>
      {error && <div className="nb-login-error" style={{ marginBottom: 10 }}><AlertCircle size={14} /> {error}</div>}
      {!problems ? <p className="nb-sub" style={{ padding: 20 }}>Đang tải kết quả…</p> : (
        <>
          <div className="nb-contest-stats-summary nb-xm-summary">
            <div><strong>{joined.length}/{rows.length}</strong><span>Đã vào thi</span></div>
            <div><strong>{rows.filter((r) => r.phase === "running").length}</strong><span>Đang làm bài</span></div>
            <div><strong>{avg}</strong><span>Điểm trung bình /{maxScore}</span></div>
            <div><strong>{top}</strong><span>Điểm cao nhất</span></div>
          </div>
          <div className="nb-exam-toolbar" style={{ margin: "14px 0" }}>
            <div className="nb-exam-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm học sinh…" /></div>
            <div className="nb-filter-row" style={{ margin: 0 }}>
              {[["all", "Tất cả"], ["running", "Đang làm"], ["finished", "Đã nộp"], ["timeup", "Hết giờ"], ["none", "Chưa vào thi"]].map(([k, l]) => <button key={k} className={`nb-chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
            <div className="nb-filter-row" style={{ margin: 0 }}>
              {[["score", "Theo điểm"], ["name", "Theo tên"]].map(([k, l]) => <button key={k} className={`nb-chip ${sortKey === k ? "active" : ""}`} onClick={() => setSortKey(k)}>{l}</button>)}
            </div>
          </div>
          <div className="nb-contest-stats-table-wrap">
            <table className="nb-contest-stats-table nb-xm-table">
              <thead><tr><th>#</th><th>Học sinh</th><th>Trạng thái</th><th>Thời gian</th><th title="Số lần học sinh rời khỏi màn hình thi (không trừ điểm)">Rời màn hình</th>{problems.map((p, i) => <th key={p.id} title={p.title}>Bài {i + 1}<small>/{p.points}</small></th>)}<th>Tổng<small>/{maxScore}</small></th><th></th></tr></thead>
              <tbody>
                {visible.map((r, index) => (
                  <tr key={r.student.id}>
                    <td>{index + 1}</td>
                    <td><div className="nb-contest-student"><Avatar name={r.student.name} size={28} /><div className="nb-xm-name"><strong>{r.student.name}</strong><small>@{r.student.username}{r.student.className ? ` · ${r.student.className}` : ""}</small></div></div></td>
                    <td><span className={`nb-xm-phase ${phaseTone[r.phase]}`}>{ATTEMPT_PHASE_LABEL[r.phase]}</span></td>
                    <td>{r.attempt ? formatSpan(r.spent) : "—"}{r.attempt?.extraMinutes ? <small className="nb-xm-extra"> (+{r.attempt.extraMinutes}′)</small> : null}</td>
                    <td>{r.attempt ? <span className={`nb-xm-viol ${r.attempt.violations > 0 ? "has" : ""}`} title="Số lần rời màn hình (không trừ điểm)">{r.attempt.violations || 0}{r.attempt.pausedAt && r.phase === "running" ? " · đang vắng" : ""}</span> : "—"}</td>
                    {problems.map((p) => { const sc = r.best.get(p.id); return <td key={p.id}><span className={`nb-xm-cell ${sc == null ? "empty" : sc >= p.points ? "full" : sc > 0 ? "part" : "zero"}`}>{sc == null ? "–" : sc}</span></td>; })}
                    <td><b>{r.total}</b></td>
                    <td className="nb-xm-row-actions">
                      <button className="nb-btn nb-btn-ghost" disabled={r.own.length === 0} onClick={() => setDetail(r)}><Eye size={14} /> Xem bài</button>
                      {r.attempt && <button className="nb-btn nb-btn-ghost" title="Cộng thêm thời gian cho học sinh này" onClick={() => { setExtendFor(r); setExtendMinutes("15"); }}><Clock size={14} /> + Giờ</button>}
                      {r.attempt?.finishedAt && <button className="nb-btn nb-btn-ghost" title="Cho học sinh làm tiếp" onClick={() => reopen(r)}><RefreshCw size={14} /> Làm tiếp</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="nb-exam-empty" style={{ marginTop: 12 }}><Users size={24} /><strong>Không có học sinh phù hợp</strong><span>Đổi bộ lọc hoặc kiểm tra danh sách học sinh được giao đề.</span></div>}
        </>
      )}
      {extendFor && (
        <div className="nb-modal-overlay" onClick={() => setExtendFor(null)} role="dialog" aria-modal="true" aria-label="Cộng thêm giờ">
          <form className="nb-modal nb-xm-extend" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); extend(extendFor, extendMinutes); }}>
            <div className="nb-modal-head"><div><div className="nb-eyebrow">Cộng thêm giờ</div><h3 className="nb-h3">{extendFor.student.name}</h3>
              <p className="nb-sub">Đã được cộng {extendFor.attempt.extraMinutes} phút · Thời gian đề: {exam.duration} phút</p></div>
              <button type="button" className="nb-icon-btn" onClick={() => setExtendFor(null)} aria-label="Đóng"><X size={18} /></button></div>
            <div className="nb-xm-extend-body">
              <div className="nb-xm-extend-quick">{[5, 10, 15, 30, 45, 60].map((m) => <button type="button" key={m} className={`nb-chip ${String(m) === String(extendMinutes) ? "active" : ""}`} onClick={() => setExtendMinutes(String(m))}>+{m} phút</button>)}</div>
              <label className="nb-xm-field"><span>Hoặc nhập số phút (số âm để giảm bớt giờ đã cộng)</span>
                <input className="nb-input" type="number" step="1" min="-600" max="600" value={extendMinutes} onChange={(e) => setExtendMinutes(e.target.value)} autoFocus /></label>
            </div>
            <div className="nb-modal-actions"><button type="button" className="nb-btn nb-btn-ghost" onClick={() => setExtendFor(null)}>Hủy</button><button type="submit" className="nb-btn nb-btn-primary"><Clock size={15} /> Cộng {Number(extendMinutes) || 0} phút</button></div>
          </form>
        </div>
      )}
      {detail && problems && (
        <ExamSubmissionViewer title={detail.student.name} subtitle={`${exam.title} · ${detail.total}/${maxScore} điểm · ${ATTEMPT_PHASE_LABEL[detail.phase]}`} problems={problems} submissions={detail.own} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

/* ---------- Trang Đề thi thử ---------- */
function ExamsView({ exams, examsMissing, isTeacher, currentUser, students, practiceProblems, refreshExams, setExams }) {
  const [mode, setMode] = useState({ type: "list" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [meta, setMeta] = useState({ subs: [], attempts: [] });
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());

  const myExams = useMemo(() => (isTeacher ? exams : exams.filter((e) => examVisibleTo(e, currentUser.id))), [exams, isTeacher, currentUser.id]);

  const loadMeta = useCallback(async () => {
    if (examsMissing || myExams.length === 0) return;
    try {
      const scope = isTeacher ? {} : { studentId: currentUser.id };
      const [subs, attempts] = await Promise.all([dbExamFetchSubmissions(scope), dbExamFetchAttempts(scope)]);
      setMeta({ subs, attempts });
    } catch (e) { /* mạng chập chờn: giữ dữ liệu cũ */ }
  }, [examsMissing, myExams.length, isTeacher, currentUser.id]);
  useEffect(() => {
    if (mode.type !== "list") return undefined;
    loadMeta();
    const t = setInterval(() => { if (!document.hidden) { loadMeta(); setNow(Date.now()); } }, 60000);
    return () => clearInterval(t);
  }, [mode.type, loadMeta]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(t); } return undefined; }, [notice]);

  const liveExam = (id) => exams.find((e) => e.id === id) || null;
  const studentName = (id) => students.find((s) => s.id === id)?.name || id;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi-VN");
    return myExams.filter((e) => (filter === "all" || e.status === filter) && (!q || `${e.title} ${e.date}`.toLocaleLowerCase("vi-VN").includes(q)));
  }, [myExams, query, filter]);
  const stats = {
    total: myExams.length, active: myExams.filter((e) => e.status === "active").length,
    upcoming: myExams.filter((e) => e.status === "upcoming").length, completed: myExams.filter((e) => e.status === "completed").length,
  };

  async function changeStatus(exam, status) {
    try {
      await dbExamSetStatus(exam.id, status);
      setExams((list) => list.map((e) => (e.id === exam.id ? { ...e, status } : e)));
      refreshExams();
    } catch (e) { setNotice("Chưa đổi được trạng thái đề, hãy thử lại."); }
  }
  async function cloneExam(exam) {
    try {
      const problems = await dbExamGetProblems(exam.id);
      await dbExamSave({ ...exam, id: `ex${Date.now()}`, title: `${exam.title} · Bản sao`, status: "draft", date: "Chưa xếp lịch" }, problems, true, currentUser.id);
      await refreshExams();
      setNotice("Đã nhân bản thành bản nháp.");
    } catch (e) { setNotice("Chưa nhân bản được đề, hãy thử lại."); }
  }
  async function deleteExam(exam) {
    const count = meta.subs.filter((s) => s.examId === exam.id).length;
    const warn = count > 0 ? `\n\nĐề này đang có ${count} lượt nộp của học sinh — toàn bộ sẽ bị xóa cùng đề.` : "";
    if (!window.confirm(`Xóa đề thi “${exam.title}”? Thao tác này không thể hoàn tác.${warn}`)) return;
    try {
      await dbExamRemove(exam.id);
      setExams((list) => list.filter((e) => e.id !== exam.id));
      refreshExams();
    } catch (e) { setNotice("Chưa xóa được đề, hãy thử lại."); }
  }

  if (mode.type === "builder") {
    return <ExamBuilder exam={mode.exam} students={students} practiceProblems={practiceProblems} currentUser={currentUser}
      onClose={() => setMode({ type: "list" })} onSaved={async (msg) => { await refreshExams(); setMode({ type: "list" }); setNotice(msg); }} />;
  }
  if (mode.type === "run" && liveExam(mode.examId)) {
    return <ExamRunner exam={liveExam(mode.examId)} currentUser={currentUser} isTeacher={isTeacher || mode.preview} onExit={() => { setMode({ type: "list" }); loadMeta(); }} />;
  }
  if (mode.type === "results" && liveExam(mode.examId)) {
    return <ExamResults exam={liveExam(mode.examId)} students={students} onExit={() => setMode({ type: "list" })} />;
  }

  return (
    <div className="nb-exam-page">
      <div className="nb-exam-hero"><div><div className="nb-eyebrow">Kiểm tra định kỳ · Mô phỏng phòng thi</div><h2 className="nb-exam-title">Đề thi thử</h2>
        <p className="nb-exam-sub">{isTeacher ? "Đề thi có bài riêng, giao cho cả lớp hoặc từng học sinh, theo dõi bài làm theo thời gian thực." : "Làm bài trong thời gian quy định, nộp nhiều lần và lấy điểm cao nhất."}</p></div>
        <div className="nb-exam-hero-icon"><Clock size={28} /><span>Thi thật<br />Tự tin hơn</span></div></div>
      {notice && <div className="nb-xm-toast" role="status">{notice}</div>}
      {examsMissing && <div className="nb-locked-banner"><AlertCircle size={15} /> Chưa tạo bảng dữ liệu đề thi trên Supabase. Hãy chạy file <strong>schema-exams.sql</strong> trong SQL Editor rồi tải lại trang.</div>}
      <div className="nb-exam-stat-grid">
        <div className="nb-exam-stat"><span className="blue"><ListChecks size={17} /></span><div><strong>{stats.total}</strong><small>{isTeacher ? "Tổng số đề" : "Đề được giao"}</small></div></div>
        <div className="nb-exam-stat"><span className="green"><Play size={17} /></span><div><strong>{stats.active}</strong><small>Đang mở</small></div></div>
        <div className="nb-exam-stat"><span className="gold"><Clock size={17} /></span><div><strong>{stats.upcoming}</strong><small>Sắp diễn ra</small></div></div>
        <div className="nb-exam-stat"><span className="ink"><CheckCircle2 size={17} /></span><div><strong>{stats.completed}</strong><small>Đã kết thúc</small></div></div>
      </div>
      {isTeacher && !examsMissing && (
        <div className="nb-exam-create-panel"><div className="nb-exam-manage-head"><div><div className="nb-eyebrow">Khu vực giáo viên</div><h3 className="nb-h3">Quản lý đề thi</h3>
          <p className="nb-sub">Tạo đề với bài riêng, chọn học sinh được giao, mở/đóng đề và xem bài làm.</p></div>
          <button className="nb-btn nb-btn-primary" onClick={() => setMode({ type: "builder", exam: null })}><Plus size={16} /> Tạo đề thi mới</button></div></div>
      )}
      <div className="nb-exam-toolbar"><div className="nb-exam-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm đề thi hoặc ngày thi…" /></div>
        <div className="nb-filter-row" style={{ margin: 0 }}>{[["all", "Tất cả"], ...(isTeacher ? [["draft", "Bản nháp"]] : []), ["active", "Đang mở"], ["upcoming", "Sắp diễn ra"], ["completed", "Đã kết thúc"]].map(([k, l]) => <button key={k} className={`nb-chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}</div></div>
      <div className="nb-exam-list">
        {visible.map((exam) => {
          const sm = EXAM_STATUS_META[exam.status];
          const attempts = meta.attempts.filter((a) => a.examId === exam.id);
          const subs = meta.subs.filter((s) => s.examId === exam.id);
          const target = exam.assignedTo.length || students.length;
          const mine = attempts.find((a) => a.studentId === currentUser.id) || null;
          const phase = attemptPhase(exam, mine, now);
          const myBest = sumMap(bestScoreMap(subs.filter((s) => s.studentId === currentUser.id)));
          const assignedNames = exam.assignedTo.map(studentName).join(", ");
          return (
            <article key={exam.id} className={`nb-exam-card ${sm.tone}`}>
              <div className="nb-exam-card-accent" />
              <div className="nb-exam-card-head"><div><div className="nb-exam-card-kicker"><span className={`nb-pill ${sm.cls}`}>{sm.label}</span><span>{exam.date}</span></div><h3>{exam.title}</h3></div><div className="nb-exam-card-code">{exam.id}</div></div>
              <div className="nb-exam-card-meta">
                <span><Clock size={14} /> {exam.duration} phút</span><span><ListChecks size={14} /> {exam.problemCount} bài</span><span><Award size={14} /> {exam.totalPoints} điểm</span>
                {isTeacher && <span title={assignedNames || "Cả lớp"}><Users size={14} /> {exam.assignedTo.length ? `${exam.assignedTo.length} học sinh được giao` : "Cả lớp"}</span>}
              </div>
              {exam.description && <p className="nb-xm-card-desc">{exam.description}</p>}
              {isTeacher && exam.status !== "draft" && (
                <div className="nb-exam-card-progress"><div className="nb-exam-progress-head"><span>Tình hình làm bài</span><strong>{attempts.length}/{target} đã vào thi · {new Set(subs.map((s) => s.studentId)).size} có bài nộp</strong></div>
                  <div className="nb-exam-progress"><span style={{ width: `${target ? Math.round(attempts.length / target * 100) : 0}%` }} /></div></div>
              )}
              {!isTeacher && exam.status !== "upcoming" && (
                <div className="nb-exam-card-progress"><div className="nb-exam-progress-head"><span>{ATTEMPT_PHASE_LABEL[phase]}</span><strong>{mine ? `${myBest}/${exam.totalPoints} điểm` : "Chưa có điểm"}</strong></div>
                  <div className="nb-exam-progress"><span style={{ width: `${exam.totalPoints ? Math.min(100, Math.round(myBest / exam.totalPoints * 100)) : 0}%` }} /></div></div>
              )}
              <div className="nb-exam-card-actions">
                {!isTeacher && exam.status === "upcoming" && <span className="nb-sub"><Lock size={13} /> Chưa mở, quay lại khi giáo viên mở đề</span>}
                {!isTeacher && exam.status !== "upcoming" && (
                  <button className="nb-btn nb-btn-primary" onClick={() => setMode({ type: "run", examId: exam.id })}>
                    {phase === "running" && exam.status === "active" ? <><Play size={15} /> Tiếp tục làm bài</> : mine ? <><Eye size={15} /> Xem bài làm</> : exam.status === "active" ? <><Play size={15} /> Vào thi</> : <><Eye size={15} /> Xem đề</>}
                  </button>
                )}
                {isTeacher && <>
                  {exam.status !== "draft" && <button className="nb-btn nb-btn-primary" onClick={() => setMode({ type: "results", examId: exam.id })}><TrendingUp size={15} /> Bài làm & kết quả</button>}
                  <button className="nb-btn nb-btn-ghost" onClick={() => setMode({ type: "run", examId: exam.id, preview: true })}><Eye size={15} /> Xem trước</button>
                  <button className="nb-btn nb-btn-ghost" onClick={() => setMode({ type: "builder", exam })}><Pencil size={15} /> Sửa</button>
                  <button className="nb-btn nb-btn-ghost" onClick={() => cloneExam(exam)}><RefreshCw size={15} /> Nhân bản</button>
                  {exam.status === "draft" && <button className="nb-btn nb-btn-ghost" onClick={() => changeStatus(exam, "upcoming")}><Send size={15} /> Công bố</button>}
                  {exam.status === "upcoming" && <button className="nb-btn nb-btn-ghost" onClick={() => changeStatus(exam, "active")}><Play size={15} /> Mở đề</button>}
                  {exam.status === "active" && <button className="nb-btn nb-btn-ghost" onClick={() => changeStatus(exam, "completed")}><CheckCircle2 size={15} /> Đóng đề</button>}
                  {exam.status === "completed" && <button className="nb-btn nb-btn-ghost" onClick={() => changeStatus(exam, "active")}><RefreshCw size={15} /> Mở lại</button>}
                  <button className="nb-icon-btn nb-danger-icon" onClick={() => deleteExam(exam)} title="Xóa đề thi" aria-label="Xóa đề thi"><Trash2 size={15} /></button>
                </>}
              </div>
            </article>
          );
        })}
      </div>
      {visible.length === 0 && !examsMissing && <div className="nb-exam-empty"><Clock size={26} /><strong>{myExams.length === 0 ? (isTeacher ? "Chưa có đề thi nào" : "Chưa có đề thi nào được giao cho em") : "Không tìm thấy đề thi"}</strong><span>{isTeacher && myExams.length === 0 ? "Bấm “Tạo đề thi mới” để bắt đầu." : "Thử đổi bộ lọc hoặc quay lại sau."}</span></div>}
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

/* ====================================================================== */
/*  GIẢI TRÍ: GÕ LỆNH PYTHON                                              */
/* ====================================================================== */
const TYPING_CATEGORIES = [
  { key: "all", label: "Tất cả" },
  { key: "co-ban", label: "Cơ bản" },
  { key: "chuoi", label: "Chuỗi" },
  { key: "list", label: "List" },
  { key: "dict", label: "Dict & Set" },
  { key: "lap", label: "Điều kiện & vòng lặp" },
  { key: "ham", label: "Hàm, module & file" },
  { key: "toan", label: "Toán & số" },
  { key: "thuvien", label: "Thư viện chuẩn" },
  { key: "lop", label: "Lớp & xử lý lỗi" },
  { key: "thuat-toan", label: "Thuật toán" },
];
// Ký hiệu + màu nhấn cho từng chủ đề (hiển thị trên thẻ chủ đề)
const TYPING_TOPIC_STYLE = {
  all: { mark: "Py", color: "#2563eb" }, "co-ban": { mark: "=", color: "#0d9488" }, chuoi: { mark: "Aa", color: "#d97706" },
  list: { mark: "[ ]", color: "#7c3aed" }, dict: { mark: "{ }", color: "#db2777" }, lap: { mark: "for", color: "#059669" },
  ham: { mark: "def", color: "#0284c7" }, toan: { mark: "π", color: "#dc2626" }, thuvien: { mark: "lib", color: "#4f46e5" },
  lop: { mark: "OOP", color: "#c026d3" }, "thuat-toan": { mark: "O(n)", color: "#ea580c" },
};
// Cấp bậc theo tổng điểm tích lũy
const TYPING_LEVELS = [
  { min: 0, name: "Tập sự gõ phím" }, { min: 600, name: "Gõ phím chăm chỉ" }, { min: 2000, name: "Thạo lệnh Python" },
  { min: 5000, name: "Ngón tay thần tốc" }, { min: 10000, name: "Cao thủ Python" }, { min: 20000, name: "Bậc thầy gõ lệnh" },
];
function typingLevel(xp) {
  let idx = 0;
  TYPING_LEVELS.forEach((l, i) => { if (xp >= l.min) idx = i; });
  const cur = TYPING_LEVELS[idx], next = TYPING_LEVELS[idx + 1] || null;
  return { idx, name: cur.name, next, pct: next ? Math.round((xp - cur.min) / (next.min - cur.min) * 100) : 100, toNext: next ? next.min - xp : 0 };
}
const TYPING_SNIPPETS = [
  ["co-ban", 'print("Xin chao")', "In một dòng chữ ra màn hình"],
  ["co-ban", 'name = input("Ten: ")', "Nhập một chuỗi từ bàn phím"],
  ["co-ban", "n = int(input())", "Nhập một số nguyên"],
  ["co-ban", "x = float(input())", "Nhập một số thực"],
  ["co-ban", "a, b = map(int, input().split())", "Nhập hai số nguyên trên cùng một dòng"],
  ["co-ban", "print(a + b)", "In tổng của a và b"],
  ["co-ban", 'print(f"Tong = {a + b}")', "In chuỗi có chèn giá trị biến (f-string)"],
  ["co-ban", "print(a // b, a % b)", "Thương nguyên và số dư của phép chia"],
  ["co-ban", "print(2 ** 10)", "Lũy thừa: 2 mũ 10"],
  ["co-ban", "print(abs(-5))", "Giá trị tuyệt đối"],
  ["co-ban", "print(round(3.14159, 2))", "Làm tròn đến 2 chữ số thập phân"],
  ["co-ban", "print(max(a, b))", "Số lớn hơn trong hai số"],
  ["co-ban", "print(min(a, b, c))", "Số nhỏ nhất trong các số"],
  ["co-ban", "print(type(x))", "Xem kiểu dữ liệu của biến"],
  ["co-ban", "print(divmod(17, 5))", "Trả về cả thương và số dư"],
  ["co-ban", 'print("a", "b", sep="-")', "In nhiều giá trị, ngăn cách bằng dấu '-'"],
  ["co-ban", 'print(n, end=" ")', "In xong không xuống dòng"],
  ["co-ban", "x = int(\"123\") + 1", "Đổi chuỗi sang số rồi cộng 1"],
  ["chuoi", "s = s.upper()", "Chuyển thành chữ HOA"],
  ["chuoi", "s = s.lower()", "Chuyển thành chữ thường"],
  ["chuoi", "s = s.strip()", "Xóa khoảng trắng hai đầu chuỗi"],
  ["chuoi", 'words = s.split(",")', "Tách chuỗi thành danh sách theo dấu phẩy"],
  ["chuoi", 'print(" ".join(words))', "Ghép danh sách thành chuỗi, cách nhau bởi dấu cách"],
  ["chuoi", 's = s.replace("a", "b")', "Thay mọi chữ a bằng b"],
  ["chuoi", "print(s[::-1])", "In chuỗi đảo ngược"],
  ["chuoi", "print(len(s))", "Độ dài chuỗi"],
  ["chuoi", 'print(s.find("x"))', "Vị trí đầu tiên của 'x' (-1 nếu không có)"],
  ["chuoi", 'print(s.count("a"))', "Đếm số lần xuất hiện của 'a'"],
  ["chuoi", 'print(s.startswith("ab"))', "Kiểm tra chuỗi có bắt đầu bằng 'ab'"],
  ["chuoi", "print(s.isdigit())", "Kiểm tra chuỗi chỉ gồm chữ số"],
  ["chuoi", "print(s.title())", "Viết hoa chữ cái đầu mỗi từ"],
  ["chuoi", "print(s[1:4])", "Cắt chuỗi từ vị trí 1 đến 3"],
  ["chuoi", "print(ord(\"a\"), chr(98))", "Mã ASCII của ký tự và ký tự từ mã"],
  ["chuoi", 'print(f"{x:.2f}")', "In số thực với 2 chữ số thập phân"],
  ["chuoi", 'print("ab" * 3)', "Lặp chuỗi 3 lần"],
  ["list", "a = [1, 2, 3]", "Tạo danh sách (list)"],
  ["list", "a.append(4)", "Thêm phần tử vào cuối"],
  ["list", "a.insert(0, 9)", "Chèn 9 vào vị trí đầu tiên"],
  ["list", "a.pop()", "Lấy ra và xóa phần tử cuối"],
  ["list", "a.remove(3)", "Xóa phần tử có giá trị 3 (lần đầu tiên)"],
  ["list", "a.sort(reverse=True)", "Sắp xếp giảm dần ngay trên list"],
  ["list", "b = sorted(a)", "Tạo list mới đã sắp xếp tăng dần"],
  ["list", "a.reverse()", "Đảo ngược list"],
  ["list", "print(a.index(2))", "Vị trí của giá trị 2"],
  ["list", "a.extend([4, 5])", "Nối thêm nhiều phần tử vào cuối"],
  ["list", "print(a[-1])", "Phần tử cuối cùng"],
  ["list", "print(a[1:3])", "Lát cắt từ vị trí 1 đến 2"],
  ["list", "print(sum(a) / len(a))", "Trung bình cộng của list"],
  ["list", "b = [x * x for x in a]", "List comprehension: bình phương từng phần tử"],
  ["list", "b = [x for x in a if x % 2 == 0]", "Lọc ra các số chẵn"],
  ["list", "a = list(map(int, input().split()))", "Nhập một dãy số trên một dòng"],
  ["list", "b = a.copy()", "Sao chép list"],
  ["list", "a = list(range(1, 11))", "Tạo list [1, 2, ..., 10]"],
  ["list", "print(any(a), all(a))", "Có ít nhất một / tất cả phần tử đúng"],
  ["list", "for i, x in enumerate(a):", "Duyệt list kèm chỉ số"],
  ["dict", 'd = {"a": 1, "b": 2}', "Tạo từ điển (dict)"],
  ["dict", 'd["c"] = 3', "Thêm hoặc cập nhật khóa 'c'"],
  ["dict", 'print(d.get("x", 0))', "Lấy giá trị, không có khóa thì trả về 0"],
  ["dict", "for k, v in d.items():", "Duyệt từng cặp khóa - giá trị"],
  ["dict", 'print("a" in d)', "Kiểm tra khóa có tồn tại"],
  ["dict", "print(list(d.keys()))", "Danh sách các khóa"],
  ["dict", "print(list(d.values()))", "Danh sách các giá trị"],
  ["dict", 'del d["a"]', "Xóa khóa 'a'"],
  ["dict", 'd.update({"x": 1})', "Gộp thêm cặp khóa - giá trị"],
  ["dict", "s = set(a)", "Tạo tập hợp, loại bỏ phần tử trùng"],
  ["dict", "s.add(5)", "Thêm phần tử vào tập hợp"],
  ["dict", "s.discard(2)", "Xóa phần tử (không lỗi nếu không có)"],
  ["dict", "print(s1 | s2, s1 & s2)", "Hợp và giao của hai tập hợp"],
  ["dict", "print(len(set(a)))", "Số phần tử khác nhau trong list"],
  ["dict", "d = dict(zip(a, b))", "Ghép hai list thành dict"],
  ["lap", "for i in range(n):", "Lặp i từ 0 đến n-1"],
  ["lap", "for i in range(1, n + 1):", "Lặp i từ 1 đến n"],
  ["lap", "for i in range(n, 0, -1):", "Lặp ngược từ n về 1"],
  ["lap", "while n > 0:", "Lặp khi n còn lớn hơn 0"],
  ["lap", "if x % 2 == 0:", "Kiểm tra x là số chẵn"],
  ["lap", "elif x > 0:", "Nhánh điều kiện tiếp theo"],
  ["lap", "else:", "Nhánh còn lại"],
  ["lap", "for x in a:", "Duyệt từng phần tử của list"],
  ["lap", "for x, y in zip(a, b):", "Duyệt song song hai list"],
  ["lap", "if x in a:", "Kiểm tra x có trong list"],
  ["lap", "if not a:", "Kiểm tra list rỗng"],
  ["lap", "while True:", "Vòng lặp vô hạn (dùng break để thoát)"],
  ["lap", "if a > b and b > c:", "Hai điều kiện cùng đúng"],
  ["lap", "break", "Thoát khỏi vòng lặp"],
  ["lap", "continue", "Bỏ qua phần còn lại, sang vòng kế tiếp"],
  ["ham", "def tong(a, b):", "Khai báo hàm có hai tham số"],
  ["ham", "return a + b", "Trả về kết quả của hàm"],
  ["ham", "f = lambda x: x * 2", "Hàm ẩn danh (lambda)"],
  ["ham", "import math", "Nạp thư viện toán học"],
  ["ham", "print(math.sqrt(16))", "Căn bậc hai"],
  ["ham", "print(math.gcd(12, 18))", "Ước chung lớn nhất"],
  ["ham", "print(math.floor(2.7), math.ceil(2.1))", "Làm tròn xuống / làm tròn lên"],
  ["ham", "from math import pi", "Chỉ nạp số pi từ math"],
  ["ham", "import sys", "Nạp thư viện hệ thống"],
  ["ham", "input = sys.stdin.readline", "Đọc nhập nhanh hơn trong bài thi"],
  ["ham", "try:", "Bắt đầu khối thử chạy"],
  ["ham", "except ValueError:", "Bắt lỗi khi đổi kiểu sai"],
  ["ham", 'with open("a.txt") as f:', "Mở file an toàn, tự đóng khi xong"],
  ["ham", "data = f.read()", "Đọc toàn bộ nội dung file"],
  ["ham", "class SinhVien:", "Khai báo lớp (class)"],
  ["ham", "def __init__(self, ten):", "Hàm khởi tạo của lớp"],
  ["ham", "self.ten = ten", "Lưu thuộc tính cho đối tượng"],
  // ---- Mở rộng: Toán & số, Thư viện chuẩn, Lớp & lỗi, Thuật toán ----
  ["toan", "math.sqrt(16)", "Căn bậc hai"],
  ["toan", "math.floor(3.7)", "Làm tròn xuống số nguyên"],
  ["toan", "math.ceil(3.2)", "Làm tròn lên số nguyên"],
  ["toan", "math.pi", "Hằng số pi"],
  ["toan", "math.gcd(12, 18)", "Ước chung lớn nhất"],
  ["toan", "math.lcm(4, 6)", "Bội chung nhỏ nhất"],
  ["toan", "math.factorial(5)", "Giai thừa của 5"],
  ["toan", "2 ** 10", "Lũy thừa: 2 mũ 10"],
  ["toan", "pow(2, 10, 1000)", "Lũy thừa 2^10 lấy dư cho 1000"],
  ["toan", "abs(-7)", "Giá trị tuyệt đối"],
  ["toan", "round(3.14159, 2)", "Làm tròn đến 2 chữ số thập phân"],
  ["toan", "q, r = divmod(17, 5)", "Lấy thương và số dư cùng lúc"],
  ["toan", "if n % 2 == 0:", "Kiểm tra n là số chẵn"],
  ["toan", "if n % 2 == 1:", "Kiểm tra n là số lẻ"],
  ["toan", "last = n % 10", "Lấy chữ số cuối của n"],
  ["toan", "n //= 10", "Bỏ chữ số cuối của n"],
  ["toan", "s = sum(int(c) for c in str(n))", "Tính tổng các chữ số của n"],
  ["toan", "bin(10)", "Đổi sang nhị phân"],
  ["toan", "int(\"1010\", 2)", "Đổi số nhị phân sang thập phân"],
  ["toan", "hex(255)", "Đổi sang hệ thập lục phân"],
  ["toan", "MOD = 10 ** 9 + 7", "Hằng số modulo quen thuộc"],
  ["toan", "ans = a * b % MOD", "Nhân rồi lấy dư"],
  ["toan", "max(a, b, c)", "Số lớn nhất trong ba số"],
  ["toan", "min(a, b, c)", "Số nhỏ nhất trong ba số"],
  ["toan", "r = math.isqrt(n)", "Căn bậc hai nguyên của n"],
  ["toan", "if r * r == n:", "Kiểm tra n có phải số chính phương"],
  ["toan", "math.hypot(3, 4)", "Độ dài cạnh huyền"],
  ["toan", "math.sin(math.pi / 2)", "Sin của góc 90 độ"],
  ["toan", "math.log(100, 10)", "Logarit cơ số 10 của 100"],
  ["toan", "math.log2(8)", "Logarit cơ số 2"],
  ["toan", "math.inf", "Giá trị vô cực"],
  ["toan", "INF = float(\"inf\")", "Đặt giá trị vô cực để so sánh"],
  ["toan", "avg = sum(a) / len(a)", "Trung bình cộng của list"],
  ["toan", "print(f\"{n:05d}\")", "In số nguyên, đệm số 0 cho đủ 5 chữ số"],
  ["toan", "print(f\"{n:,}\")", "In số có dấu phẩy ngăn cách hàng nghìn"],
  ["toan", "total += i * i", "Cộng dồn bình phương"],
  ["toan", "isinstance(x, int)", "Kiểm tra x có phải số nguyên"],
  ["toan", "if a <= x < b:", "So sánh dây chuyền: x nằm trong [a, b)"],
  ["toan", "x = 1e9", "Số thực viết dạng khoa học"],
  ["toan", "int(3.99)", "Bỏ phần thập phân, được 3"],
  ["toan", "float(5) / 2", "Chia số thực"],
  ["toan", "-7 // 2", "Chia nguyên làm tròn xuống: -4"],
  ["toan", "n = abs(n)", "Lấy trị tuyệt đối rồi gán lại"],
  ["toan", "cnt = 0", "Khởi tạo biến đếm"],
  ["toan", "total = 0", "Khởi tạo biến tổng"],
  ["toan", "a, b = b, a", "Hoán đổi giá trị hai biến"],
  ["toan", "x = x * x - 1", "Cập nhật giá trị bằng biểu thức"],
  ["toan", "print(round(x))", "Làm tròn số rồi in ra"],
  ["thuvien", "import random", "Nạp thư viện số ngẫu nhiên"],
  ["thuvien", "random.randint(1, 100)", "Số nguyên ngẫu nhiên từ 1 đến 100"],
  ["thuvien", "random.choice(a)", "Chọn ngẫu nhiên một phần tử"],
  ["thuvien", "random.shuffle(a)", "Xáo trộn list tại chỗ"],
  ["thuvien", "random.random()", "Số thực ngẫu nhiên từ 0 đến 1"],
  ["thuvien", "random.sample(a, 3)", "Chọn 3 phần tử khác nhau"],
  ["thuvien", "random.seed(42)", "Cố định hạt giống ngẫu nhiên"],
  ["thuvien", "from collections import Counter", "Nạp bộ đếm tần suất"],
  ["thuvien", "cnt = Counter(s)", "Đếm số lần xuất hiện mỗi ký tự"],
  ["thuvien", "cnt.most_common(3)", "Ba phần tử xuất hiện nhiều nhất"],
  ["thuvien", "from collections import deque", "Nạp hàng đợi hai đầu"],
  ["thuvien", "q = deque()", "Tạo hàng đợi rỗng"],
  ["thuvien", "q.popleft()", "Lấy phần tử ở đầu hàng đợi"],
  ["thuvien", "q.appendleft(x)", "Thêm phần tử vào đầu hàng đợi"],
  ["thuvien", "from collections import defaultdict", "Nạp dict có giá trị mặc định"],
  ["thuvien", "d = defaultdict(int)", "Dict mặc định giá trị 0"],
  ["thuvien", "d = defaultdict(list)", "Dict mặc định là list rỗng"],
  ["thuvien", "import itertools", "Nạp thư viện lặp nâng cao"],
  ["thuvien", "itertools.permutations(a)", "Mọi hoán vị của a"],
  ["thuvien", "itertools.combinations(a, 2)", "Mọi tổ hợp chập 2"],
  ["thuvien", "itertools.product(a, b)", "Tích Descartes của hai tập"],
  ["thuvien", "from itertools import accumulate", "Nạp hàm cộng dồn"],
  ["thuvien", "pre = list(accumulate(a))", "Mảng tổng cộng dồn"],
  ["thuvien", "import heapq", "Nạp hàng đợi ưu tiên"],
  ["thuvien", "heapq.heappush(h, x)", "Đẩy x vào heap"],
  ["thuvien", "heapq.heappop(h)", "Lấy phần tử nhỏ nhất khỏi heap"],
  ["thuvien", "heapq.heapify(a)", "Biến list thành heap"],
  ["thuvien", "import bisect", "Nạp tìm kiếm nhị phân"],
  ["thuvien", "bisect.bisect_left(a, x)", "Vị trí chèn x bên trái trong list đã sắp xếp"],
  ["thuvien", "bisect.bisect_right(a, x)", "Vị trí chèn x bên phải trong list đã sắp xếp"],
  ["thuvien", "bisect.insort(a, x)", "Chèn x giữ nguyên thứ tự sắp xếp"],
  ["thuvien", "data = sys.stdin.read().split()", "Đọc toàn bộ input rồi tách từ"],
  ["thuvien", "sys.setrecursionlimit(10 ** 6)", "Tăng giới hạn đệ quy"],
  ["thuvien", "sys.exit()", "Thoát chương trình ngay"],
  ["thuvien", "sys.stdout.write(\"ok\")", "Ghi thẳng ra đầu ra chuẩn"],
  ["thuvien", "import time", "Nạp thư viện thời gian"],
  ["thuvien", "start = time.time()", "Lấy mốc thời gian hiện tại"],
  ["thuvien", "time.sleep(1)", "Tạm dừng 1 giây"],
  ["thuvien", "import datetime", "Nạp thư viện ngày giờ"],
  ["thuvien", "datetime.date.today()", "Ngày hôm nay"],
  ["thuvien", "import os", "Nạp thư viện hệ điều hành"],
  ["thuvien", "os.path.exists(\"a.txt\")", "Kiểm tra file có tồn tại"],
  ["thuvien", "import json", "Nạp thư viện JSON"],
  ["thuvien", "json.dumps(d)", "Đổi dict thành chuỗi JSON"],
  ["thuvien", "json.loads(s)", "Đổi chuỗi JSON thành dict"],
  ["thuvien", "from functools import lru_cache", "Nạp bộ nhớ đệm cho hàm"],
  ["thuvien", "@lru_cache(maxsize=None)", "Ghi nhớ kết quả hàm để chạy nhanh hơn"],
  ["thuvien", "import re", "Nạp thư viện biểu thức chính quy"],
  ["thuvien", "re.findall(r\"\\d+\", s)", "Tìm mọi số trong chuỗi"],
  ["thuvien", "import string", "Nạp hằng số chuỗi"],
  ["thuvien", "string.ascii_lowercase", "Bảng chữ cái thường a-z"],
  ["thuvien", "from fractions import Fraction", "Nạp kiểu phân số"],
  ["thuvien", "copy.deepcopy(a)", "Sao chép sâu một list lồng nhau"],
  ["lop", "class Animal:", "Khai báo lớp Animal"],
  ["lop", "def __init__(self, name):", "Hàm khởi tạo nhận tên"],
  ["lop", "self.name = name", "Lưu tên vào đối tượng"],
  ["lop", "def speak(self):", "Phương thức của đối tượng"],
  ["lop", "return self.name", "Trả về thuộc tính của đối tượng"],
  ["lop", "class Dog(Animal):", "Lớp Dog kế thừa từ Animal"],
  ["lop", "super().__init__(name)", "Gọi hàm khởi tạo của lớp cha"],
  ["lop", "def __str__(self):", "Cách in đối tượng bằng print()"],
  ["lop", "return f\"{self.name}\"", "Trả về chuỗi mô tả đối tượng"],
  ["lop", "def __repr__(self):", "Cách hiển thị đối tượng khi debug"],
  ["lop", "def __len__(self):", "Cho phép dùng len() với đối tượng"],
  ["lop", "def __eq__(self, other):", "Định nghĩa phép so sánh =="],
  ["lop", "def __lt__(self, other):", "Định nghĩa phép so sánh <"],
  ["lop", "def __add__(self, other):", "Định nghĩa phép cộng +"],
  ["lop", "@staticmethod", "Phương thức tĩnh, không cần self"],
  ["lop", "@classmethod", "Phương thức của lớp, nhận cls"],
  ["lop", "@property", "Biến phương thức thành thuộc tính"],
  ["lop", "def area(self):", "Phương thức tính diện tích"],
  ["lop", "obj = Animal(\"Mimi\")", "Tạo một đối tượng"],
  ["lop", "obj.speak()", "Gọi phương thức của đối tượng"],
  ["lop", "isinstance(obj, Animal)", "Kiểm tra đối tượng thuộc lớp nào"],
  ["lop", "hasattr(obj, \"name\")", "Kiểm tra đối tượng có thuộc tính"],
  ["lop", "getattr(obj, \"name\")", "Lấy thuộc tính theo tên"],
  ["lop", "setattr(obj, \"age\", 3)", "Gán thuộc tính theo tên"],
  ["lop", "class Stack:", "Khai báo lớp ngăn xếp"],
  ["lop", "self.items = []", "Danh sách bên trong đối tượng"],
  ["lop", "self.items.append(x)", "Đẩy phần tử vào ngăn xếp"],
  ["lop", "return self.items.pop()", "Lấy phần tử trên cùng"],
  ["lop", "return len(self.items) == 0", "Kiểm tra ngăn xếp rỗng"],
  ["lop", "raise ValueError(\"Sai gia tri\")", "Chủ động báo lỗi giá trị"],
  ["lop", "raise Exception(\"Loi\")", "Ném một ngoại lệ"],
  ["lop", "except Exception as e:", "Bắt mọi lỗi và lưu vào e"],
  ["lop", "except ZeroDivisionError:", "Bắt lỗi chia cho 0"],
  ["lop", "except (ValueError, TypeError):", "Bắt nhiều loại lỗi cùng lúc"],
  ["lop", "finally:", "Khối luôn chạy dù có lỗi hay không"],
  ["lop", "assert n > 0", "Khẳng định điều kiện, sai sẽ báo lỗi"],
  ["lop", "print(e)", "In nội dung lỗi"],
  ["lop", "class MyError(Exception):", "Tự định nghĩa loại lỗi"],
  ["lop", "pass", "Câu lệnh rỗng, chưa làm gì"],
  ["lop", "from dataclasses import dataclass", "Nạp lớp dữ liệu gọn"],
  ["lop", "@dataclass", "Tự sinh hàm khởi tạo cho lớp"],
  ["lop", "def __getitem__(self, i):", "Cho phép truy cập obj[i]"],
  ["lop", "def __iter__(self):", "Cho phép duyệt đối tượng bằng for"],
  ["lop", "yield i", "Trả về từng giá trị (generator)"],
  ["lop", "def __enter__(self):", "Hỗ trợ khối with"],
  ["lop", "type(obj).__name__", "Lấy tên kiểu của đối tượng"],
  ["lop", "del obj", "Xóa biến đối tượng"],
  ["lop", "self.x, self.y = x, y", "Gán hai thuộc tính một dòng"],
  ["lop", "print(Animal.__name__)", "In tên của lớp"],
  ["lop", "obj.age += 1", "Tăng thuộc tính của đối tượng"],
  ["thuat-toan", "def gcd(a, b):", "Hàm tìm ước chung lớn nhất"],
  ["thuat-toan", "while b:", "Lặp đến khi b bằng 0"],
  ["thuat-toan", "a, b = b, a % b", "Bước lặp của thuật toán Euclid"],
  ["thuat-toan", "return a", "Trả về kết quả a"],
  ["thuat-toan", "def is_prime(n):", "Hàm kiểm tra số nguyên tố"],
  ["thuat-toan", "if n < 2:", "Số nhỏ hơn 2 không phải số nguyên tố"],
  ["thuat-toan", "return False", "Trả về sai"],
  ["thuat-toan", "for i in range(2, int(n ** 0.5) + 1):", "Duyệt ước đến căn bậc hai của n"],
  ["thuat-toan", "if n % i == 0:", "Kiểm tra i có là ước của n"],
  ["thuat-toan", "return True", "Trả về đúng"],
  ["thuat-toan", "sieve = [True] * (n + 1)", "Mảng sàng số nguyên tố"],
  ["thuat-toan", "sieve[0] = sieve[1] = False", "0 và 1 không phải số nguyên tố"],
  ["thuat-toan", "for j in range(i * i, n + 1, i):", "Duyệt các bội của i"],
  ["thuat-toan", "sieve[j] = False", "Loại bỏ bội số"],
  ["thuat-toan", "def fib(n):", "Hàm tính số Fibonacci"],
  ["thuat-toan", "a, b = 0, 1", "Hai số Fibonacci đầu tiên"],
  ["thuat-toan", "a, b = b, a + b", "Sinh số Fibonacci tiếp theo"],
  ["thuat-toan", "def fact(n):", "Hàm tính giai thừa"],
  ["thuat-toan", "return n * fact(n - 1)", "Gọi đệ quy tính giai thừa"],
  ["thuat-toan", "if n <= 1:", "Điều kiện dừng của đệ quy"],
  ["thuat-toan", "return 1", "Trả về 1"],
  ["thuat-toan", "def binary_search(a, x):", "Hàm tìm kiếm nhị phân"],
  ["thuat-toan", "lo, hi = 0, len(a) - 1", "Khoảng tìm kiếm ban đầu"],
  ["thuat-toan", "mid = (lo + hi) // 2", "Vị trí giữa khoảng"],
  ["thuat-toan", "if a[mid] == x:", "Tìm thấy phần tử ở giữa"],
  ["thuat-toan", "lo = mid + 1", "Thu hẹp sang nửa phải"],
  ["thuat-toan", "hi = mid - 1", "Thu hẹp sang nửa trái"],
  ["thuat-toan", "a.sort(key=lambda x: x[1])", "Sắp xếp theo phần tử thứ hai"],
  ["thuat-toan", "for i in range(n - 1):", "Vòng ngoài của sắp xếp nổi bọt"],
  ["thuat-toan", "for j in range(n - 1 - i):", "Vòng trong của sắp xếp nổi bọt"],
  ["thuat-toan", "if a[j] > a[j + 1]:", "Hai phần tử kề nhau sai thứ tự"],
  ["thuat-toan", "a[j], a[j + 1] = a[j + 1], a[j]", "Đổi chỗ hai phần tử kề nhau"],
  ["thuat-toan", "dp = [0] * (n + 1)", "Mảng quy hoạch động"],
  ["thuat-toan", "dp[i] = dp[i - 1] + dp[i - 2]", "Công thức truy hồi kiểu Fibonacci"],
  ["thuat-toan", "dp = [[0] * m for _ in range(n)]", "Bảng quy hoạch động hai chiều"],
  ["thuat-toan", "prefix = [0] * (n + 1)", "Mảng tổng tiền tố"],
  ["thuat-toan", "prefix[i] = prefix[i - 1] + a[i - 1]", "Tính tổng tiền tố"],
  ["thuat-toan", "s = prefix[r] - prefix[l - 1]", "Tổng đoạn từ l đến r"],
  ["thuat-toan", "visited = [False] * n", "Đánh dấu đỉnh đã thăm"],
  ["thuat-toan", "graph = [[] for _ in range(n)]", "Danh sách kề của đồ thị"],
  ["thuat-toan", "graph[u].append(v)", "Thêm cạnh từ u đến v"],
  ["thuat-toan", "def dfs(u):", "Hàm duyệt đồ thị theo chiều sâu"],
  ["thuat-toan", "visited[u] = True", "Đánh dấu đã thăm đỉnh u"],
  ["thuat-toan", "for v in graph[u]:", "Duyệt các đỉnh kề với u"],
  ["thuat-toan", "if not visited[v]:", "Chỉ đi tiếp nếu chưa thăm"],
  ["thuat-toan", "dfs(v)", "Đệ quy sang đỉnh kề"],
  ["thuat-toan", "q = deque([start])", "Hàng đợi BFS xuất phát từ start"],
  ["thuat-toan", "dist = [-1] * n", "Khoảng cách chưa biết"],
  ["thuat-toan", "if s == s[::-1]:", "Kiểm tra chuỗi đối xứng"],
  ["thuat-toan", "while lo < hi:", "Hai con trỏ chạy vào giữa"],
  ["thuat-toan", "best = max(best, cur)", "Cập nhật giá trị lớn nhất"],
  ["thuat-toan", "cur = max(a[i], cur + a[i])", "Dãy con liên tiếp có tổng lớn nhất"],
  ["thuat-toan", "return dp[n]", "Trả về đáp án của bài quy hoạch động"],
].map(([cat, code, hint]) => ({ cat, code, hint }));

const TYPING_MODES = {
  timed: { label: "Thử thách 60 giây", desc: "Gõ càng nhiều lệnh đúng càng tốt trước khi hết giờ.", seconds: 60 },
  free: { label: "Luyện 15 lệnh", desc: "Không giới hạn thời gian. Gõ chính xác 15 lệnh liên tiếp.", count: 15 },
  review: { label: "Ôn lệnh chưa thuộc", desc: "Chỉ gồm các lệnh em chưa gõ đúng hoàn toàn lần nào. Gõ đúng một lần là tính là đã thuộc.", count: 15 },
};

function shuffleList(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function typingTitle(wpm) {
  if (wpm >= 45) return "Siêu tốc độ";
  if (wpm >= 30) return "Ngón tay thần tốc";
  if (wpm >= 15) return "Gõ chăm chỉ";
  return "Tập sự gõ phím";
}

const PY_KEYWORDS = new Set("def return for in while if elif else import from as with try except class lambda not and or break continue pass True False None is".split(" "));
const PY_BUILTINS = new Set("print input int float str len range map list set dict sum min max abs round sorted open type zip enumerate any all chr ord divmod tuple bool pow reversed".split(" "));
function pyTokenClasses(code) {
  const cls = new Array(code.length).fill("p");
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)/g;
  let m;
  while ((m = re.exec(code))) {
    let c = "p";
    const end = m.index + m[0].length;
    if (m[1]) c = "s";
    else if (m[2]) c = "n";
    else if (m[3] === "f" && /["']/.test(code[end] || "")) c = "s";
    else if (PY_KEYWORDS.has(m[3])) c = "k";
    else if (PY_BUILTINS.has(m[3])) c = "b";
    else if (code[end] === "(") c = "f";
    for (let i = m.index; i < end; i += 1) cls[i] = c;
  }
  return cls;
}
function ColoredCode({ code }) {
  const cls = useMemo(() => pyTokenClasses(code), [code]);
  return <code className="nb-tg-colored">{[...code].map((ch, i) => <span key={i} className={`t-${cls[i]}`}>{ch}</span>)}</code>;
}

/* Bàn phím ảo: chỉ ra phím kế tiếp và ngón tay nên dùng */
const TG_FINGERS = [
  { fingers: [0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0, 0], left: 5, keys: [["`", "~"], ["1", "!"], ["2", "@"], ["3", "#"], ["4", "$"], ["5", "%"], ["6", "^"], ["7", "&"], ["8", "*"], ["9", "("], ["0", ")"], ["-", "_"], ["=", "+"]] },
  { fingers: [0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0, 0, 0], left: 4, keys: "qwertyuiop".split("").map((c) => [c, c.toUpperCase()]).concat([["[", "{"], ["]", "}"], ["\\", "|"]]) },
  { fingers: [0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0], left: 4, keys: "asdfghjkl".split("").map((c) => [c, c.toUpperCase()]).concat([[";", ":"], ["'", "\""]]) },
  { fingers: [0, 1, 2, 3, 3, 3, 3, 2, 1, 0], left: 4, keys: "zxcvbnm".split("").map((c) => [c, c.toUpperCase()]).concat([[",", "<"], [".", ">"], ["/", "?"]]) },
];
const TG_ROWS = TG_FINGERS.map((row, r) => row.keys.map(([base, shift], c) => ({
  id: `${r}-${c}`, base, shift, finger: row.fingers[c], hand: c <= row.left ? "L" : "R", letter: /[a-z]/.test(base),
})));
const TG_KEY_BY_CHAR = (() => {
  const map = { " ": { id: "space", shift: null } };
  TG_ROWS.flat().forEach((k) => {
    map[k.base] = { id: k.id, shift: null };
    if (k.shift !== k.base) map[k.shift] = { id: k.id, shift: k.hand === "L" ? "R" : "L" };
  });
  return map;
})();

function TypingKeyboard({ nextChar, press }) {
  const target = nextChar ? TG_KEY_BY_CHAR[nextChar] : null;
  return (
    <div className="nb-tg-kb" aria-hidden="true">
      {TG_ROWS.map((row, r) => (
        <div className="nb-tg-kb-row" key={r} style={{ paddingLeft: r === 1 ? 14 : r === 2 ? 26 : r === 3 ? 0 : 0 }}>
          {r === 3 && <div className={`nb-tg-key wide shift ${target?.shift === "L" ? "target" : ""}`}>Shift</div>}
          {row.map((k) => (
            <div key={k.id} className={`nb-tg-key f${k.finger} ${target?.id === k.id ? "target" : ""} ${press?.id === k.id ? (press.bad ? "bad" : "down") : ""}`}>
              {!k.letter && k.shift !== k.base && <small>{k.shift}</small>}
              <span>{k.letter ? k.shift : k.base}</span>
            </div>
          ))}
          {r === 3 && <div className={`nb-tg-key wide shift ${target?.shift === "R" ? "target" : ""}`}>Shift</div>}
        </div>
      ))}
      <div className="nb-tg-kb-row"><div className={`nb-tg-key space ${target?.id === "space" ? "target" : ""} ${press?.id === "space" ? (press.bad ? "bad" : "down") : ""}`}>Dấu cách</div></div>
      <div className="nb-tg-kb-legend"><span><i className="f0" />Út</span><span><i className="f1" />Áp út</span><span><i className="f2" />Giữa</span><span><i className="f3" />Trỏ</span><span><i className="f4" />Cái</span></div>
    </div>
  );
}

/* Ví dụ tự gõ ở màn hình chọn chủ đề */
function TypingDemo({ snippets }) {
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const snippet = snippets[i % Math.max(1, snippets.length)] || TYPING_SNIPPETS[0];
  useEffect(() => { setI(0); setN(0); }, [snippets]);
  useEffect(() => {
    if (reduced) return undefined;
    const done = n >= snippet.code.length;
    const timer = setTimeout(() => { if (done) { setI((v) => v + 1); setN(0); } else setN((v) => v + 1); }, done ? 1500 : 75 + Math.random() * 60);
    return () => clearTimeout(timer);
  }, [n, snippet, reduced]);
  const cls = useMemo(() => pyTokenClasses(snippet.code), [snippet.code]);
  const shown = reduced ? snippet.code.length : n;
  return (
    <div className="nb-tg-editor demo">
      <div className="nb-tg-tab"><Code2 size={13} /> vi_du.py</div>
      <div className="nb-tg-line"><span className="nb-tg-gutter">1</span>
        <code>{[...snippet.code].map((ch, k) => <span key={k} className={k < shown ? `t-${cls[k]}` : "t-dim"}>{ch}</span>)}{!reduced && <i className="nb-tg-caret" />}</code>
      </div>
      <div className="nb-tg-demo-hint">{snippet.hint}</div>
    </div>
  );
}

function TypingGameView({ currentUser }) {
  const [phase, setPhase] = useState("menu");
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState("timed");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState(null);
  const [press, setPress] = useState(null);
  const [gain, setGain] = useState(null);
  const [, bump] = useReducer((x) => x + 1, 0);
  const inputRef = useRef(null);
  const pressTimer = useRef(null);
  const game = useRef(null);
  const bestKey = (m) => `typing-best:${currentUser.id}:${m}`;
  const [bests, setBests] = useState(() => ({ timed: lsGet(bestKey("timed")), free: lsGet(bestKey("free")), review: lsGet(bestKey("review")) }));
  const profileKey = `typing-profile:${currentUser.id}`;
  const masteredKey = `typing-mastered:${currentUser.id}`;
  const [profile, setProfile] = useState(() => lsGet(profileKey) || { xp: 0, games: 0, bestWpm: 0 });
  const [mastered, setMastered] = useState(() => new Set(Array.isArray(lsGet(masteredKey)) ? lsGet(masteredKey) : []));
  const [countdown, setCountdown] = useState(0);

  const categoryPool = useMemo(() => TYPING_SNIPPETS.filter((s) => category === "all" || s.cat === category), [category]);
  const unmasteredPool = useMemo(() => categoryPool.filter((s) => !mastered.has(s.code)), [categoryPool, mastered]);
  const pool = mode === "review" && unmasteredPool.length > 0 ? unmasteredPool : categoryPool;
  const demoPool = useMemo(() => shuffleList(categoryPool).slice(0, 6), [categoryPool]);
  useEffect(() => () => clearTimeout(pressTimer.current), []);

  function newGame() {
    const need = mode === "timed" ? 300 : TYPING_MODES[mode].count;
    let queue = [];
    while (queue.length < need) queue = queue.concat(shuffleList(pool));
    queue = queue.slice(0, need);
    game.current = { queue, idx: 0, score: 0, done: 0, chars: 0, keys: 0, errors: 0, combo: 0, bestCombo: 0, missed: [], learned: new Set(), snipErr: false, startedAt: Date.now(), flash: "" };
    setTyped(""); setResult(null); setGain(null);
    setCountdown(3); setPhase("ready");
  }
  // Đếm ngược 3-2-1 rồi mới bắt đầu tính giờ
  useEffect(() => {
    if (phase !== "ready") return undefined;
    if (countdown <= 0) {
      if (game.current) game.current.startedAt = Date.now();
      setPhase("play");
      setTimeout(() => inputRef.current?.focus(), 30);
      return undefined;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, countdown]);
  function finish() {
    const g = game.current;
    if (!g || g.finished) return;
    g.finished = true;
    const elapsed = Math.min(Date.now() - g.startedAt, mode === "timed" ? TYPING_MODES.timed.seconds * 1000 : Infinity);
    const minutes = Math.max(elapsed / 60000, 1 / 600);
    const wpm = Math.round(g.chars / 5 / minutes);
    const accuracy = g.keys ? Math.round(((g.keys - g.errors) / g.keys) * 100) : 100;
    const summary = { score: g.score, wpm, accuracy, done: g.done, bestCombo: g.bestCombo, seconds: Math.round(elapsed / 1000), missed: g.missed, mode, date: new Date().toISOString() };
    const previous = lsGet(bestKey(mode));
    const isRecord = g.score > 0 && (!previous || g.score > previous.score);
    if (isRecord) { const rec = { score: g.score, wpm, accuracy, date: summary.date }; lsSet(bestKey(mode), rec); setBests((b) => ({ ...b, [mode]: rec })); }
    // Tích lũy điểm kinh nghiệm, cấp bậc và các lệnh đã thuộc
    const oldProfile = lsGet(profileKey) || { xp: 0, games: 0, bestWpm: 0 };
    const newProfile = { xp: oldProfile.xp + g.score, games: oldProfile.games + 1, bestWpm: Math.max(oldProfile.bestWpm || 0, wpm) };
    lsSet(profileKey, newProfile); setProfile(newProfile);
    const levelUp = typingLevel(newProfile.xp).idx > typingLevel(oldProfile.xp).idx ? typingLevel(newProfile.xp).name : "";
    const known = new Set(Array.isArray(lsGet(masteredKey)) ? lsGet(masteredKey) : []);
    const before = known.size;
    g.learned.forEach((code) => known.add(code));
    if (known.size !== before) { lsSet(masteredKey, [...known]); setMastered(known); }
    const stars = g.done >= 5 ? (accuracy >= 97 && (mode !== "timed" || wpm >= 25) ? 3 : accuracy >= 90 ? 2 : 1) : (g.done > 0 ? 1 : 0);
    setResult({ ...summary, isRecord, previous, xpGain: g.score, levelUp, newlyLearned: known.size - before, stars });
    setPhase("result");
  }
  useEffect(() => {
    if (phase !== "play") return undefined;
    const timer = setInterval(() => {
      const g = game.current;
      if (!g) return;
      if (mode === "timed" && Date.now() - g.startedAt >= TYPING_MODES.timed.seconds * 1000) finish();
      else bump();
    }, 200);
    return () => clearInterval(timer);
  }, [phase, mode]);

  function nextSnippet() {
    const g = game.current;
    g.idx += 1;
    setTyped("");
    if (mode !== "timed" && g.idx >= TYPING_MODES[mode].count) finish();
  }
  function onKeyDown(event) {
    if (event.key === "Escape") { quit(); return; }
    if (event.key.length !== 1) return;
    const info = TG_KEY_BY_CHAR[event.key];
    const g = game.current;
    if (!info || !g) return;
    const expected = g.queue[g.idx]?.code[typed.length];
    setPress({ id: info.id, bad: expected !== event.key });
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPress(null), 150);
  }
  function onChange(event) {
    const g = game.current;
    if (!g || g.finished) return;
    const snippet = g.queue[g.idx];
    const value = event.target.value;
    if (value.length > snippet.code.length) return;
    for (let i = typed.length; i < value.length; i += 1) {
      g.keys += 1;
      if (value[i] !== snippet.code[i]) {
        g.errors += 1; g.combo = 0; g.flash = "bad"; g.snipErr = true;
        if (!g.missed.some((m) => m.code === snippet.code)) g.missed.push(snippet);
      }
    }
    if (value === snippet.code) {
      const points = Math.round(snippet.code.length * 10 * (1 + Math.min(g.combo, 10) * 0.1));
      g.score += points; g.chars += snippet.code.length; g.done += 1; g.combo += 1;
      g.bestCombo = Math.max(g.bestCombo, g.combo); g.flash = "ok";
      if (!g.snipErr) g.learned.add(snippet.code);
      g.snipErr = false;
      setGain({ n: points, id: Date.now() });
      nextSnippet();
    } else {
      setTyped(value);
    }
    bump();
  }
  function skip() {
    const g = game.current;
    if (!g || g.finished) return;
    const snippet = g.queue[g.idx];
    g.combo = 0; g.snipErr = false;
    if (!g.missed.some((m) => m.code === snippet.code)) g.missed.push(snippet);
    nextSnippet(); bump(); inputRef.current?.focus();
  }
  function quit() { if (game.current) game.current.finished = true; setPhase("menu"); }

  /* ---------------- Màn hình chọn ---------------- */
  if (phase === "menu") {
    const lv = typingLevel(profile.xp);
    const masteredCount = TYPING_SNIPPETS.filter((x) => mastered.has(x.code)).length;
    const modeIcon = { timed: <Clock size={18} />, free: <ListChecks size={18} />, review: <RefreshCw size={18} /> };
    return (
      <div className="nb-tg">
        <header className="nb-tg-hero">
          <div className="nb-tg-hero-text">
            <span className="nb-tg-hero-tag"><Keyboard size={14} /> Giải trí · Gõ lệnh Python</span>
            <h2>Gõ nhanh, gõ chuẩn, nhớ lâu</h2>
            <p>{TYPING_SNIPPETS.length} hàm và câu lệnh Python hay gặp. Luyện gõ để nhớ cú pháp, bớt sai chính tả khi làm bài.</p>
          </div>
          <div className="nb-tg-hero-stats">
            <div><strong>{TYPING_SNIPPETS.length}</strong><span>lệnh</span></div>
            <div><strong>{masteredCount}</strong><span>đã thuộc</span></div>
            <div><strong>{profile.games}</strong><span>ván đã chơi</span></div>
            <div><strong>{profile.bestWpm || 0}</strong><span>từ/phút cao nhất</span></div>
          </div>
        </header>
        <div className="nb-tg-menu">
          <div className="nb-tg-choose">
            <section className="nb-tg-block">
              <h3>Chọn chủ đề</h3>
              <div className="nb-tg-topics" role="radiogroup" aria-label="Chủ đề">
                {TYPING_CATEGORIES.map((c) => {
                  const list = TYPING_SNIPPETS.filter((x) => c.key === "all" || x.cat === c.key);
                  const known = list.filter((x) => mastered.has(x.code)).length;
                  const st = TYPING_TOPIC_STYLE[c.key] || TYPING_TOPIC_STYLE.all;
                  return (
                    <button key={c.key} role="radio" aria-checked={category === c.key} className={`nb-tg-topic ${category === c.key ? "active" : ""}`} style={{ "--tg-accent": st.color }} onClick={() => setCategory(c.key)}>
                      <span className="nb-tg-topic-mark">{st.mark}</span>
                      <span className="nb-tg-topic-main">
                        <strong>{c.label}</strong>
                        <code>{c.key === "all" ? "print(), for, def, ..." : list[0].code}</code>
                      </span>
                      <span className="nb-tg-topic-count">{known}/{list.length} đã thuộc</span>
                      <i className="nb-tg-topic-bar"><b style={{ width: `${list.length ? Math.round(known / list.length * 100) : 0}%` }} /></i>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="nb-tg-block">
              <h3>Chọn chế độ</h3>
              <div className="nb-tg-modes" role="radiogroup" aria-label="Chế độ">
                {Object.entries(TYPING_MODES).map(([key, m]) => (
                  <button key={key} role="radio" aria-checked={mode === key} className={`nb-tg-mode ${mode === key ? "active" : ""}`} onClick={() => setMode(key)}>
                    <span className="nb-tg-mode-icon">{modeIcon[key]}</span>
                    <span className="nb-tg-mode-text"><strong>{m.label}</strong><span>{m.desc}</span></span>
                    <small>{bests[key] ? `Kỷ lục ${bests[key].score}` : "Chưa chơi"}</small>
                  </button>
                ))}
              </div>
              {mode === "review" && unmasteredPool.length === 0 && <p className="nb-sub">Em đã thuộc hết lệnh của chủ đề này. Hệ thống sẽ ôn lại toàn bộ chủ đề.</p>}
            </section>
          </div>
          <aside className="nb-tg-side">
            <section className="nb-tg-level">
              <div className="nb-tg-level-top"><Award size={18} /><div><span>Cấp bậc của em</span><strong>{lv.name}</strong></div></div>
              <i className="nb-tg-level-bar"><b style={{ width: `${lv.pct}%` }} /></i>
              <small>{lv.next ? `${profile.xp} điểm · còn ${lv.toNext} điểm để lên “${lv.next.name}”` : `${profile.xp} điểm · cấp cao nhất`}</small>
            </section>
            <TypingDemo snippets={demoPool} />
            <button className="nb-btn nb-btn-primary nb-tg-start-btn" onClick={newGame}><Play size={17} /> Bắt đầu chơi</button>
            <p className="nb-sub">Gõ đúng liên tiếp để tăng combo, điểm nhân tối đa gấp đôi. Sai một ký tự là mất combo. Nhấn Esc để thoát giữa chừng.</p>
          </aside>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="nb-tg">
        <div className="nb-tg-ready" role="status" aria-live="assertive">
          <span>Sẵn sàng · {TYPING_MODES[mode].label}</span>
          <strong key={countdown}>{countdown > 0 ? countdown : "Gõ!"}</strong>
          <p>Đặt hai ngón trỏ lên phím F và J. Các lệnh sẽ hiện ngay sau đây.</p>
        </div>
      </div>
    );
  }

  /* ---------------- Kết quả ---------------- */
  if (phase === "result" && result) {
    return (
      <div className="nb-tg">
        <div className="nb-tg-result">
          <section className="nb-tg-result-main">
            <span className="nb-tg-result-mode">{TYPING_MODES[result.mode].label}</span>
            <div className="nb-tg-stars" aria-label={`${result.stars} trên 3 sao`}>{[1, 2, 3].map((n) => <i key={n} className={n <= result.stars ? "on" : ""} style={{ animationDelay: `${n * 140}ms` }}>★</i>)}</div>
            <h2>{typingTitle(result.wpm)}</h2>
            <div className="nb-tg-wpm"><strong>{result.wpm}</strong><span>từ mỗi phút</span></div>
            {result.isRecord && <span className="nb-tg-record"><Award size={15} /> Kỷ lục mới của em</span>}
            {result.levelUp && <span className="nb-tg-record levelup"><Trophy size={15} /> Lên cấp: {result.levelUp}</span>}
            <p className="nb-sub">+{result.xpGain} điểm cấp bậc{result.newlyLearned > 0 ? ` · thuộc thêm ${result.newlyLearned} lệnh` : ""}</p>
            {result.previous && !result.isRecord && <p className="nb-sub">Kỷ lục hiện tại: {result.previous.score} điểm, {result.previous.wpm} từ/phút.</p>}
            <div className="nb-tg-actions">
              <button className="nb-btn nb-btn-primary" onClick={newGame}><RefreshCw size={16} /> Chơi lại</button>
              <button className="nb-btn nb-btn-ghost" onClick={() => setPhase("menu")}>Đổi chủ đề</button>
            </div>
          </section>
          <dl className="nb-tg-result-stats">
            <div><dt>Điểm</dt><dd>{result.score}</dd></div>
            <div><dt>Chính xác</dt><dd>{result.accuracy}%</dd></div>
            <div><dt>Lệnh hoàn thành</dt><dd>{result.done}</dd></div>
            <div><dt>Combo cao nhất</dt><dd>x{result.bestCombo}</dd></div>
            <div><dt>Thời gian</dt><dd>{result.seconds} giây</dd></div>
          </dl>
        </div>
        {result.missed.length > 0 ? (
          <section className="nb-tg-block">
            <h3>Nên luyện thêm ({result.missed.length} lệnh)</h3>
            <div className="nb-tg-missed">
              {result.missed.map((m) => (<div key={m.code}><ColoredCode code={m.code} /><span>{m.hint}</span></div>))}
            </div>
          </section>
        ) : <p className="nb-sub">Em không gõ sai lệnh nào. Rất chuẩn!</p>}
      </div>
    );
  }

  /* ---------------- Đang chơi ---------------- */
  const g = game.current;
  if (!g) return null;
  const snippet = g.queue[g.idx] || g.queue[0];
  const elapsed = Date.now() - g.startedAt;
  const total = TYPING_MODES.timed.seconds;
  const left = Math.max(0, total - elapsed / 1000);
  const liveWpm = elapsed > 3000 ? Math.round(g.chars / 5 / (elapsed / 60000)) : 0;
  const liveAcc = g.keys ? Math.round(((g.keys - g.errors) / g.keys) * 100) : 100;
  const multiplier = (1 + Math.min(g.combo, 10) * 0.1).toFixed(1);
  const categoryLabel = TYPING_CATEGORIES.find((c) => c.key === snippet.cat)?.label || "";
  const cls = pyTokenClasses(snippet.code);
  const RING = 2 * Math.PI * 18;

  return (
    <div className="nb-tg play">
      <div className="nb-tg-bar">
        <button className="nb-btn nb-btn-ghost" onClick={quit}><ChevronLeft size={16} /> Thoát</button>
        {mode === "timed" ? (
          <div className={`nb-tg-ring ${left < 10 ? "warn" : ""}`} role="timer" aria-label={`Còn ${Math.ceil(left)} giây`}>
            <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" className="bg" /><circle cx="22" cy="22" r="18" className="fg" strokeDasharray={RING} strokeDashoffset={RING * (1 - left / total)} /></svg>
            <b>{Math.ceil(left)}</b>
          </div>
        ) : (
          <div className="nb-tg-progress"><span>Lệnh {Math.min(g.idx + 1, TYPING_MODES[mode].count)}/{TYPING_MODES[mode].count}</span><i><b style={{ width: `${(g.idx / TYPING_MODES[mode].count) * 100}%` }} /></i></div>
        )}
        <button className="nb-btn nb-btn-ghost" onClick={skip}>Bỏ qua <ChevronRight size={16} /></button>
      </div>

      <div className="nb-tg-strip">
        <div className="nb-tg-score"><span>Điểm</span><strong>{g.score}</strong>{gain && <em key={gain.id} className="nb-tg-gain">+{gain.n}</em>}</div>
        <div className={`nb-tg-combo ${g.combo >= 3 ? "hot" : ""}`}>
          <span>Combo {g.combo} · x{multiplier}</span>
          <div className="nb-tg-pips">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < Math.min(g.combo, 10) ? "on" : ""} />)}</div>
        </div>
        <div className="nb-tg-mini"><span>Tốc độ</span><strong>{liveWpm}</strong></div>
        <div className="nb-tg-mini"><span>Chính xác</span><strong>{liveAcc}%</strong></div>
      </div>

      <div className={`nb-tg-editor ${g.flash}`} onAnimationEnd={() => { g.flash = ""; }} onClick={() => inputRef.current?.focus()}>
        <div className="nb-tg-tab"><Code2 size={13} /> lenh.py <span>{categoryLabel}</span></div>
        <div className="nb-tg-line" aria-label={snippet.code}>
          <span className="nb-tg-gutter">1</span>
          <code>
            {[...snippet.code].map((ch, i) => {
              const t = typed[i];
              const state = t === undefined ? (i === typed.length ? "cur" : "dim") : t === ch ? `t-${cls[i]}` : "bad";
              return <span key={i} className={state}>{ch}</span>;
            })}
          </code>
        </div>
        <div className="nb-tg-prompt">
          <span aria-hidden="true">&gt;&gt;&gt;</span>
          <input
            ref={inputRef} className="nb-mono" value={typed} onChange={onChange} onKeyDown={onKeyDown}
            onPaste={(e) => e.preventDefault()} placeholder="Gõ lệnh ở đây" autoFocus autoComplete="off" autoCorrect="off"
            autoCapitalize="off" spellCheck={false} aria-label="Ô gõ lệnh"
          />
        </div>
      </div>
      <p className="nb-tg-meaning"><b>Ý nghĩa</b> {snippet.hint}</p>
      <TypingKeyboard nextChar={snippet.code[typed.length]} press={press} />
    </div>
  );
}

const BASE_NAV = [
  { key: "overview", label: "Tổng quan", shortLabel: "Tổng quan", icon: Home },
  { key: "lessons", label: "Bài giảng", shortLabel: "Bài giảng", icon: BookOpen },
  { key: "problems", label: "Luyện tập & Python", shortLabel: "Luyện tập", icon: Code2 },
  { key: "assignments", label: "Bài được giao", shortLabel: "Được giao", icon: ListChecks },
  { key: "contests", label: "Đề thi thử", shortLabel: "Đề thi", icon: Clock },
  { key: "leaderboard", label: "Bảng xếp hạng", shortLabel: "Xếp hạng", icon: Trophy },
  { key: "discussion", label: "Thảo luận", shortLabel: "Thảo luận", icon: MessageSquare },
  { key: "typing", label: "Giải trí", shortLabel: "Gõ lệnh", icon: Keyboard },
];
const ACCOUNTS_NAV = { key: "accounts", label: "Quản lý tài khoản", shortLabel: "Tài khoản", icon: Users };

function App() {
  const [tab, setTab] = useState("overview");
  const [topics, setTopics] = useState([]);
  const [problems, setProblems] = useState([]);
  const [exams, setExams] = useState([]);
  const [examsMissing, setExamsMissing] = useState(false);
  const [discussions, setDiscussions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [assignments, setAssignments] = useState([]);
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

  const subCursor = useRef(null);
  function applyData(data) {
    if (data.topics) setTopics(data.topics);
    if (data.problems) setProblems(data.problems);
    setExams(data.exams); setExamsMissing(data.examsMissing);
    setSubmissions((prev) => (data.partial ? mergeIncremental(prev, data.submissions) : mergeLocalCode(prev, data.submissions)));
    if (data.discussions) setDiscussions(data.discussions);
    if (data.accounts) setAccounts(data.accounts);
    if (data.assignments) setAssignments(data.assignments);
    if (data.cursor) subCursor.current = data.cursor;
  }
  function sinceCursor() {
    return subCursor.current ? new Date(new Date(subCursor.current).getTime() - 3 * 60 * 1000).toISOString() : null;
  }

  const runInitialLoad = useCallback(async () => {
    setLoading(true);
    setSetupError(false);
    try {
      const data = await fetchAll();
      applyData(data);
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

  // Làm mới nền: chỉ chạy khi đã đăng nhập, tab đang hiện và người dùng còn thao tác.
  // Mỗi lượt tải nhẹ (bài nộp mới); 2 lượt có thêm thảo luận/bài giao; 5 lượt tải đầy đủ để đối chiếu.
  useEffect(() => {
    if (!authUserId) return undefined;
    const POLL_MS = 120000;
    const IDLE_MS = 5 * 60 * 1000;
    let tick = 0;
    let running = false;
    let lastRun = Date.now();
    let lastActivity = Date.now();
    let wasIdle = false;
    const run = async () => {
      if (running || document.hidden) return;
      running = true;
      tick += 1;
      const scope = tick % 5 === 0 ? "full" : tick % 2 === 0 ? "medium" : "fast";
      try {
        applyData(await fetchAll({ scope, since: sinceCursor() }));
        setStorageError(false);
        lastRun = Date.now();
      } catch (e) { /* mạng chập chờn: bỏ qua, lượt sau thử lại */ }
      running = false;
    };
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivity > IDLE_MS) { wasIdle = true; return; }
      run();
    }, POLL_MS);
    const resume = () => {
      lastActivity = Date.now();
      if ((wasIdle || document.visibilityState === "visible") && Date.now() - lastRun > 60000) { wasIdle = false; run(); }
      wasIdle = false;
    };
    const activity = () => { lastActivity = Date.now(); if (wasIdle) resume(); };
    const onVisible = () => { if (!document.hidden) resume(); };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((name) => window.addEventListener(name, activity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, activity, { capture: true }));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authUserId]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      applyData(await fetchAll());
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
    const hashed = hashPassword(password);
    let acc = accounts.find((a) => a.username.toLowerCase() === uname);
    if (!acc || acc.passwordHash !== hashed) {
      // Danh sách tài khoản trên máy có thể cũ (tài khoản mới tạo / vừa đổi mật khẩu): tải lại một lần rồi thử lại.
      try {
        const { data: fresh, error } = await supabase.from("accounts").select("*");
        if (!error && fresh) {
          const list = fresh.map(mapAccount);
          setAccounts(list);
          acc = list.find((a) => a.username.toLowerCase() === uname);
        }
      } catch (e) { /* giữ kết quả cũ */ }
    }
    if (!acc || acc.passwordHash !== hashed) {
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
  const refreshExams = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("exams").select(EXAM_LIST_COLUMNS).order("created_at", { ascending: false });
      if (error) throw error;
      setExams((data || []).map(mapExam)); setExamsMissing(false);
    } catch (e) { /* giữ danh sách hiện tại */ }
  }, []);
  const visibleExams = useMemo(
    () => (isTeacher ? exams : exams.filter((exam) => currentUser && examVisibleTo(exam, currentUser.id))),
    [exams, isTeacher, currentUser?.id]
  );
  function addThread(t) {
    setDiscussions((prev) => [t, ...prev]);
    dbAddThread(t).catch(() => setStorageError(true));
  }
  function addReply(threadId, reply) {
    setDiscussions((prev) => prev.map((d) => (d.id === threadId ? { ...d, replies: [...d.replies, reply] } : d)));
    dbAddReply(threadId, reply).catch(() => setStorageError(true));
  }
  function addAssignments(pairs) {
    if (!isTeacher || pairs.length === 0) return;
    const existingKeys = new Set(assignments.map((a) => `${a.problemId}::${a.studentId}`));
    const newRows = pairs
      .filter(({ problemId, studentId }) => !existingKeys.has(`${problemId}::${studentId}`))
      .map(({ problemId, studentId }) => ({
        id: "asg" + Date.now() + Math.random().toString(36).slice(2, 7),
        problemId, studentId, assignedBy: currentUser?.name || "", note: "", createdAt: new Date().toISOString(),
      }));
    if (newRows.length === 0) return;
    setAssignments((prev) => [...prev, ...newRows]);
    dbAddAssignments(newRows).catch(() => setStorageError(true));
  }
  function removeAssignment(id) {
    if (!isTeacher) return;
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    dbRemoveAssignment(id).catch(() => setStorageError(true));
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

  const navItems = (isTeacher ? [...BASE_NAV, ACCOUNTS_NAV] : BASE_NAV).map((item) =>
    item.key === "assignments" && isTeacher ? { ...item, label: "Giao bài", shortLabel: "Giao bài" } : item
  );
  const activeTabLabel = navItems.find((n) => n.key === tab)?.label;

  return (
    <div className="nb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        .nb-root {
          --ink: #102A43;
          --ink-soft: #163B5C;
          --paper: #F3FBFC;
          --paper-line: #D7E9ED;
          --red-pen: #B23A3A;
          --pen-blue: #04A6C7;
          --gold: #B9822F;
          --ac-green: #2E9E6D;
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
          width: 230px; flex-shrink: 0; background: var(--ink); color: #C6CDDA;
          display: flex; flex-direction: column; position: relative; padding: 22px 14px;
        }
        .nb-sidebar::before {
          content: ""; position: absolute; left: 10px; top: 0; bottom: 0; width: 1px;
          background-image: radial-gradient(circle, rgba(92, 211, 229, 0.22) 1.5px, transparent 1.5px);
          background-size: 100% 22px;
        }
        .nb-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 20px 14px; }
        .nb-brand-mark {
          width: 34px; height: 34px; border-radius: 8px; background: var(--pen-blue);
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
        .nb-nav-item:hover { background: rgba(4,166,199,0.16); color: #fff; }
        .nb-nav-item.active { background: var(--pen-blue); color: #fff; }

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
          content: ""; position: absolute; left: 46px; top: 0; bottom: 0; width: 1.5px; background: rgba(4,166,199,0.24);
          pointer-events: none;
        }
        .nb-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 30px 18px 62px; border-bottom: 1px solid var(--paper-line);
          background: rgba(243,251,252,0.92); backdrop-filter: blur(2px); position: sticky; top: 0; z-index: 5;
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

        .nb-home-page { display: flex; flex-direction: column; gap: 18px; }
        .nb-sister-link { align-self: flex-start; display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border: 1px solid var(--paper-line); border-radius: 99px; background: #fff; color: var(--pen-blue); font: 600 12px inherit; text-decoration: none; transition: border-color .12s, background .12s; }
        .nb-sister-link:hover { border-color: var(--pen-blue); background: rgba(4,166,199,0.07); }
        .nb-home-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 25px 27px; border-radius: 14px; color: #fff; box-shadow: 0 10px 24px rgba(4,166,199,0.16); }
        .nb-home-hero.student { background: linear-gradient(120deg, #0B4657 0%, #04A6C7 62%, #66D3E4 100%); }
        .nb-home-hero.teacher { background: linear-gradient(120deg, #0C3E4D 0%, #087C95 58%, #5BC9D9 100%); }
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
        .nb-home-stat > span.red { color: var(--red-pen); background: rgba(178,58,58,0.1); }
        .nb-home-stat div { display: flex; flex-direction: column; gap: 2px; }
        .nb-home-stat strong { color: var(--ink); font: 700 20px 'JetBrains Mono', monospace; }
        .nb-home-stat small { color: var(--slate); font-size: 11px; }
        .nb-home-stat em { display: block; margin-top: 3px; color: var(--pen-blue); font-size: 9px; font-style: normal; }
        .nb-home-hero-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .nb-home-hero-action { display: inline-flex; align-items: center; gap: 6px; padding: 9px 11px; border: 1px solid rgba(255,255,255,0.24); border-radius: 8px; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer; font: 600 11px inherit; transition: background .15s ease, transform .15s ease; }
        .nb-home-hero-action:hover { background: rgba(255,255,255,0.18); transform: translateY(-1px); }
        .nb-home-insight-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 14px; }
        .nb-home-insight-card { min-width: 0; }
        .nb-home-insight-list, .nb-home-signal-list, .nb-home-question-list { display: flex; flex-direction: column; gap: 2px; }
        .nb-home-insight-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--paper-line); }
        .nb-home-insight-row:last-child, .nb-home-signal-row:last-child, .nb-home-question-row:last-child { border-bottom: 0; }
        .nb-home-insight-icon { display: inline-flex; align-items: center; justify-content: center; width: 27px; height: 27px; border-radius: 8px; }
        .nb-home-insight-icon.warning { color: var(--gold); background: rgba(185,130,47,0.14); }
        .nb-home-insight-icon.steady { color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-home-insight-row > div { min-width: 0; }
        .nb-home-insight-row strong, .nb-home-signal-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-home-insight-row small, .nb-home-signal-row small { display: block; margin-top: 2px; color: var(--slate); font-size: 10px; }
        .nb-home-insight-row > b { color: var(--pen-blue); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-home-insight-track { height: 4px; margin-top: 5px; overflow: hidden; border-radius: 99px; background: var(--paper-line); }
        .nb-home-insight-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #63CFDF); }
        .nb-home-signal-row { display: flex; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--paper-line); }
        .nb-home-signal-row > div { min-width: 0; flex: 1; }
        .nb-home-signal-row > span { flex: 0 0 auto; padding: 4px 7px; border-radius: 99px; font: 600 9px 'JetBrains Mono', monospace; }
        .nb-home-signal-row > span.risk { color: var(--red-pen); background: rgba(178,58,58,0.1); }
        .nb-home-signal-row > span.watch { color: var(--gold); background: rgba(185,130,47,0.14); }
        .nb-home-questions { min-width: 0; }
        .nb-home-question-row { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 0; border: 0; border-bottom: 1px solid var(--paper-line); background: transparent; color: var(--ink); cursor: pointer; font-family: inherit; text-align: left; }
        .nb-home-question-row:hover { color: var(--pen-blue); }
        .nb-home-question-row > span:nth-child(2) { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .nb-home-question-row strong { font-size: 11px; }
        .nb-home-question-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--slate); font-size: 10px; }
        .nb-home-question-icon { display: inline-flex; align-items: center; justify-content: center; width: 27px; height: 27px; flex: 0 0 auto; border-radius: 8px; color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-home-question-row > svg { flex: 0 0 auto; color: var(--slate); }
        .nb-home-main-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 14px; }
        .nb-home-progress-card, .nb-home-class-card, .nb-home-contest-card { display: flex; flex-direction: column; gap: 12px; padding: 21px; border: 1px solid var(--paper-line); border-radius: 11px; background: #fff; }
        .nb-home-progress-card, .nb-home-class-card { background: linear-gradient(135deg, #fff 0%, #F2FBFC 100%); }
        .nb-home-contest-card { background: #F6FCFD; }
        .nb-home-contest-card.live { border-color: rgba(46,158,109,0.35); background: linear-gradient(135deg, #F8FCF7, #EEF8F1); }
        .nb-home-card-head, .nb-home-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .nb-home-card-head h2, .nb-home-section-head h2 { margin: 4px 0 0; font-size: 18px; letter-spacing: -0.01em; }
        .nb-home-percent { color: var(--pen-blue); font: 700 25px 'JetBrains Mono', monospace; }
        .nb-home-progress { height: 9px; overflow: hidden; border-radius: 99px; background: var(--paper-line); }
        .nb-home-progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #63CFDF); }
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
        .nb-exam-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 25px 27px; border-radius: 14px; color: #fff; background: linear-gradient(120deg, #0B4657 0%, #04A6C7 62%, #66D3E4 100%); box-shadow: 0 10px 24px rgba(4,166,199,0.18); }
        .nb-exam-title { margin: 6px 0 7px; font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; }
        .nb-exam-sub { margin: 0; color: rgba(255,255,255,0.72); font-size: 13px; line-height: 1.5; }
        .nb-exam-hero .nb-eyebrow { color: #C8D7EC; }
        .nb-exam-hero-icon { display: flex; align-items: center; gap: 10px; padding: 12px 15px; border: 1px solid rgba(255,255,255,0.22); border-radius: 10px; background: rgba(255,255,255,0.1); font: 600 11px/1.4 'JetBrains Mono', monospace; }
        .nb-exam-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .nb-exam-stat { display: flex; align-items: center; gap: 10px; padding: 14px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-exam-stat > span { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; }
        .nb-exam-stat > span.blue { color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-exam-stat > span.green { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-exam-stat > span.gold { color: var(--gold); background: rgba(185,130,47,0.13); }
        .nb-exam-stat > span.ink { color: var(--ink); background: rgba(16,42,67,0.08); }
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
        .nb-exam-check { display: flex; align-items: center; gap: 9px; padding: 10px; border: 1px solid var(--paper-line); border-radius: 8px; background: #FBFEFE; cursor: pointer; }
        .nb-exam-check.selected { border-color: var(--pen-blue); background: rgba(4,166,199,0.06); }
        .nb-exam-check input { accent-color: var(--pen-blue); }
        .nb-exam-check > span { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .nb-exam-check strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-exam-check small { color: var(--slate); font-size: 10px; }
        .nb-exam-check > svg { color: var(--pen-blue); opacity: 0; }
        .nb-exam-check.selected > svg { opacity: 1; }
        .nb-assigned-list { display: flex; flex-direction: column; gap: 8px; }
        .nb-assigned-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 15px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; cursor: pointer; text-align: left; font-family: inherit; transition: border-color .12s, background .12s; }
        .nb-assigned-row:hover { border-color: var(--pen-blue); background: rgba(4,166,199,0.04); }
        .nb-assigned-row-main { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
        .nb-assigned-row-main strong { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-assigned-row-main small { color: var(--slate); font-size: 11px; }
        .nb-assign-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
        .nb-assign-stats > div { display: flex; flex-direction: column; gap: 3px; padding: 14px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; }
        .nb-assign-stats strong { font: 700 22px 'JetBrains Mono', monospace; color: var(--pen-blue); }
        .nb-assign-stats span { color: var(--slate); font-size: 11px; }
        .nb-assign-mode-toggle { display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: var(--paper-line); margin-bottom: 14px; }
        .nb-assign-mode-toggle button { padding: 8px 16px; border: 0; border-radius: 7px; background: transparent; color: var(--slate); font: 600 12.5px inherit; cursor: pointer; }
        .nb-assign-mode-toggle button.active { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(16,42,67,0.12); }
        .nb-assign-panel { display: flex; flex-direction: column; gap: 4px; }
        .nb-assign-checklist { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 260px; overflow-y: auto; padding: 3px; margin-top: 8px; }
        .nb-assign-check { display: flex; align-items: center; gap: 9px; padding: 10px; border: 1px solid var(--paper-line); border-radius: 8px; background: #FBFEFE; cursor: pointer; }
        .nb-assign-check.selected { border-color: var(--pen-blue); background: rgba(4,166,199,0.06); }
        .nb-assign-check.already { opacity: 0.55; cursor: not-allowed; }
        .nb-assign-check input { accent-color: var(--pen-blue); }
        .nb-assign-check > span { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .nb-assign-check strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .nb-assign-check small { color: var(--slate); font-size: 10px; margin-left: auto; }
        .nb-assign-overview { margin-top: 8px; }
        .nb-assign-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
        .nb-assign-filters select { width: auto; min-width: 180px; }
        .nb-assign-rows { display: flex; flex-direction: column; gap: 7px; }
        .nb-assign-row { display: flex; align-items: center; gap: 11px; padding: 10px 13px; border: 1px solid var(--paper-line); border-radius: 9px; background: #fff; }
        .nb-assign-row-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .nb-assign-row-info strong { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-assign-row-info small { color: var(--slate); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 640px) {
          .nb-assign-checklist { grid-template-columns: 1fr; }
          .nb-assign-stats { grid-template-columns: 1fr; }
        }
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
        .nb-exam-progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #63CFDF); }
        .nb-exam-card-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 3px; }
        .nb-exam-card-actions .nb-sub { display: inline-flex; align-items: center; gap: 5px; }
        .nb-exam-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 48px 15px; color: var(--slate); text-align: center; background: #fff; border: 1px dashed var(--paper-line); border-radius: 10px; }
        .nb-exam-empty strong { color: var(--ink); font-size: 14px; }
        .nb-exam-empty span { font-size: 12px; }
        .nb-exam-room { display: flex; flex-direction: column; gap: 14px; }
        .nb-exam-room-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; padding: 15px 17px; background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-exam-room-title { min-width: 0; }
        .nb-exam-room-title h2 { margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 20px; }
        .nb-exam-timer { display: inline-flex; align-items: center; gap: 7px; padding: 9px 12px; border-radius: 8px; color: var(--red-pen); background: rgba(178,58,58,0.08); font: 700 14px 'JetBrains Mono', monospace; white-space: nowrap; }
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
        .nb-exam-room-intro { padding: 22px 24px; border-radius: 10px; background: linear-gradient(135deg, #F7F9FC, #fff); border: 1px solid var(--paper-line); }
        .nb-exam-room-intro h3 { margin: 5px 0 5px; font-size: 20px; }
        .nb-exam-room-intro p { margin: 0; color: var(--slate); font-size: 13px; line-height: 1.6; }
        .nb-exam-problem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 12px; }
        .nb-exam-problem-card { display: flex; flex-direction: column; gap: 15px; min-height: 145px; padding: 15px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; text-align: left; cursor: pointer; font-family: inherit; transition: transform .12s, box-shadow .12s, border-color .12s; }
        .nb-exam-problem-card:hover { transform: translateY(-2px); border-color: var(--pen-blue); box-shadow: 0 8px 18px rgba(16,42,67,0.07); }
        .nb-exam-problem-card.done { border-color: rgba(46,158,109,0.45); }
        .nb-exam-problem-card-top, .nb-exam-problem-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .nb-exam-index { color: var(--pen-blue); font: 700 10px 'JetBrains Mono', monospace; }
        .nb-exam-done { display: inline-flex; align-items: center; gap: 4px; color: var(--ac-green); font-size: 10px; font-weight: 600; }
        .nb-exam-problem-card h4 { flex: 1; margin: 0; font-size: 14px; line-height: 1.4; }
        .nb-exam-problem-card-foot > span { color: var(--slate); font: 11px 'JetBrains Mono', monospace; }

        .nb-exam-manage-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
        .nb-exam-manage-head h3 { margin: 4px 0; }
        .nb-exam-status-selector { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; padding: 10px; border: 1px solid var(--paper-line); border-radius: 8px; background: #FBFAF5; }
        .nb-exam-status-selector > span { margin-right: 4px; color: var(--slate); font-size: 11px; font-weight: 600; }
        .nb-danger-icon { color: var(--red-pen) !important; border-color: rgba(178,58,58,0.22) !important; }
        .nb-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
        .nb-practice-progress-board { display: grid; grid-template-columns: minmax(210px, 0.9fr) minmax(0, 1.1fr); gap: 1px; margin-bottom: 18px; overflow: hidden; border: 1px solid var(--paper-line); border-radius: 12px; background: var(--paper-line); box-shadow: 0 8px 20px rgba(16,42,67,0.04); }
        .nb-practice-progress-copy { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 10px; row-gap: 3px; padding: 17px 19px; color: #fff; background: linear-gradient(125deg, #1D344A 0%, #04A6C7 100%); }
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
        .nb-practice-search { flex: 1 1 250px; display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 10px; color: var(--slate); border: 1px solid var(--paper-line); border-radius: 7px; background: #FBFEFE; }
        .nb-practice-search:focus-within { color: var(--pen-blue); border-color: var(--pen-blue); box-shadow: 0 0 0 3px rgba(4,166,199,0.08); }
        .nb-practice-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: var(--ink); background: transparent; font: 13px inherit; }
        .nb-practice-filter-stack { display: flex; flex-direction: column; gap: 5px; }
        .nb-practice-filter-stack > span { color: var(--slate); font: 600 10px 'JetBrains Mono', monospace; letter-spacing: .04em; text-transform: uppercase; }
        .nb-practice-toolbar .nb-chip { padding: 5px 10px; font-size: 11px; }
        .nb-practice-teacher-board { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 20px; margin: 0 0 18px; padding: 16px 18px; border: 1px solid #CCD6E8; border-left: 4px solid var(--pen-blue); border-radius: 0 10px 10px 0; background: linear-gradient(90deg, rgba(4,166,199,0.07), rgba(255,255,255,0.96)); }
        .nb-practice-teacher-board h3 { margin: 3px 0 4px; }
        .nb-practice-teacher-stats { display: flex; align-items: center; gap: 14px; color: var(--slate); font-size: 11px; white-space: nowrap; }
        .nb-practice-teacher-stats b { color: var(--pen-blue); font: 700 14px 'JetBrains Mono', monospace; }
        .nb-practice-roadmap { position: relative; padding: 19px 20px 20px; border: 1px solid var(--paper-line); border-radius: 12px; background: #fff; }
        .nb-practice-roadmap-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 15px; border-bottom: 1px solid var(--paper-line); }
        .nb-practice-roadmap-head h3 { margin: 3px 0 0; font-size: 18px; }
        .nb-practice-month-group { margin-top: 14px; overflow: hidden; border: 1px solid var(--paper-line); border-radius: 10px; background: linear-gradient(135deg, #fff 0%, #F7FCFD 100%); }
        .nb-practice-month-group:first-of-type { margin-top: 16px; }
        .nb-practice-month-head { width: 100%; display: flex; align-items: center; gap: 11px; padding: 13px 15px; border: 0; border-bottom: 1px solid var(--paper-line); background: transparent; color: var(--ink); text-align: left; cursor: pointer; font-family: inherit; transition: background .15s ease, border-color .15s ease; }
        .nb-practice-month-head:hover { background: rgba(4,166,199,0.06); }
        .nb-practice-month-head:focus-visible { outline: 2px solid var(--pen-blue); outline-offset: -2px; }
        .nb-practice-month-marker { display: grid; place-items: center; width: 29px; height: 29px; flex: 0 0 auto; border-radius: 8px; color: #fff; background: var(--pen-blue); box-shadow: 0 4px 10px rgba(4,166,199,0.18); font: 700 10px 'JetBrains Mono', monospace; }
        .nb-practice-month-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .nb-practice-month-title > span { color: var(--slate); font: 10px 'JetBrains Mono', monospace; letter-spacing: .04em; text-transform: uppercase; }
        .nb-practice-month-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 15px; }
        .nb-practice-month-summary { flex: 0 0 auto; color: var(--slate); font-size: 11px; }
        .nb-practice-month-chevron { flex: 0 0 auto; color: var(--pen-blue); transition: transform .18s ease; }
        .nb-practice-month-head[aria-expanded="true"] .nb-practice-month-chevron { transform: rotate(90deg); }
        .nb-practice-month-content { padding: 0 14px 14px; }
        .nb-practice-month-content .nb-practice-group { padding-top: 14px; }
        .nb-practice-group { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 10px; padding-top: 18px; }
        .nb-practice-group-rail { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 5px; }
        .nb-practice-group-rail span { z-index: 1; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; color: #fff; background: var(--pen-blue); box-shadow: 0 0 0 4px #EDF2FA; font: 700 10px 'JetBrains Mono', monospace; }
        .nb-practice-group-rail i { position: absolute; top: 35px; bottom: -20px; width: 1px; background: var(--paper-line); }
        .nb-practice-group:last-child .nb-practice-group-rail i { display: none; }
        .nb-practice-group-content { min-width: 0; padding-bottom: 8px; }
        .nb-practice-group-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; margin-bottom: 9px; }
        .nb-practice-group-head p { margin: 0 0 3px; color: var(--slate); font: 10px 'JetBrains Mono', monospace; }
        .nb-practice-group-head h3 { margin: 0; color: var(--ink); font-size: 16px; }
        .nb-practice-group-summary { min-width: 125px; color: var(--slate); font-size: 11px; text-align: right; }
        .nb-practice-group-summary > div { width: 128px; height: 5px; margin-top: 5px; margin-left: auto; overflow: hidden; border-radius: 99px; background: var(--paper-line); }
        .nb-practice-group-summary > div i { display: block; height: 100%; border-radius: inherit; background: var(--ac-green); transition: width .25s ease; }
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
        .nb-practice-status.todo { color: #697789; background: #EFF2F5; }
        .nb-practice-status.in-progress { color: #9B5C00; background: rgba(185,130,47,0.14); }
        .nb-practice-status.done { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-practice-problem-score { display: flex; align-items: center; justify-content: flex-end; gap: 9px; min-width: 106px; }
        .nb-practice-problem-score strong { color: var(--pen-blue); font: 700 11px 'JetBrains Mono', monospace; }
        .nb-practice-problem-score > span { display: inline-flex; align-items: center; gap: 3px; color: var(--pen-blue); font-size: 10px; }
        .nb-practice-problem-actions { display: flex; align-items: center; gap: 5px; padding-left: 5px; border-left: 1px solid var(--paper-line); }
        .nb-practice-manage-action { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border: 1px solid var(--paper-line); border-radius: 6px; background: #fff; color: var(--pen-blue); cursor: pointer; font: 600 10px inherit; transition: background .12s, border-color .12s; }
        .nb-practice-manage-action:hover { border-color: var(--pen-blue); background: rgba(4,166,199,0.07); }
        .nb-practice-manage-action.delete { color: var(--red-pen); }
        .nb-practice-manage-action.delete:hover { border-color: rgba(178,58,58,0.4); background: rgba(178,58,58,0.08); }
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
        .nb-btn-danger { background: rgba(178,58,58,0.08); color: var(--red-pen); border: 1px solid rgba(178,58,58,0.22); }
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
        .nb-testcase-card { border: 1px solid var(--paper-line); border-radius: 9px; padding: 10px; background: #FBFEFE; }
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
        .nb-lesson-content { color: #2B2F36; font-size: 14px; line-height: 1.8; margin-bottom: 24px; }
        .nb-lesson-content p { margin: 0 0 16px; white-space: pre-wrap; }
        .nb-lesson-status-badges { display: flex; flex-wrap: wrap; gap: 5px; }
        .nb-lesson-progress-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-bottom: 24px; border-bottom: 1px solid var(--paper-line); }
        .nb-lesson-discussion { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--paper-line); }
        .nb-lesson-discussion-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
        .nb-lesson-question-form { display: flex; gap: 8px; align-items: flex-end; margin-bottom: 16px; }
        .nb-lesson-question-form .nb-input { flex: 1; }
        .nb-lesson-thread-list { display: flex; flex-direction: column; gap: 12px; }
        .nb-lesson-thread { padding: 13px; border: 1px solid var(--paper-line); border-radius: 9px; background: #FBFEFE; }
        .nb-lesson-form-grid { display: grid; grid-template-columns: 0.8fr 2fr 1fr; gap: 10px; }
        .nb-lesson-editor { gap: 12px; }
        .nb-lesson-empty { min-height: 460px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--slate); text-align: center; }

        .nb-filter-row { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
        .nb-chip { font-size: 12.5px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--paper-line); background: #fff; cursor: pointer; font-family: inherit; color: var(--slate); }
        .nb-chip.active { background: var(--pen-blue); color: #fff; border-color: var(--pen-blue); }

        .nb-problem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        .nb-problem-card { background: #fff; border: 1px solid var(--paper-line); border-radius: 10px; padding: 14px; text-align: left; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 10px; transition: transform .12s, box-shadow .12s; }
        .nb-problem-card:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(16,42,67,0.08); }
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
        .nb-input { border: 1px solid var(--paper-line); border-radius: 7px; padding: 9px 11px; font-size: 13.5px; font-family: inherit; background: #FBFEFE; width: 100%; box-sizing: border-box; }
        .nb-checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--slate); }
        .nb-checklist { max-height: 170px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--paper-line); border-radius: 8px; padding: 10px; background: #FBFEFE; }

        .nb-modal-overlay { position: fixed; inset: 0; background: rgba(16,42,67,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
        .nb-modal { background: var(--paper); border-radius: 12px; max-width: 820px; width: 100%; max-height: 88vh; overflow-y: auto; }
        .nb-modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 22px; border-bottom: 1px solid var(--paper-line); }
        .nb-modal-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px 22px; }
        .nb-modal-col { display: flex; flex-direction: column; }
        .nb-sample { background: #fff; border: 1px solid var(--paper-line); border-radius: 8px; padding: 10px; margin-top: 14px; }
        .nb-sample-title { color: var(--ink); font-size: 12px; font-weight: 700; margin-bottom: 9px; }
        .nb-sample-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nb-code-block { min-width: 0; border: 1px solid var(--paper-line); border-radius: 7px; overflow: hidden; background: #F7FCFD; }
        .nb-code-block-label { padding: 6px 8px; color: var(--slate); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--paper-line); }
        .nb-code-block pre { margin: 0; padding: 9px; min-height: 34px; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: var(--ink); font: 12px/1.55 'JetBrains Mono', monospace; }
        .nb-problem-statement { margin-top: 12px; color: var(--ink); font-size: 13.5px; line-height: 1.7; }
        .nb-problem-statement p { margin: 0 0 10px; white-space: pre-wrap; }
        .nb-problem-statement-image { display: block; max-width: 100%; max-height: 360px; object-fit: contain; margin: 0 0 14px; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; padding: 5px; }
        .nb-code-editor { width: 100%; min-height: 200px; background: var(--ink); color: #D7F1F5; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; border-radius: 8px; border: none; padding: 14px; resize: vertical; box-sizing: border-box; }
        .nb-thonny-editor { border: 1px solid #181a1f; border-radius: 9px; overflow: hidden; background: #282c34; box-shadow: 0 6px 18px rgba(10,12,16,0.28); }
        .nb-editor-toolbar, .nb-editor-status { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 12px; color: #9da5b4; background: #21252b; font: 11px/1.2 'JetBrains Mono', monospace; letter-spacing: .01em; }
        .nb-editor-toolbar span:first-child { display: flex; align-items: center; gap: 6px; color: #61afef; font-weight: 600; }
        .nb-editor-status { color: #6b7385; background: #21252b; border-top: 1px solid #181a1f; font-size: 10px; }
        .nb-editor-workspace { display: flex; position: relative; min-height: 330px; max-height: 480px; overflow: hidden; background: #282c34; }
        .nb-editor-gutter { flex: 0 0 46px; padding: 14px 7px 14px 0; color: #495162; background: #282c34; border-right: 1px solid #21252b; text-align: right; user-select: none; font: 14px/22px 'JetBrains Mono', monospace; }
        .nb-editor-gutter span { display: block; height: 22px; transition: color .1s; }
        .nb-editor-gutter span.active { color: #abb2bf; font-weight: 600; }
        .nb-editor-code-layer { position: relative; flex: 1; min-width: 0; overflow: hidden; }
        .nb-editor-active-line { position: absolute; left: 0; right: 0; top: 14px; height: 22px; background: rgba(255,255,255,0.045); pointer-events: none; z-index: 0; }
        .nb-code-highlight, .nb-code-input {
          position: absolute; inset: 0; width: max-content; min-width: 100%; min-height: 100%; margin: 0; padding: 14px 16px; border: 0; box-sizing: border-box;
          font: 14px/22px 'JetBrains Mono', monospace; letter-spacing: .2px; tab-size: 4; white-space: pre;
          font-feature-settings: "calt" 1, "liga" 1; font-variant-ligatures: contextual;
        }
        .nb-code-highlight { pointer-events: none; color: #abb2bf; background: transparent; z-index: 1; }
        .nb-code-highlight code { font: inherit; }
        .nb-code-input { z-index: 2; resize: none; overflow: auto; color: transparent; caret-color: #528bff; background: transparent; outline: none; -webkit-text-fill-color: transparent; }
        .nb-code-input::selection { background: rgba(97,175,239,0.28); }
        .nb-syntax-comment { color: #5c6370; font-style: italic; }
        .nb-syntax-string { color: #98c379; }
        .nb-syntax-number { color: #d19a66; }
        .nb-syntax-keyword { color: #c678dd; }
        .nb-syntax-function { color: #61afef; }
        .nb-syntax-operator { color: #56b6c2; }
        .nb-modal-actions { margin-top: 10px; display: flex; }
        .nb-solver-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 12px; color: var(--slate); font-size: 11.5px; }
        .nb-solver-meta strong { color: var(--ink); font-family: 'JetBrains Mono', monospace; }
        .nb-history-panel { margin-top: 14px; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; overflow: hidden; }
        .nb-history-toggle { width: 100%; display: flex; align-items: center; gap: 7px; padding: 10px 11px; background: transparent; border: none; color: var(--pen-blue); font: 600 12px inherit; cursor: pointer; text-align: left; }
        .nb-history-chevron { margin-left: auto; transition: transform .15s; }
        .nb-history-chevron.open { transform: rotate(90deg); }
        .nb-history-body { border-top: 1px solid var(--paper-line); padding: 9px; }
        .nb-history-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
        .nb-history-item { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 8px; border: 1px solid transparent; border-radius: 6px; background: #F7FCFD; text-align: left; cursor: pointer; font-family: inherit; }
        .nb-history-item:hover, .nb-history-item.active { border-color: var(--pen-blue); background: rgba(4,166,199,0.06); }
        .nb-history-item > div { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .nb-history-item strong { color: var(--ink); font: 700 11px 'JetBrains Mono', monospace; }
        .nb-history-item small { grid-column: 1 / -1; color: var(--slate); font-size: 10px; }
        .nb-history-date { color: var(--slate); font-size: 10px; }
        .nb-history-viewer { margin-top: 9px; border-top: 1px dashed var(--paper-line); padding-top: 9px; }
        .nb-history-viewer-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; font-size: 11px; }
        .nb-history-viewer-head .nb-btn { padding: 5px 8px; font-size: 10px; }
        .nb-history-code { max-height: 260px; overflow: auto; margin: 0; padding: 10px; border-radius: 6px; background: var(--ink); color: #D7F1F5; white-space: pre-wrap; word-break: break-word; font: 11px/1.5 'JetBrains Mono', monospace; }
        .nb-result { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
        .nb-result-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .nb-result-score { color: var(--pen-blue); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-result-output { margin: 0; padding: 10px; border-radius: 7px; background: var(--ink); color: #D7F1F5; font: 12px/1.5 'JetBrains Mono', monospace; white-space: pre-wrap; overflow-x: auto; }
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
        .nb-ranking-hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 24px 26px; border-radius: 14px; color: #fff; background: linear-gradient(120deg, #0A4259 0%, #04A6C7 58%, #57C8D7 100%); box-shadow: 0 10px 24px rgba(4,166,199,0.18); }
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
        .nb-ranking-stat-icon.blue { color: var(--pen-blue); background: rgba(4,166,199,0.11); }
        .nb-ranking-stat-icon.gold { color: var(--gold); background: rgba(185,130,47,0.13); }
        .nb-ranking-stat-icon.green { color: var(--ac-green); background: rgba(46,158,109,0.12); }
        .nb-ranking-stat-icon.ink { color: var(--ink); background: rgba(16,42,67,0.08); }
        .nb-ranking-stat div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-stat strong { color: var(--ink); font: 700 20px 'JetBrains Mono', monospace; }
        .nb-ranking-stat small { color: var(--slate); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nb-ranking-podium { display: grid; grid-template-columns: 1fr 1.1fr 1fr; align-items: end; gap: 12px; min-height: 220px; }
        .nb-podium-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 20px 14px 17px; background: #fff; border: 1px solid var(--paper-line); border-radius: 12px; text-align: center; box-shadow: 0 5px 14px rgba(16,42,67,0.05); }
        .nb-podium-card.rank-1 { min-height: 220px; padding-top: 24px; border-color: rgba(185,130,47,0.55); box-shadow: 0 10px 22px rgba(185,130,47,0.14); }
        .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 184px; }
        .nb-podium-card.is-me { outline: 2px solid var(--pen-blue); outline-offset: 2px; }
        .nb-podium-rank { display: flex; align-items: center; gap: 5px; color: var(--gold); font: 700 13px 'JetBrains Mono', monospace; }
        .nb-podium-card.rank-2 .nb-podium-rank { color: #738299; }
        .nb-podium-card.rank-3 .nb-podium-rank { color: #A86E4B; }
        .nb-podium-card > strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
        .nb-podium-card > b { color: var(--pen-blue); font: 700 19px 'JetBrains Mono', monospace; }
        .nb-podium-card > b small { color: var(--slate); font: 500 10px inherit; }
        .nb-podium-me { position: absolute; top: 9px; right: 9px; color: var(--pen-blue); font: 700 9px 'JetBrains Mono', monospace; text-transform: uppercase; }
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
        .nb-ranking-progress span, .nb-row-progress > div span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pen-blue), #63CFDF); }
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
        .nb-ranking-table tr.me td:first-child { box-shadow: inset 3px 0 var(--pen-blue); }
        .nb-ranking-score-col { text-align: right !important; }
        .nb-rank-number { display: inline-flex; align-items: center; justify-content: center; min-width: 27px; height: 27px; color: var(--slate); font: 600 11px 'JetBrains Mono', monospace; }
        .nb-rank-number.rank-1, .nb-rank-number.rank-2, .nb-rank-number.rank-3 { border-radius: 7px; }
        .nb-rank-number.rank-1 { color: #8A6417; background: rgba(185,130,47,0.18); }
        .nb-rank-number.rank-2 { color: #5F6D80; background: rgba(95,109,128,0.13); }
        .nb-rank-number.rank-3 { color: #8E5C40; background: rgba(168,110,75,0.14); }
        .nb-ranking-student { display: flex; align-items: center; gap: 9px; }
        .nb-ranking-student > span { display: flex; flex-direction: column; gap: 2px; }
        .nb-ranking-student strong { font-size: 13px; }
        .nb-ranking-student small { color: var(--pen-blue); font: 600 10px 'JetBrains Mono', monospace; }
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
        .nb-bar-fill.me { background: var(--pen-blue); }
        .nb-bar-value { font-size: 11px; }
        .nb-bar-label { font-size: 10px; color: var(--slate); text-align: center; max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .nb-table-wrap { overflow-x: auto; }
        .nb-table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 420px; }
        .nb-table th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; color: var(--slate); padding: 8px 10px; border-bottom: 1px solid var(--paper-line); white-space: nowrap; }
        .nb-table td { padding: 9px 10px; border-bottom: 1px solid var(--paper-line); white-space: nowrap; }
        .nb-table tr.me { background: rgba(4,166,199,0.06); }

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
        .nb-bottom-nav-item.active { color: #fff; background: var(--pen-blue); box-shadow: 0 4px 12px rgba(4,166,199,0.24); }

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
          .nb-practice-month-head { gap: 8px; padding: 11px 10px; }
          .nb-practice-month-content { padding-left: 8px; padding-right: 8px; }
          .nb-practice-month-summary { font-size: 10px; }
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
          .nb-modal { max-height: 94vh; }
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
          .nb-home-hero-tools { width: 100%; }
          .nb-home-hero-action { flex: 1; justify-content: center; }
          .nb-home-insight-grid { grid-template-columns: 1fr; }
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
        }
      /* ------------------------------------------------------------------ */
        /*  OVERVIEW REDESIGN — modern academic dashboard                  */
        /* ------------------------------------------------------------------ */
        .nb-root {
          --paper: #f6f8fc;
          --paper-line: #e5eaf2;
          --ink: #17243d;
          --ink-soft: #52627a;
          --pen-blue: #2563eb;
          --ac-green: #12a36a;
          --gold: #d99017;
          --red-pen: #dc5a67;
          --slate: #718096;
          background: #101a30;
        }
        .nb-sidebar {
          width: 248px;
          padding: 24px 16px;
          background: linear-gradient(180deg, #111c35 0%, #172644 100%);
          border-right: 1px solid rgba(255,255,255,.07);
        }
        .nb-sidebar::before { opacity: .28; }
        .nb-brand { padding: 0 10px 26px 12px; }
        .nb-brand-mark {
          width: 38px; height: 38px; border-radius: 12px;
          background: linear-gradient(135deg, #3b82f6, #22c1c3);
          box-shadow: 0 8px 20px rgba(37,99,235,.28);
        }
        .nb-brand-text b { font-size: 14px; letter-spacing: -.01em; }
        .nb-nav { gap: 5px; margin-top: 8px; }
        .nb-nav-item {
          min-height: 44px; padding: 11px 14px; border-radius: 11px;
          color: #aab6cc; font-size: 13px; transition: all .18s ease;
        }
        .nb-nav-item:hover { background: rgba(96,165,250,.14); color: #fff; transform: translateX(2px); }
        .nb-nav-item.active {
          background: linear-gradient(90deg, rgba(59,130,246,.98), rgba(37,99,235,.75));
          color: #fff; box-shadow: 0 7px 18px rgba(37,99,235,.22);
        }
        .nb-main {
          background: var(--paper);
          background-image: radial-gradient(circle at 85% -10%, rgba(37,99,235,.07), transparent 30%);
        }
        .nb-main::before { display: none; }
        .nb-topbar {
          padding: 18px 38px;
          background: rgba(246,248,252,.88);
          border-bottom: 1px solid rgba(229,234,242,.85);
          backdrop-filter: blur(14px);
        }
        .nb-content { padding: 32px 38px 52px; max-width: 1560px; }
        .nb-home-page { gap: 22px; }
        .nb-home-hero {
          position: relative; overflow: hidden; min-height: 172px; padding: 32px 34px;
          border-radius: 22px; box-shadow: 0 18px 42px rgba(25,54,104,.16);
        }
        .nb-home-hero::after {
          content: ""; position: absolute; width: 280px; height: 280px; right: 5%; top: -150px;
          border: 1px solid rgba(255,255,255,.17); border-radius: 50%; box-shadow: 0 0 0 30px rgba(255,255,255,.04), 0 0 0 60px rgba(255,255,255,.035);
          pointer-events: none;
        }
        .nb-home-hero.student, .nb-home-hero.teacher {
          background: linear-gradient(120deg, #182d55 0%, #245ac6 57%, #22a8ba 100%);
        }
        .nb-home-hero > div, .nb-home-hero-tools, .nb-home-hero-rank { position: relative; z-index: 1; }
        .nb-home-hero h1 { font-size: 32px; letter-spacing: -.035em; }
        .nb-home-hero p { font-size: 13.5px; max-width: 620px; }
        .nb-eyebrow { color: #7b8aa3; font-size: 10px; letter-spacing: .09em; }
        .nb-home-stat-grid { gap: 14px; }
        .nb-home-stat {
          min-height: 92px; padding: 18px; border: 1px solid #e6ebf3; border-radius: 15px;
          box-shadow: 0 5px 15px rgba(31,52,86,.04); transition: transform .18s ease, box-shadow .18s ease;
        }
        .nb-home-stat:hover { transform: translateY(-2px); box-shadow: 0 11px 24px rgba(31,52,86,.09); }
        .nb-home-stat > span { width: 40px; height: 40px; border-radius: 12px; }
        .nb-home-stat strong { font-size: 21px; }
        .nb-home-stat small { font-size: 11.5px; }
        .nb-home-stat em { color: #8290a5; font-size: 10px; }
        .nb-home-main-grid, .nb-home-insight-grid, .nb-home-lower-grid { gap: 18px; }
        .nb-home-progress-card, .nb-home-class-card, .nb-home-contest-card, .nb-panel {
          border: 1px solid #e5eaf2; border-radius: 17px; box-shadow: 0 7px 22px rgba(31,52,86,.045);
        }
        .nb-home-progress-card, .nb-home-class-card { padding: 25px; background: linear-gradient(135deg, #fff 0%, #f3f8ff 100%); }
        .nb-home-contest-card { padding: 25px; background: linear-gradient(145deg, #fff, #f2fbfa); }
        .nb-home-contest-card.live { border-color: rgba(18,163,106,.3); background: linear-gradient(145deg, #fff, #effaf5); }
        .nb-home-card-head h2, .nb-home-section-head h2 { font-size: 19px; letter-spacing: -.025em; }
        .nb-home-percent { color: var(--pen-blue); font-size: 27px; }
        .nb-home-progress { height: 10px; background: #e5edf7; }
        .nb-home-progress span { background: linear-gradient(90deg, #2563eb, #22b8c7); }
        .nb-home-insight-row, .nb-home-signal-row, .nb-home-question-row, .nb-home-activity-item, .nb-home-student-row, .nb-home-class-feed > div { padding: 12px 0; border-bottom-color: #edf0f5; }
        .nb-home-insight-track { height: 5px; background: #edf1f6; }
        .nb-home-insight-track span { background: linear-gradient(90deg, #2563eb, #50c8d4); }
        .nb-home-next { background: linear-gradient(145deg, #fff, #f9fbff); }
        .nb-home-next-links button { padding: 13px 0; border-top-color: #edf0f5; }
        .nb-link-button { font-size: 11.5px; }
        .nb-btn { border-radius: 10px; padding: 10px 15px; transition: transform .16s ease, box-shadow .16s ease; }
        .nb-btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); box-shadow: 0 6px 14px rgba(37,99,235,.18); }
        .nb-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 9px 18px rgba(37,99,235,.25); }
        .nb-btn-ghost { border-style: solid; border-color: #cdd9eb; background: #fff; }
        .nb-home-class-activity { padding: 21px 24px; }
        .nb-pill { padding: 4px 10px; }
        /* -------------------------------------------------------------- */
        /*  LESSONS REDESIGN                                             */
        /* -------------------------------------------------------------- */
        .nb-lesson-overview {
          grid-template-columns: minmax(0, 1.6fr) repeat(2, minmax(150px, .65fr));
          gap: 14px;
        }
        .nb-lesson-progress-card, .nb-lesson-stat-card, .nb-lesson-catalog, .nb-lesson-reader {
          border-color: #e5eaf2;
          border-radius: 16px;
          box-shadow: 0 7px 22px rgba(31,52,86,.045);
        }
        .nb-lesson-progress-card {
          padding: 20px 22px;
          background: linear-gradient(135deg, #fff 0%, #f2f7ff 100%);
        }
        .nb-lesson-progress-head { margin-bottom: 12px; font-size: 12px; }
        .nb-lesson-progress-head strong { color: var(--pen-blue); font-size: 24px; }
        .nb-progress-track { height: 9px; background: #e5edf7; }
        .nb-progress-fill { background: linear-gradient(90deg, #2563eb, #22b8c7); }
        .nb-lesson-stat-card {
          min-height: 86px; padding: 18px; background: #fff;
          color: var(--pen-blue);
        }
        .nb-lesson-stat-card strong { margin-left: auto; font-size: 24px; }
        .nb-lesson-stat-card span { font-size: 11px; }
        .nb-lesson-toolbar {
          padding: 13px; margin-bottom: 18px; border: 1px solid #e5eaf2;
          border-radius: 14px; background: rgba(255,255,255,.72);
          box-shadow: 0 5px 16px rgba(31,52,86,.035);
        }
        .nb-lesson-search .nb-input {
          height: 42px; border-color: #dfe6f1; border-radius: 11px; background: #fff;
        }
        .nb-chip { padding: 7px 14px; border-color: #dfe6f1; background: #fff; border-radius: 10px; font-size: 11.5px; }
        .nb-chip.active { background: #2563eb; border-color: #2563eb; box-shadow: 0 5px 12px rgba(37,99,235,.16); }
        .nb-lesson-mobile-hint {
          display: none; align-items: center; gap: 7px; margin: -6px 0 16px;
          color: #58708f; font-size: 11px;
        }
        .nb-lesson-layout { grid-template-columns: minmax(260px, .82fr) minmax(0, 1.8fr); gap: 18px; }
        .nb-lesson-catalog { overflow: hidden; background: #fff; }
        .nb-lesson-catalog-head { padding: 18px; background: linear-gradient(180deg, #fbfdff, #fff); border-bottom-color: #edf0f5; }
        .nb-lesson-catalog-list { padding: 6px; gap: 4px; }
        .nb-lesson-catalog-item { border: 0; border-radius: 11px; }
        .nb-lesson-catalog-item.active { background: #eef4ff; box-shadow: inset 3px 0 #2563eb; }
        .nb-lesson-catalog-main { padding: 13px 12px; gap: 11px; }
        .nb-lesson-index { width: 29px; color: #8b9ab0; font-size: 10px; }
        .nb-lesson-catalog-item.active .nb-lesson-index { color: #2563eb; }
        .nb-lesson-catalog-text strong { font-size: 12px; }
        .nb-lesson-catalog-text small { color: #8190a5; font-size: 10px; }
        .nb-lesson-item-actions { padding-right: 5px; }
        .nb-lesson-reader {
          min-height: 560px; padding: 32px 38px 34px; background: #fff;
          scroll-margin-top: 88px;
        }
        .nb-lesson-reader-top { padding-bottom: 13px; border-bottom: 1px solid #edf0f5; }
        .nb-lesson-reader-title { margin: 18px 0 20px; max-width: 850px; color: #17243d; font-size: 34px; letter-spacing: -.035em; }
        .nb-lesson-callout { margin-bottom: 27px; padding: 15px 17px; border-left-width: 4px; border-radius: 0 11px 11px 0; background: #eff6ff; }
        .nb-lesson-callout p { font-size: 13px; line-height: 1.7; }
        .nb-lesson-content { max-width: 860px; color: #34445b; font-size: 14px; line-height: 1.9; }
        .nb-lesson-content p { margin-bottom: 18px; }
        .nb-lesson-progress-actions { gap: 10px; padding-top: 4px; }
        .nb-lesson-discussion { max-width: 860px; margin-top: 30px; padding-top: 24px; }
        @media (max-width: 900px) {
          .nb-content { padding: 24px 22px 40px; }
          .nb-topbar { padding-left: 22px; padding-right: 22px; }
          .nb-home-hero { padding: 26px; }
          .nb-lesson-overview { grid-template-columns: 1fr 1fr; }
          .nb-lesson-progress-card { grid-column: 1 / -1; }
          .nb-lesson-toolbar { align-items: stretch; padding: 11px; }
          .nb-lesson-search { flex-basis: 100%; }
          .nb-lesson-mobile-hint { display: flex; }
          .nb-lesson-layout { display: flex; flex-direction: column; gap: 14px; }
          .nb-lesson-catalog, .nb-lesson-reader { width: 100%; }
          .nb-lesson-catalog { max-height: 310px; overflow-y: auto; }
          .nb-lesson-reader { min-height: 0; padding: 25px 20px 28px; scroll-margin-top: 76px; }
          .nb-lesson-reader-title { font-size: 28px; }
          .nb-lesson-content { font-size: 13.5px; }
          .nb-lesson-progress-actions .nb-btn { flex: 1; justify-content: center; }
        }
        @media (max-width: 560px) {
          .nb-lesson-overview { grid-template-columns: 1fr; }
          .nb-lesson-progress-card { grid-column: auto; }
          .nb-lesson-stat-card { min-height: 70px; }
          .nb-lesson-stat-card strong { font-size: 20px; }
          .nb-lesson-reader-title { font-size: 25px; }
          .nb-lesson-callout { padding: 13px 14px; }
          .nb-lesson-progress-actions { flex-direction: column; }
          .nb-lesson-progress-actions .nb-btn { width: 100%; }
        }
        /* -------------------------------------------------------------- */
        /*  PRACTICE & PYTHON REDESIGN                                  */
        /* -------------------------------------------------------------- */
        .nb-practice-progress-board {
          grid-template-columns: minmax(260px, 1fr) minmax(280px, 1.2fr);
          margin-bottom: 20px; border: 1px solid #dfe7f3; border-radius: 17px;
          box-shadow: 0 8px 24px rgba(31,52,86,.06);
        }
        .nb-practice-progress-copy {
          min-height: 112px; padding: 22px 24px;
          background: linear-gradient(125deg, #182d55 0%, #2563eb 62%, #22a8ba 100%);
        }
        .nb-practice-progress-copy strong { font-size: 30px; }
        .nb-practice-track { height: 8px; margin-top: 4px; }
        .nb-practice-summary { background: #e8edf5; }
        .nb-practice-summary-card { padding: 18px 21px; background: #fff; }
        .nb-practice-summary-card strong { font-size: 21px; }
        .nb-practice-toolbar {
          align-items: stretch; gap: 16px; padding: 14px; margin-bottom: 20px;
          border: 1px solid #e1e8f2; border-radius: 15px; background: rgba(255,255,255,.82);
          box-shadow: 0 6px 18px rgba(31,52,86,.04);
        }
        .nb-practice-search {
          min-height: 42px; padding: 0 12px; border-color: #dfe6f1; border-radius: 11px; background: #fff;
        }
        .nb-practice-search:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.09); }
        .nb-practice-filter-stack { gap: 6px; }
        .nb-practice-filter-stack > span { color: #7d8ca4; font-size: 9px; }
        .nb-practice-toolbar .nb-chip { padding: 7px 12px; border-radius: 9px; font-size: 10.5px; }
        .nb-practice-teacher-board {
          margin-bottom: 20px; padding: 19px 21px; border: 1px solid #dce6f5; border-left: 4px solid #2563eb;
          border-radius: 0 15px 15px 0; background: linear-gradient(100deg, #eef5ff, #fff);
          box-shadow: 0 6px 18px rgba(31,52,86,.04);
        }
        .nb-practice-teacher-board h3 { font-size: 17px; }
        .nb-practice-roadmap {
          padding: 22px 23px 24px; border: 1px solid #e1e8f2; border-radius: 17px;
          box-shadow: 0 7px 22px rgba(31,52,86,.045);
        }
        .nb-practice-roadmap-head { padding-bottom: 18px; border-bottom-color: #e9edf4; }
        .nb-practice-roadmap-head h3 { font-size: 19px; letter-spacing: -.02em; }
        .nb-practice-month-group { margin-top: 16px; border-color: #e0e7f1; border-radius: 13px; background: #fbfdff; }
        .nb-practice-month-head { padding: 15px 17px; border-bottom-color: #e9edf4; }
        .nb-practice-month-head:hover { background: #f0f6ff; }
        .nb-practice-month-marker { width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(135deg, #2563eb, #22a8ba); box-shadow: 0 5px 12px rgba(37,99,235,.18); }
        .nb-practice-month-title > span { color: #8a98ac; font-size: 9px; }
        .nb-practice-month-title strong { font-size: 15px; }
        .nb-practice-month-summary { color: #718096; font-size: 10.5px; }
        .nb-practice-month-content { padding: 0 16px 16px; }
        .nb-practice-group { grid-template-columns: 40px minmax(0, 1fr); gap: 12px; padding-top: 20px; }
        .nb-practice-group-rail span { width: 29px; height: 29px; background: #eef4ff; color: #2563eb; box-shadow: 0 0 0 4px #fbfdff; }
        .nb-practice-group-rail i { background: #dce6f5; }
        .nb-practice-group-head { margin-bottom: 11px; }
        .nb-practice-group-head p { color: #8795aa; font-size: 9px; }
        .nb-practice-group-head h3 { font-size: 17px; letter-spacing: -.015em; }
        .nb-practice-problem-list { border-top-color: #e8edf4; }
        .nb-practice-problem {
          min-height: 66px; padding: 13px 8px 13px 0; border-bottom-color: #edf0f5; border-radius: 9px;
        }
        .nb-practice-problem:hover { padding-left: 10px; background: #f4f8ff; }
        .nb-practice-problem-index { color: #8b9ab0; }
        .nb-practice-problem h4 { font-size: 13px; }
        .nb-practice-problem-meta { color: #7d8ca4; font-size: 10px; }
        .nb-practice-status { padding: 3px 8px; }
        .nb-practice-problem-score strong { font-size: 12px; }
        .nb-practice-manage-action { border-radius: 8px; }
        @media (max-width: 900px) {
          .nb-practice-progress-board { grid-template-columns: 1fr; }
          .nb-practice-toolbar { gap: 12px; }
          .nb-practice-roadmap { padding: 18px 14px 20px; }
          .nb-practice-month-content { padding-left: 8px; padding-right: 8px; }
        }
        @media (max-width: 560px) {
          .nb-practice-progress-copy { min-height: 104px; padding: 19px; }
          .nb-practice-summary-card { padding: 15px; }
          .nb-practice-toolbar { padding: 11px; }
          .nb-practice-filter-stack { width: 100%; }
          .nb-practice-filter-stack .nb-filter-row { width: 100%; }
          .nb-practice-filter-stack .nb-chip { flex: 1; padding-left: 6px; padding-right: 6px; }
          .nb-practice-roadmap-head { flex-direction: column; gap: 7px; }
          .nb-practice-month-head { gap: 8px; padding: 13px 11px; }
          .nb-practice-month-summary { margin-left: auto; }
          .nb-practice-group { grid-template-columns: 28px minmax(0, 1fr); gap: 8px; }
          .nb-practice-problem { grid-template-columns: 24px minmax(0, 1fr); gap: 8px; padding-right: 0; }
          .nb-practice-problem-score { grid-column: 2; justify-content: flex-start; min-width: 0; padding-top: 3px; }
          .nb-practice-problem.teacher { grid-template-columns: 24px minmax(0, 1fr); }
          .nb-practice-problem.teacher .nb-practice-problem-actions { grid-column: 2; padding: 6px 0 0; border: 0; }
          .nb-practice-problem h4 { white-space: normal; line-height: 1.45; }
        }
        /* -------------------------------------------------------------- */
        /*  CONTESTS / MOCK EXAMS REDESIGN                              */
        /* -------------------------------------------------------------- */
        .nb-exam-page { gap: 20px; }
        .nb-exam-hero {
          position: relative; overflow: hidden; min-height: 178px; padding: 32px 34px;
          border-radius: 22px; background: linear-gradient(120deg, #182d55 0%, #245ac6 58%, #22a8ba 100%);
          box-shadow: 0 18px 42px rgba(25,54,104,.16);
        }
        .nb-exam-hero::after {
          content: ""; position: absolute; width: 290px; height: 290px; right: 7%; top: -155px;
          border: 1px solid rgba(255,255,255,.18); border-radius: 50%;
          box-shadow: 0 0 0 30px rgba(255,255,255,.04), 0 0 0 62px rgba(255,255,255,.035); pointer-events: none;
        }
        .nb-exam-hero > div { position: relative; z-index: 1; }
        .nb-exam-title { font-size: 33px; letter-spacing: -.035em; }
        .nb-exam-sub { max-width: 620px; font-size: 13.5px; }
        .nb-exam-hero-icon { border-radius: 12px; padding: 14px 17px; background: rgba(255,255,255,.12); backdrop-filter: blur(5px); }
        .nb-exam-stat-grid { gap: 14px; }
        .nb-exam-stat {
          min-height: 90px; padding: 18px; border-color: #e5eaf2; border-radius: 15px;
          box-shadow: 0 5px 15px rgba(31,52,86,.04); transition: transform .18s ease, box-shadow .18s ease;
        }
        .nb-exam-stat:hover { transform: translateY(-2px); box-shadow: 0 11px 24px rgba(31,52,86,.09); }
        .nb-exam-stat > span { width: 40px; height: 40px; border-radius: 12px; }
        .nb-exam-stat strong { font-size: 21px; }
        .nb-exam-stat small { font-size: 11.5px; }
        .nb-exam-create-panel, .nb-exam-toolbar {
          border-color: #e1e8f2; border-radius: 15px; box-shadow: 0 6px 18px rgba(31,52,86,.04);
        }
        .nb-exam-create-panel { padding: 20px; }
        .nb-exam-manage-head h3 { font-size: 18px; }
        .nb-exam-form { margin-top: 20px; padding-top: 20px; gap: 17px; border-top-color: #e9edf4; }
        .nb-exam-form-grid { gap: 12px; }
        .nb-exam-form-grid label > span { font-size: 10px; }
        .nb-exam-check { padding: 12px; border-color: #e1e8f2; border-radius: 10px; background: #fbfdff; transition: border-color .15s, background .15s; }
        .nb-exam-check:hover { border-color: #9db9ed; }
        .nb-exam-check.selected { border-color: #2563eb; background: #eef4ff; }
        .nb-exam-toolbar { padding: 14px; background: rgba(255,255,255,.82); }
        .nb-exam-search { height: 42px; border-color: #dfe6f1; border-radius: 11px; }
        .nb-exam-search:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.09); }
        .nb-exam-list { gap: 15px; }
        .nb-exam-card {
          gap: 15px; padding: 22px 23px 20px 28px; border-color: #e1e8f2; border-radius: 16px;
          box-shadow: 0 7px 22px rgba(31,52,86,.045); transition: transform .18s ease, box-shadow .18s ease;
        }
        .nb-exam-card:hover { transform: translateY(-2px); box-shadow: 0 13px 28px rgba(31,52,86,.09); }
        .nb-exam-card-accent { width: 5px; }
        .nb-exam-card-head h3 { font-size: 19px; letter-spacing: -.02em; }
        .nb-exam-card-kicker { margin-bottom: 9px; }
        .nb-exam-card-meta { gap: 16px; font-size: 11.5px; }
        .nb-exam-card-progress { max-width: 600px; padding: 11px 13px; border: 1px solid #e7edf5; border-radius: 10px; background: #fbfdff; }
        .nb-exam-progress { height: 8px; background: #e7edf5; }
        .nb-exam-progress span { background: linear-gradient(90deg, #2563eb, #22b8c7); }
        .nb-exam-card-actions { padding-top: 5px; }
        .nb-exam-card-actions .nb-btn { border-radius: 10px; }
        .nb-exam-empty { padding: 62px 15px; border-color: #dfe7f2; border-radius: 15px; }
        .nb-contest-bar {
          position: sticky; top: 0; z-index: 4; padding: 12px 14px; border: 1px solid #e1e8f2;
          border-radius: 14px; background: rgba(255,255,255,.9); box-shadow: 0 7px 20px rgba(31,52,86,.08); backdrop-filter: blur(12px);
        }
        .nb-problem-card { border-color: #e1e8f2; border-radius: 14px; box-shadow: 0 5px 16px rgba(31,52,86,.04); }
        .nb-problem-card:hover { border-color: #9db9ed; box-shadow: 0 10px 22px rgba(31,52,86,.1); }
        .nb-exam-room-head, .nb-exam-navigator, .nb-exam-room-intro { border-color: #e1e8f2; border-radius: 15px; box-shadow: 0 6px 18px rgba(31,52,86,.04); }
        .nb-exam-room-head { padding: 18px 20px; }
        .nb-exam-navigator-head { padding: 16px; }
        .nb-exam-nav-item { padding: 13px 12px; border-bottom-color: #edf0f5; }
        .nb-exam-nav-item:hover, .nb-exam-nav-item.active { background: #eef4ff; box-shadow: inset 3px 0 #2563eb; }
        @media (max-width: 900px) {
          .nb-exam-hero { min-height: 160px; padding: 27px; }
          .nb-exam-stat-grid { gap: 10px; }
          .nb-exam-create-panel { padding: 17px; }
          .nb-exam-card { padding: 20px 19px 18px 24px; }
          .nb-exam-room-head { padding: 15px; }
        }
        @media (max-width: 560px) {
          .nb-exam-hero { padding: 23px 20px; border-radius: 18px; }
          .nb-exam-title { font-size: 27px; }
          .nb-exam-sub { font-size: 12.5px; }
          .nb-exam-stat { min-height: 76px; padding: 12px; }
          .nb-exam-stat > span { width: 34px; height: 34px; border-radius: 10px; }
          .nb-exam-stat strong { font-size: 17px; }
          .nb-exam-stat small { font-size: 10px; }
          .nb-exam-card-head { gap: 8px; }
          .nb-exam-card-head h3 { font-size: 16px; }
          .nb-exam-card-code { font-size: 9px; }
          .nb-exam-card-meta { gap: 8px; font-size: 10px; }
          .nb-exam-card-actions .nb-btn { flex: 1; justify-content: center; }
          .nb-exam-room-head { border-radius: 12px; }
          .nb-contest-bar { gap: 8px; flex-wrap: wrap; }
          .nb-contest-bar .nb-btn { order: 1; }
          .nb-contest-bar .nb-exam-timer { order: 2; margin-left: auto; }
          .nb-contest-bar > .nb-sub { order: 3; flex-basis: 100%; }
        }
        /* -------------------------------------------------------------- */
        /*  CONTEST STATISTICS                                           */
        /* -------------------------------------------------------------- */
        .nb-contest-stats-modal { max-width: 820px; border: 1px solid #e1e8f2; box-shadow: 0 24px 70px rgba(18,35,70,.2); }
        .nb-contest-stats-modal .nb-modal-head { padding-bottom: 18px; border-bottom: 1px solid #e9edf4; }
        .nb-contest-stats-modal .nb-modal-head h3 { margin-top: 5px; font-size: 21px; }
        .nb-contest-stats-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
        .nb-contest-stats-summary > div { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid #e2e9f3; border-radius: 12px; background: #f8fbff; }
        .nb-contest-stats-summary strong { color: #2563eb; font: 700 21px 'JetBrains Mono', monospace; }
        .nb-contest-stats-summary span { color: #718096; font-size: 10.5px; }
        .nb-contest-stats-table-wrap { overflow-x: auto; border: 1px solid #e2e9f3; border-radius: 13px; }
        .nb-contest-stats-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 12px; }
        .nb-contest-stats-table th { padding: 11px 13px; color: #7a8aa2; background: #f7f9fc; font: 600 10px 'JetBrains Mono', monospace; letter-spacing: .03em; text-align: left; text-transform: uppercase; }
        .nb-contest-stats-table td { padding: 12px 13px; color: #52627a; border-top: 1px solid #edf0f5; }
        .nb-contest-stats-table tbody tr:hover { background: #f8fbff; }
        .nb-contest-stats-table td:last-child b { color: #2563eb; font: 700 14px 'JetBrains Mono', monospace; }
        .nb-contest-stats-table td:last-child small { color: #8a98ac; font-size: 10px; }
        .nb-contest-student { display: flex; align-items: center; gap: 9px; color: #17243d; }
        .nb-contest-student strong { font-size: 12px; }
        .nb-contest-rank { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; color: #718096; background: #edf1f6; font: 700 10px 'JetBrains Mono', monospace; }
        .nb-contest-rank.rank-1 { color: #a66b0d; background: #fff1ce; }
        .nb-contest-rank.rank-2 { color: #617084; background: #edf0f4; }
        .nb-contest-rank.rank-3 { color: #8b5c3c; background: #f5e8df; }
        .nb-contest-stats-modal .nb-modal-actions { justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid #e9edf4; }
        .nb-review-modal { padding: 22px; max-width: 720px; }
        .nb-review-modal .nb-modal-head { padding: 0 0 16px; border-bottom: 1px solid var(--paper-line); }
        .nb-review-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 16px 0; }
        .nb-review-list { display: flex; flex-direction: column; gap: 8px; max-height: 52vh; overflow-y: auto; }
        .nb-review-item { border: 1px solid var(--paper-line); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
        .nb-review-item-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fff; border: none; cursor: pointer; text-align: left; font: inherit; min-height: 52px; box-sizing: border-box; }
        .nb-review-item-head:hover { background: #f8fafc; }
        .nb-review-item-head .nb-pill { flex-shrink: 0; white-space: nowrap; }
        .nb-review-item-head > .nb-avatar { flex-shrink: 0; }
        .nb-review-item-info { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
        .nb-review-item-info strong { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-review-item-info small { color: #8a98ac; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-review-item-score { font: 700 13px 'JetBrains Mono', monospace; color: var(--pen-blue); white-space: nowrap; flex-shrink: 0; }
        .nb-review-item-chevron { transition: transform .15s; color: #9aa6ba; flex-shrink: 0; }
        .nb-review-item-chevron.open { transform: rotate(90deg); }
        .nb-history-code-wrap { border-top: 1px dashed var(--paper-line); padding: 10px 12px; background: #fafbfd; }
        .nb-history-code-wrap .nb-history-code { max-height: 320px; }
        @media (max-width: 560px) {
          .nb-review-item-head { flex-wrap: wrap; }
          .nb-review-item-info { order: 1; width: 100%; }
        }
        @media (max-width: 560px) {
          .nb-contest-stats-modal { max-height: 92vh; }
          .nb-contest-stats-summary { gap: 7px; }
          .nb-contest-stats-summary > div { padding: 11px 9px; }
          .nb-contest-stats-summary strong { font-size: 17px; }
          .nb-contest-stats-summary span { font-size: 9px; }
          .nb-contest-stats-table { min-width: 500px; }
        }
        /* -------------------------------------------------------------- */
        /*  LEADERBOARD REDESIGN                                         */
        /* -------------------------------------------------------------- */
        .nb-ranking-page { gap: 21px; }
        .nb-ranking-hero {
          position: relative; overflow: hidden; min-height: 178px; padding: 32px 34px;
          border-radius: 22px; background: linear-gradient(120deg, #182d55 0%, #245ac6 58%, #22a8ba 100%);
          box-shadow: 0 18px 42px rgba(25,54,104,.16);
        }
        .nb-ranking-hero::after {
          content: ""; position: absolute; width: 290px; height: 290px; right: 7%; top: -155px;
          border: 1px solid rgba(255,255,255,.18); border-radius: 50%;
          box-shadow: 0 0 0 30px rgba(255,255,255,.04), 0 0 0 62px rgba(255,255,255,.035); pointer-events: none;
        }
        .nb-ranking-hero > div { position: relative; z-index: 1; }
        .nb-ranking-title { font-size: 33px; letter-spacing: -.035em; }
        .nb-ranking-sub { font-size: 13.5px; }
        .nb-ranking-hero-badge { border-radius: 12px; padding: 13px 16px; background: rgba(255,255,255,.12); backdrop-filter: blur(5px); }
        .nb-ranking-stat-grid { gap: 14px; }
        .nb-ranking-stat {
          min-height: 90px; padding: 18px; border-color: #e5eaf2; border-radius: 15px;
          box-shadow: 0 5px 15px rgba(31,52,86,.04); transition: transform .18s ease, box-shadow .18s ease;
        }
        .nb-ranking-stat:hover { transform: translateY(-2px); box-shadow: 0 11px 24px rgba(31,52,86,.09); }
        .nb-ranking-stat-icon { width: 40px; height: 40px; flex-basis: 40px; border-radius: 12px; }
        .nb-ranking-stat strong { font-size: 21px; }
        .nb-ranking-stat small { font-size: 11.5px; }
        .nb-ranking-podium { gap: 15px; min-height: 246px; }
        .nb-podium-card {
          padding: 22px 16px 18px; border-color: #e1e8f2; border-radius: 17px;
          box-shadow: 0 7px 20px rgba(31,52,86,.06); transition: transform .18s ease, box-shadow .18s ease;
        }
        .nb-podium-card:hover { transform: translateY(-3px); box-shadow: 0 13px 28px rgba(31,52,86,.1); }
        .nb-podium-card.rank-1 { min-height: 246px; padding-top: 27px; border-color: rgba(217,144,23,.5); background: linear-gradient(160deg, #fffdf8, #fff); box-shadow: 0 12px 27px rgba(185,130,47,.15); }
        .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 202px; }
        .nb-podium-card.is-me { outline: 2px solid #2563eb; outline-offset: 3px; }
        .nb-podium-card > strong { font-size: 14px; }
        .nb-podium-card > b { font-size: 20px; }
        .nb-ranking-insight-grid { gap: 18px; }
        .nb-ranking-chart-panel, .nb-ranking-me-panel, .nb-ranking-table-panel { border-color: #e1e8f2; border-radius: 17px; box-shadow: 0 7px 22px rgba(31,52,86,.045); }
        .nb-ranking-chart-panel, .nb-ranking-me-panel { padding: 22px; }
        .nb-ranking-section-head h3 { font-size: 18px; letter-spacing: -.02em; }
        .nb-ranking-me-score strong { font-size: 35px; }
        .nb-ranking-progress, .nb-row-progress > div { height: 8px; background: #e7edf5; }
        .nb-ranking-progress span, .nb-row-progress > div span { background: linear-gradient(90deg, #2563eb, #22b8c7); }
        .nb-ranking-toolbar {
          gap: 16px; padding: 14px; border: 1px solid #e1e8f2; border-radius: 15px;
          background: rgba(255,255,255,.82); box-shadow: 0 6px 18px rgba(31,52,86,.04);
        }
        .nb-ranking-search { height: 42px; border-color: #dfe6f1; border-radius: 11px; }
        .nb-ranking-search:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.09); }
        .nb-ranking-controls .nb-input { height: 42px; border-color: #dfe6f1; border-radius: 10px; }
        .nb-ranking-controls .nb-chip { border-radius: 9px; padding: 7px 12px; }
        .nb-ranking-table-panel { padding: 22px 22px 10px; }
        .nb-ranking-table-title { margin-bottom: 15px; }
        .nb-ranking-table th { padding: 10px 12px; color: #7a8aa2; border-bottom-color: #e7edf5; }
        .nb-ranking-table td { height: 58px; padding: 11px 12px; border-bottom-color: #edf0f5; }
        .nb-ranking-table tbody tr:hover { background: #f8fbff; }
        .nb-ranking-table tr.me { background: #eef4ff; }
        .nb-ranking-table tr.me td:first-child { box-shadow: inset 3px 0 #2563eb; }
        .nb-rank-number { min-width: 29px; height: 29px; border-radius: 8px; }
        .nb-ranking-student strong { font-size: 13px; }
        .nb-barchart { height: 235px; gap: 12px; }
        .nb-bar-fill { border-radius: 7px 7px 0 0; background: linear-gradient(180deg, #4f86f7, #2563eb); }
        .nb-bar-fill.me { background: linear-gradient(180deg, #22b8c7, #12a36a); }
        @media (max-width: 900px) {
          .nb-ranking-hero { min-height: 160px; padding: 27px; }
          .nb-ranking-podium { gap: 10px; }
          .nb-ranking-chart-panel, .nb-ranking-me-panel { padding: 18px; }
          .nb-ranking-table-panel { padding: 18px 14px 8px; }
        }
        @media (max-width: 560px) {
          .nb-ranking-hero { padding: 23px 20px; border-radius: 18px; }
          .nb-ranking-title { font-size: 27px; }
          .nb-ranking-sub { font-size: 12.5px; }
          .nb-ranking-stat-grid { gap: 8px; }
          .nb-ranking-stat { min-height: 76px; padding: 12px; }
          .nb-ranking-stat-icon { width: 34px; height: 34px; flex-basis: 34px; border-radius: 10px; }
          .nb-ranking-stat strong { font-size: 17px; }
          .nb-ranking-stat small { font-size: 10px; }
          .nb-ranking-podium { gap: 5px; min-height: 188px; }
          .nb-podium-card { padding: 14px 7px 13px; border-radius: 11px; }
          .nb-podium-card.rank-1 { min-height: 188px; padding-top: 18px; }
          .nb-podium-card.rank-2, .nb-podium-card.rank-3 { min-height: 162px; }
          .nb-podium-card > strong { max-width: 90px; font-size: 10.5px; }
          .nb-podium-card > b { font-size: 15px; }
          .nb-ranking-toolbar { padding: 11px; }
          .nb-ranking-controls { gap: 9px; }
          .nb-ranking-controls .nb-input { width: 100%; }
          .nb-ranking-controls .nb-filter-row { width: 100%; }
          .nb-ranking-controls .nb-chip { flex: 1; padding-left: 6px; padding-right: 6px; }
          .nb-barchart { height: 190px; gap: 7px; }
        }
        /* -------------------------------------------------------------- */
        /*  ACCOUNT MANAGEMENT REDESIGN                                  */
        /* -------------------------------------------------------------- */
        .nb-management-panel { margin-bottom: 20px; }
        .nb-home-stat-grid[style*="marginBottom"] { gap: 14px; }
        .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat {
          min-height: 90px; padding: 18px; border-radius: 15px; border-color: #e5eaf2;
          box-shadow: 0 5px 15px rgba(31,52,86,.04); transition: transform .18s ease, box-shadow .18s ease;
        }
        .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat:hover { transform: translateY(-2px); box-shadow: 0 11px 24px rgba(31,52,86,.09); }
        .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat > span { width: 40px; height: 40px; border-radius: 12px; }
        .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat strong { font-size: 21px; }
        .nb-panel:has(.nb-management-head) { border-color: #e1e8f2; border-radius: 17px; box-shadow: 0 7px 22px rgba(31,52,86,.045); }
        .nb-panel:has(.nb-management-head) > .nb-management-head { padding: 21px 22px 16px !important; }
        .nb-management-head h3 { font-size: 19px; letter-spacing: -.02em; }
        .nb-management-head .nb-sub { max-width: 700px; line-height: 1.6; }
        .nb-panel:has(.nb-management-head) > .nb-exam-toolbar {
          margin: 0; padding: 0 22px 18px !important; border: 0; border-radius: 0; box-shadow: none; background: transparent;
        }
        .nb-panel:has(.nb-management-head) .nb-exam-search { height: 42px; border-color: #dfe6f1; border-radius: 11px; }
        .nb-panel:has(.nb-management-head) .nb-exam-search:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.09); }
        .nb-panel:has(.nb-management-head) .nb-chip { border-radius: 9px; padding: 7px 12px; }
        .nb-panel:has(.nb-management-head) .nb-form {
          margin: 2px 22px 22px !important; padding: 20px; border: 1px solid #dfe7f2; border-radius: 14px; background: #f8fbff;
        }
        .nb-panel:has(.nb-management-head) .nb-form label { gap: 6px; }
        .nb-panel:has(.nb-management-head) .nb-form .nb-input { height: 42px; border-color: #dfe6f1; border-radius: 10px; background: #fff; }
        .nb-field-label { color: #7a8aa2; font: 600 10px 'JetBrains Mono', monospace; letter-spacing: .03em; text-transform: uppercase; }
        .nb-panel:has(.nb-management-head) .nb-table { min-width: 850px; }
        .nb-panel:has(.nb-management-head) .nb-table th { padding: 11px 14px; color: #7a8aa2; background: #f7f9fc; border-bottom-color: #e7edf5; }
        .nb-panel:has(.nb-management-head) .nb-table td { height: 64px; padding: 12px 14px; border-bottom-color: #edf0f5; vertical-align: middle; }
        .nb-panel:has(.nb-management-head) .nb-table tbody tr:hover { background: #f8fbff; }
        .nb-panel:has(.nb-management-head) .nb-table tbody tr > td:first-child strong { color: #17243d; font-size: 13px; }
        .nb-panel:has(.nb-management-head) .nb-table tbody tr > td:nth-child(3) { color: #607089; font-size: 12px; }
        .nb-panel:has(.nb-management-head) .nb-table td .nb-input { height: 36px; border-radius: 9px; background: #fff; }
        .nb-panel:has(.nb-management-head) .nb-table td .nb-btn { padding: 8px 11px; border-radius: 9px; font-size: 11px; }
        .nb-panel:has(.nb-management-head) .nb-pill { padding: 5px 9px; border-radius: 8px; font-size: 9px; }
        @media (max-width: 900px) {
          .nb-home-stat-grid[style*="marginBottom"] { grid-template-columns: repeat(2, 1fr); }
          .nb-panel:has(.nb-management-head) > .nb-management-head { padding-left: 17px !important; padding-right: 17px !important; }
          .nb-panel:has(.nb-management-head) > .nb-exam-toolbar { padding-left: 17px !important; padding-right: 17px !important; }
        }
        @media (max-width: 560px) {
          .nb-home-stat-grid[style*="marginBottom"] { gap: 8px; }
          .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat { min-height: 76px; padding: 12px; }
          .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat > span { width: 34px; height: 34px; border-radius: 10px; }
          .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat strong { font-size: 17px; }
          .nb-home-stat-grid[style*="marginBottom"] .nb-home-stat small { font-size: 10px; }
          .nb-panel:has(.nb-management-head) > .nb-management-head { gap: 10px; align-items: flex-start; }
          .nb-panel:has(.nb-management-head) > .nb-management-head .nb-btn { flex-shrink: 0; padding: 9px 10px; font-size: 10px; }
          .nb-panel:has(.nb-management-head) .nb-form { margin-left: 12px !important; margin-right: 12px !important; padding: 14px; }
          .nb-panel:has(.nb-management-head) > .nb-exam-toolbar { padding-left: 12px !important; padding-right: 12px !important; }
          .nb-panel:has(.nb-management-head) .nb-filter-row { width: 100%; }
          .nb-panel:has(.nb-management-head) .nb-filter-row .nb-chip { flex: 1; padding-left: 6px; padding-right: 6px; }
          .nb-panel:has(.nb-management-head) .nb-table { min-width: 820px; }
        }

        .nb-brand-mark.nb-brand-logo { background: #0F172A; padding: 0; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 6px 16px rgba(15,23,42,.28); box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .nb-brand-mark.nb-brand-logo svg { display: block; width: 72%; height: 72%; flex: none; }
        /* --- Cập nhật: biểu đồ đường đua điểm (không tràn trên điện thoại) + chuyên đề thu gọn --- */
        .nb-bar-fill { height: var(--pct, 0%); }
        .nb-bar-value { max-width: 100%; white-space: nowrap; font-size: 10.5px; }
        .nb-practice-group-toggle { width: 100%; background: none; border: 0; padding: 4px 0; margin-bottom: 9px; cursor: pointer; text-align: left; font: inherit; color: inherit; align-items: center; }
        .nb-practice-group-toggle > div:first-child { min-width: 0; flex: 1; }
        .nb-practice-group-chevron { flex-shrink: 0; color: var(--slate); transition: transform .18s ease; }
        .nb-practice-group-chevron.open { transform: rotate(90deg); }
        .nb-practice-group-toggle:hover h3 { color: var(--pen-blue); }
        .nb-practice-roadmap-tools { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .nb-practice-roadmap-tools > div { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .nb-practice-roadmap-tools .nb-btn { padding: 6px 11px; font-size: 12px; }
        @media (max-width: 640px) {
          .nb-barchart { flex-direction: column; align-items: stretch; height: auto; gap: 9px; padding: 6px 0 0; }
          .nb-bar-col { flex-direction: row; align-items: center; gap: 8px; height: auto; }
          .nb-bar-label { order: 1; width: 62px; max-width: 62px; flex: 0 0 62px; text-align: left; font-size: 11px; }
          .nb-bar-track { order: 2; flex: 1; min-width: 0; max-width: none; height: 14px; align-items: stretch; background: rgba(37,99,235,.07); border-radius: 7px; overflow: hidden; }
          .nb-bar-fill { height: 100%; width: var(--pct, 0%); min-height: 0; min-width: 3px; border-radius: 7px; background: linear-gradient(90deg, #4f86f7, #2563eb); }
          .nb-bar-fill.me { background: linear-gradient(90deg, #22b8c7, #12a36a); }
          .nb-bar-value { order: 3; width: 48px; flex: 0 0 48px; text-align: right; font-size: 12px; }
          .nb-practice-roadmap-head { flex-direction: column; align-items: stretch; }
          .nb-practice-roadmap-tools { align-items: flex-start; }
          .nb-practice-roadmap-tools > div { justify-content: flex-start; }
        }

        /* --- Thống kê lượt làm bài theo ngày (tổng quan giáo viên) --- */
        .nb-daily-panel { margin: 0 0 18px; padding: 18px 20px; }
        .nb-daily-chart { display: flex; align-items: stretch; gap: 6px; height: 168px; margin: 6px 0 14px; overflow-x: auto; padding-bottom: 2px; }
        .nb-daily-col { flex: 1 0 28px; min-width: 28px; display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: 0; padding: 4px 0 2px; border-radius: 8px; cursor: pointer; font: inherit; color: inherit; }
        .nb-daily-col:hover { background: rgba(37,99,235,.05); }
        .nb-daily-col.selected { background: rgba(37,99,235,.1); }
        .nb-daily-count { font-size: 10.5px; color: var(--slate); }
        .nb-daily-bar-track { flex: 1; width: 100%; max-width: 26px; display: flex; align-items: flex-end; }
        .nb-daily-bar { display: block; width: 100%; min-height: 3px; border-radius: 5px 5px 0 0; background: linear-gradient(180deg, #4f86f7, #2563eb); }
        .nb-daily-col.selected .nb-daily-bar { background: linear-gradient(180deg, #22b8c7, #12a36a); }
        .nb-daily-label { font-size: 10px; color: var(--slate); white-space: nowrap; }
        .nb-daily-col.selected .nb-daily-label { color: var(--ink); font-weight: 700; }
        .nb-daily-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .nb-daily-date { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--slate); }
        .nb-daily-date .nb-input { width: 170px; }
        .nb-daily-stats { display: flex; gap: 10px; flex-wrap: wrap; }
        .nb-daily-stats > div { display: flex; flex-direction: column; gap: 1px; padding: 8px 14px; border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; min-width: 96px; }
        .nb-daily-stats strong { font-size: 18px; color: var(--ink); }
        .nb-daily-stats span { font-size: 11px; color: var(--slate); }
        .nb-daily-list { display: flex; flex-direction: column; gap: 7px; }
        .nb-daily-student { border: 1px solid var(--paper-line); border-radius: 10px; background: #fff; overflow: hidden; flex-shrink: 0; }
        .nb-daily-student-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: none; border: 0; cursor: pointer; text-align: left; font: inherit; color: inherit; }
        .nb-daily-student-head:hover { background: rgba(37,99,235,.04); }
        .nb-daily-student-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .nb-daily-student-info strong { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-daily-student-info small { font-size: 11px; color: var(--slate); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-daily-student-count { font-size: 12px; font-weight: 700; color: var(--pen-blue); white-space: nowrap; }
        .nb-daily-subs { display: flex; flex-direction: column; border-top: 1px solid var(--paper-line); background: #fafbfd; }
        .nb-daily-sub { border-bottom: 1px solid var(--paper-line); flex-shrink: 0; }
        .nb-daily-sub:last-child { border-bottom: 0; }
        .nb-daily-sub-head { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 12px; background: none; border: 0; cursor: pointer; text-align: left; font: inherit; color: inherit; }
        .nb-daily-sub-head:hover { background: rgba(37,99,235,.05); }
        .nb-daily-sub-time { font-size: 11px; color: var(--slate); flex: 0 0 42px; }
        .nb-daily-sub-title { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-daily-sub-score { font-size: 11px; color: var(--slate); flex: 0 0 auto; }
        .nb-daily-sub-code-icon { color: var(--slate); flex: 0 0 auto; }
        .nb-daily-foot { margin: 10px 2px 0; }
        @media (max-width: 640px) {
          .nb-daily-panel { padding: 14px 12px; }
          .nb-daily-chart { height: 148px; }
          .nb-daily-date .nb-input { width: 100%; }
          .nb-daily-date { width: 100%; }
          .nb-daily-stats { width: 100%; }
          .nb-daily-stats > div { flex: 1; min-width: 0; padding: 8px 10px; }
          .nb-daily-sub-head { flex-wrap: wrap; }
          .nb-daily-sub-title { flex-basis: calc(100% - 60px); order: 2; }
        }
        /* -------------------------------------------------------------- */
        /*  ĐỀ THI THỬ — builder, phòng thi, kết quả                      */
        /* -------------------------------------------------------------- */
        .nb-xm-toast { position: sticky; top: 8px; z-index: 6; padding: 11px 15px; border-radius: 10px; color: #0b5a3b; background: #e6f6ee; border: 1px solid #b7e3cb; font-size: 13px; font-weight: 600; box-shadow: 0 6px 18px rgba(31,52,86,.08); }
        .nb-exam-card.draft .nb-exam-card-accent { background: #9aa8bd; }
        .nb-xm-card-desc { margin: 0; color: var(--slate); font-size: 12.5px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .nb-xm-bar-title { flex: 1; min-width: 0; font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-xm-bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .nb-xm-builder, .nb-xm-results { display: flex; flex-direction: column; gap: 14px; }
        .nb-xm-builder .nb-contest-bar, .nb-xm-results .nb-contest-bar { margin-bottom: 0; }
        .nb-xm-section { background: #fff; border: 1px solid #e1e8f2; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .nb-xm-section-head { display: flex; align-items: flex-start; gap: 12px; }
        .nb-xm-section-head > span { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; color: #fff; background: var(--pen-blue); font: 700 13px 'JetBrains Mono', monospace; }
        .nb-xm-section-head h3 { margin: 0; font-size: 15px; }
        .nb-xm-section-head p { margin: 3px 0 0; color: var(--slate); font-size: 12px; line-height: 1.5; }
        .nb-xm-section-tools { margin-left: auto; color: var(--pen-blue); font: 700 12px 'JetBrains Mono', monospace; white-space: nowrap; }
        .nb-xm-field { display: flex; flex-direction: column; gap: 6px; }
        .nb-xm-field > span { color: var(--slate); font-size: 11px; font-weight: 600; }
        .nb-xm-scope { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nb-xm-scope-opt { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 13px 14px; text-align: left; cursor: pointer; border: 1.5px solid #e1e8f2; border-radius: 12px; background: #fbfdff; color: var(--ink); font: inherit; }
        .nb-xm-scope-opt small { color: var(--slate); font-size: 11px; }
        .nb-xm-scope-opt svg { color: var(--slate); }
        .nb-xm-scope-opt.active { border-color: var(--pen-blue); background: rgba(4,166,199,.06); }
        .nb-xm-scope-opt.active svg { color: var(--pen-blue); }
        .nb-xm-students { display: flex; flex-direction: column; gap: 10px; }
        .nb-xm-students-tools { display: flex; flex-direction: column; gap: 8px; }
        .nb-xm-students-tools .nb-practice-search, .nb-xm-picker .nb-practice-search { flex: none; height: 42px; min-height: 0; }
        .nb-xm-problem-modal > *, .nb-xm-picker > *, .nb-xm-viewer > * { flex-shrink: 0; }
        .nb-xm-problem-modal textarea, .nb-xm-problem-modal input, .nb-xm-problem-modal select { flex-shrink: 0; }
        .nb-xm-problem-modal .nb-testcase-editor { flex-shrink: 0; }
        .nb-xm-picker .nb-xm-picker-list { flex-shrink: 1; min-height: 120px; }
        .nb-xm-statement-input { min-height: 220px; line-height: 1.6; resize: vertical; }
        /* ---- Hiển thị đề bài ---- */
        .nb-st { font-size: 14px; line-height: 1.75; color: var(--ink); }
        .nb-st .nb-st-p { margin: 0 0 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .nb-st .nb-st-h { margin: 18px 0 8px; color: var(--ink); letter-spacing: -.01em; line-height: 1.3; }
        .nb-st .nb-st-h1 { font-size: 18px; } .nb-st .nb-st-h2 { font-size: 16px; } .nb-st .nb-st-h3 { font-size: 14.5px; }
        .nb-st .nb-st-label { display: flex; align-items: center; gap: 8px; margin: 18px 0 8px; }
        .nb-st .nb-st-label span { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--pen-blue); padding: 3px 10px; border-radius: 999px; background: rgba(4,166,199,.1); }
        .nb-st .nb-st-label::after { content: ""; flex: 1; height: 1px; background: var(--paper-line); }
        .nb-st .nb-st-tag { display: inline-block; margin-right: 8px; padding: 1px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--pen-blue); background: rgba(4,166,199,.1); }
        .nb-st .nb-st-code { font-family: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: .88em; padding: 1px 6px; border-radius: 5px; background: #eef4f8; border: 1px solid #dbe7ee; color: #0b4f66; white-space: pre-wrap; }
        .nb-st .nb-st-pre { margin: 0 0 14px; padding: 12px 14px; border-radius: 10px; background: #0f2233; color: #e6f1f7; font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.6; overflow-x: auto; white-space: pre; }
        .nb-st .nb-st-list { margin: 0 0 12px; padding-left: 4px; list-style: none; counter-reset: stitem; }
        .nb-st .nb-st-list li { position: relative; padding-left: 26px; margin: 4px 0; overflow-wrap: anywhere; }
        .nb-st .nb-st-list li::before { content: ""; position: absolute; left: 8px; top: .72em; width: 6px; height: 6px; border-radius: 50%; background: var(--pen-blue); }
        .nb-st .nb-st-list.ordered li { counter-increment: stitem; }
        .nb-st .nb-st-list.ordered li::before { content: counter(stitem); top: .15em; left: 0; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff; background: var(--pen-blue); }
        .nb-st sup, .nb-st sub { font-size: .72em; line-height: 0; }
        .nb-st .nb-st-sup { vertical-align: super; } .nb-st .nb-st-sub { vertical-align: sub; }
        .nb-st .nb-st-table-wrap { overflow-x: auto; margin: 0 0 14px; border: 1px solid var(--paper-line); border-radius: 10px; }
        .nb-st .nb-st-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .nb-st .nb-st-table th, .nb-st .nb-st-table td { padding: 7px 12px; text-align: left; border-bottom: 1px solid var(--paper-line); }
        .nb-st .nb-st-table th { background: #f1f8fa; font-weight: 700; }
        .nb-st .nb-st-table tr:last-child td { border-bottom: none; }
        .nb-st-help { margin: 6px 0 8px; }
        .nb-st-help-row { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: 12px; color: var(--slate); line-height: 1.8; }
        .nb-st-help-row code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; background: #eef4f8; padding: 1px 5px; border-radius: 4px; color: #0b4f66; }
        .nb-st-preview { margin-top: 8px; padding: 14px 16px; border: 1px dashed var(--paper-line); border-radius: 12px; background: #fbfdfe; max-height: 340px; overflow: auto; }
        .nb-xm-lang-note { display: flex; flex-direction: column; gap: 2px; justify-content: center; }
        .nb-xm-lang-note strong { font-size: 13px; } .nb-xm-lang-note small { color: var(--slate); font-size: 11px; }
        /* ---- Chọn ngôn ngữ trong đề thi ---- */
        .nb-lang-picker { padding: 22px; border: 1.5px dashed var(--paper-line); border-radius: 14px; background: linear-gradient(180deg, #fbfdfe, #f2f9fb); }
        .nb-lang-picker h4 { margin: 4px 0 6px; font-size: 18px; }
        .nb-lang-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
        .nb-lang-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 10px; cursor: pointer; border: 1.5px solid #dbe7ee; border-radius: 14px; background: #fff; transition: transform .15s, box-shadow .15s, border-color .15s; font: inherit; color: inherit; }
        .nb-lang-card:hover, .nb-lang-card:focus-visible { transform: translateY(-2px); border-color: var(--pen-blue); box-shadow: 0 8px 20px rgba(4,166,199,.16); outline: none; }
        .nb-lang-card small { color: var(--slate); font-size: 11px; }
        .nb-lang-mark { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; font-weight: 800; font-size: 17px; color: #fff; background: linear-gradient(135deg, #04a6c7, #1b6fb5); margin-bottom: 4px; }
        .lang-python .nb-lang-mark { background: linear-gradient(135deg, #3776ab, #f4c430); color: #10263a; }
        .lang-c .nb-lang-mark { background: linear-gradient(135deg, #5b6c83, #2b3a4f); }
        .lang-cpp .nb-lang-mark { background: linear-gradient(135deg, #00599c, #3b8fd9); }
        .nb-lang-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
        .nb-lang-bar span { font-size: 12px; font-weight: 700; color: var(--slate); margin-right: 4px; }
        .nb-lang-bar button { cursor: pointer; padding: 5px 12px; border-radius: 999px; border: 1.5px solid #dbe7ee; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink); }
        .nb-lang-bar button.active { background: var(--pen-blue); border-color: var(--pen-blue); color: #fff; }
        @media (max-width: 560px) { .nb-lang-grid { grid-template-columns: 1fr; } .nb-lang-card { flex-direction: row; justify-content: flex-start; padding: 12px 16px; gap: 12px; } .nb-lang-mark { margin: 0; width: 42px; height: 42px; } }
        /* ---- Rời màn hình / cộng giờ ---- */
        .nb-xm-viol-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--slate); background: #eef4f8; }
        .nb-xm-viol-chip.has { color: #9a5b00; background: #fff3d6; }
        .nb-xm-viol { display: inline-block; min-width: 24px; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; background: #eef4f8; color: var(--slate); text-align: center; }
        .nb-xm-viol.has { background: #fff3d6; color: #9a5b00; }
        .nb-xm-extra { color: var(--pen-blue); font-weight: 700; }
        .nb-xm-away { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 12px 16px; border-radius: 12px; border: 1px solid #f3d38a; background: #fff8e6; color: #7a4a00; animation: nbAwayIn .25s ease-out; }
        .nb-xm-away > div { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
        .nb-xm-away svg { flex-shrink: 0; }
        @keyframes nbAwayIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        .nb-xm-extend { max-width: 460px; }
        .nb-xm-extend > * { flex-shrink: 0; }
        .nb-xm-extend-body { padding: 4px 22px 8px; display: flex; flex-direction: column; gap: 14px; }
        .nb-xm-extend-quick { display: flex; flex-wrap: wrap; gap: 8px; }
        .nb-xm-desc-input { min-height: 110px; line-height: 1.6; resize: vertical; }
        .nb-xm-problem-modal { gap: 14px; }
        .nb-xm-problem-modal .nb-modal-head { padding-bottom: 12px; border-bottom: 1px solid #e9edf4; align-items: center; }
        .nb-xm-problem-modal .nb-modal-head .nb-h3 { margin: 4px 0 0; }
        .nb-xm-row label > .nb-field-label, .nb-xm-field > span { color: var(--slate); font: 600 11px 'Be Vietnam Pro', inherit; text-transform: none; letter-spacing: 0; }
        .nb-xm-problem-modal .nb-form-section-label { margin-top: 4px; }
        .nb-xm-problem-modal .nb-modal-actions { gap: 10px; padding-top: 6px; }
        .nb-xm-students-bulk { display: flex; gap: 8px; flex-wrap: wrap; }
        .nb-xm-student-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 280px; overflow-y: auto; padding: 3px; }
        .nb-xm-problem-list { display: flex; flex-direction: column; gap: 8px; }
        .nb-xm-problem-row { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border: 1px solid #e1e8f2; border-radius: 11px; background: #fbfdff; }
        .nb-xm-problem-no { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--pen-blue); background: rgba(4,166,199,.11); font: 700 12px 'JetBrains Mono', monospace; }
        .nb-xm-problem-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .nb-xm-problem-main strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-xm-problem-main small { color: var(--slate); font-size: 11px; }
        .nb-xm-problem-actions { display: flex; gap: 2px; flex: none; }
        .nb-xm-problem-actions .nb-icon-btn:disabled { opacity: .3; cursor: default; }
        .nb-xm-add-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .nb-xm-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding: 4px 0 18px; }
        .nb-xm-problem-modal { max-width: 760px; display: flex; flex-direction: column; gap: 12px; padding: 20px; }
        .nb-xm-problem-modal .nb-modal-head { padding: 0; }
        .nb-xm-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .nb-xm-row.two { grid-template-columns: 1fr 1fr; }
        .nb-xm-row label { display: flex; flex-direction: column; gap: 5px; }
        .nb-xm-picker { max-width: 640px; display: flex; flex-direction: column; gap: 12px; padding: 20px; }
        .nb-xm-picker .nb-modal-head { padding: 0; }
        .nb-xm-picker-list { display: flex; flex-direction: column; gap: 7px; max-height: 360px; overflow-y: auto; padding: 3px; }
        .nb-xm-intro { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; padding: 28px; background: #fff; border: 1px solid #e1e8f2; border-radius: 16px; }
        .nb-xm-intro h2 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
        .nb-xm-intro-desc { margin: 0; color: var(--slate); font-size: 14px; line-height: 1.6; white-space: pre-line; }
        .nb-xm-intro-meta { display: flex; gap: 10px; flex-wrap: wrap; }
        .nb-xm-intro-meta span { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 9px; background: #eef4ff; color: #1e4fb8; font-size: 13px; font-weight: 600; }
        .nb-xm-rules { margin: 0; padding-left: 20px; color: var(--ink); font-size: 13.5px; line-height: 1.75; }
        .nb-xm-result-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 15px 18px; margin-bottom: 12px; border-radius: 13px; background: linear-gradient(120deg, #eef4ff, #eafaf3); border: 1px solid #d5e3f7; }
        .nb-xm-result-banner strong { font-size: 17px; }
        .nb-xm-result-banner span { color: var(--slate); font-size: 12px; }
        .nb-xm-card-score { display: flex; align-items: center; gap: 10px; }
        .nb-xm-card-score .nb-exam-progress { flex: 1; }
        .nb-xm-card-score strong { font: 700 12px 'JetBrains Mono', monospace; color: var(--ink); }
        .nb-xm-finish { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
        .nb-xm-viewer { max-width: 960px; display: flex; flex-direction: column; }
        .nb-xm-viewer .nb-modal-head { padding: 18px 20px 6px; }
        .nb-xm-tabs { display: flex; gap: 6px; padding: 8px 20px; overflow-x: auto; }
        .nb-xm-tab { flex: none; display: flex; flex-direction: column; gap: 2px; padding: 8px 13px; border: 1px solid #e1e8f2; border-radius: 10px; background: #fff; cursor: pointer; text-align: left; font: inherit; color: var(--ink); }
        .nb-xm-tab span { font-size: 11px; color: var(--slate); }
        .nb-xm-tab strong { font: 700 12px 'JetBrains Mono', monospace; }
        .nb-xm-tab.active { border-color: var(--pen-blue); background: rgba(4,166,199,.07); }
        .nb-xm-statement { margin: 0 20px; border: 1px solid #e1e8f2; border-radius: 10px; background: #fbfdff; }
        .nb-xm-statement summary { cursor: pointer; padding: 10px 14px; font-size: 13px; font-weight: 600; }
        .nb-xm-statement .nb-problem-statement { padding: 0 14px 12px; }
        .nb-xm-viewer-body { display: grid; grid-template-columns: 260px 1fr; gap: 12px; padding: 12px 20px; min-height: 240px; }
        .nb-xm-sub-list { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
        .nb-xm-sub-item { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; border: 1px solid #e1e8f2; border-radius: 10px; background: #fff; text-align: left; cursor: pointer; font: inherit; color: var(--ink); }
        .nb-xm-sub-item small { color: var(--slate); font-size: 11px; }
        .nb-xm-sub-item strong { font: 700 13px 'JetBrains Mono', monospace; }
        .nb-xm-sub-item.active { border-color: var(--pen-blue); background: rgba(4,166,199,.06); }
        .nb-xm-code { min-width: 0; max-height: 340px; overflow: auto; border: 1px solid #e1e8f2; border-radius: 10px; background: #fbfdff; }
        .nb-xm-code .nb-history-code { margin: 0; border: 0; border-radius: 0; max-height: none; }
        .nb-xm-viewer .nb-modal-actions { padding: 0 20px 18px; }
        .nb-xm-summary { grid-template-columns: repeat(4, 1fr); margin: 0; }
        .nb-xm-table th small { margin-left: 3px; opacity: .7; font-weight: 400; }
        .nb-xm-table { min-width: 760px; }
        .nb-xm-name { display: flex; flex-direction: column; }
        .nb-xm-name small { color: #8a98ac; font-size: 10px; }
        .nb-xm-phase { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .nb-xm-phase.idle { color: #6b7a90; background: #edf0f5; }
        .nb-xm-phase.run { color: #1e4fb8; background: #e6efff; }
        .nb-xm-phase.done { color: #0b5a3b; background: #e6f6ee; }
        .nb-xm-phase.late { color: #8a5a00; background: #fff1ce; }
        .nb-xm-cell { display: inline-block; min-width: 28px; padding: 2px 6px; border-radius: 6px; text-align: center; font: 600 12px 'JetBrains Mono', monospace; }
        .nb-xm-cell.empty { color: #b3bdcc; }
        .nb-xm-cell.zero { color: #a13232; background: #fbe9e9; }
        .nb-xm-cell.part { color: #8a5a00; background: #fff1ce; }
        .nb-xm-cell.full { color: #0b5a3b; background: #e6f6ee; }
        .nb-xm-row-actions { white-space: nowrap; }
        .nb-xm-row-actions .nb-btn { padding: 5px 9px; font-size: 11.5px; margin-right: 4px; }
        @media (max-width: 760px) {
          .nb-xm-scope, .nb-xm-student-grid, .nb-xm-row, .nb-xm-row.two { grid-template-columns: 1fr; }
          .nb-xm-viewer-body { grid-template-columns: 1fr; }
          .nb-xm-sub-list { max-height: 180px; }
          .nb-xm-summary { grid-template-columns: repeat(2, 1fr); }
          .nb-xm-intro { padding: 20px; }
          .nb-xm-problem-row { flex-wrap: wrap; }
          .nb-xm-section { padding: 14px; }
        }
        /* -------------------------------------------------------------- */
        /*  GÕ LỆNH PYTHON                                               */
        /* -------------------------------------------------------------- */
        .nb-tg { --tg-bg: #0e1b2b; --tg-dim: #6f829b; --tg-p: #e8eef7; --tg-k: #8cb4ff; --tg-b: #5fd7b0; --tg-s: #f5c26b; --tg-n: #c4a7ff; --tg-f: #7fe3f0;
          --tg-ok: #1f9d6b; --tg-bad: #d64545; --tg-amber: #c98a12; display: flex; flex-direction: column; gap: 18px; max-width: 960px; margin: 0 auto; }
        .nb-tg-head h2 { margin: 0 0 6px; font-size: 28px; letter-spacing: -.02em; }
        .nb-tg-head p { margin: 0; max-width: 560px; color: var(--slate); font-size: 14px; line-height: 1.6; }
        .nb-tg-menu { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 22px; align-items: start; }
        .nb-tg-choose { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
        .nb-tg-block { display: flex; flex-direction: column; gap: 10px; }
        .nb-tg-block h3 { margin: 0; font-size: 13px; color: var(--slate); font-weight: 700; }
        .nb-tg-topics { display: flex; flex-direction: column; background: #fff; border: 1px solid #e1e8f2; border-radius: 14px; overflow: hidden; }
        .nb-tg-topic { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; text-align: left; font: inherit; color: var(--ink); background: transparent; border: 0; border-top: 1px solid #edf1f6; border-left: 3px solid transparent; cursor: pointer; transition: background .15s; }
        .nb-tg-topic:first-child { border-top: 0; }
        .nb-tg-topic strong { font-size: 13.5px; }
        .nb-tg-topic code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #7a8aa2; font: 500 12px 'JetBrains Mono', monospace; }
        .nb-tg-topic span { color: var(--slate); font-size: 11.5px; white-space: nowrap; }
        .nb-tg-topic:hover { background: #f5f9fc; }
        .nb-tg-topic.active { background: #eef5ff; border-left-color: #2563eb; }
        .nb-tg-topic.active code { color: #1e4fb8; }
        .nb-tg-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nb-tg-mode { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: start; padding: 14px 16px; text-align: left; font: inherit; color: var(--ink); cursor: pointer; background: #fff; border: 1.5px solid #e1e8f2; border-radius: 13px; transition: border-color .15s, background .15s; }
        .nb-tg-mode-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--slate); background: #eef2f7; }
        .nb-tg-mode-text { display: flex; flex-direction: column; gap: 3px; }
        .nb-tg-mode-text strong { font-size: 14px; }
        .nb-tg-mode-text span { color: var(--slate); font-size: 12px; line-height: 1.5; }
        .nb-tg-mode small { grid-column: 2; color: #1e4fb8; font: 600 11.5px 'JetBrains Mono', monospace; }
        .nb-tg-mode.active { border-color: #2563eb; background: #f3f8ff; }
        .nb-tg-mode.active .nb-tg-mode-icon { color: #fff; background: #2563eb; }
        .nb-tg-side { position: sticky; top: 14px; display: flex; flex-direction: column; gap: 12px; }
        .nb-tg-start-btn { width: 100%; justify-content: center; padding: 13px 18px; font-size: 15px; }
        .nb-tg-side .nb-sub { margin: 0; font-size: 12px; line-height: 1.6; }
        .nb-tg-editor { display: flex; flex-direction: column; border-radius: 14px; background: var(--tg-bg); box-shadow: 0 14px 34px rgba(14,27,43,.22); overflow: hidden; border: 2px solid transparent; }
        .nb-tg-tab { display: flex; align-items: center; gap: 7px; padding: 9px 14px; color: #9fb0c6; background: rgba(255,255,255,.05); font: 500 12px 'JetBrains Mono', monospace; }
        .nb-tg-tab span { margin-left: auto; padding: 2px 8px; border-radius: 99px; color: #cfe0f5; background: rgba(255,255,255,.09); font: 600 11px 'Be Vietnam Pro', sans-serif; }
        .nb-tg-line { display: flex; gap: 14px; padding: 22px 18px; font: 600 22px/1.65 'JetBrains Mono', monospace; }
        .nb-tg-line code { font: inherit; white-space: pre-wrap; word-break: break-all; color: var(--tg-p); }
        .nb-tg-gutter { color: #44566e; user-select: none; }
        .nb-tg-line span, .nb-tg-colored span { transition: color .08s; }
        .t-p { color: var(--tg-p); } .t-k { color: var(--tg-k); } .t-b { color: var(--tg-b); } .t-s { color: var(--tg-s); } .t-n { color: var(--tg-n); } .t-f { color: var(--tg-f); }
        .t-dim, .nb-tg-line .dim { color: var(--tg-dim); }
        .nb-tg-line .cur { color: #fff; background: rgba(255,255,255,.14); box-shadow: inset 0 -2px #22b8c7; border-radius: 2px; }
        .nb-tg-line .bad { color: #fff; background: var(--tg-bad); border-radius: 3px; }
        .nb-tg-caret { display: inline-block; width: 2px; height: 1.15em; margin-left: 1px; vertical-align: text-bottom; background: #22b8c7; animation: nbTgCaret 1s steps(1) infinite; }
        @keyframes nbTgCaret { 50% { opacity: 0; } }
        .nb-tg-editor.demo { box-shadow: 0 10px 26px rgba(14,27,43,.18); }
        .nb-tg-editor.demo .nb-tg-line { padding: 18px 16px; font-size: 16px; min-height: 84px; }
        .nb-tg-demo-hint { padding: 0 16px 16px 44px; color: #8ea2bd; font-size: 12px; }
        .nb-tg-prompt { display: flex; align-items: center; gap: 10px; padding: 0 16px 16px; }
        .nb-tg-prompt > span { color: #5fd7b0; font: 700 15px 'JetBrains Mono', monospace; }
        .nb-tg-prompt input { flex: 1; min-width: 0; padding: 11px 14px; border-radius: 10px; border: 1.5px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #fff; font-size: 17px; outline: none; }
        .nb-tg-prompt input::placeholder { color: #6f829b; }
        .nb-tg-prompt input:focus { border-color: #22b8c7; box-shadow: 0 0 0 3px rgba(34,184,199,.2); }
        .nb-tg-editor.ok { animation: nbTgOk .4s ease; }
        .nb-tg-editor.bad { animation: nbTgBad .28s ease; }
        @keyframes nbTgOk { 0% { border-color: #3ddc97; } 100% { border-color: transparent; } }
        @keyframes nbTgBad { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); border-color: var(--tg-bad); } 75% { transform: translateX(4px); } }
        .nb-tg-meaning { margin: 0; padding: 0 4px; color: var(--ink); font-size: 14px; line-height: 1.6; }
        .nb-tg-meaning b { margin-right: 8px; color: #1e4fb8; }
        .nb-tg-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .nb-tg-ring { position: relative; width: 52px; height: 52px; display: grid; place-items: center; }
        .nb-tg-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
        .nb-tg-ring circle { fill: none; stroke-width: 4; }
        .nb-tg-ring .bg { stroke: #e3eaf3; }
        .nb-tg-ring .fg { stroke: #2563eb; stroke-linecap: round; transition: stroke-dashoffset .25s linear, stroke .3s; }
        .nb-tg-ring.warn .fg { stroke: var(--tg-bad); }
        .nb-tg-ring b { font: 700 16px 'JetBrains Mono', monospace; color: var(--ink); }
        .nb-tg-ring.warn b { color: var(--tg-bad); }
        .nb-tg-progress { flex: 1; max-width: 320px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--slate); font-weight: 600; }
        .nb-tg-progress i { display: block; height: 6px; border-radius: 99px; background: #e3eaf3; overflow: hidden; }
        .nb-tg-progress b { display: block; height: 100%; background: #2563eb; transition: width .25s; }
        .nb-tg-strip { display: grid; grid-template-columns: 1.1fr 1.6fr .8fr .8fr; align-items: center; background: #fff; border: 1px solid #e1e8f2; border-radius: 14px; }
        .nb-tg-strip > div { display: flex; flex-direction: column; gap: 4px; padding: 12px 18px; border-left: 1px solid #edf1f6; min-width: 0; }
        .nb-tg-strip > div:first-child { border-left: 0; }
        .nb-tg-strip span { color: var(--slate); font-size: 12px; }
        .nb-tg-strip strong { font: 700 24px 'JetBrains Mono', monospace; color: var(--ink); line-height: 1.1; }
        .nb-tg-score { position: relative; }
        .nb-tg-gain { position: absolute; right: 14px; top: 8px; color: var(--tg-ok); font: 700 14px 'JetBrains Mono', monospace; font-style: normal; animation: nbTgGain .9s ease-out forwards; pointer-events: none; }
        @keyframes nbTgGain { 0% { opacity: 0; transform: translateY(8px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
        .nb-tg-pips { display: flex; gap: 4px; }
        .nb-tg-pips i { flex: 1; height: 9px; border-radius: 3px; background: #e3eaf3; transition: background .15s; }
        .nb-tg-pips i.on { background: #2563eb; }
        .nb-tg-combo.hot .nb-tg-pips i.on { background: var(--tg-amber); }
        .nb-tg-combo.hot span { color: #8a5a00; font-weight: 600; }
        .nb-tg-kb { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 14px 12px 10px; background: #fff; border: 1px solid #e1e8f2; border-radius: 14px; user-select: none; }
        .nb-tg-kb-row { display: flex; gap: 5px; justify-content: center; }
        .nb-tg-key { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 8px; border: 1px solid #d9e2ee; border-bottom-width: 3px; background: #f6f9fc; color: #44566e; font: 600 13px 'JetBrains Mono', monospace; transition: transform .06s, background .1s; }
        .nb-tg-key small { position: absolute; top: 2px; left: 5px; font-size: 9px; color: #8a98ac; font-weight: 500; }
        .nb-tg-key.f0 { background: #fdf0f0; } .nb-tg-key.f1 { background: #fff6e8; } .nb-tg-key.f2 { background: #eefaf3; } .nb-tg-key.f3 { background: #eef4ff; } .nb-tg-key.f4 { background: #f4f0fd; }
        .nb-tg-key.wide { width: 74px; font-size: 11px; background: #eef2f7; }
        .nb-tg-key.space { width: 300px; font-size: 11px; background: #f4f0fd; }
        .nb-tg-key.target { background: #2563eb; border-color: #1b4fc4; color: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.25); }
        .nb-tg-key.target small { color: #cfe0ff; }
        .nb-tg-key.down { transform: translateY(2px); background: #cfe0ff; border-bottom-width: 1px; }
        .nb-tg-key.bad { background: #ffd9d9; border-color: var(--tg-bad); color: #8f1f1f; }
        .nb-tg-kb-legend { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin-top: 6px; color: var(--slate); font-size: 11px; }
        .nb-tg-kb-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .nb-tg-kb-legend i { width: 11px; height: 11px; border-radius: 3px; border: 1px solid #d0d9e6; }
        .nb-tg-kb-legend .f0 { background: #fdf0f0; } .nb-tg-kb-legend .f1 { background: #fff6e8; } .nb-tg-kb-legend .f2 { background: #eefaf3; } .nb-tg-kb-legend .f3 { background: #eef4ff; } .nb-tg-kb-legend .f4 { background: #f4f0fd; }
        .nb-tg-result { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 18px; align-items: stretch; }
        .nb-tg-result-main { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 28px; border-radius: 16px; background: var(--tg-bg); color: #fff; }
        .nb-tg-result-mode { color: #9fb0c6; font-size: 13px; }
        .nb-tg-result-main h2 { margin: 0; font-size: 26px; letter-spacing: -.01em; }
        .nb-tg-wpm { display: flex; align-items: baseline; gap: 10px; }
        .nb-tg-wpm strong { font: 700 76px/1 'JetBrains Mono', monospace; color: var(--tg-f); }
        .nb-tg-wpm span { color: #9fb0c6; font-size: 14px; }
        .nb-tg-record { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; color: #4d3200; background: #ffd770; font-size: 12.5px; font-weight: 700; }
        .nb-tg-result-main .nb-sub { color: #9fb0c6; margin: 0; }
        .nb-tg-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
        .nb-tg-result-main .nb-btn-ghost { color: #fff; border-color: rgba(255,255,255,.3); background: transparent; }
        .nb-tg-result-stats { margin: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid #e1e8f2; border-radius: 16px; overflow: hidden; }
        .nb-tg-result-stats > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 15px 20px; border-top: 1px solid #edf1f6; }
        .nb-tg-result-stats > div:first-child { border-top: 0; }
        .nb-tg-result-stats dt { color: var(--slate); font-size: 13px; }
        .nb-tg-result-stats dd { margin: 0; font: 700 20px 'JetBrains Mono', monospace; color: var(--ink); }
        .nb-tg-missed { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nb-tg-missed > div { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--tg-bg); min-width: 0; }
        .nb-tg-missed code.nb-tg-colored { font: 600 14px/1.5 'JetBrains Mono', monospace; word-break: break-all; }
        .nb-tg-missed span { color: #9fb0c6; font-size: 12px; }
        .nb-tg button:focus-visible { outline: 3px solid rgba(37,99,235,.45); outline-offset: 2px; }
        @media (max-width: 860px) {
          .nb-tg-menu { grid-template-columns: 1fr; }
          .nb-tg-side { position: static; order: -1; }
          .nb-tg-result { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .nb-tg-kb { display: none; }
        }
        @media (max-width: 640px) {
          .nb-tg-head h2 { font-size: 23px; }
          .nb-tg-topic { grid-template-columns: 1fr auto; }
          .nb-tg-topic code { display: none; }
          .nb-tg-modes { grid-template-columns: 1fr; }
          .nb-tg-strip { grid-template-columns: 1fr 1fr; }
          .nb-tg-strip > div { border-left: 0; border-top: 1px solid #edf1f6; padding: 10px 14px; }
          .nb-tg-strip > div:nth-child(-n+2) { border-top: 0; }
          .nb-tg-strip > div:nth-child(even) { border-left: 1px solid #edf1f6; }
          .nb-tg-line { font-size: 17px; padding: 16px 12px; gap: 10px; }
          .nb-tg-prompt input { font-size: 16px; }
          .nb-tg-wpm strong { font-size: 58px; }
          .nb-tg-result-main { padding: 22px; }
          .nb-tg-missed { grid-template-columns: 1fr; }
        }
                /* ---- Giải trí: giao diện nâng cấp ---- */
        .nb-tg-hero { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding: 26px 28px; margin-bottom: 20px; border-radius: 18px; color: #fff; background: radial-gradient(120% 140% at 0% 0%, #1b4fc4 0%, #0f2a52 45%, #0b1b33 100%); position: relative; overflow: hidden; }
        .nb-tg-hero::after { content: "</>"; position: absolute; right: 22px; bottom: -22px; font: 800 120px/1 'JetBrains Mono', monospace; color: rgba(255,255,255,.05); pointer-events: none; }
        .nb-tg-hero-text { max-width: 520px; position: relative; z-index: 1; }
        .nb-tg-hero-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 700; background: rgba(255,255,255,.12); }
        .nb-tg-hero h2 { margin: 12px 0 8px; font-size: 30px; letter-spacing: -.02em; line-height: 1.2; }
        .nb-tg-hero p { margin: 0; color: #c3d4ec; font-size: 14px; line-height: 1.65; }
        .nb-tg-hero-stats { display: grid; grid-template-columns: repeat(4, minmax(78px, 1fr)); gap: 10px; position: relative; z-index: 1; }
        .nb-tg-hero-stats > div { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 10px; border-radius: 14px; background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(4px); }
        .nb-tg-hero-stats strong { font: 700 24px 'JetBrains Mono', monospace; color: #7fe3f2; }
        .nb-tg-hero-stats span { font-size: 11px; color: #b9cbe4; text-align: center; }
        .nb-tg-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; background: transparent; border: 0; border-radius: 0; overflow: visible; }
        .nb-tg-topic { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr); grid-template-rows: auto auto auto; gap: 2px 12px; align-items: center; padding: 14px; border: 1.5px solid #e1e8f2; border-left-width: 1.5px; border-radius: 14px; background: #fff; cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s; }
        .nb-tg-topic:first-child { border-top: 1.5px solid #e1e8f2; }
        .nb-tg-topic:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,42,82,.1); background: #fff; }
        .nb-tg-topic.active { border-color: var(--tg-accent); background: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tg-accent) 18%, transparent); }
        .nb-tg-topic-mark { grid-row: 1 / span 2; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; color: #fff; background: var(--tg-accent); font: 700 13px 'JetBrains Mono', monospace; letter-spacing: -.02em; }
        .nb-tg-topic .nb-tg-topic-mark { color: #fff; }
        .nb-tg-topic-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .nb-tg-topic-main code { max-width: 100%; }
        .nb-tg-topic.active .nb-tg-topic-main code { color: var(--tg-accent); }
        .nb-tg-topic-count { grid-column: 2; font-size: 11.5px; color: var(--slate); }
        .nb-tg-topic-bar { grid-column: 1 / -1; display: block; height: 5px; margin-top: 8px; border-radius: 99px; background: #e8eef5; overflow: hidden; }
        .nb-tg-topic-bar b { display: block; height: 100%; border-radius: 99px; background: var(--tg-accent); transition: width .4s; }
        .nb-tg-modes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .nb-tg-mode small { grid-column: 1 / -1; }
        .nb-tg-level { display: flex; flex-direction: column; gap: 9px; padding: 15px 16px; border-radius: 14px; background: #fff; border: 1px solid #e1e8f2; }
        .nb-tg-level-top { display: flex; align-items: center; gap: 12px; }
        .nb-tg-level-top svg { flex-shrink: 0; width: 38px; height: 38px; padding: 8px; border-radius: 12px; color: #6b4a00; background: linear-gradient(135deg, #ffe08a, #ffc23d); }
        .nb-tg-level-top div { display: flex; flex-direction: column; }
        .nb-tg-level-top span { font-size: 11.5px; color: var(--slate); }
        .nb-tg-level-top strong { font-size: 15px; }
        .nb-tg-level-bar { display: block; height: 7px; border-radius: 99px; background: #e8eef5; overflow: hidden; }
        .nb-tg-level-bar b { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #2563eb, #22b8c7); transition: width .5s; }
        .nb-tg-level small { color: var(--slate); font-size: 11.5px; }
        .nb-tg-ready { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 380px; border-radius: 18px; color: #fff; text-align: center; background: radial-gradient(120% 140% at 50% 0%, #1b4fc4 0%, #0f2a52 50%, #0b1b33 100%); }
        .nb-tg-ready span { color: #b9cbe4; font-size: 14px; font-weight: 600; }
        .nb-tg-ready strong { font: 700 112px/1 'JetBrains Mono', monospace; color: #7fe3f2; animation: nbTgPop .7s ease-out; }
        .nb-tg-ready p { margin: 0; color: #9fb4d2; font-size: 13px; }
        @keyframes nbTgPop { 0% { transform: scale(.6); opacity: 0; } 35% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        .nb-tg-stars { display: flex; gap: 8px; }
        .nb-tg-stars i { font-style: normal; font-size: 34px; line-height: 1; color: rgba(255,255,255,.18); }
        .nb-tg-stars i.on { color: #ffcf4d; text-shadow: 0 0 18px rgba(255,207,77,.55); animation: nbTgStar .5s ease-out backwards; }
        @keyframes nbTgStar { 0% { transform: scale(.2) rotate(-40deg); opacity: 0; } 70% { transform: scale(1.25) rotate(8deg); } 100% { transform: scale(1); opacity: 1; } }
        .nb-tg-record.levelup { background: #9cf0c8; color: #064a2e; }
        .nb-tg-line { background-image: linear-gradient(90deg, rgba(255,255,255,.03), transparent 40%); }
        .nb-tg-editor { box-shadow: 0 18px 40px rgba(8,20,40,.28); }
        .nb-tg-tab::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #ff5f57; box-shadow: 16px 0 0 #febc2e, 32px 0 0 #28c840; margin-right: 38px; }
        .nb-tg-combo.hot { animation: nbTgHot 1.2s ease-in-out infinite; }
        @keyframes nbTgHot { 0%,100% { background: transparent; } 50% { background: rgba(255,190,60,.12); } }
        @media (max-width: 860px) { .nb-tg-hero-stats { width: 100%; } }
        @media (max-width: 760px) { .nb-tg-modes { grid-template-columns: 1fr; } }
        @media (max-width: 640px) {
          .nb-tg-hero { padding: 20px; } .nb-tg-hero h2 { font-size: 23px; }
          .nb-tg-hero-stats { grid-template-columns: repeat(2, 1fr); }
          .nb-tg-topics { grid-template-columns: 1fr 1fr; }
          .nb-tg-topic { grid-template-columns: 1fr; } .nb-tg-topic-mark { grid-row: auto; width: 36px; height: 36px; margin-bottom: 4px; }
          .nb-tg-topic-main code { display: none; } .nb-tg-topic-count { grid-column: 1; }
          .nb-tg-ready strong { font-size: 84px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nb-tg *, .nb-tg-editor { animation: none !important; transition: none !important; }
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
              <div className="nb-brand-mark nb-brand-logo"><BrandLogoSvg /></div>
              <div className="nb-brand-text"><b>Tin học thầy Lợi</b><span>Nội trú Mường Nhé</span></div>
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
                  <div className="nb-sub" style={{ color: "#75809A" }}>{accountRoleLabel(currentUser.role)}</div>
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
                <div className="nb-brand-mark nb-brand-logo nb-only-mobile" style={{ width: 28, height: 28 }}><BrandLogoSvg /></div>
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
                  points={points} solvedCount={solvedCount} contests={visibleExams} discussions={discussions}
                  problems={problems} problemsCount={problems.length} onNavigate={setTab}
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
                  solvedByCurrent={solvedByCurrent} onVerdict={registerVerdict} students={students}
                />
              )}
              {tab === "assignments" && (
                <AssignedView
                  isTeacher={isTeacher} currentUser={currentUser} problems={problems} students={students}
                  assignments={assignments} submissions={submissions} addAssignments={addAssignments}
                  removeAssignment={removeAssignment} solvedByCurrent={solvedByCurrent} onVerdict={registerVerdict}
                  topics={topics}
                />
              )}
              {tab === "contests" && (
                <ExamsView
                  exams={exams} examsMissing={examsMissing} isTeacher={isTeacher} currentUser={currentUser}
                  students={students} practiceProblems={problems} refreshExams={refreshExams} setExams={setExams}
                />
              )}
              {tab === "typing" && <TypingGameView currentUser={currentUser} />}
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
