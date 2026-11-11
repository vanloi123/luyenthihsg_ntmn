import React, { useState, useMemo, useEffect, useRef, useCallback, useReducer, useContext } from "react";
import { createRoot } from "react-dom/client";
import {
  Home, BookOpen, Code2, Trophy, MessageSquare, Clock, Users, Plus,
  Send, CheckCircle2, XCircle, Loader2, Flame, ChevronRight, ChevronLeft, Search,
  Award, TrendingUp, AlertCircle, X, Play, Lock, GraduationCap, ListChecks,
  RefreshCw, Eye, EyeOff, LogOut, Pencil, Trash2, Save, UploadCloud, ExternalLink, Keyboard, Target, Copy, Pause, SkipBack, SkipForward,
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
// Code mẫu của giáo viên: cột exams.solutions (schema-exams-v3.sql) = { mode, count, items: { [problemId]: { language, code, note } } }
// mode: "auto" = mở khi mọi học sinh được giao đã nộp xong · "open" = mở ngay · "hidden" = chưa công bố
let examSolutionsColumn = true;
const SOLUTION_MODES = {
  auto: "Tự động mở khi tất cả học sinh đã nộp bài",
  open: "Công bố ngay",
  hidden: "Chưa công bố",
};
function cleanSolutions(solutions, problems) {
  const ids = new Set((problems || []).map((p) => p.id));
  const items = {};
  Object.entries(solutions?.items || {}).forEach(([id, it]) => {
    if (ids.has(id) && String(it?.code || "").trim()) items[id] = { language: normalizeLanguage(it.language), code: String(it.code), note: String(it.note || "") };
  });
  const mode = ["auto", "open", "hidden"].includes(solutions?.mode) ? solutions.mode : "auto";
  return { mode, count: Object.keys(items).length, items };
}
// trả về true nếu đã lưu code mẫu, false nếu cột chưa có (chưa chạy SQL v3)
async function dbExamSave(exam, problems, isNew, createdBy, solutions) {
  const row = examRow(exam, problems);
  const wantSolutions = solutions !== undefined && examSolutionsColumn;
  if (wantSolutions) row.solutions = cleanSolutions(solutions, problems);
  const run = (r) => (isNew
    ? supabase.from("exams").insert({ id: exam.id, ...r, created_by: createdBy || null })
    : supabase.from("exams").update(r).eq("id", exam.id));
  let { error } = await run(row);
  if (error && wantSolutions && isMissingColumnError(error, "solutions")) {
    examSolutionsColumn = false;
    delete row.solutions;
    ({ error } = await run(row));
    if (error) throw error;
    return false;
  }
  if (error) throw error;
  return wantSolutions;
}
async function dbExamGetSolutions(examId) {
  if (!examSolutionsColumn) return null;
  const { data, error } = await supabase.from("exams").select("solutions").eq("id", examId).maybeSingle();
  if (error) { if (isMissingColumnError(error, "solutions")) examSolutionsColumn = false; return null; }
  return data?.solutions || null;
}
// Học sinh chỉ tải phần tóm tắt (chế độ + số bài có code mẫu), chưa tải nội dung code khi chưa được công bố
async function dbExamSolutionInfo(examId) {
  if (!examSolutionsColumn) return null;
  const { data, error } = await supabase.from("exams").select("mode:solutions->>mode,count:solutions->>count").eq("id", examId).maybeSingle();
  if (error) { if (isMissingColumnError(error, "solutions")) examSolutionsColumn = false; return null; }
  if (!data || !Number(data.count)) return null;
  return { mode: data.mode || "auto", count: Number(data.count) };
}
async function dbExamSetSolutionMode(examId, solutions, mode) {
  const next = { ...(solutions || { items: {}, count: 0 }), mode };
  const { error } = await supabase.from("exams").update({ solutions: next }).eq("id", examId);
  if (error) throw error;
  return next;
}
// Code mẫu được mở khi: công bố ngay, hoặc (chế độ tự động) mọi học sinh được giao đều đã nộp / hết giờ
function solutionsUnlocked(exam, mode, attempts, students, nowMs) {
  if (mode === "open") return true;
  if (mode === "hidden") return false;
  const known = new Set((students || []).map((st) => st.id));
  const ids = (exam.assignedTo.length ? exam.assignedTo : [...known]).filter((id) => known.has(id));
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const phase = attemptPhase(exam, attempts.find((a) => a.studentId === id) || null, nowMs);
    return phase === "finished" || phase === "timeup";
  });
}
function solutionProgress(exam, attempts, students, nowMs) {
  const known = new Set((students || []).map((st) => st.id));
  const ids = (exam.assignedTo.length ? exam.assignedTo : [...known]).filter((id) => known.has(id));
  const done = ids.filter((id) => {
    const phase = attemptPhase(exam, attempts.find((a) => a.studentId === id) || null, nowMs);
    return phase === "finished" || phase === "timeup";
  }).length;
  return { done, total: ids.length };
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
/* ---------- Nhận xét của giáo viên cho bài nộp (bảng submission_feedback, xem schema-feedback.sql) ---------- */
const isMissingTableError = (error) => !!error && (error.code === "42P01" || error.code === "PGRST205" || error.status === 404 || /submission_feedback/i.test(String(error.message || "")) && /(does not exist|schema cache|could not find)/i.test(String(error.message || "")));
function mapFeedback(row) {
  return {
    submissionId: row.submission_id, studentId: row.student_id, problemId: row.problem_id || "",
    comment: row.comment || "", tags: Array.isArray(row.tags) ? row.tags : [],
    lineNotes: Array.isArray(row.line_notes) ? row.line_notes.filter((n) => n && Number(n.line) > 0) : [],
    fixedCode: row.fixed_code || "", author: row.author || "",
    createdAt: row.created_at || null, updatedAt: row.updated_at || row.created_at || null, seenAt: row.seen_at || null,
  };
}
// Trả về { missing: true } nếu chưa chạy SQL; ngược lại { row } (row = null nếu chưa có nhận xét)
async function dbFetchFeedbackFor(submissionId) {
  const { data, error } = await supabase.from("submission_feedback").select("*").eq("submission_id", submissionId).maybeSingle();
  if (error) { if (isMissingTableError(error)) return { missing: true }; throw error; }
  return { row: data ? mapFeedback(data) : null };
}
// Chỉ lấy id (rất nhẹ) để đánh dấu "đã nhận xét" trong danh sách của giáo viên
async function dbFetchFeedbackIds({ problemId, studentId }) {
  let q = supabase.from("submission_feedback").select("submission_id").limit(2000);
  if (problemId) q = q.eq("problem_id", problemId);
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) { if (isMissingTableError(error)) return null; throw error; }
  return new Set((data || []).map((r) => r.submission_id));
}
// Chỉ 4 cột nhẹ, lấy tăng dần theo updated_at để giáo viên biết em nào đã nộp lại sau nhận xét
async function dbFetchFeedbackIndex(since) {
  let q = supabase.from("submission_feedback").select("submission_id,student_id,problem_id,created_at,updated_at").order("updated_at", { ascending: true }).limit(3000);
  if (since) q = q.gt("updated_at", since);
  const { data, error } = await q;
  if (error) { if (isMissingTableError(error)) return null; throw error; }
  return (data || []).map((r) => ({ submissionId: r.submission_id, studentId: r.student_id, problemId: r.problem_id || "", createdAt: r.created_at || r.updated_at, updatedAt: r.updated_at }));
}
// Toàn bộ nhận xét của một học sinh cho một bài (để xem quá trình sửa bài)
async function dbFetchFeedbackGroup(studentId, problemId) {
  const { data, error } = await supabase.from("submission_feedback").select("*").eq("student_id", studentId).eq("problem_id", problemId).order("updated_at", { ascending: true }).limit(100);
  if (error) { if (isMissingTableError(error)) return []; throw error; }
  return (data || []).map(mapFeedback);
}
function readFbAck() { try { return JSON.parse(localStorage.getItem("nb_fb_ack") || "{}") || {}; } catch { return {}; } }
function writeFbAck(map) { try { localStorage.setItem("nb_fb_ack", JSON.stringify(map)); } catch { /* bỏ qua */ } }
async function dbFetchFeedbackForStudent(studentId) {
  const { data, error } = await supabase.from("submission_feedback").select("*").eq("student_id", studentId).order("updated_at", { ascending: false }).limit(300);
  if (error) { if (isMissingTableError(error)) return null; throw error; }
  return (data || []).map(mapFeedback);
}
async function dbSaveFeedback(fb) {
  const now = new Date().toISOString();
  const row = {
    submission_id: fb.submissionId, student_id: fb.studentId, problem_id: fb.problemId || null,
    comment: fb.comment || "", tags: fb.tags || [], line_notes: fb.lineNotes || [],
    fixed_code: fb.fixedCode || null, author: fb.author || null, updated_at: now, seen_at: null,
  };
  const { data, error } = await supabase.from("submission_feedback").upsert(row, { onConflict: "submission_id" }).select("*").maybeSingle();
  if (error) throw error;
  return data ? mapFeedback(data) : mapFeedback({ ...row, created_at: now });
}
async function dbDeleteFeedback(submissionId) {
  const { error } = await supabase.from("submission_feedback").delete().eq("submission_id", submissionId);
  if (error) throw error;
}
async function dbMarkFeedbackSeen(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from("submission_feedback").update({ seen_at: new Date().toISOString() }).in("submission_id", ids);
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
          Máy chủ dữ liệu không phản hồi hoặc từ chối truy cập. Có thể do mạng yếu, dự án Supabase đang tạm dừng hoặc đã hết hạn mức băng thông (egress) của gói miễn phí. Thầy cô mở <strong>Supabase → Settings → Usage</strong> để kiểm tra.
        </p>
        <p className="nb-para" style={{ marginTop: 10 }}>
          Nếu mới triển khai, kiểm tra lại: đã dán đúng <strong>SUPABASE_URL</strong> và <strong>SUPABASE_ANON_KEY</strong> vào file <code>config.js</code> chưa,
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

const PY_KEYWORDS_REAL = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
const PY_EDITOR_BUILTINS = new Set("abs all any bin bool chr dict divmod enumerate filter float format frozenset hex input int isinstance len list map max min oct open ord pow print range repr reversed round set sorted str sum tuple type zip".split(" "));
const C_KEYWORDS_REAL = new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL".split(" "));
const CPP_KEYWORDS_REAL = new Set("alignas alignof auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend if inline int long namespace new nullptr operator private protected public register return short signed sizeof static struct template this throw true try typedef typename union unsigned using virtual void volatile while".split(" "));
const C_BUILTINS = new Set("printf scanf puts gets getchar putchar malloc calloc free strlen strcpy strcmp memset abs sqrt pow main".split(" "));
const CPP_BUILTINS = new Set("cout cin cerr endl std string vector map set pair queue stack deque sort min max swap abs sqrt pow printf scanf getline size push_back make_pair main".split(" "));

// Tô màu theo phong cách Thonny: từ khóa đậm, hàm dựng sẵn, số, chuỗi, chú thích.
function highlightCodeLine(line, language) {
  const isPy = language === "python";
  if (!isPy && /^\s*#/.test(line)) return <span className="nb-syntax-builtin">{line}</span>;
  const keywords = isPy ? PY_KEYWORDS_REAL : language === "c" ? C_KEYWORDS_REAL : CPP_KEYWORDS_REAL;
  const builtins = isPy ? PY_EDITOR_BUILTINS : language === "c" ? C_BUILTINS : CPP_BUILTINS;
  const comment = isPy ? "#.*" : "\\/\\/.*|\\/\\*.*?(?:\\*\\/|$)";
  const tokenPattern = new RegExp(`(${comment})|("(?:\\\\.|[^"\\\\])*(?:"|$)|'(?:\\\\.|[^'\\\\])*(?:'|$))|(0[xX][0-9a-fA-F]+|\\b\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?\\b|\\.\\d+)|([A-Za-z_][A-Za-z0-9_]*)`, "g");
  const out = [];
  let cursor = 0;
  let expectName = false;
  let m;
  let k = 0;
  const plain = (t) => { if (t) out.push(<React.Fragment key={k++}>{t}</React.Fragment>); };
  while ((m = tokenPattern.exec(line))) {
    plain(line.slice(cursor, m.index));
    cursor = m.index + m[0].length;
    let cls = "";
    if (m[1]) cls = "nb-syntax-comment";
    else if (m[2]) cls = "nb-syntax-string";
    else if (m[3]) cls = "nb-syntax-number";
    else {
      const w = m[4];
      if (expectName) { cls = "nb-syntax-def"; expectName = false; }
      else if (keywords.has(w)) { cls = "nb-syntax-keyword"; if (isPy && (w === "def" || w === "class")) expectName = true; }
      else if (builtins.has(w)) cls = "nb-syntax-builtin";
    }
    if (m[4] && !cls) { expectName = false; plain(m[0]); continue; }
    out.push(<span key={k++} className={cls}>{m[0]}</span>);
  }
  plain(line.slice(cursor));
  return out;
}

function guessCodeLanguage(code) {
  const text = String(code || "");
  if (/#include|std::|cout\s*<<|cin\s*>>|using\s+namespace/.test(text)) return /std::|cout|cin|namespace|<iostream>|<vector>/.test(text) ? "cpp" : "c";
  if (/\bprintf\s*\(|\bscanf\s*\(/.test(text) && /;\s*$/m.test(text)) return "c";
  return "python";
}

// Hiển thị code chỉ-đọc với số dòng và màu giống trình soạn thảo
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* chuyển sang cách dự phòng */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function CodeCopyButton({ code }) {
  const [state, setState] = useState("idle"); // idle | ok | fail
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(event) {
    event.stopPropagation();
    const ok = await copyTextToClipboard(String(code || "").replace(/\s+$/, "") + "\n");
    setState(ok ? "ok" : "fail");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }
  return (
    <button type="button" className={`nb-copy-btn ${state}`} onClick={copy} title="Sao chép toàn bộ code" aria-label="Sao chép code">
      {state === "ok" ? <><CheckCircle2 size={13} /> Đã sao chép</> : state === "fail" ? <><AlertCircle size={13} /> Không sao chép được</> : <><Copy size={13} /> Sao chép code</>}
    </button>
  );
}

function CodeView({ code, language, className = "" }) {
  const lang = LANGUAGE_META[language] ? language : guessCodeLanguage(code);
  const lines = String(code || "").replace(/\s+$/, "").split("\n");
  return (
    <div className="nb-copywrap">
      <div className={`nb-codeview ${className}`}>
        <div className="nb-codeview-gutter" aria-hidden="true">{lines.map((_, i) => <span key={i}>{i + 1}</span>)}</div>
        <pre className="nb-codeview-code"><code>{lines.map((line, i) => <React.Fragment key={i}>{highlightCodeLine(line, lang)}{i < lines.length - 1 ? "\n" : ""}</React.Fragment>)}</code></pre>
      </div>
      {String(code || "").trim() && <CodeCopyButton code={code} />}
    </div>
  );
}

function CodeEditor({ code, onChange, language, onSubmit, readOnly }) {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [activeLine, setActiveLine] = useState(0);
  const lines = String(code || "").split("\n");
  const textareaRef = useRef(null);
  const INDENT = "    ";
  const LINE_HEIGHT = 24;
  const [caretCol, setCaretCol] = useState(1);

  function syncActiveLine(event) {
    const target = event.currentTarget;
    const before = target.value.slice(0, target.selectionStart);
    const beforeLines = before.split("\n");
    setActiveLine(beforeLines.length - 1);
    setCaretCol(beforeLines[beforeLines.length - 1].length + 1);
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
      <div className="nb-editor-toolbar"><span className="nb-editor-tab"><Code2 size={13} /> bai_lam{(LANGUAGE_META[language] || LANGUAGE_META.cpp).extension}</span><span className="nb-editor-lang">{(LANGUAGE_META[language] || LANGUAGE_META.cpp).label}</span></div>
      <div className="nb-editor-workspace">
        <div className="nb-editor-gutter" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{lines.map((_, index) => <span key={index} className={index === activeLine ? "active" : ""}>{index + 1}</span>)}</div>
        <div className="nb-editor-code-layer">
          <div className="nb-editor-active-line" style={{ transform: `translateY(${activeLine * LINE_HEIGHT - scroll.top}px)` }} aria-hidden="true" />
          <pre className="nb-code-highlight" style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }} aria-hidden="true"><code>{lines.map((line, index) => <React.Fragment key={index}>{highlightCodeLine(line, language)}{index < lines.length - 1 ? "\n" : ""}</React.Fragment>)}</code></pre>
          <textarea ref={textareaRef} className="nb-code-input" value={code} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onKeyUp={syncActiveLine} onClick={syncActiveLine} onSelect={syncActiveLine} onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })} spellCheck={false} readOnly={readOnly} aria-label="Trình soạn thảo mã nguồn" />
        </div>
      </div>
      <div className="nb-editor-status"><span>{readOnly ? "Chế độ chỉ xem" : "Tab thụt · Shift+Tab lùi · Ctrl+Enter nộp bài"}</span><span className="nb-editor-pos">Dòng {activeLine + 1}, cột {caretCol} · {lines.length} dòng</span></div>
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
  const fbCtx = useContext(FeedbackContext);
  const selectedFb = selectedHistory ? fbCtx.byId.get(selectedHistory.id) : null;
  const fbAutoOpened = useRef(false);
  useEffect(() => {
    // Có nhận xét mới của thầy cô -> tự mở sẵn lịch sử và chọn đúng lần nộp đó
    if (fbAutoOpened.current || readOnly) return;
    const hit = orderedHistory.find((sub) => { const f = fbCtx.byId.get(sub.id); return f && !f.seenAt; });
    if (hit) { fbAutoOpened.current = true; setHistoryOpen(true); setSelectedHistoryId(hit.id); }
  }, [fbCtx.byId, orderedHistory.length, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="nb-modal nb-practice-modal" onClick={(e) => e.stopPropagation()}>
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
                <div className="nb-history-list">{orderedHistory.map((submission) => <button type="button" key={submission.id} className={"nb-history-item " + (selectedHistory?.id === submission.id ? "active" : "")} onClick={() => setSelectedHistoryId(submission.id)}><div><VerdictPill verdict={submission.verdict} /><span className="nb-history-date">{formatSubmissionDate(submission.createdAt)}</span></div><strong>{submission.score ?? 0}/{submission.problemPoints ?? problem.points}đ</strong><small>{submission.passedTests != null && submission.totalTests != null ? `${submission.passedTests}/${submission.totalTests} test đạt` : "Bản nộp cũ"}</small>{fbCtx.byId.get(submission.id) && <span className={"nb-fb-chip wide " + (fbCtx.byId.get(submission.id).seenAt ? "" : "fresh")}><MessageSquare size={11} /> {fbCtx.byId.get(submission.id).seenAt ? "Có nhận xét của thầy cô" : "Nhận xét mới của thầy cô"}</span>}</button>)}</div>
                {selectedHistory && <div className="nb-history-viewer"><div className="nb-history-viewer-head"><strong>Code của lần nộp</strong><button type="button" className="nb-btn nb-btn-ghost" onClick={async () => { try { const c = selectedHistory.sourceCode || await fetchSourceCode(selectedHistory.id); if (c) { if (chooseLanguage && LANGUAGE_META[selectedHistory.language]) setChosenLanguage(selectedHistory.language); setCode(c); setResult(null); setHistoryOpen(false); } } catch (e) { /* ignore */ } }}><Code2 size={14} /> Khôi phục vào editor</button></div><LazySourceCode submission={selectedHistory} language={chooseLanguage ? selectedHistory.language : editorLanguage} notes={selectedFb?.lineNotes} emptyMessage="Lượt nộp này được tạo trước khi hệ thống lưu source code." />{selectedFb && <HistoryFeedback fb={selectedFb} submission={selectedHistory} language={chooseLanguage ? selectedHistory.language : editorLanguage} onRestore={(fixedCode) => { setCode(fixedCode); setResult(null); setHistoryOpen(false); }} />}</div>}
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
  const followCtx = useContext(FeedbackContext);
  const todayKey = localDayKey(Date.now());
  const [range, setRange] = useState(14);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [openStudent, setOpenStudent] = useState(null);
  const [openSubId, setOpenSubId] = useState(null);
  const [fbIds, setFbIds] = useState(() => new Set());
  useEffect(() => {
    if (!openStudent) return undefined;
    let cancelled = false;
    dbFetchFeedbackIds({ studentId: openStudent }).then((ids) => { if (!cancelled && ids) setFbIds((cur) => new Set([...cur, ...ids])); }).catch(() => {});
    return () => { cancelled = true; };
  }, [openStudent]);
  const markFeedback = useCallback((id, has) => setFbIds((cur) => { const n = new Set(cur); if (has) n.add(id); else n.delete(id); return n; }), []);
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
                            {followCtx.followSubIds.has(sub.id) && <span className="nb-fb-chip fresh" title="Học sinh nộp lại sau khi được nhận xét"><RefreshCw size={11} /> Nộp lại sau nhận xét</span>}
                            {fbIds.has(sub.id) && <span className="nb-fb-chip" title="Đã có nhận xét"><MessageSquare size={11} /> Đã nhận xét</span>}
                            <VerdictPill verdict={sub.verdict} />
                            <span className="nb-daily-sub-score nb-mono">{sub.score ?? 0}đ</span>
                            <Code2 size={14} className="nb-daily-sub-code-icon" />
                          </button>
                          {subOpen && <div className="nb-history-code-wrap"><FeedbackEditor submission={sub} emptyMessage="Lượt nộp này không có lưu source code." onChanged={markFeedback} /></div>}
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

function timeAgoVi(value, nowMs = Date.now()) {
  const t = new Date(value || 0).getTime();
  if (!t) return "";
  const diff = Math.max(0, nowMs - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(t));
}

function OvRing({ value, tone }) {
  const R = 17, C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg className={`nb-ov-ring ${tone}`} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={R} className="bg" />
      <circle cx="22" cy="22" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} />
      <text x="22" y="26" textAnchor="middle">{Math.round(v)}</text>
    </svg>
  );
}
function OvSpark({ data, tone }) {
  const max = Math.max(1, ...data);
  const w = 88, h = 34, step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 4 - (v / max) * (h - 10)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className={`nb-ov-spark ${tone}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} className="area" />
      <path d={line} className="line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" className="dot" />
    </svg>
  );
}
function OvKpi({ label, value, sub, trend, ring, spark, tone = "teal", icon }) {
  return (
    <div className="nb-ov-kpi">
      <div className="nb-ov-kpi-main">
        <small>{icon}{label}</small>
        <strong>{value}</strong>
        <span>{sub}{trend != null && trend !== 0 && <em className={trend > 0 ? "up" : "down"}>{trend > 0 ? "▲" : "▼"} {Math.abs(trend)}</em>}</span>
      </div>
      {ring != null && <OvRing value={ring} tone={tone} />}
      {spark && <OvSpark data={spark} tone={tone} />}
    </div>
  );
}

function OvPanel({ eyebrow, title, action, onAction, children, className = "" }) {
  return (
    <section className={`nb-ov-panel ${className}`}>
      <header><div><span className="nb-ov-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action && <button className="nb-link-button" onClick={onAction}>{action} <ChevronRight size={14} /></button>}</header>
      {children}
    </section>
  );
}

function OvEmpty({ icon, title, text }) {
  return <div className="nb-ov-empty">{icon}<strong>{title}</strong><span>{text}</span></div>;
}

function greetingByHour() {
  const h = new Date().getHours();
  return h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

const WEEKLY_GOAL_DEFAULT = 5; /* mục tiêu cố định: 5 bài AC / ngày */
const CHALLENGE_STEP = 3; /* sau khi đạt, cứ mỗi 3 bài AC thêm là một thử thách */
const AC_MILESTONES = [5, 10, 20, 30, 50, 100];

const DAY_MS_G = 24 * 60 * 60 * 1000;
const DOW_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/* Map: 0h của ngày -> số bài được AC LẦN ĐẦU trong ngày đó */
function acPerDay(subs) {
  const first = new Map();
  subs.forEach((x) => {
    if (x.verdict !== "AC") return;
    const t = new Date(x.createdAt || 0).getTime();
    const cur = first.get(x.problemId);
    if (cur === undefined || t < cur) first.set(x.problemId, t);
  });
  const m = new Map();
  first.forEach((t) => { const k = new Date(t).setHours(0, 0, 0, 0); m.set(k, (m.get(k) || 0) + 1); });
  return m;
}

/* Chuỗi ngày liên tiếp đạt mục tiêu; hôm nay chưa đạt thì chuỗi vẫn còn nếu hôm qua đạt */
function goalStreak(m) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if ((m.get(d.getTime()) || 0) < WEEKLY_GOAL_DEFAULT) d.setDate(d.getDate() - 1);
  let n = 0;
  while ((m.get(d.getTime()) || 0) >= WEEKLY_GOAL_DEFAULT) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

function bestGoalStreak(m) {
  const days = [...m.entries()].filter(([, c]) => c >= WEEKLY_GOAL_DEFAULT).map(([k]) => k).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  days.forEach((k) => {
    if (prev !== null) { const nx = new Date(prev); nx.setDate(nx.getDate() + 1); run = nx.getTime() === k ? run + 1 : 1; } else run = 1;
    best = Math.max(best, run); prev = k;
  });
  return best;
}

function lastDaysCounts(m, n = 7) {
  const out = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(d); x.setDate(x.getDate() - i);
    out.push({ key: x.getTime(), dow: DOW_VI[x.getDay()], label: `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`, count: m.get(x.getTime()) || 0, today: i === 0 });
  }
  return out;
}

/* Huy hiệu: các huy hiệu theo bài AC tính theo NGÀY (làm mới mỗi ngày), huy hiệu chuỗi tính theo số ngày liền đạt mục tiêu */
function computeBadges(todayCount, streak = 0) {
  const G = WEEKLY_GOAL_DEFAULT;
  const daily = [
    { id: "first", icon: <CheckCircle2 size={26} />, name: "AC đầu tiên", need: 1, tone: "sky" },
    { id: "goal", icon: <Target size={26} />, name: "Đạt mục tiêu", need: G, tone: "emerald" },
    { id: "chal", icon: <Flame size={26} />, name: "Vượt thử thách", need: G + CHALLENGE_STEP, tone: "amber" },
    { id: "super", icon: <Trophy size={26} />, name: "Siêu năng suất", need: G + 2 * CHALLENGE_STEP, tone: "violet" },
    { id: "a10", icon: <Code2 size={26} />, name: "10 bài AC", need: 10, tone: "rose" },
    { id: "a30", icon: <Award size={26} />, name: "30 bài AC", need: 30, tone: "gold" },
  ].map((d) => ({ ...d, cur: todayCount, unit: "bài", kind: "day", sub: d.need === 1 ? "Giải đúng bài đầu tiên trong ngày" : `AC ${d.need} bài trong một ngày` }));
  const streaks = [
    { id: "s3", icon: <Flame size={26} />, name: "3 ngày liên tiếp", need: 3, tone: "teal" },
    { id: "s7", icon: <Flame size={26} />, name: "7 ngày liên tiếp", need: 7, tone: "gold" },
  ].map((d) => ({ ...d, cur: streak, unit: "ngày", kind: "streak", sub: `Đạt mục tiêu ${d.need} ngày liền` }));
  return [...daily, ...streaks].map((d) => ({ ...d, earned: d.cur >= d.need, pct: Math.min(100, Math.round((d.cur / d.need) * 100)) }));
}

/* Ảnh huy hiệu: đặt file badges/<id>.png (id: first, goal, chal, super, a10, a30, s3, s7) cạnh index.html.
   Không có ảnh thì tự dùng biểu tượng mặc định. */
function BadgeMedal({ badge }) {
  const [failed, setFailed] = useState(false);
  const hasImg = !failed;
  return (
    <span className={`nb-medal ${hasImg ? "has-img" : ""}`} style={{ "--p": `${badge.pct * 3.6}deg` }}>
      <span className="nb-medal-face">
        {hasImg && <img src={`badges/${badge.id}.png`} alt="" draggable="false" onError={() => setFailed(true)} />}
        {!hasImg && (badge.earned ? badge.icon : <Lock size={20} />)}
      </span>
      {hasImg && !badge.earned && <i className="nb-medal-lock"><Lock size={12} /></i>}
      {badge.earned && <i className="nb-medal-check"><CheckCircle2 size={14} /></i>}
    </span>
  );
}

function BadgeShelf({ badges, bestDay }) {
  const got = badges.filter((b) => b.earned).length;
  /* huy hiệu gần đạt nhất được nhắc riêng để kích thích chinh phục */
  const next = badges.filter((b) => !b.earned).sort((a, b) => b.pct - a.pct)[0];
  return (
    <OvPanel eyebrow="Thành tích" title={`Huy hiệu của em · ${got}/${badges.length}`}>
      {next && <div className="nb-badge-next"><Target size={15} /> Gần nhất: <b>{next.name}</b> — còn {next.need - next.cur} {next.unit}</div>}
      <div className="nb-badges">
        {badges.map((b) => (
          <div key={b.id} className={`nb-badge t-${b.tone} ${b.earned ? "earned" : "locked"}`} title={b.sub}>
            <BadgeMedal badge={b} />
            <strong>{b.name}</strong>
            <small>{b.sub}</small>
            <span className="nb-badge-state">{b.earned ? (b.kind === "streak" ? "Đang giữ chuỗi" : "Đã đạt hôm nay") : `${Math.min(b.cur, b.need)}/${b.need} ${b.unit}`}</span>
          </div>))}
      </div>
      <p className="nb-badge-note">Huy hiệu bài AC làm mới mỗi ngày, huy hiệu chuỗi mất khi bỏ lỡ một ngày · Kỷ lục một ngày của em: <b>{bestDay} bài AC</b></p>
    </OvPanel>
  );
}

function GoalStrip({ days }) {
  return (
    <div className="nb-goal-strip" aria-label="7 ngày gần nhất">
      {days.map((d) => (
        <span key={d.key} className={`nb-gs ${d.count >= WEEKLY_GOAL_DEFAULT ? "ok" : d.count > 0 ? "part" : d.today ? "wait" : "none"} ${d.today ? "today" : ""}`} title={`${d.dow} ${d.label}: ${d.count} bài`}>
          <em>{d.dow}</em><b>{d.count >= WEEKLY_GOAL_DEFAULT ? <CheckCircle2 size={14} /> : d.count || "·"}</b>
        </span>))}
    </div>
  );
}

function gtLevel(n) { return n >= WEEKLY_GOAL_DEFAULT + 2 * CHALLENGE_STEP ? "super" : n >= WEEKLY_GOAL_DEFAULT + CHALLENGE_STEP ? "chal" : n >= WEEKLY_GOAL_DEFAULT ? "ok" : n > 0 ? "part" : "none"; }
function TeacherGoalTable({ students, subsByStudent, onNavigate }) {
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("attention");
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const rows = useMemo(() => students.map((st) => {
    const m = acPerDay(subsByStudent.get(st.id) || []);
    const days = lastDaysCounts(m, 7);
    return { student: st, days, today: days[days.length - 1].count, streak: goalStreak(m), reached: days.filter((d) => d.count >= WEEKLY_GOAL_DEFAULT).length };
  }), [students, subsByStudent]);
  const reachedToday = rows.filter((r) => r.today >= WEEKLY_GOAL_DEFAULT).length;
  const filtered = rows.filter((r) => filter === "all" ? true : filter === "done" ? r.today >= WEEKLY_GOAL_DEFAULT : filter === "partial" ? r.today > 0 && r.today < WEEKLY_GOAL_DEFAULT : r.today === 0)
    .filter((r) => !q.trim() || (r.student.name || "").toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sortBy === "streak" ? (b.streak - a.streak) || (b.reached - a.reached) : (a.today - b.today) || (a.reached - b.reached) || (a.student.name || "").localeCompare(b.student.name || "", "vi"));
  const LIMIT = 8;
  const shown = showAll ? filtered : filtered.slice(0, LIMIT);
  const header = rows[0]?.days || [];

  function exportCsv() {
    const head = ["Học sinh", ...header.map((d) => `${d.dow} ${d.label}`), "Ngày đạt (7 ngày)", "Chuỗi hiện tại"];
    const body = filtered.map((r) => [r.student.name, ...r.days.map((d) => d.count), r.reached, r.streak]);
    const csv = [head, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `muc-tieu-ngay-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const cnt = { all: rows.length, done: reachedToday, partial: rows.filter((r) => r.today > 0 && r.today < WEEKLY_GOAL_DEFAULT).length, none: rows.filter((r) => r.today === 0).length };
  const pct = rows.length ? Math.round((reachedToday / rows.length) * 100) : 0;
  const tiles = [["all", "Cả lớp", "all"], ["done", "Đã đạt", "ok"], ["partial", "Đang làm", "part"], ["none", "Chưa làm", "none"]];

  return (
    <section className="nb-ov-panel nb-gt">
      <header>
        <div>
          <span className="nb-ov-eyebrow">Mục tiêu ngày · 7 ngày gần nhất</span>
          <h2>Hôm nay <b>{reachedToday}/{students.length}</b> em đạt {WEEKLY_GOAL_DEFAULT} bài AC</h2>
        </div>
        <button className="nb-link-button" onClick={exportCsv}><Save size={14} /> Xuất CSV</button>
      </header>
      {students.length === 0 ? <OvEmpty icon={<Users size={22} />} title="Chưa có học sinh" text="Dữ liệu hiện khi lớp có học sinh." /> : (
        <>
          <div className="nb-gt-progress" role="img" aria-label={`${pct}% học sinh đã đạt mục tiêu hôm nay`}><i style={{ width: `${pct}%` }} /><i className="part" style={{ width: `${rows.length ? (cnt.partial / rows.length) * 100 : 0}%` }} /></div>
          <div className="nb-gt-tools">
            <div className="nb-gt-tiles" role="tablist">
              {tiles.map(([k, l, tone]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={`nb-gt-tile ${tone} ${filter === k ? "on" : ""}`} onClick={() => { setFilter(k); setShowAll(false); }}>
                  <b>{cnt[k]}</b><span>{l}</span>
                </button>))}
            </div>
            <div className="nb-gt-right">
              <label className="nb-gt-search"><Search size={13} /><input placeholder="Tìm em…" value={q} onChange={(e) => { setQ(e.target.value); setShowAll(false); }} /></label>
              <select className="nb-input nb-gt-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sắp xếp">
                <option value="attention">Cần nhắc trước</option>
                <option value="streak">Chuỗi cao nhất</option>
              </select>
            </div>
          </div>
          <div className="nb-gt-scroll">
            <table className="nb-gt-table">
              <thead><tr><th>Học sinh</th>{header.map((d) => <th key={d.key} className={d.today ? "today" : ""}>{d.today ? "Nay" : d.dow}<small>{d.label.slice(0, 5)}</small></th>)}<th>Đạt</th><th>Chuỗi</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.student.id} className={r.today >= WEEKLY_GOAL_DEFAULT ? "done" : ""}>
                    <td><div className="nb-gt-name"><span className={`nb-gt-dot ${gtLevel(r.today)}`} title={r.today >= WEEKLY_GOAL_DEFAULT ? "Đã đạt hôm nay" : r.today > 0 ? "Đang làm" : "Chưa làm hôm nay"} /><Avatar name={r.student.name} size={22} /><span>{r.student.name}</span></div></td>
                    {r.days.map((d) => <td key={d.key} className={d.today ? "today" : ""}><span className={`nb-gt-cell ${gtLevel(d.count)}`} style={d.count > 0 && d.count < WEEKLY_GOAL_DEFAULT ? { "--fill": `${(d.count / WEEKLY_GOAL_DEFAULT) * 100}%` } : undefined} title={`${d.dow} ${d.label}: ${d.count} bài AC`}>{d.count > 0 ? d.count : ""}</span></td>)}
                    <td><span className="nb-gt-reach" title={`${r.reached}/7 ngày đạt mục tiêu`}>{r.reached}<small>/7</small></span></td>
                    <td><span className={`nb-gt-streak ${r.streak > 0 ? "on" : ""}`}><Flame size={12} /> {r.streak}</span></td>
                  </tr>))}
                {shown.length === 0 && <tr><td colSpan={10} className="nb-gt-empty">Không có học sinh nào khớp.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="nb-gt-foot">
            <span className="nb-gt-legend"><i className="nb-gt-cell none" /> chưa làm <i className="nb-gt-cell part" style={{ "--fill": "50%" }} /> 1–{WEEKLY_GOAL_DEFAULT - 1} bài <i className="nb-gt-cell ok" /> {WEEKLY_GOAL_DEFAULT}+ đạt <i className="nb-gt-cell chal" /> {WEEKLY_GOAL_DEFAULT + CHALLENGE_STEP}+ thử thách <i className="nb-gt-cell super" /> {WEEKLY_GOAL_DEFAULT + 2 * CHALLENGE_STEP}+ siêu</span>
            {filtered.length > LIMIT && <button className="nb-link-button" onClick={() => setShowAll((v) => !v)}>{showAll ? "Thu gọn" : `Xem tất cả ${filtered.length} em`}</button>}
          </div>
        </>
      )}
    </section>
  );
}

/* Số bài LẦN ĐẦU được AC kể từ mốc `weekStart` (ở đây là 0h hôm nay) */
function newAcThisWeek(subs, weekStart) {
  const first = new Map();
  subs.forEach((s) => {
    if (s.verdict !== "AC") return;
    const t = new Date(s.createdAt || 0).getTime();
    const cur = first.get(s.problemId);
    if (cur === undefined || t < cur) first.set(s.problemId, t);
  });
  let n = 0;
  first.forEach((t) => { if (t >= weekStart) n += 1; });
  return n;
}

function WeeklyGoalCard({ solvedWeek, solvedTotal, remainingProblems, onGo, days, streak }) {
  const goal = WEEKLY_GOAL_DEFAULT;
  const hour = new Date().getHours();
  const reached = solvedWeek >= goal;
  const extra = Math.max(0, solvedWeek - goal);
  const challengesDone = Math.floor(extra / CHALLENGE_STEP);
  const inChallenge = extra % CHALLENGE_STEP;
  const nextTarget = reached ? goal + (challengesDone + 1) * CHALLENGE_STEP : goal;
  const need = Math.max(0, nextTarget - solvedWeek);
  const allDone = remainingProblems <= 0;
  const nextMilestone = AC_MILESTONES.find((m) => m > solvedTotal);

  let tone = "go", title, text, icon = <Target size={22} />, label = `Mục tiêu hôm nay · AC ${goal} bài`;
  let segTotal = goal, segDone = Math.min(solvedWeek, goal);
  if (reached) {
    tone = "done"; icon = <Trophy size={22} />;
    label = `Đã đạt mục tiêu ${goal} bài · Thử thách mỗi ${CHALLENGE_STEP} bài`;
    segTotal = CHALLENGE_STEP; segDone = inChallenge;
    title = challengesDone === 0
      ? `Chúc mừng! Em đã đạt mục tiêu hôm nay (${solvedWeek}/${goal} bài)`
      : `Tuyệt vời! Em đã vượt ${challengesDone} thử thách (${solvedWeek} bài AC hôm nay)`;
    text = allDone
      ? "Em đã giải hết tất cả bài hiện có — chờ thầy cô thêm bài mới nhé!"
      : `Thử thách tiếp theo: thêm ${CHALLENGE_STEP} bài nữa để đạt ${nextTarget} bài trong ngày (còn ${need}).`;
  } else if (solvedWeek === 0) {
    tone = hour >= 18 ? "warn" : "start";
    title = `Hôm nay em chưa giải bài nào — mục tiêu là ${goal} bài AC`;
    text = hour >= 18 ? "Trời đã tối rồi, hãy giải thật nhanh vài bài để giữ chuỗi học nhé!" : "Bắt đầu bằng một bài dễ để lấy đà nhé!";
  } else if (hour >= 18 && need >= 2) {
    tone = "warn";
    title = `Em còn thiếu ${need} bài để đạt mục tiêu hôm nay`;
    text = "Sắp hết ngày rồi, cố thêm chút nữa nhé!";
  } else {
    title = `Còn ${need} bài nữa là đạt mục tiêu hôm nay`;
    text = `Em đã giải ${solvedWeek}/${goal} bài, tiếp tục phát huy nhé!`;
  }

  return (
    <section className={`nb-goal ${tone}`} aria-label="Mục tiêu hôm nay">
      <span className="nb-goal-icon">{icon}</span>
      <div className="nb-goal-main">
        <small>{label}</small>
        <strong>{title}</strong>
        <span>{text}</span>
        <div className="nb-goal-steps" role="img" aria-label={`${segDone} trên ${segTotal} bài`}>
          {Array.from({ length: segTotal }, (_, i) => <i key={i} className={i < segDone ? "on" : ""} />)}
          <b>{segDone}/{segTotal}{reached ? ` · Thử thách ${challengesDone + 1}` : ""}</b>
        </div>
        {days && <div className="nb-goal-strip-wrap"><GoalStrip days={days} /><span className="nb-goal-streak"><Flame size={14} /> <b>{streak}</b> ngày liên tiếp đạt mục tiêu</span></div>}
        {nextMilestone && <div className="nb-goal-foot"><span><Award size={13} /> Mốc tiếp theo: {nextMilestone} bài AC (còn {nextMilestone - solvedTotal})</span></div>}
      </div>
      <button className="nb-btn nb-btn-primary" onClick={() => onGo?.()}>
        {reached ? <><Flame size={15} /> Nhận thử thách</> : <><Code2 size={15} /> Giải bài ngay</>}
      </button>
    </section>
  );
}

function OverviewView({ currentUser, students, submissions, points, solvedCount, contests, discussions, problemsCount, problems, onNavigate }) {
  const isTeacher = currentUser.role === "teacher" || currentUser.role === "admin";
  const todayLabel = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric" }).format(new Date());
  const activeContest = contests.find((contest) => contest.status === "active");
  const byTimeDesc = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

  if (!isTeacher) {
    const rankSorted = [...students].sort((a, b) => (points(b.id) - points(a.id)) || (solvedCount(b.id) - solvedCount(a.id)));
    const rank = rankSorted.findIndex((student) => student.id === currentUser.id) + 1;
    const mine = submissions.filter((submission) => submission.studentId === currentUser.id).sort(byTimeDesc);
    const recentActivity = mine.slice(0, 5);
    const solved = solvedCount(currentUser.id);
    const remaining = Math.max(0, problemsCount - solved);
    const progress = problemsCount ? Math.round((solved / problemsCount) * 100) : 0;
    const bestRecent = mine.find((submission) => submission.verdict === "AC");
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const solvedWeek = newAcThisWeek(mine, todayStart); /* số bài AC lần đầu trong hôm nay */
    const dayMap = acPerDay(mine);
    const streak = goalStreak(dayMap);
    const weekDays = lastDaysCounts(dayMap, 7);
    const badges = computeBadges(solvedWeek, streak);
    const bestDay = Math.max(0, ...dayMap.values());

    return (
      <div className="nb-ov">
        <SisterSiteBanner />
        <header className="nb-ov-head">
          <div className="nb-ov-head-text"><span className="nb-ov-date">{todayLabel}</span><h1>{greetingByHour()}, {currentUser.name}</h1><p>Mỗi ngày một bài, em sẽ tiến bộ thấy rõ.</p></div>
          <div className="nb-ov-head-chips">
            <span className="nb-ov-chip gold"><Award size={14} /> Hạng {rank > 0 ? `#${rank}` : "—"}</span>
            <span className="nb-ov-chip red"><Flame size={14} /> {streak} ngày đạt mục tiêu</span>
          </div>
        </header>

        {activeContest ? (
          <section className="nb-ov-focus live">
            <span className="nb-ov-focus-icon"><span className="nb-home-live-dot"><span /></span></span>
            <div className="nb-ov-focus-text"><small>Việc cần làm ngay</small><strong>Đề thi đang mở: {activeContest.title}</strong><span><Clock size={13} /> {activeContest.duration} phút · <ListChecks size={13} /> {activeContest.problemCount} bài</span></div>
            <button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("contests")}><Play size={15} /> Vào thi</button>
          </section>
        ) : (
          <section className="nb-ov-focus">
            <span className="nb-ov-focus-icon"><Code2 size={20} /></span>
            <div className="nb-ov-focus-text"><small>Việc tiếp theo</small><strong>{remaining > 0 ? `Còn ${remaining} bài chờ em chinh phục` : "Em đã hoàn thành tất cả bài hiện có"}</strong><span>{bestRecent ? `Bài giải tốt gần nhất: ${bestRecent.problemTitle || bestRecent.problemId}.` : "Chọn một bài để bắt đầu xây dựng thành tích."}</span></div>
            <button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Luyện tập ngay</button>
          </section>
        )}

        <FeedbackInbox submissions={submissions} onOpen={(fb) => { pendingProblemOpenId = fb.problemId; onNavigate?.("problems"); }} />

        <WeeklyGoalCard solvedWeek={solvedWeek} solvedTotal={solved} remainingProblems={remaining} days={weekDays} streak={streak} onGo={() => onNavigate?.("problems")} />

        <div className="nb-ov-kpis">
          <OvKpi label="Tổng điểm" value={points(currentUser.id)} sub="điểm tích lũy" tone="teal" />
          <OvKpi label="Xếp hạng lớp" value={rank > 0 ? `#${rank}` : "—"} sub={`trên ${students.length} học sinh`} tone="gold" />
          <OvKpi label="Bài đã giải" value={`${solved}/${problemsCount}`} sub="trong ngân hàng bài" ring={progress} tone="green" />
          <OvKpi label="Chuỗi ngày học" value={streak} sub="ngày liền đạt mục tiêu" tone="rose" />
        </div>

        <BadgeShelf badges={badges} bestDay={bestDay} />

        <div className="nb-ov-grid two">
          <OvPanel eyebrow="Nhật ký học tập" title="Hoạt động gần đây" action="Xem bài tập" onAction={() => onNavigate?.("problems")}>
            {recentActivity.length === 0 ? <OvEmpty icon={<Code2 size={22} />} title="Chưa có hoạt động" text="Giải bài đầu tiên để theo dõi tiến độ." /> : (
              <ul className="nb-ov-list">{recentActivity.map((s, i) => (
                <li key={s.id || i}>
                  <span className={`nb-ov-dot ${s.verdict === "AC" ? "ok" : "warn"}`}>{s.verdict === "AC" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</span>
                  <div><strong>{s.problemTitle || s.problemId}</strong><small>{s.passedTests != null && s.totalTests != null ? `${s.passedTests}/${s.totalTests} test` : s.verdict} · {timeAgoVi(s.createdAt)}</small></div>
                  <b>{s.score ?? 0}đ</b>
                </li>))}</ul>
            )}
          </OvPanel>
          <OvPanel eyebrow="Lối tắt" title="Học gì tiếp theo?">
            <div className="nb-ov-links">
              <button onClick={() => onNavigate?.("lessons")}><span className="nb-ov-link-icon blue"><BookOpen size={16} /></span><span><strong>Bài giảng</strong><small>Ôn lý thuyết trước khi làm bài</small></span><ChevronRight size={15} /></button>
              <button onClick={() => onNavigate?.("assignments")}><span className="nb-ov-link-icon green"><ListChecks size={16} /></span><span><strong>Bài được giao</strong><small>Việc thầy cô giao riêng cho em</small></span><ChevronRight size={15} /></button>
              <button onClick={() => onNavigate?.("leaderboard")}><span className="nb-ov-link-icon gold"><Trophy size={16} /></span><span><strong>Bảng xếp hạng</strong><small>So sánh với cả lớp</small></span><ChevronRight size={15} /></button>
              <button onClick={() => { lsSet("fun-tab", "typing"); onNavigate?.("typing"); }}><span className="nb-ov-link-icon red"><Keyboard size={16} /></span><span><strong>Giải trí: Gõ lệnh Python</strong><small>Luyện gõ nhanh, nhớ cú pháp</small></span><ChevronRight size={15} /></button>
              <button onClick={() => { lsSet("fun-tab", "algo"); onNavigate?.("typing"); }}><span className="nb-ov-link-icon blue"><Code2 size={16} /></span><span><strong>Giải trí: Mô phỏng thuật toán</strong><small>Xem sắp xếp, tìm kiếm, BFS, DFS chạy từng bước</small></span><ChevronRight size={15} /></button>
            </div>
          </OvPanel>
        </div>
      </div>
    );
  }

  /* ---------------- Giáo viên ---------------- */
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const inWindow = (s, from, to) => { const t = new Date(s.createdAt || 0).getTime(); return t >= from && t < to; };
  const weekly = submissions.filter((s) => inWindow(s, now - 7 * DAY, now + DAY));
  const prevWeek = submissions.filter((s) => inWindow(s, now - 14 * DAY, now - 7 * DAY));
  const weeklyActive = new Set(weekly.map((s) => s.studentId)).size;
  const weeklyAc = weekly.filter((s) => s.verdict === "AC").length;
  const acRate = weekly.length ? Math.round((weeklyAc / weekly.length) * 100) : 0;
  const avgPoints = students.length ? Math.round(students.reduce((sum, st) => sum + points(st.id), 0) / students.length) : 0;
  const activePct = students.length ? Math.round((weeklyActive / students.length) * 100) : 0;
  const openThreads = discussions.filter((d) => (d.replies || []).length === 0);
  const sparkDays = Array.from({ length: 7 }, (_, i) => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const from = d0.getTime() - (6 - i) * DAY;
    return submissions.filter((x) => inWindow(x, from, from + DAY)).length;
  });
  const topThree = [...students].sort((a, b) => (points(b.id) - points(a.id)) || (solvedCount(b.id) - solvedCount(a.id))).slice(0, 3);

  const lastByStudent = new Map();
  const byProblem = new Map();
  const byStudentSubs = new Map();
  submissions.forEach((s) => {
    const t = new Date(s.createdAt || 0).getTime();
    if (t > (lastByStudent.get(s.studentId) || 0)) lastByStudent.set(s.studentId, t);
    if (!byStudentSubs.has(s.studentId)) byStudentSubs.set(s.studentId, []);
    byStudentSubs.get(s.studentId).push(s);
    if (!byProblem.has(s.problemId)) byProblem.set(s.problemId, []);
    byProblem.get(s.problemId).push(s);
  });
  const inactive = students
    .map((st) => ({ student: st, last: lastByStudent.get(st.id) || 0 }))
    .filter((x) => x.last < now - 14 * DAY)
    .sort((a, b) => a.last - b.last);
  const hardProblems = (problems || []).map((problem) => {
    const list = byProblem.get(problem.id) || [];
    const ac = list.filter((s) => s.verdict === "AC").length;
    return { problem, attempts: list.length, ac, rate: list.length ? Math.round((ac / list.length) * 100) : 0 };
  }).filter((x) => x.attempts >= 3).sort((a, b) => (a.rate - b.rate) || (b.attempts - a.attempts)).slice(0, 4);
  const nameById = new Map(students.map((st) => [st.id, st.name]));
  const recent = submissions.slice().sort(byTimeDesc).slice(0, 7);

  const todo = [];
  if (openThreads.length > 0) todo.push({ key: "q", tone: "red", icon: <MessageSquare size={17} />, title: `${openThreads.length} câu hỏi chờ trả lời`, text: "Học sinh đang chờ thầy cô phản hồi", go: "discussion" });
  if (activeContest) todo.push({ key: "x", tone: "green", icon: <Clock size={17} />, title: "Đang có đề thi mở", text: `${activeContest.title} · ${activeContest.duration} phút`, go: "contests" });
  if (inactive.length > 0) todo.push({ key: "i", tone: "gold", icon: <Users size={17} />, title: `${inactive.length} học sinh 14 ngày chưa nộp bài`, text: "Cần nhắc nhở hoặc hỗ trợ", go: "leaderboard" });

  return (
    <div className="nb-ov">
      <SisterSiteBanner />
      <header className="nb-ov-head">
        <div className="nb-ov-head-text"><span className="nb-ov-date">{todayLabel}</span><h1>{greetingByHour()}, {currentUser.name}</h1><p>Tuần này lớp có <b>{weekly.length}</b> lượt nộp từ <b>{weeklyActive}/{students.length}</b> học sinh.</p></div>
        <div className="nb-ov-head-actions">
          <button className="nb-btn nb-btn-ghost" onClick={() => onNavigate?.("problems")}><Code2 size={15} /> Quản lý bài</button>
          <button className="nb-btn nb-btn-primary" onClick={() => onNavigate?.("contests")}><Plus size={15} /> Tạo đề thi</button>
        </div>
      </header>

      <section className="nb-ov-todo" aria-label="Việc cần xử lý">
        <header><strong>Cần xử lý hôm nay</strong>{todo.length > 0 && <span className="nb-ov-count">{todo.length}</span>}</header>
        {todo.length === 0
          ? <div className="nb-ov-todo-ok"><CheckCircle2 size={18} /> Không có việc cần xử lý, mọi thứ đang ổn.</div>
          : <div className="nb-ov-todo-rows">{todo.map((t) => (
            <button key={t.key} className={`nb-ov-todo-row ${t.tone}`} onClick={() => onNavigate?.(t.go)}>
              <span className="nb-ov-todo-icon">{t.icon}</span>
              <span className="nb-ov-todo-text"><strong>{t.title}</strong><small>{t.text}</small></span>
              <ChevronRight size={16} />
            </button>))}</div>}
      </section>

      <div className="nb-ov-kpis">
        <OvKpi label="Học sinh hoạt động" value={`${weeklyActive}/${students.length}`} sub="trong 7 ngày qua" ring={activePct} tone="teal" />
        <OvKpi label="Lượt nộp tuần" value={weekly.length} sub="vs tuần trước" trend={weekly.length - prevWeek.length} spark={sparkDays} tone="blue" />
        <OvKpi label="Tỷ lệ đúng" value={`${acRate}%`} sub={`${weeklyAc} lượt AC / 7 ngày`} ring={acRate} tone="green" />
        <OvKpi label="Điểm trung bình" value={avgPoints} sub="mỗi học sinh" tone="gold" />
      </div>

      <FollowUpInbox students={students} onOpen={(f) => { pendingReviewTarget = { problemId: f.problemId, submissionId: f.latest.id }; onNavigate?.("problems"); }} />

      <div className="nb-ov-grid main">
        <div className="nb-ov-col wide"><DailyActivityPanel submissions={submissions} students={students} /></div>
        <div className="nb-ov-col">
          {openThreads.length > 0 && (
            <OvPanel eyebrow="Hộp việc cần làm" title="Câu hỏi chờ trả lời" action="Mở thảo luận" onAction={() => onNavigate?.("discussion")}>
              <ul className="nb-ov-list">{openThreads.slice(0, 3).map((d) => (
                <li key={d.id} className="clickable" onClick={() => onNavigate?.("discussion")}>
                  <span className="nb-ov-dot info"><MessageSquare size={14} /></span>
                  <div><strong>{d.author}</strong><small>{String(d.content || "").slice(0, 60)}{String(d.content || "").length > 60 ? "…" : ""}</small></div>
                </li>))}</ul>
            </OvPanel>
          )}
          <OvPanel eyebrow="Theo dõi cá nhân" title="Học sinh cần hỗ trợ" action="Xem lớp" onAction={() => onNavigate?.("leaderboard")}>
            {inactive.length === 0 ? <OvEmpty icon={<CheckCircle2 size={22} />} title="Cả lớp đều hoạt động" text="Không ai quá 14 ngày chưa nộp bài." /> : (
              <ul className="nb-ov-list">{inactive.slice(0, 5).map(({ student, last }) => (
                <li key={student.id}>
                  <Avatar name={student.name} size={30} />
                  <div><strong>{student.name}</strong><small>{last ? `Nộp gần nhất ${timeAgoVi(last, now)}` : "Chưa nộp bài nào"}</small></div>
                  <span className="nb-ov-tag risk">Cần nhắc</span>
                </li>))}
              {inactive.length > 5 && <li className="more">và {inactive.length - 5} học sinh khác</li>}</ul>
            )}
          </OvPanel>
        </div>
      </div>

      <FeedbackTracker students={students} submissions={submissions} onNavigate={onNavigate} />

      <TeacherGoalTable students={students} subsByStudent={byStudentSubs} onNavigate={onNavigate} />

      <div className="nb-ov-grid three">
        <OvPanel eyebrow="Phân tích bài tập" title="Bài có tỷ lệ đúng thấp" action="Mở kho bài" onAction={() => onNavigate?.("problems")}>
          {hardProblems.length === 0 ? <OvEmpty icon={<Code2 size={22} />} title="Chưa đủ dữ liệu" text="Cần ít nhất 3 lượt nộp cho một bài." /> : (
            <ul className="nb-ov-list">{hardProblems.map((x) => (
              <li key={x.problem.id}>
                <div className="grow"><strong>{x.problem.title}</strong><small>{x.ac}/{x.attempts} lượt đúng</small><i className="nb-ov-meter"><b className={x.rate < 40 ? "low" : ""} style={{ width: `${x.rate}%` }} /></i></div>
                <b className="rate">{x.rate}%</b>
              </li>))}</ul>
          )}
        </OvPanel>
        <OvPanel eyebrow="Thành tích lớp" title="Học sinh nổi bật" action="Bảng xếp hạng" onAction={() => onNavigate?.("leaderboard")}>
          {topThree.length === 0 ? <OvEmpty icon={<Users size={22} />} title="Chưa có dữ liệu" text="Xuất hiện khi học sinh bắt đầu nộp bài." /> : (
            <ul className="nb-ov-list">{topThree.map((st, i) => (
              <li key={st.id}>
                <span className={`nb-ov-rank r${i + 1}`}>{i + 1}</span>
                <Avatar name={st.name} size={30} />
                <div><strong>{st.name}</strong><small>{solvedCount(st.id)} bài đã giải</small></div>
                <b>{points(st.id)}đ</b>
              </li>))}</ul>
          )}
        </OvPanel>
        <OvPanel eyebrow="Theo thời gian thực" title="Hoạt động gần đây">
          {recent.length === 0 ? <OvEmpty icon={<Code2 size={22} />} title="Chưa có lượt nộp" text="Các lượt nộp mới sẽ hiện ở đây." /> : (
            <ul className="nb-ov-list">{recent.map((s, i) => (
              <li key={s.id || i}>
                <span className={`nb-ov-dot ${s.verdict === "AC" ? "ok" : "warn"}`}>{s.verdict === "AC" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}</span>
                <div><strong>{nameById.get(s.studentId) || "Học sinh"}</strong><small>{timeAgoVi(s.createdAt, now)} · {s.problemTitle || s.problemId}</small></div>
                <b className={s.verdict === "AC" ? "ok" : ""}>{s.verdict}</b>
              </li>))}</ul>
          )}
        </OvPanel>
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

/* ======================= THỐNG KÊ AC THEO BÀI (cả lớp) ======================= */
function downloadCsv(filename, rows) {
  const csv = rows.map((line) => line.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Map: problemId -> { ac: Set<studentId>, tried: Set<studentId>, attempts } — chỉ tính học sinh đang có trong lớp */
function buildClassSolveStats(submissions, students) {
  const ids = new Set(students.map((st) => st.id));
  const map = new Map();
  submissions.forEach((sub) => {
    if (!ids.has(sub.studentId)) return;
    let e = map.get(sub.problemId);
    if (!e) { e = { ac: new Set(), tried: new Set(), attempts: 0 }; map.set(sub.problemId, e); }
    e.tried.add(sub.studentId);
    e.attempts += 1;
    if (sub.verdict === "AC") e.ac.add(sub.studentId);
  });
  return map;
}

function ClassSolveBar({ st, total, clickable, unit = "em", onOpen }) {
  if (!total) return null;
  const ac = st?.ac.size || 0;
  const tried = st?.tried.size || 0;
  const pct = Math.round((ac / total) * 100);
  const hard = tried >= 3 && ac / tried <= 0.34;
  const tone = ac === 0 ? "none" : pct >= 60 ? "high" : pct >= 30 ? "mid" : "low";
  const body = (
    <>
      <span className="nb-solve-track" aria-hidden="true"><b style={{ width: `${pct}%` }} /></span>
      <span className="nb-solve-text"><CheckCircle2 size={13} /><b>{ac}/{total}</b> {unit} đã AC{ac === 0 && tried > 0 ? " · chưa ai giải được" : ""}</span>
      {clickable && hard && <span className="nb-solve-flag">Cần xem lại</span>}
      {clickable && <ChevronRight size={13} className="nb-solve-go" />}
    </>
  );
  return clickable
    ? <button type="button" className={`nb-solve ${tone}`} onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Xem danh sách em đã AC / chưa AC / chưa làm">{body}</button>
    : <div className={`nb-solve ${tone}`} title={`${pct}% lớp đã giải được bài này`}>{body}</div>;
}

/* Giáo viên: ai đã AC, ai đã thử nhưng chưa AC, ai chưa làm bài này */
function ProblemClassModal({ problem, students, submissions, onClose }) {
  const [tab, setTab] = useState("ac");
  const data = useMemo(() => {
    const byStudent = new Map();
    submissions.filter((x) => x.problemId === problem.id).forEach((x) => {
      if (!byStudent.has(x.studentId)) byStudent.set(x.studentId, []);
      byStudent.get(x.studentId).push(x);
    });
    const rows = students.map((st) => {
      const subs = (byStudent.get(st.id) || []).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      const firstAcIdx = subs.findIndex((x) => x.verdict === "AC");
      const best = subs.reduce((m, x) => Math.max(m, Number(x.score ?? 0)), 0);
      return {
        student: st, attempts: subs.length, best,
        status: subs.length === 0 ? "none" : firstAcIdx >= 0 ? "ac" : "tried",
        acAt: firstAcIdx >= 0 ? subs[firstAcIdx].createdAt : null,
        triesToAc: firstAcIdx >= 0 ? firstAcIdx + 1 : null,
        lastAt: subs.length ? subs[subs.length - 1].createdAt : null,
      };
    });
    const ac = rows.filter((r) => r.status === "ac").sort((a, b) => new Date(a.acAt || 0) - new Date(b.acAt || 0));
    const tried = rows.filter((r) => r.status === "tried").sort((a, b) => b.attempts - a.attempts);
    const none = rows.filter((r) => r.status === "none").sort((a, b) => (a.student.name || "").localeCompare(b.student.name || "", "vi"));
    const fastest = ac.length ? [...ac].sort((a, b) => (a.triesToAc - b.triesToAc) || (new Date(a.acAt || 0) - new Date(b.acAt || 0)))[0] : null;
    return { ac, tried, none, first: ac[0] || null, fastest, rows };
  }, [problem.id, students, submissions]);

  const total = students.length;
  const pct = total ? Math.round((data.ac.length / total) * 100) : 0;
  const list = tab === "ac" ? data.ac : tab === "tried" ? data.tried : data.none;

  function exportCsv() {
    const label = { ac: "Đã AC", tried: "Đã thử, chưa AC", none: "Chưa làm" };
    const body = [...data.ac, ...data.tried, ...data.none].map((r) => [r.student.name, r.student.username || "", label[r.status], r.attempts, r.best, r.acAt ? formatSubmissionDate(r.acAt) : "", r.triesToAc || ""]);
    downloadCsv(`ai-da-ac-${problem.id}.csv`, [["Học sinh", "Tài khoản", "Trạng thái", "Số lần nộp", "Điểm cao nhất", "AC lần đầu lúc", "AC ở lần nộp thứ"], ...body]);
  }

  return (
    <div className="nb-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Thống kê AC — ${problem.title}`}>
      <div className="nb-modal nb-cls-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div><div className="nb-eyebrow">Ai đã giải được bài này?</div><h3 className="nb-h3">{problem.title}</h3></div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="nb-cls-summary">
          <div className="nb-cls-ring" style={{ "--p": `${pct * 3.6}deg` }}><span><b>{pct}%</b>lớp đã AC</span></div>
          <div className="nb-cls-stats">
            <div className="ac"><b>{data.ac.length}</b><span>đã AC</span></div>
            <div className="tried"><b>{data.tried.length}</b><span>đã thử, chưa AC</span></div>
            <div className="none"><b>{data.none.length}</b><span>chưa làm</span></div>
          </div>
        </div>
        {data.first && (
          <div className="nb-cls-highlights">
            <div><Trophy size={15} /> <span>AC đầu tiên</span><b>{data.first.student.name}</b><small>{formatSubmissionDate(data.first.acAt)}</small></div>
            <div><Target size={15} /> <span>Ít lần nộp nhất</span><b>{data.fastest.student.name}</b><small>AC ở lần nộp thứ {data.fastest.triesToAc}</small></div>
          </div>
        )}
        <div className="nb-cls-tabs">
          {[["ac", "Đã AC", data.ac.length], ["tried", "Đã thử, chưa AC", data.tried.length], ["none", "Chưa làm", data.none.length]].map(([k, l, n]) => (
            <button key={k} type="button" className={`${tab === k ? "on" : ""} ${k}`} onClick={() => setTab(k)}>{l} <i>{n}</i></button>))}
        </div>
        <div className="nb-cls-list">
          {list.length === 0 && <p className="nb-sub" style={{ padding: 14 }}>Không có học sinh nào trong nhóm này.</p>}
          {list.map((r, i) => (
            <div className="nb-cls-row" key={r.student.id}>
              <Avatar name={r.student.name} size={30} />
              <div className="nb-cls-name"><strong>{r.student.name}</strong><small>{r.student.username ? `@${r.student.username}` : ""}</small></div>
              {r.status === "ac" && <div className="nb-cls-detail">{tab === "ac" && i === 0 && <span className="nb-cls-first"><Trophy size={11} /> Đầu tiên</span>}<span>AC lần nộp thứ <b>{r.triesToAc}</b></span><small>{formatSubmissionDate(r.acAt)}</small></div>}
              {r.status === "tried" && <div className="nb-cls-detail"><span><b>{r.attempts}</b> lần nộp · cao nhất {r.best}đ</span><small>Gần nhất {formatSubmissionDate(r.lastAt)}</small></div>}
              {r.status === "none" && <div className="nb-cls-detail"><small>Chưa nộp lần nào</small></div>}
            </div>))}
        </div>
        <div className="nb-modal-actions" style={{ justifyContent: "space-between" }}>
          <button className="nb-btn nb-btn-ghost" onClick={exportCsv}><Save size={14} /> Xuất CSV</button>
          <button className="nb-btn nb-btn-ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function ProblemsView({ isTeacher, currentUser, problems, submissions, points, addProblem, updateProblem, removeProblem, solvedByCurrent, onVerdict, topics, students }) {
  const [languageFilter, setLanguageFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [pointMin, setPointMin] = useState("");
  const [pointMax, setPointMax] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);
  const fbList = useContext(FeedbackContext).list;
  const [reviewProblem, setReviewProblem] = useState(null);
  const [classProblem, setClassProblem] = useState(null);
  const [reviewFocusId, setReviewFocusId] = useState(null);
  const [sortBy, setSortBy] = useState("default");
  const [classFilter, setClassFilter] = useState("all");
  const classStats = useMemo(() => buildClassSolveStats(submissions, students || []), [submissions, students]);
  const pointBounds = useMemo(() => {
    const vals = problems.map((x) => Number(x.points) || 0);
    return { min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 0 };
  }, [problems]);
  const filtersActive = languageFilter !== "all" || progressFilter !== "all" || levelFilter !== "all" || pointMin !== "" || pointMax !== "" || classFilter !== "all" || query.trim() !== "";
  function clearAllFilters() { setLanguageFilter("all"); setProgressFilter("all"); setLevelFilter("all"); setPointMin(""); setPointMax(""); setClassFilter("all"); setQuery(""); setSortBy("default"); }
  useEffect(() => {
    // Học sinh bấm vào thông báo nhận xét ở Tổng quan -> mở sẵn bài đó
    if (pendingReviewTarget && problems.length > 0) {
      const t = pendingReviewTarget;
      const target = problems.find((x) => x.id === t.problemId);
      pendingReviewTarget = null;
      if (target) { setReviewFocusId(t.submissionId); setReviewProblem(target); }
    }
    if (!pendingProblemOpenId || problems.length === 0) return;
    const target = problems.find((x) => x.id === pendingProblemOpenId);
    pendingProblemOpenId = null;
    if (target) setActive(target);
  }, [problems]);
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
    const levelMatches = levelFilter === "all" || problem.difficulty === levelFilter;
    const pts = Number(problem.points) || 0;
    const minOk = pointMin === "" || Number.isNaN(Number(pointMin)) || pts >= Number(pointMin);
    const maxOk = pointMax === "" || Number.isNaN(Number(pointMax)) || pts <= Number(pointMax);
    const searchText = `${problem.id} ${problem.title} ${topic?.title || ""} ${topic?.code || ""} ${problem.difficulty || ""} ${pts} điểm`.toLocaleLowerCase("vi-VN");
    const cs = classStats.get(problem.id);
    const acN = cs?.ac.size || 0;
    const triedN = cs?.tried.size || 0;
    const classMatches = classFilter === "all"
      || (classFilter === "noac" && acN === 0)
      || (classFilter === "review" && triedN >= 3 && acN / triedN <= 0.34);
    return languageMatches && progressMatches && classMatches && levelMatches && minOk && maxOk && (!query.trim() || searchText.includes(query.trim().toLocaleLowerCase("vi-VN")));
  }).sort((a, b) => {
    if (sortBy === "default") return 0;
    if (sortBy === "pts-desc") return (Number(b.points) || 0) - (Number(a.points) || 0);
    if (sortBy === "pts-asc") return (Number(a.points) || 0) - (Number(b.points) || 0);
    if (sortBy === "diff-asc" || sortBy === "diff-desc") {
      const da = DIFFICULTIES.indexOf(a.difficulty), db = DIFFICULTIES.indexOf(b.difficulty);
      return sortBy === "diff-asc" ? da - db : db - da;
    }
    const ca = classStats.get(a.id)?.ac.size || 0;
    const cb = classStats.get(b.id)?.ac.size || 0;
    return sortBy === "most" ? cb - ca : ca - cb;
  }), [problems, languageFilter, progressFilter, query, topicById, currentSubmissions, solvedByCurrent, classStats, classFilter, sortBy, levelFilter, pointMin, pointMax]);

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
            {!isTeacher && fbList.some((f) => f.problemId === problem.id && !f.seenAt) && <span className="nb-fb-chip fresh"><MessageSquare size={11} /> Nhận xét mới</span>}
          </div>
          <div className="nb-practice-problem-meta">
            <span>{language.label}</span><i />
            <span>{problem.points} điểm</span><i />
            <span>{getProblemTestCases(problem).length} test</span>
            {isTeacher ? <><i /><span>{teacherStats.attempts} lượt nộp</span></> : <><i /><span>{studentStats.attempts ? `${studentStats.attempts} lượt nộp` : "Chưa có lượt nộp"}</span></>}
          </div>
          <ClassSolveBar st={classStats.get(problem.id)} total={(students || []).length} clickable={isTeacher} unit={isTeacher ? "em" : "bạn"} onOpen={() => setClassProblem(problem)} />
        </div>
        <div className="nb-practice-problem-score">
          <DifficultyTag level={problem.difficulty} />
          {!isTeacher && <strong>{studentStats.bestScore}/{problem.points}</strong>}
          {isTeacher && <span>Quản lý <ChevronRight size={16} /></span>}
        </div>
        {isTeacher && <div className="nb-practice-problem-actions"><button type="button" className="nb-practice-manage-action" onClick={(event) => { event.stopPropagation(); setReviewFocusId(null); setReviewProblem(problem); }}><Eye size={14} /> Bài nộp</button><button type="button" className="nb-practice-manage-action edit" onClick={(event) => { event.stopPropagation(); beginEdit(problem); }}><Pencil size={14} /> Sửa</button><button type="button" className="nb-practice-manage-action delete" onClick={(event) => { event.stopPropagation(); handleDelete(problem); }}><Trash2 size={14} /> Xóa</button></div>}
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
        {isTeacher && <div className="nb-practice-filter-stack"><span>Thống kê lớp</span><div className="nb-filter-row" style={{ margin: 0 }}>{[['all', 'Tất cả'], ['noac', 'Chưa ai AC'], ['review', 'Cần xem lại']].map(([key, label]) => <button key={key} className={`nb-chip ${classFilter === key ? "active" : ""}`} onClick={() => setClassFilter(key)}>{label}</button>)}</div></div>}
        <div className="nb-practice-filter-stack"><span>Mức độ</span><div className="nb-filter-row" style={{ margin: 0 }}>{[["all", "Tất cả", problems.length], ...DIFFICULTIES.map((d) => [d, d, problems.filter((x) => x.difficulty === d).length])].map(([key, label, n]) => <button key={key} className={`nb-chip ${levelFilter === key ? "active" : ""}`} onClick={() => setLevelFilter(key)}>{label} <small className="nb-chip-n">{n}</small></button>)}</div></div>
        <div className="nb-practice-filter-stack"><span>Điểm</span><div className="nb-practice-points"><input className="nb-input" type="number" inputMode="numeric" min="0" value={pointMin} onChange={(e) => setPointMin(e.target.value)} placeholder={`Từ ${pointBounds.min}`} aria-label="Điểm thấp nhất" /><i>–</i><input className="nb-input" type="number" inputMode="numeric" min="0" value={pointMax} onChange={(e) => setPointMax(e.target.value)} placeholder={`Đến ${pointBounds.max}`} aria-label="Điểm cao nhất" /></div></div>
        <div className="nb-practice-filter-stack"><span>Sắp xếp</span><select className="nb-input nb-practice-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sắp xếp bài"><option value="default">Mặc định</option><option value="diff-asc">Dễ → khó</option><option value="diff-desc">Khó → dễ</option><option value="pts-desc">Điểm cao → thấp</option><option value="pts-asc">Điểm thấp → cao</option><option value="most">Nhiều {isTeacher ? "em" : "bạn"} AC nhất</option><option value="least">Ít {isTeacher ? "em" : "bạn"} AC nhất</option></select></div>
        {!isTeacher && <div className="nb-practice-filter-stack"><span>Tiến độ</span><div className="nb-filter-row" style={{ margin: 0 }}>{[['all', 'Tất cả'], ['todo', 'Chưa mở'], ['in-progress', 'Đang luyện'], ['done', 'Đã xong']].map(([key, label]) => <button key={key} className={`nb-chip ${progressFilter === key ? "active" : ""}`} onClick={() => setProgressFilter(key)}>{label}</button>)}</div></div>}
        {filtersActive && <button type="button" className="nb-btn nb-btn-ghost nb-practice-clear" onClick={clearAllFilters}><X size={13} /> Xóa lọc</button>}
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

      {classProblem && isTeacher && (
        <ProblemClassModal problem={classProblem} students={students || []} submissions={submissions} onClose={() => setClassProblem(null)} />
      )}

      {reviewProblem && (
        <SubmissionReviewModal
          problem={reviewProblem}
          submissions={submissions.filter((s) => s.problemId === reviewProblem.id)}
          students={students}
          initialOpenId={reviewFocusId}
          onClose={() => { setReviewProblem(null); setReviewFocusId(null); }}
        />
      )}
    </div>
  );
}

/* ======================= NHẬN XÉT BÀI NỘP ======================= */
const FeedbackContext = React.createContext({ role: "none", teacherName: "", byId: new Map(), list: [], unseenCount: 0, markSeen: () => {}, refresh: () => {}, followList: [], followSubIds: new Set(), followBySub: new Map(), followCount: 0, badgeCount: 0, ackFollowUp: () => {}, noteFeedbackSaved: () => {}, noteFeedbackDeleted: () => {}, fbIndex: [] });
let pendingReviewTarget = null; // giáo viên bấm vào thông báo "nộp lại": { problemId, submissionId }
let pendingProblemOpenId = null; // mở sẵn bài khi học sinh bấm vào thông báo nhận xét ở Tổng quan

const FEEDBACK_TAGS = [
  { id: "algo", label: "Sai thuật toán", tone: "red" },
  { id: "edge", label: "Thiếu trường hợp biên", tone: "red" },
  { id: "syntax", label: "Lỗi cú pháp", tone: "red" },
  { id: "tle", label: "Chạy quá chậm (TLE)", tone: "amber" },
  { id: "fmt", label: "Sai định dạng output", tone: "amber" },
  { id: "input", label: "Đọc dữ liệu sai", tone: "amber" },
  { id: "style", label: "Chưa gọn, khó đọc", tone: "blue" },
  { id: "good", label: "Làm tốt", tone: "green" },
];
const FEEDBACK_PHRASES = [
  "Em kiểm tra lại điều kiện dừng của vòng lặp.",
  "Hãy thử với n nhỏ nhất và n lớn nhất trong đề.",
  "Cần in đúng định dạng đề bài yêu cầu.",
  "Em chạy thử từng bước với ví dụ mẫu để tìm chỗ sai.",
  "Bài làm tốt, em thêm chú thích để code dễ đọc hơn.",
];
const feedbackTagMeta = (id) => FEEDBACK_TAGS.find((t) => t.id === id) || { id, label: String(id), tone: "blue" };

/* So sánh hai đoạn code theo từng dòng (LCS) để tô màu chỗ giáo viên đã sửa */
function diffLines(aText, bText) {
  const a = String(aText || "").replace(/\s+$/, "").split("\n");
  const b = String(bText || "").replace(/\s+$/, "").split("\n");
  if (a.length * b.length > 400000) return [...a.map((text) => ({ t: "del", text })), ...b.map((text) => ({ t: "add", text }))];
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: "same", text: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", text: a[i] }); i += 1; }
    else { out.push({ t: "add", text: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ t: "del", text: a[i] }); i += 1; }
  while (j < m) { out.push({ t: "add", text: b[j] }); j += 1; }
  return out;
}

function FixedCodeDiff({ original, fixed, language }) {
  const [mode, setMode] = useState("diff");
  const lang = LANGUAGE_META[language] ? language : guessCodeLanguage(fixed || original);
  const ops = useMemo(() => diffLines(original, fixed), [original, fixed]);
  const changed = ops.filter((o) => o.t !== "same").length;
  let newNo = 0;
  return (
    <div className="nb-diff">
      <div className="nb-diff-bar">
        <span>{changed === 0 ? "Bản sửa giống bài nộp" : `${ops.filter((o) => o.t === "add").length} dòng thêm/sửa · ${ops.filter((o) => o.t === "del").length} dòng bỏ`}</span>
        <div className="nb-diff-toggle">
          <button type="button" className={mode === "diff" ? "on" : ""} onClick={() => setMode("diff")}>Chỗ khác nhau</button>
          <button type="button" className={mode === "fixed" ? "on" : ""} onClick={() => setMode("fixed")}>Bản sửa hoàn chỉnh</button>
        </div>
      </div>
      {mode === "fixed" ? <CodeView code={fixed} language={lang} /> : (
        <div className="nb-diff-body">
          {ops.map((o, i) => {
            if (o.t !== "del") newNo += 1;
            return (
              <div key={i} className={`nb-diff-row ${o.t}`}>
                <span className="nb-diff-no">{o.t === "del" ? "" : newNo}</span>
                <span className="nb-diff-mark">{o.t === "add" ? "+" : o.t === "del" ? "−" : ""}</span>
                <pre><code>{highlightCodeLine(o.text, lang)}{"\n"}</code></pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Code có số dòng; dòng bị giáo viên chú thích hiện ghi chú ngay bên dưới. Giáo viên bấm vào số dòng để thêm chú thích. */
function AnnotatedCode({ code, language, notes = [], onLineClick, activeLine }) {
  const lang = LANGUAGE_META[language] ? language : guessCodeLanguage(code);
  const lines = String(code || "").replace(/\s+$/, "").split("\n");
  const byLine = new Map();
  notes.forEach((n) => { const k = Number(n.line); if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(n); });
  return (
    <div className="nb-copywrap">
    <div className={`nb-ann ${onLineClick ? "clickable" : ""}`}>
      {lines.map((line, i) => {
        const no = i + 1;
        const ns = (byLine.get(no) || []).filter((n) => String(n.text || "").trim());
        return (
          <React.Fragment key={i}>
            <div className={`nb-ann-row ${byLine.has(no) ? "flagged" : ""} ${activeLine === no ? "active" : ""}`}>
              <button type="button" className="nb-ann-no" disabled={!onLineClick} tabIndex={onLineClick ? 0 : -1} onClick={() => onLineClick && onLineClick(no)} title={onLineClick ? "Bấm để chú thích dòng này" : undefined}>{no}</button>
              <pre className="nb-ann-code"><code>{highlightCodeLine(line, lang)}{"\n"}</code></pre>
            </div>
            {ns.map((n, k) => <div className="nb-ann-note" key={k}><AlertCircle size={14} /><span>{n.text}</span></div>)}
          </React.Fragment>
        );
      })}
    </div>
    {String(code || "").trim() && <CodeCopyButton code={code} />}
    </div>
  );
}

function FeedbackTagList({ tags }) {
  if (!tags || tags.length === 0) return null;
  return <div className="nb-fb-tags">{tags.map((id) => { const t = feedbackTagMeta(id); return <span key={id} className={`nb-fb-tag ${t.tone}`}>{t.label}</span>; })}</div>;
}

function useSubmissionCode(submission) {
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
  return { code, state };
}

/* Học sinh xem nhận xét của giáo viên cho một bài nộp */
function StudentFeedback({ fb, original, language, onRestore }) {
  const ctx = useContext(FeedbackContext);
  const [wasNew] = useState(!fb.seenAt);
  useEffect(() => { if (!fb.seenAt) ctx.markSeen([fb.submissionId]); }, [fb.submissionId, fb.seenAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nb-fbs">
      <div className="nb-fbs-head">
        <MessageSquare size={16} /><strong>Nhận xét của thầy cô</strong>
        {wasNew && <span className="nb-fb-new">Mới</span>}
        <small>{fb.author ? `${fb.author} · ` : ""}{timeAgoVi(fb.updatedAt)}</small>
      </div>
      <FeedbackTagList tags={fb.tags} />
      {fb.comment && <p className="nb-fbs-comment">{fb.comment}</p>}
      {fb.lineNotes.length > 0 && <p className="nb-fbs-hint"><AlertCircle size={13} /> Các dòng có ghi chú được đánh dấu ngay trong code phía trên.</p>}
      {fb.fixedCode && (
        <div className="nb-fbs-fix">
          <div className="nb-fbs-fix-head"><strong>Bản sửa gợi ý của thầy cô</strong>{onRestore && <button type="button" className="nb-btn nb-btn-ghost" onClick={() => onRestore(fb.fixedCode)}><Code2 size={14} /> Đưa bản sửa vào editor</button>}</div>
          <FixedCodeDiff original={original} fixed={fb.fixedCode} language={language} />
        </div>
      )}
    </div>
  );
}

function HistoryFeedback({ fb, submission, language, onRestore }) {
  const { code } = useSubmissionCode(submission);
  return <StudentFeedback fb={fb} original={code} language={language} onRestore={onRestore} />;
}

/* Giáo viên: xem code + viết nhận xét / chú thích dòng / bản sửa cho một bài nộp */
function FeedbackEditor({ submission, language, emptyMessage, onChanged }) {
  const ctx = useContext(FeedbackContext);
  const { code, state: codeState } = useSubmissionCode(submission);
  const [state, setState] = useState("loading"); // loading | ready | missing | error
  const [saved, setSaved] = useState(null);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState([]);
  const [useFix, setUseFix] = useState(false);
  const [fixed, setFixed] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [activeLine, setActiveLine] = useState(null);
  const lang = LANGUAGE_META[language] ? language : guessCodeLanguage(code);
  const follow = ctx.followBySub.get(submission.id) || null;
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevFb, setPrevFb] = useState(null);
  useEffect(() => { // giáo viên đã mở bài nộp lại -> bỏ khỏi danh sách "cần phản hồi"
    if (follow) ctx.ackFollowUp(follow.studentId, follow.problemId, follow.latest.id);
  }, [submission.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function togglePrev() {
    const next = !prevOpen;
    setPrevOpen(next);
    if (next && !prevFb && follow) dbFetchFeedbackFor(follow.feedbackSubmissionId).then((r) => setPrevFb(r.row || false)).catch(() => setPrevFb(false));
  }

  useEffect(() => {
    let cancelled = false;
    setState("loading"); setMsg(null);
    dbFetchFeedbackFor(submission.id).then((r) => {
      if (cancelled) return;
      if (r.missing) { setState("missing"); return; }
      const fb = r.row;
      setSaved(fb);
      setTags(fb?.tags || []); setComment(fb?.comment || ""); setNotes(fb?.lineNotes || []);
      setUseFix(!!fb?.fixedCode); setFixed(fb?.fixedCode || "");
      setState("ready");
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [submission.id]);

  function toggleTag(id) { setTags((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); }
  function addNoteAt(line) {
    setActiveLine(line);
    setNotes((cur) => (cur.some((n) => Number(n.line) === line) ? cur : [...cur, { line, text: "" }].sort((a, b) => a.line - b.line)));
  }
  function setNoteText(line, text) { setNotes((cur) => cur.map((n) => (Number(n.line) === line ? { ...n, text } : n))); }
  function removeNote(line) { setNotes((cur) => cur.filter((n) => Number(n.line) !== line)); }
  function toggleFix(on) { setUseFix(on); if (on && !fixed.trim()) setFixed(code); }

  const cleanNotes = notes.filter((n) => String(n.text || "").trim()).map((n) => ({ line: Number(n.line), text: String(n.text).trim() }));
  const fixedClean = useFix && fixed.trim() && fixed.trim() !== code.trim() ? fixed : "";
  const hasContent = !!(comment.trim() || tags.length || cleanNotes.length || fixedClean);

  async function save() {
    if (!hasContent) { setMsg({ kind: "warn", text: "Chưa có nội dung để lưu. Hãy viết nhận xét, chọn nhãn hoặc chú thích dòng." }); return; }
    setBusy(true); setMsg(null);
    try {
      const fb = await dbSaveFeedback({ submissionId: submission.id, studentId: submission.studentId, problemId: submission.problemId, comment: comment.trim(), tags, lineNotes: cleanNotes, fixedCode: fixedClean, author: ctx.teacherName });
      setSaved(fb); setNotes(fb.lineNotes.length ? fb.lineNotes : notes);
      ctx.noteFeedbackSaved(fb);
      setMsg({ kind: "ok", text: "Đã lưu. Học sinh sẽ thấy nhận xét này khi mở bài." });
      onChanged && onChanged(submission.id, true);
    } catch (e) { setMsg({ kind: "err", text: "Không lưu được, em thử lại sau." }); }
    setBusy(false);
  }
  async function remove() {
    if (!saved || !examConfirm("Xóa nhận xét của bài nộp này? Học sinh sẽ không còn thấy nữa.")) return;
    setBusy(true); setMsg(null);
    try {
      await dbDeleteFeedback(submission.id);
      ctx.noteFeedbackDeleted(submission.id);
      setSaved(null); setTags([]); setComment(""); setNotes([]); setUseFix(false); setFixed("");
      setMsg({ kind: "ok", text: "Đã xóa nhận xét." });
      onChanged && onChanged(submission.id, false);
    } catch (e) { setMsg({ kind: "err", text: "Không xóa được, thử lại sau." }); }
    setBusy(false);
  }

  const codeBlock = codeState === "loading" ? <p className="nb-sub" style={{ padding: "0 14px 14px" }}>Đang tải code…</p>
    : codeState === "error" ? <p className="nb-sub" style={{ padding: "0 14px 14px" }}>Không tải được code, thử lại sau.</p>
    : code ? <AnnotatedCode code={code} language={language} notes={notes} activeLine={activeLine} onLineClick={state === "ready" ? addNoteAt : undefined} />
    : <p className="nb-sub" style={{ padding: "0 14px 14px" }}>{emptyMessage}</p>;

  if (state === "missing") {
    return (
      <div className="nb-fbe">
        {codeBlock}
        <div className="nb-fbe-note warn"><AlertCircle size={15} /> Chưa bật tính năng nhận xét: cần chạy file <b>schema-feedback.sql</b> trong Supabase (chạy trên site test trước).</div>
      </div>
    );
  }

  return (
    <div className="nb-fbe">
      {follow && (
        <div className="nb-fbe-follow">
          <div className="nb-fbe-follow-head"><RefreshCw size={15} /><span>Học sinh đã <b>nộp lại</b> sau khi thầy nhận xét ({timeAgoVi(follow.feedbackAt)}). Hãy xem em đã sửa đúng chưa.</span><button type="button" className="nb-btn nb-btn-ghost" onClick={togglePrev}>{prevOpen ? "Ẩn nhận xét trước" : "Xem nhận xét lần trước"}</button></div>
          {prevOpen && (prevFb === null ? <p className="nb-sub">Đang tải…</p> : prevFb === false ? <p className="nb-sub">Không tải được nhận xét trước đó.</p> : (
            <div className="nb-fbe-prev"><FeedbackTagList tags={prevFb.tags} />{prevFb.comment && <p>{prevFb.comment}</p>}{prevFb.lineNotes.length > 0 && <ul>{prevFb.lineNotes.map((n) => <li key={n.line}><b>Dòng {n.line}:</b> {n.text}</li>)}</ul>}{prevFb.fixedCode && <small>Có kèm bản sửa gợi ý.</small>}</div>
          ))}
        </div>
      )}
      <div className="nb-fbe-code">
        {codeBlock}
        {state === "ready" && code && <p className="nb-fbe-tip"><MessageSquare size={13} /> Bấm vào <b>số dòng</b> để chú thích lỗi ngay tại dòng đó.</p>}
      </div>
      <div className="nb-fbe-panel">
        <div className="nb-fbe-head">
          <strong><MessageSquare size={15} /> Nhận xét của giáo viên</strong>
          {saved && <span className="nb-fbe-saved"><CheckCircle2 size={13} /> Đã lưu · {timeAgoVi(saved.updatedAt)}</span>}
        </div>
        {state === "loading" && <p className="nb-sub">Đang tải nhận xét…</p>}
        {state === "error" && <p className="nb-sub">Không tải được nhận xét, thử lại sau.</p>}
        {state === "ready" && (
          <>
            <div className="nb-fbe-label">Loại lỗi / đánh giá</div>
            <div className="nb-fb-tags pick">{FEEDBACK_TAGS.map((t) => <button type="button" key={t.id} className={`nb-fb-tag ${t.tone} ${tags.includes(t.id) ? "on" : ""}`} onClick={() => toggleTag(t.id)}>{tags.includes(t.id) && <CheckCircle2 size={12} />}{t.label}</button>)}</div>

            <div className="nb-fbe-label">Nhận xét</div>
            <textarea className="nb-input nb-fbe-text" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Chỉ ra lỗi sai và gợi ý hướng sửa cho em…" />
            <div className="nb-fbe-phrases">{FEEDBACK_PHRASES.map((ph) => <button type="button" key={ph} onClick={() => setComment((c) => (c.trim() ? `${c.trim()} ${ph}` : ph))}>+ {ph}</button>)}</div>

            <div className="nb-fbe-label">Chú thích theo dòng {notes.length > 0 && <span>({notes.length})</span>}</div>
            {notes.length === 0 ? <p className="nb-fbe-empty">Chưa có chú thích. Bấm vào số dòng trong code để thêm.</p> : (
              <div className="nb-fbe-notes">
                {notes.map((n) => (
                  <div key={n.line} className={`nb-fbe-note-row ${activeLine === Number(n.line) ? "active" : ""}`}>
                    <span className="nb-fbe-line">Dòng {n.line}</span>
                    <input className="nb-input" autoFocus={activeLine === Number(n.line) && !n.text} value={n.text} onChange={(e) => setNoteText(Number(n.line), e.target.value)} onFocus={() => setActiveLine(Number(n.line))} placeholder="Dòng này sai ở đâu?" />
                    <button type="button" className="nb-icon-btn" onClick={() => removeNote(Number(n.line))} aria-label="Xóa chú thích"><X size={14} /></button>
                  </div>))}
              </div>
            )}

            <label className="nb-fbe-check"><input type="checkbox" checked={useFix} onChange={(e) => toggleFix(e.target.checked)} /> Đưa kèm <b>bản sửa gợi ý</b> (sửa trực tiếp code của em)</label>
            {useFix && (
              <div className="nb-fbe-fix">
                <CodeEditor code={fixed} onChange={setFixed} language={lang} onSubmit={() => {}} />
                {fixedClean ? <FixedCodeDiff original={code} fixed={fixed} language={lang} /> : <p className="nb-fbe-empty">Sửa code ở khung trên, chỗ khác biệt sẽ hiện ở đây.</p>}
              </div>
            )}

            {msg && <div className={`nb-fbe-note ${msg.kind}`}>{msg.kind === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}</div>}
            <div className="nb-fbe-actions">
              {saved && <button type="button" className="nb-btn nb-btn-ghost" disabled={busy} onClick={remove}><Trash2 size={14} /> Xóa nhận xét</button>}
              <button type="button" className="nb-btn nb-btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="nb-spin" /> : <Save size={14} />} {saved ? "Cập nhật nhận xét" : "Lưu nhận xét"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Tổng quan giáo viên: học sinh đã sửa và nộp lại sau khi được nhận xét */
function FollowUpInbox({ students, onOpen }) {
  const ctx = useContext(FeedbackContext);
  if (ctx.role !== "teacher" || ctx.followList.length === 0) return null;
  const nameOf = (id) => students.find((st) => st.id === id)?.name || id;
  const rows = ctx.followList.slice(0, 5);
  return (
    <section className="nb-fui" aria-label="Học sinh nộp lại sau nhận xét">
      <span className="nb-fui-icon"><RefreshCw size={21} /></span>
      <div className="nb-fui-main">
        <small>Cần phản hồi</small>
        <strong>{ctx.followList.length} học sinh đã sửa và nộp lại sau khi thầy nhận xét</strong>
        <ul>
          {rows.map((f) => (
            <li key={f.key}>
              <Avatar name={nameOf(f.studentId)} size={30} />
              <div className="nb-fui-who"><b>{nameOf(f.studentId)}</b><span>{f.latest.problemTitle || f.problemId}</span></div>
              <span className="nb-fui-meta"><VerdictPill verdict={f.latest.verdict} /><em>{f.latest.score ?? 0}đ</em>{f.count > 1 && <i>nộp lại {f.count} lần</i>}<small>{timeAgoVi(f.latest.createdAt)}</small></span>
              <button type="button" className="nb-btn nb-btn-primary" onClick={() => onOpen(f)}>Xem &amp; nhận xét</button>
              <button type="button" className="nb-icon-btn" title="Đánh dấu đã xem" aria-label="Đánh dấu đã xem" onClick={() => ctx.ackFollowUp(f.studentId, f.problemId, f.latest.id)}><CheckCircle2 size={16} /></button>
            </li>))}
          {ctx.followList.length > rows.length && <li className="more">và {ctx.followList.length - rows.length} học sinh khác</li>}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Theo dõi sửa bài sau nhận xét (giáo viên) ---------- */
const FT_STALE_DAYS = 3;
const FT_STATUS = {
  pending: { label: "Chưa sửa", cls: "pending" },
  retrying: { label: "Đang sửa", cls: "retrying" },
  fixed: { label: "Đã sửa đúng", cls: "fixed" },
  ok: { label: "Bài đã đúng", cls: "ok" },
};
function fmtDurationVi(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "< 1 phút";
  if (m < 60) return `${m} phút`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} giờ`;
  return `${Math.round(h / 24)} ngày`;
}
/* Gom nhận xét theo (học sinh, bài) rồi đối chiếu với các lần nộp sau đó */
function computeFeedbackTracking(fbIndex, submissions, nowMs = Date.now()) {
  const groups = new Map();
  (fbIndex || []).forEach((f) => {
    const k = `${f.studentId}:${f.problemId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });
  if (groups.size === 0) return [];
  const subsByKey = new Map();
  submissions.forEach((x) => {
    const k = `${x.studentId}:${x.problemId}`;
    if (!groups.has(k)) return;
    if (!subsByKey.has(k)) subsByKey.set(k, []);
    subsByKey.get(k).push(x);
  });
  const ts = (v) => new Date(v || 0).getTime();
  const out = [];
  groups.forEach((fbs, k) => {
    const subs = (subsByKey.get(k) || []).sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    const t0 = Math.min(...fbs.map((f) => ts(f.createdAt || f.updatedAt)));
    const tn = Math.max(...fbs.map((f) => ts(f.updatedAt)));
    const first = fbs[0];
    const baseSub = subs.find((x) => fbs.some((f) => f.submissionId === x.id));
    const after = subs.filter((x) => ts(x.createdAt) > t0);
    const fixIdx = after.findIndex((x) => x.verdict === "AC");
    const last = subs[subs.length - 1] || null;
    let status; let fixMs = null; let tries = after.length;
    if (baseSub && baseSub.verdict === "AC" && after.length === 0) status = "ok";
    else if (fixIdx >= 0) { status = "fixed"; tries = fixIdx + 1; fixMs = ts(after[fixIdx].createdAt) - t0; }
    else if (after.length > 0) status = "retrying";
    else status = "pending";
    const ageMs = nowMs - t0;
    out.push({
      key: k, studentId: first.studentId, problemId: first.problemId,
      problemTitle: baseSub?.problemTitle || subs.find((x) => x.problemTitle)?.problemTitle || first.problemId,
      status, t0, tn, count: fbs.length, tries, fixMs, ageMs,
      stale: status === "pending" && ageMs >= FT_STALE_DAYS * 86400000,
      waitingTeacher: status === "retrying" && last && ts(last.createdAt) > tn,
      baseVerdict: baseSub?.verdict || null, lastSub: last, lastAt: last ? ts(last.createdAt) : 0,
      fixedAt: fixIdx >= 0 ? ts(after[fixIdx].createdAt) : null,
    });
  });
  return out;
}
const FT_PRIORITY = (r) => (r.stale ? 0 : r.waitingTeacher ? 1 : r.status === "pending" ? 2 : r.status === "retrying" ? 3 : r.status === "fixed" ? 4 : 5);

function FeedbackTimelineModal({ row, studentName, submissions, onClose, onOpenReview }) {
  const [fbs, setFbs] = useState(null);
  useEffect(() => {
    let alive = true;
    dbFetchFeedbackGroup(row.studentId, row.problemId).then((r) => { if (alive) setFbs(r); }).catch(() => { if (alive) setFbs([]); });
    return () => { alive = false; };
  }, [row.studentId, row.problemId]);
  const events = useMemo(() => {
    const ev = [];
    submissions.filter((x) => x.studentId === row.studentId && x.problemId === row.problemId)
      .forEach((x) => ev.push({ t: new Date(x.createdAt || 0).getTime(), type: "sub", sub: x }));
    (fbs || []).forEach((f) => ev.push({ t: new Date(f.updatedAt || f.createdAt || 0).getTime(), type: "fb", fb: f }));
    return ev.sort((a, b) => a.t - b.t || (a.type === "sub" ? -1 : 1));
  }, [fbs, submissions, row.studentId, row.problemId]);
  const lastSubId = [...events].reverse().find((e) => e.type === "sub")?.sub.id;
  return (
    <div className="nb-modal-overlay" onClick={onClose}>
      <div className="nb-modal nb-ft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div>
            <h3 className="nb-h3">Quá trình sửa bài</h3>
            <p className="nb-sub" style={{ margin: "4px 0 0" }}>{studentName} · {row.problemTitle}</p>
          </div>
          <button className="nb-icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="nb-ft-modal-body">
          <div className="nb-ft-modal-sum">
            <span className={`nb-ft-chip ${FT_STATUS[row.status].cls}`}>{FT_STATUS[row.status].label}</span>
            {row.status === "fixed" && <span>Sửa đúng sau <b>{row.tries}</b> lần nộp lại · mất <b>{fmtDurationVi(row.fixMs)}</b></span>}
            {row.status === "retrying" && <span>Đã nộp lại <b>{row.tries}</b> lần, chưa đạt AC{row.waitingTeacher ? " · đang chờ thầy xem" : ""}</span>}
            {row.status === "pending" && <span>Nhận xét {timeAgoVi(row.t0)} · chưa nộp lại</span>}
          </div>
          {fbs === null ? <p className="nb-sub">Đang tải…</p> : (
            <ol className="nb-ft-timeline">
              {events.map((e, i) => e.type === "sub" ? (
                <li key={`s${e.sub.id}`} className="sub">
                  <span className="nb-ft-dot" />
                  <div>
                    <div className="nb-ft-line"><strong>Nộp bài</strong><VerdictPill verdict={e.sub.verdict} /><em>{e.sub.score ?? 0}đ</em>{e.sub.id === lastSubId && <i className="nb-ft-last">Mới nhất</i>}</div>
                    <small>{formatSubmissionDate(e.sub.createdAt)} · {timeAgoVi(e.sub.createdAt)}</small>
                  </div>
                </li>
              ) : (
                <li key={`f${e.fb.submissionId}${i}`} className="fb">
                  <span className="nb-ft-dot" />
                  <div>
                    <div className="nb-ft-line"><strong>Thầy nhận xét</strong>{e.fb.seenAt ? <i className="nb-ft-seen">Em đã xem</i> : <i className="nb-ft-unseen">Em chưa xem</i>}</div>
                    {e.fb.comment && <p className="nb-ft-quote">{e.fb.comment}</p>}
                    {e.fb.tags.length > 0 && <FeedbackTagList tags={e.fb.tags} />}
                    {(e.fb.lineNotes.length > 0 || e.fb.fixedCode) && <small>{e.fb.lineNotes.length > 0 ? `${e.fb.lineNotes.length} ghi chú theo dòng` : ""}{e.fb.lineNotes.length > 0 && e.fb.fixedCode ? " · " : ""}{e.fb.fixedCode ? "có bản sửa gợi ý" : ""}</small>}
                    <small>{formatSubmissionDate(e.fb.updatedAt)}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="nb-ft-modal-foot">
          <button type="button" className="nb-btn" onClick={onClose}>Đóng</button>
          <button type="button" className="nb-btn nb-btn-primary" onClick={onOpenReview}>Mở bài nộp mới nhất</button>
        </div>
      </div>
    </div>
  );
}

function FeedbackTracker({ students, submissions, onNavigate }) {
  const ctx = useContext(FeedbackContext);
  const [tab, setTab] = useState("items");
  const [statusF, setStatusF] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [studentF, setStudentF] = useState("");
  const isTeacher = ctx.role === "teacher";
  const fbIndex = ctx.fbIndex || [];
  const nameOf = useCallback((id) => students.find((st) => st.id === id)?.name || id, [students]);
  const rows = useMemo(() => (isTeacher ? computeFeedbackTracking(fbIndex, submissions) : []), [isTeacher, fbIndex, submissions]);
  const kpi = useMemo(() => {
    const c = { total: rows.length, pending: 0, retrying: 0, fixed: 0, ok: 0, stale: 0, waiting: 0, fixSum: 0, fixN: 0, triesSum: 0 };
    rows.forEach((r) => {
      c[r.status] += 1;
      if (r.stale) c.stale += 1;
      if (r.waitingTeacher) c.waiting += 1;
      if (r.status === "fixed") { c.fixSum += r.fixMs; c.fixN += 1; c.triesSum += r.tries; }
    });
    const needFix = c.total - c.ok;
    c.rate = needFix > 0 ? Math.round((c.fixed / needFix) * 100) : 0;
    c.avgFix = c.fixN ? c.fixSum / c.fixN : null;
    c.avgTries = c.fixN ? c.triesSum / c.fixN : null;
    return c;
  }, [rows]);
  const perStudent = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      if (!m.has(r.studentId)) m.set(r.studentId, { id: r.studentId, total: 0, pending: 0, retrying: 0, fixed: 0, ok: 0, stale: 0, fixSum: 0, fixN: 0, triesSum: 0, last: 0 });
      const a = m.get(r.studentId);
      a.total += 1; a[r.status] += 1; if (r.stale) a.stale += 1;
      if (r.status === "fixed") { a.fixSum += r.fixMs; a.fixN += 1; a.triesSum += r.tries; }
      a.last = Math.max(a.last, r.t0);
    });
    return [...m.values()].map((a) => {
      const need = a.total - a.ok;
      return { ...a, rate: need > 0 ? Math.round((a.fixed / need) * 100) : null, avgFix: a.fixN ? a.fixSum / a.fixN : null, avgTries: a.fixN ? a.triesSum / a.fixN : null };
    }).sort((x, y) => (y.stale - x.stale) || (y.pending - x.pending) || (y.retrying - x.retrying) || (x.rate ?? 101) - (y.rate ?? 101));
  }, [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => statusF === "all" || (statusF === "stale" ? r.stale : r.status === statusF))
      .filter((r) => !studentF || r.studentId === studentF)
      .filter((r) => !q || nameOf(r.studentId).toLowerCase().includes(q) || String(r.problemTitle).toLowerCase().includes(q))
      .sort((a, b) => FT_PRIORITY(a) - FT_PRIORITY(b) || b.t0 - a.t0);
  }, [rows, statusF, studentF, query, nameOf]);
  if (!isTeacher || fbIndex.length === 0) return null;

  const exportCsv = () => {
    const stLabel = (r) => (r.stale ? "Chưa sửa (quá hạn)" : r.waitingTeacher ? "Đã nộp lại (chờ thầy)" : FT_STATUS[r.status].label);
    const data = [["Học sinh", "Bài", "Trạng thái", "Số nhận xét", "Nhận xét lúc", "Số lần nộp lại", "Thời gian sửa (phút)", "Nộp gần nhất"]];
    [...rows].sort((a, b) => FT_PRIORITY(a) - FT_PRIORITY(b)).forEach((r) => data.push([
      nameOf(r.studentId), r.problemTitle, stLabel(r), r.count, new Date(r.t0).toLocaleString("vi-VN"), r.tries,
      r.fixMs != null ? Math.round(r.fixMs / 60000) : "", r.lastAt ? new Date(r.lastAt).toLocaleString("vi-VN") : "",
    ]));
    downloadCsv(`theo-doi-sua-bai-${new Date().toISOString().slice(0, 10)}.csv`, data);
  };
  const pct = (n) => (kpi.total ? (n / kpi.total) * 100 : 0);
  const chips = [["all", `Tất cả ${kpi.total}`], ["stale", `Quá ${FT_STALE_DAYS} ngày ${kpi.stale}`], ["pending", `Chưa sửa ${kpi.pending}`], ["retrying", `Đang sửa ${kpi.retrying}`], ["fixed", `Đã sửa đúng ${kpi.fixed}`], ["ok", `Bài đã đúng ${kpi.ok}`]];
  const openReview = (r) => { pendingReviewTarget = { problemId: r.problemId, submissionId: r.lastSub?.id }; setOpen(null); onNavigate?.("problems"); };

  return (
    <section className={`nb-ft ${open ? "has-modal" : ""}`} aria-label="Theo dõi sửa bài sau nhận xét">
      <header className="nb-ft-head">
        <div><span className="nb-ov-eyebrow">Giám sát nhận xét</span><h2>Theo dõi sửa bài sau nhận xét</h2></div>
        <button type="button" className="nb-btn" onClick={exportCsv}><UploadCloud size={15} style={{ transform: "rotate(180deg)" }} /> Xuất CSV</button>
      </header>
      <div className="nb-ft-kpis">
        <div className="nb-ft-kpi"><small>Bài đã nhận xét</small><strong>{kpi.total}</strong><span>{perStudent.length} học sinh</span></div>
        <div className="nb-ft-kpi good"><small>Tỷ lệ sửa đúng</small><strong>{kpi.rate}%</strong><span>{kpi.fixed} bài đã AC sau nhận xét</span></div>
        <div className={`nb-ft-kpi ${kpi.stale ? "bad" : ""}`}><small>Chưa sửa quá {FT_STALE_DAYS} ngày</small><strong>{kpi.stale}</strong><span>{kpi.pending} bài chưa nộp lại</span></div>
        <div className={`nb-ft-kpi ${kpi.waiting ? "warn" : ""}`}><small>Chờ thầy xem lại</small><strong>{kpi.waiting}</strong><span>{kpi.retrying} bài đang sửa</span></div>
        <div className="nb-ft-kpi"><small>Thời gian sửa trung bình</small><strong>{kpi.avgFix != null ? fmtDurationVi(kpi.avgFix) : "—"}</strong><span>{kpi.avgTries != null ? `~${kpi.avgTries.toFixed(1)} lần nộp lại` : "chưa có dữ liệu"}</span></div>
      </div>
      <div className="nb-ft-bar" role="img" aria-label="Tỷ lệ trạng thái sửa bài">
        <i className="fixed" style={{ width: `${pct(kpi.fixed)}%` }} /><i className="ok" style={{ width: `${pct(kpi.ok)}%` }} /><i className="retrying" style={{ width: `${pct(kpi.retrying)}%` }} /><i className="pending" style={{ width: `${pct(kpi.pending)}%` }} />
      </div>
      <div className="nb-ft-legend"><span className="fixed">Đã sửa đúng</span><span className="ok">Bài đã đúng</span><span className="retrying">Đang sửa</span><span className="pending">Chưa sửa</span></div>

      <div className="nb-ft-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "items"} className={tab === "items" ? "on" : ""} onClick={() => setTab("items")}>Theo bài đã nhận xét</button>
        <button type="button" role="tab" aria-selected={tab === "students"} className={tab === "students" ? "on" : ""} onClick={() => setTab("students")}>Theo học sinh</button>
      </div>

      {tab === "items" ? (
        <>
          <div className="nb-ft-tools">
            <div className="nb-ft-chips">{chips.map(([k, l]) => <button key={k} type="button" className={`nb-chip ${statusF === k ? "active" : ""}`} onClick={() => setStatusF(k)}>{l}</button>)}</div>
            <label className="nb-ft-search"><Search size={14} /><input placeholder="Tìm học sinh hoặc bài…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          </div>
          {studentF && <div className="nb-ft-filtered">Đang lọc theo <b>{nameOf(studentF)}</b> <button type="button" className="nb-link-button" onClick={() => setStudentF("")}>Bỏ lọc</button></div>}
          {shown.length === 0 ? <p className="nb-sub" style={{ padding: "10px 4px" }}>Không có bài nào khớp bộ lọc.</p> : (
            <ul className="nb-ft-list">
              {shown.slice(0, 40).map((r) => (
                <li key={r.key} className={r.stale ? "stale" : ""}>
                  <Avatar name={nameOf(r.studentId)} size={30} />
                  <div className="nb-ft-who"><b>{nameOf(r.studentId)}</b><span>{r.problemTitle}</span></div>
                  <div className="nb-ft-state">
                    <span className={`nb-ft-chip ${r.stale ? "stale" : FT_STATUS[r.status].cls}`}>{r.stale ? "Quá hạn" : FT_STATUS[r.status].label}</span>
                    <small>
                      {r.status === "fixed" && `${r.tries} lần nộp lại · ${fmtDurationVi(r.fixMs)}`}
                      {r.status === "retrying" && `${r.tries} lần nộp lại${r.waitingTeacher ? " · chờ thầy" : ""}`}
                      {r.status === "pending" && `nhận xét ${timeAgoVi(r.t0)}`}
                      {r.status === "ok" && "đã đúng từ lần nhận xét"}
                    </small>
                  </div>
                  <button type="button" className="nb-btn" onClick={() => setOpen(r)}>Xem quá trình</button>
                </li>))}
              {shown.length > 40 && <li className="more">và {shown.length - 40} bài khác, hãy lọc hoặc xuất CSV</li>}
            </ul>
          )}
        </>
      ) : (
        <div className="nb-ft-table-wrap">
          <table className="nb-ft-table">
            <thead><tr><th>Học sinh</th><th>Nhận xét</th><th>Chưa sửa</th><th>Đang sửa</th><th>Đã sửa</th><th>Tỷ lệ sửa</th><th>TB lần nộp lại</th><th>TB thời gian sửa</th></tr></thead>
            <tbody>
              {perStudent.map((a) => (
                <tr key={a.id} onClick={() => { setStudentF(a.id); setStatusF("all"); setTab("items"); }} title="Bấm để xem các bài của em">
                  <td><span className="nb-ft-cell-who"><Avatar name={nameOf(a.id)} size={26} /><b>{nameOf(a.id)}</b></span></td>
                  <td>{a.total}</td>
                  <td className={a.stale ? "bad" : ""}>{a.pending}{a.stale > 0 && <i title="Quá hạn">!</i>}</td>
                  <td>{a.retrying}</td>
                  <td>{a.fixed}</td>
                  <td>{a.rate != null ? <span className="nb-ft-rate"><i style={{ width: `${a.rate}%` }} />{a.rate}%</span> : "—"}</td>
                  <td>{a.avgTries != null ? a.avgTries.toFixed(1) : "—"}</td>
                  <td>{a.avgFix != null ? fmtDurationVi(a.avgFix) : "—"}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {open && <FeedbackTimelineModal row={open} studentName={nameOf(open.studentId)} submissions={submissions} onClose={() => setOpen(null)} onOpenReview={() => openReview(open)} />}
    </section>
  );
}

/* Tổng quan học sinh: thông báo thầy cô vừa nhận xét bài nộp */
function FeedbackInbox({ submissions, onOpen }) {
  const ctx = useContext(FeedbackContext);
  if (!ctx.list.length) return null;
  const titleOf = (fb) => submissions.find((s) => s.id === fb.submissionId)?.problemTitle || fb.problemId;
  const items = [...ctx.list].sort((a, b) => (Number(!a.seenAt) === Number(!b.seenAt) ? new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) : (a.seenAt ? 1 : -1))).slice(0, 3);
  const unseen = ctx.unseenCount;
  return (
    <section className={`nb-fbi ${unseen > 0 ? "fresh" : ""}`} aria-label="Nhận xét từ thầy cô">
      <span className="nb-fbi-icon"><MessageSquare size={22} /></span>
      <div className="nb-fbi-main">
        <small>Nhận xét từ thầy cô</small>
        <strong>{unseen > 0 ? `Thầy cô vừa nhận xét ${unseen} bài nộp của em` : "Nhận xét gần đây từ thầy cô"}</strong>
        <ul>
          {items.map((fb) => (
            <li key={fb.submissionId}>
              <button type="button" onClick={() => onOpen(fb)}>
                <span className="nb-fbi-title">{titleOf(fb)}</span>
                <span className="nb-fbi-text">{fb.comment ? fb.comment.slice(0, 70) + (fb.comment.length > 70 ? "…" : "") : fb.fixedCode ? "Có bản sửa gợi ý" : fb.tags.length ? fb.tags.map((t) => feedbackTagMeta(t).label).join(" · ") : "Có ghi chú theo dòng"}</span>
                <span className="nb-fbi-time">{!fb.seenAt && <i className="nb-fb-new">Mới</i>}{timeAgoVi(fb.updatedAt)}</span>
                <ChevronRight size={15} />
              </button>
            </li>))}
        </ul>
      </div>
    </section>
  );
}

function LazySourceCode({ submission, emptyMessage, language, notes }) {
  const { code, state } = useSubmissionCode(submission);
  if (state === "loading") return <p className="nb-sub" style={{ padding: "0 14px 14px" }}>Đang tải code…</p>;
  if (state === "error") return <p className="nb-sub" style={{ padding: "0 14px 14px" }}>Không tải được code, thử lại sau.</p>;
  if (!code) return <p className="nb-sub" style={{ padding: "0 14px 14px" }}>{emptyMessage}</p>;
  return notes && notes.length ? <AnnotatedCode code={code} language={language} notes={notes} /> : <CodeView code={code} language={language} />;
}

function SubmissionReviewModal({ problem, submissions, students, onClose, initialOpenId }) {
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [openId, setOpenId] = useState(initialOpenId || null);
  const followCtx = useContext(FeedbackContext);
  useEffect(() => {
    if (!initialOpenId) return;
    const t = setTimeout(() => document.querySelector(`[data-sub="${initialOpenId}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => clearTimeout(t);
  }, [initialOpenId]);
  const [fbIds, setFbIds] = useState(() => new Set());
  useEffect(() => {
    let cancelled = false;
    dbFetchFeedbackIds({ problemId: problem.id }).then((ids) => { if (!cancelled && ids) setFbIds(ids); }).catch(() => {});
    return () => { cancelled = true; };
  }, [problem.id]);
  const markFeedback = useCallback((id, has) => setFbIds((cur) => { const n = new Set(cur); if (has) n.add(id); else n.delete(id); return n; }), []);

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
              <div className="nb-review-item" key={submission.id} data-sub={submission.id}>
                <button type="button" className="nb-review-item-head" onClick={() => setOpenId(isOpen ? null : submission.id)}>
                  <Avatar name={student?.name || submission.studentId} size={30} />
                  <div className="nb-review-item-info">
                    <strong>{student?.name || submission.studentId}</strong>
                    <small>{student?.username ? `@${student.username} · ` : ""}{formatSubmissionDate(submission.createdAt)}</small>
                  </div>
                  {followCtx.followSubIds.has(submission.id) && <span className="nb-fb-chip fresh" title="Học sinh nộp lại sau khi được nhận xét"><RefreshCw size={11} /> Nộp lại sau nhận xét</span>}
                  {fbIds.has(submission.id) && <span className="nb-fb-chip" title="Đã có nhận xét"><MessageSquare size={11} /> Đã nhận xét</span>}
                  <VerdictPill verdict={submission.verdict} />
                  <span className="nb-review-item-score">{submission.score ?? 0}đ</span>
                  <ChevronRight size={16} className={`nb-review-item-chevron ${isOpen ? "open" : ""}`} />
                </button>
                {isOpen && (
                  <div className="nb-history-code-wrap">
                    <FeedbackEditor submission={submission} emptyMessage="Lượt nộp này không có lưu source code (nộp trước khi tính năng lưu code được bật)." onChanged={markFeedback} />
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
  return code ? <CodeView code={code} language={submission.language} /> : <p className="nb-sub" style={{ padding: 14 }}>Lượt nộp này không có mã nguồn được lưu.</p>;
}

function SolutionPanel({ solution, teacherNote }) {
  if (!solution) return null;
  const meta = LANGUAGE_META[solution.language] || LANGUAGE_META.cpp;
  return (
    <section className="nb-xm-solution">
      <div className="nb-xm-solution-head"><strong><Award size={15} /> Code mẫu của thầy cô</strong><span>{meta.label}</span></div>
      {teacherNote && <p className="nb-xm-solution-teacher">{teacherNote}</p>}
      {solution.note && <p className="nb-xm-solution-note">{solution.note}</p>}
      <CodeView code={solution.code} language={solution.language} />
    </section>
  );
}

function ExamSubmissionViewer({ title, subtitle, problems, submissions, initialProblemId, onClose, solutions, solutionNote }) {
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
        {problem && solutions?.[problem.id] && <SolutionPanel solution={solutions[problem.id]} teacherNote={solutionNote} />}
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
function ExamProblemEditor({ initial, initialSolution, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    solLang: initialSolution?.language || "python", solCode: initialSolution?.code || "", solNote: initialSolution?.note || "",
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
      }), form.solCode.trim() ? { language: form.solLang, code: form.solCode.replace(/\s+$/, ""), note: form.solNote.trim() } : null);
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
        <div className="nb-form-section-label">Code mẫu của giáo viên (không bắt buộc)</div>
        <p className="nb-sub" style={{ margin: "-4px 0 8px" }}>Học sinh chỉ xem được code mẫu sau khi tất cả học sinh được giao đã nộp bài (hoặc khi thầy cô công bố ngay trong trang kết quả).</p>
        <div className="nb-xm-row two">
          <label><span className="nb-field-label">Ngôn ngữ code mẫu</span>
            <select className="nb-input" value={form.solLang} onChange={(e) => setForm({ ...form, solLang: e.target.value })}>{LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label><span className="nb-field-label">Ghi chú / hướng giải (nếu có)</span>
            <input className="nb-input" placeholder="Ví dụ: Duyệt một lần, độ phức tạp O(n)" value={form.solNote} onChange={(e) => setForm({ ...form, solNote: e.target.value })} /></label>
        </div>
        <textarea className="nb-input nb-mono nb-xm-solution-input" rows={8} placeholder="Dán code mẫu vào đây" spellCheck={false} value={form.solCode} onChange={(e) => setForm({ ...form, solCode: e.target.value })} />
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
  const [solutions, setSolutions] = useState({ mode: "auto", count: 0, items: {} });
  const [editor, setEditor] = useState(null);
  const [picker, setPicker] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    Promise.all([dbExamGetProblems(exam.id), dbExamGetSolutions(exam.id)])
      .then(([list, sol]) => { if (!cancelled) { setProblems(list); if (sol) setSolutions({ mode: sol.mode || "auto", count: sol.count || 0, items: sol.items || {} }); setLoading(false); } })
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
  function saveProblem(problem, solution) {
    setSolutions((cur) => {
      const items = { ...cur.items };
      if (solution) items[problem.id] = solution; else delete items[problem.id];
      return { ...cur, items };
    });
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
      const hasSolutions = Object.values(solutions.items).some((it) => String(it?.code || "").trim());
      const saved = await dbExamSave(payload, problems, isNew, currentUser?.id, solutions);
      onSaved((isNew ? "Đã tạo đề thi." : "Đã lưu thay đổi.") + (hasSolutions && !saved ? " Lưu ý: chưa lưu được code mẫu vì chưa chạy file schema-exams-v3.sql trên Supabase." : ""));
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
      {editor && <ExamProblemEditor initial={editor.problem} initialSolution={editor.problem ? solutions.items[editor.problem.id] : null} onSave={saveProblem} onClose={() => setEditor(null)} />}
      {picker && <PracticePickerModal practiceProblems={practiceProblems} onPick={importProblems} onClose={() => setPicker(false)} />}
    </div>
  );
}

/* ---------- Phòng thi (học sinh làm bài / giáo viên xem trước) ---------- */
function ExamRunner({ exam, currentUser, isTeacher, onExit, students = [] }) {
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
  const [solInfo, setSolInfo] = useState(null);       // { mode, count } — chưa có nội dung code
  const [solItems, setSolItems] = useState(null);     // nội dung code mẫu, chỉ tải khi đã được mở
  const [solChecking, setSolChecking] = useState(false);
  const [solUnlocked, setSolUnlocked] = useState(false);
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

  // Code mẫu: chỉ kiểm tra khi học sinh đã xong bài; tải nội dung code sau khi được mở
  const reviewActive = !isTeacher && !canWork && !!problems && !!attempt;
  const checkSolutions = useCallback(async () => {
    setSolChecking(true);
    try {
      const info = await dbExamSolutionInfo(exam.id);
      setSolInfo(info);
      if (!info) { setSolUnlocked(false); setSolChecking(false); return; }
      let open = info.mode === "open";
      if (info.mode === "auto") {
        const all = await dbExamFetchAttempts({ examId: exam.id });
        open = solutionsUnlocked(exam, "auto", all, students, Date.now() + offsetRef.current);
      }
      setSolUnlocked(open);
      if (open) { const full = await dbExamGetSolutions(exam.id); setSolItems(full?.items || {}); }
    } catch (e) { /* giữ trạng thái cũ, lần kiểm tra sau sẽ thử lại */ }
    setSolChecking(false);
  }, [exam, students]);
  useEffect(() => {
    if (!reviewActive || solUnlocked) return undefined;
    checkSolutions();
    const t = setInterval(() => { if (!document.hidden) checkSolutions(); }, 60000);
    return () => clearInterval(t);
  }, [reviewActive, solUnlocked, checkSolutions]);

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
      {reviewMode && solInfo && (
        <div className={`nb-xm-solution-banner ${solUnlocked ? "open" : ""}`}>
          {solUnlocked ? <CheckCircle2 size={18} /> : <Lock size={18} />}
          <div>
            <strong>{solUnlocked ? "Thầy cô đã công bố code mẫu" : solInfo.mode === "hidden" ? "Code mẫu chưa được công bố" : "Code mẫu sẽ mở khi tất cả học sinh đã nộp bài"}</strong>
            <span>{solUnlocked ? "Mở từng bài ở bên dưới, phần code mẫu nằm ngay dưới đề bài." : "Hệ thống tự kiểm tra lại mỗi phút, em có thể xem lại bài làm của mình trong lúc chờ."}</span>
          </div>
          {!solUnlocked && <button type="button" className="nb-btn nb-btn-ghost" onClick={checkSolutions} disabled={solChecking}><RefreshCw size={14} className={solChecking ? "nb-spin" : ""} /> Kiểm tra lại</button>}
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
        <ExamSubmissionViewer title={exam.title} subtitle={`${total}/${maxScore} điểm`} problems={problems} submissions={mySubs} initialProblemId={viewing} onClose={() => setViewing(null)} solutions={solUnlocked ? solItems : null} />
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

  const [solutions, setSolutions] = useState(null);
  const [solBusy, setSolBusy] = useState(false);
  useEffect(() => { let c = false; dbExamGetSolutions(exam.id).then((v) => { if (!c) setSolutions(v); }).catch(() => {}); return () => { c = true; }; }, [exam.id]);
  async function changeSolutionMode(mode) {
    if (!solutions) return;
    setSolBusy(true);
    try { setSolutions(await dbExamSetSolutionMode(exam.id, solutions, mode)); }
    catch (e) { setError("Chưa đổi được chế độ công bố code mẫu, hãy thử lại."); }
    setSolBusy(false);
  }
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
          {solutions && solutions.count > 0 && (() => {
            const prog = solutionProgress(exam, attempts, students, now);
            const unlocked = solutionsUnlocked(exam, solutions.mode, attempts, students, now);
            return (
              <section className={`nb-xm-solution-ctl ${unlocked ? "open" : ""}`}>
                <div className="nb-xm-solution-ctl-text">
                  <strong>{unlocked ? <CheckCircle2 size={16} /> : <Lock size={16} />} Code mẫu · {solutions.count}/{problems.length} bài</strong>
                  <span>{unlocked ? "Học sinh đang xem được code mẫu." : solutions.mode === "hidden" ? "Đang ẩn với học sinh." : `Tự động mở khi tất cả nộp xong: ${prog.done}/${prog.total} học sinh đã nộp hoặc hết giờ.`}</span>
                </div>
                <div className="nb-xm-solution-modes" role="radiogroup" aria-label="Công bố code mẫu">
                  {Object.entries(SOLUTION_MODES).map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={solutions.mode === k} disabled={solBusy} className={`nb-chip ${solutions.mode === k ? "active" : ""}`} onClick={() => changeSolutionMode(k)}>{label}</button>)}
                </div>
              </section>
            );
          })()}
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
        <ExamSubmissionViewer title={detail.student.name} subtitle={`${exam.title} · ${detail.total}/${maxScore} điểm · ${ATTEMPT_PHASE_LABEL[detail.phase]}`} problems={problems} submissions={detail.own} onClose={() => setDetail(null)} solutions={solutions?.items} solutionNote="Giáo viên luôn xem được code mẫu." />
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
      const [problems, sol] = await Promise.all([dbExamGetProblems(exam.id), dbExamGetSolutions(exam.id)]);
      await dbExamSave({ ...exam, id: `ex${Date.now()}`, title: `${exam.title} · Bản sao`, status: "draft", date: "Chưa xếp lịch" }, problems, true, currentUser.id, sol || undefined);
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
    return <ExamRunner students={students} exam={liveExam(mode.examId)} currentUser={currentUser} isTeacher={isTeacher || mode.preview} onExit={() => { setMode({ type: "list" }); loadMeta(); }} />;
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

// <ALGO-CORE>
/* ====================================================================== */
/*  GIẢI TRÍ: MÔ PHỎNG THUẬT TOÁN                                         */
/*  Mỗi thuật toán được "chạy trước" thành danh sách các bước; giao diện   */
/*  chỉ việc phát lại (tiến, lùi, tự chạy) nên không tốn băng thông mạng.  */
/* ====================================================================== */
const ALGO_GRAPH = {
  A: ["B", "C"], B: ["A", "D", "E"], C: ["A", "F"], D: ["B"],
  E: ["B", "F", "G"], F: ["C", "E", "H"], G: ["E"], H: ["F"],
};
const ALGO_GRAPH_POS = { A: [50, 120], B: [140, 52], C: [140, 188], D: [250, 28], E: [250, 108], F: [250, 200], G: [360, 66], H: [360, 176] };
const ALGO_GRAPH_EDGES = [["A", "B"], ["A", "C"], ["B", "D"], ["B", "E"], ["C", "F"], ["E", "F"], ["E", "G"], ["F", "H"]];

function algoParseNumbers(text, { min = 2, max = 12, lo = 1, hi = 99 } = {}) {
  const parts = String(text || "").split(/[\s,;]+/).filter(Boolean);
  if (parts.length < min) return { error: `Nhập ít nhất ${min} số, cách nhau bằng dấu phẩy.` };
  if (parts.length > max) return { error: `Nhập tối đa ${max} số để dễ quan sát.` };
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n))) return { error: "Chỉ nhập số nguyên, ví dụ: 5, 3, 8, 1." };
  if (nums.some((n) => n < lo || n > hi)) return { error: `Mỗi số cần nằm trong khoảng ${lo} đến ${hi}.` };
  return { value: nums };
}

function buildBubble({ nums }) {
  const a = [...nums]; const n = a.length; const sorted = []; const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, arr: [...a], sorted: [...sorted], ...x });
  push(1, `Mảng có n = ${n} phần tử. Mỗi lượt sẽ đẩy số lớn nhất của phần chưa xếp về cuối mảng.`, { vars: { n } });
  for (let i = 0; i < n - 1; i++) {
    push(2, `Lượt ${i + 1}: so sánh các cặp liền kề trong ${n - i} phần tử đầu.`, { vars: { n, i } });
    for (let j = 0; j < n - 1 - i; j++) {
      const need = a[j] > a[j + 1];
      push(4, `So sánh mang[${j}] = ${a[j]} với mang[${j + 1}] = ${a[j + 1]}: ${need ? `${a[j]} > ${a[j + 1]} nên cần đổi chỗ.` : `${a[j]} ≤ ${a[j + 1]} nên giữ nguyên.`}`, { cmp: [j, j + 1], vars: { i, j } });
      if (need) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
        push(5, `Đổi chỗ hai số: ${a[j + 1]} tiến dần về cuối mảng.`, { swap: [j, j + 1], vars: { i, j } });
      }
    }
    sorted.push(n - 1 - i);
    push(2, `Hết lượt ${i + 1}: ${a[n - 1 - i]} đã về đúng vị trí cuối, không cần xét lại.`, { vars: { n, i } });
  }
  sorted.push(0);
  push(6, "Mảng đã được sắp xếp tăng dần.", { done: true });
  return S;
}

function buildSelection({ nums }) {
  const a = [...nums]; const n = a.length; const sorted = []; const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, arr: [...a], sorted: [...sorted], ...x });
  push(1, `Mảng có n = ${n} phần tử. Mỗi lượt tìm số nhỏ nhất của phần chưa xếp rồi đưa về đầu.`, { vars: { n } });
  for (let i = 0; i < n - 1; i++) {
    let m = i;
    push(3, `Lượt ${i + 1}: tạm coi mang[${i}] = ${a[i]} là số nhỏ nhất (vt_min = ${i}).`, { min: m, vars: { i, vt_min: m } });
    for (let j = i + 1; j < n; j++) {
      const less = a[j] < a[m];
      push(5, `So sánh mang[${j}] = ${a[j]} với số nhỏ nhất hiện tại mang[${m}] = ${a[m]}: ${less ? "nhỏ hơn, cần cập nhật vt_min." : "không nhỏ hơn."}`, { cmp: [j], min: m, vars: { i, j, vt_min: m } });
      if (less) { m = j; push(6, `Cập nhật vt_min = ${m}.`, { cmp: [j], min: m, vars: { i, j, vt_min: m } }); }
    }
    if (m !== i) {
      [a[i], a[m]] = [a[m], a[i]];
      push(7, `Đổi chỗ mang[${i}] với mang[${m}]: đưa ${a[i]} về vị trí ${i}.`, { swap: [i, m], vars: { i, vt_min: m } });
    } else push(7, `mang[${i}] = ${a[i]} đã là số nhỏ nhất, không cần đổi chỗ.`, { vars: { i, vt_min: m } });
    sorted.push(i);
  }
  sorted.push(n - 1);
  push(8, "Mảng đã được sắp xếp tăng dần.", { done: true });
  return S;
}

function buildInsertion({ nums }) {
  const a = [...nums]; const n = a.length; const S = []; let zone = 1;
  const push = (line, note, x = {}) => S.push({ line, note, arr: [...a], zone, ...x });
  push(1, "Coi mang[0] là phần đã sắp xếp. Lần lượt lấy từng số phía sau chèn vào đúng chỗ, giống xếp bài trên tay.", { vars: {} });
  for (let i = 1; i < n; i++) {
    zone = i;
    const key = a[i];
    push(2, `Lấy số cần chèn can_chen = mang[${i}] = ${key}, cần chèn vào đúng chỗ trong ${i} số đã sắp xếp phía trước.`, { key, keyAt: i, vars: { i, can_chen: key } });
    let j = i - 1;
    push(3, `j = ${j}: bắt đầu so sánh với số đứng ngay trước can_chen.`, { key, keyAt: i, vars: { i, j, can_chen: key } });
    while (j >= 0 && a[j] > key) {
      push(4, `mang[${j}] = ${a[j]} > can_chen = ${key}: số này phải dịch sang phải.`, { key, keyAt: i, cmp: [j], vars: { i, j, can_chen: key } });
      a[j + 1] = a[j];
      push(5, `Dịch ${a[j + 1]} sang phải một ô, chừa chỗ trống ở vị trí ${j}.`, { key, hole: j, cmp: [j + 1], vars: { i, j, can_chen: key } });
      j--;
      push(6, `Giảm j xuống ${j}.`, { key, hole: j + 1, vars: { i, j, can_chen: key } });
    }
    if (j >= 0) push(4, `mang[${j}] = ${a[j]} ≤ can_chen = ${key}: dừng dịch, đã tìm được chỗ chèn.`, { key, hole: j + 1, cmp: [j], vars: { i, j, can_chen: key } });
    else push(4, "j = -1: đã hết số bên trái, can_chen là số nhỏ nhất, dừng dịch.", { key, hole: 0, vars: { i, j, can_chen: key } });
    a[j + 1] = key;
    zone = i + 1;
    push(7, `Đặt can_chen = ${key} vào vị trí ${j + 1}. Giờ ${i + 1} số đầu đã được sắp xếp.`, { placed: j + 1, vars: { i, j, can_chen: key } });
  }
  push(8, "Mảng đã được sắp xếp tăng dần.", { done: true });
  return S;
}

function buildMerge({ nums }) {
  const a = [...nums]; const n = a.length; const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, arr: [...a], ...x });
  push(0, "Sắp xếp trộn: chia đôi mảng, sắp xếp từng nửa, rồi trộn hai nửa đã sắp xếp lại với nhau.", {});
  const ms = (lo, hi) => {
    if (hi - lo < 1) { push(1, `Đoạn [${lo}..${hi}] chỉ có 1 phần tử nên đã có thứ tự.`, { range: [lo, hi] }); return; }
    const mid = Math.floor((lo + hi) / 2);
    push(3, `Chia đoạn [${lo}..${hi}] thành hai nửa: [${lo}..${mid}] và [${mid + 1}..${hi}].`, { range: [lo, hi], vars: { giua: mid } });
    push(4, `Gọi đệ quy sắp xếp nửa trái [${lo}..${mid}].`, { range: [lo, mid] });
    ms(lo, mid);
    push(5, `Gọi đệ quy sắp xếp nửa phải [${mid + 1}..${hi}].`, { range: [mid + 1, hi] });
    ms(mid + 1, hi);
    const L = a.slice(lo, mid + 1); const R = a.slice(mid + 1, hi + 1); const out = [];
    let i = 0; let j = 0;
    const buf = (pick) => ({ L: L.slice(i), R: R.slice(j), out: [...out], pick });
    push(6, `Hai nửa đã có thứ tự. Trộn lại thành đoạn [${lo}..${hi}] có thứ tự.`, { range: [lo, hi], merge: buf(null) });
    while (i < L.length && j < R.length) {
      const takeL = L[i] <= R[j];
      push(12, `So sánh ${L[i]} (nửa trái) với ${R[j]} (nửa phải): lấy ${takeL ? L[i] : R[j]} vì ${takeL ? `${L[i]} ≤ ${R[j]}` : `${R[j]} < ${L[i]}`}.`, { range: [lo, hi], merge: buf(takeL ? "L" : "R") });
      const v = takeL ? L[i++] : R[j++];
      out.push(v); a[lo + out.length - 1] = v;
      push(takeL ? 13 : 15, `Ghi ${v} vào vị trí ${lo + out.length - 1}.`, { range: [lo, hi], merge: buf(null), wrote: lo + out.length - 1 });
    }
    while (i < L.length) { const v = L[i++]; out.push(v); a[lo + out.length - 1] = v; push(16, `Nửa phải đã hết, chép nốt ${v} từ nửa trái vào vị trí ${lo + out.length - 1}.`, { range: [lo, hi], merge: buf(null), wrote: lo + out.length - 1 }); }
    while (j < R.length) { const v = R[j++]; out.push(v); a[lo + out.length - 1] = v; push(16, `Nửa trái đã hết, chép nốt ${v} từ nửa phải vào vị trí ${lo + out.length - 1}.`, { range: [lo, hi], merge: buf(null), wrote: lo + out.length - 1 }); }
    push(6, `Đoạn [${lo}..${hi}] đã được trộn xong và có thứ tự.`, { range: [lo, hi], okRange: [lo, hi], merge: buf(null) });
  };
  ms(0, n - 1);
  push(6, "Toàn bộ mảng đã được sắp xếp tăng dần.", { done: true });
  return S;
}

function buildLinear({ nums, x }) {
  const a = [...nums]; const S = [];
  const miss = (upto) => { const r = {}; for (let k = 0; k < upto; k++) r[k] = "miss"; return r; };
  const push = (line, note, x2 = {}) => S.push({ line, note, arr: a, ...x2 });
  push(0, `Tìm x = ${x} trong mảng bằng cách duyệt lần lượt từ phần tử đầu tiên.`, { vars: { x } });
  for (let i = 0; i < a.length; i++) {
    push(1, `i = ${i}: xét phần tử mang[${i}] = ${a[i]}.`, { roles: { ...miss(i), [i]: "cur" }, vars: { i, x } });
    if (a[i] === x) {
      push(2, `mang[${i}] = ${x}: đúng số cần tìm.`, { roles: { ...miss(i), [i]: "found" }, vars: { i, x } });
      push(3, `Trả về vị trí i = ${i}. Đã so sánh ${i + 1} lần.`, { roles: { ...miss(i), [i]: "found" }, found: i, done: true, vars: { i, x } });
      return S;
    }
    push(2, `${a[i]} ≠ ${x}: chưa phải, đi tiếp phần tử sau.`, { roles: { ...miss(i), [i]: "cur" }, vars: { i, x } });
  }
  push(4, `Đã duyệt hết ${a.length} phần tử mà không thấy ${x}: trả về -1.`, { roles: miss(a.length), done: true, vars: { x } });
  return S;
}

function buildBinary({ nums, x }) {
  const a = [...nums]; const S = [];
  let trai = 0; let phai = a.length - 1; let rounds = 0;
  const push = (line, note, x2 = {}) => {
    const tags = {};
    const tag = (k, t) => { if (k !== undefined && k >= 0 && k < a.length) (tags[k] = tags[k] || []).push(t); };
    tag(trai, "trai"); if (x2.giua !== undefined) tag(x2.giua, "giua"); tag(phai, "phai");
    S.push({ line, note, arr: a, active: [trai, phai], tags, vars: { trai, phai, x, ...(x2.giua !== undefined ? { giua: x2.giua } : {}) }, mid: x2.giua, ...x2 });
  };
  push(1, `Mảng đã sắp xếp tăng dần. Đặt trai = 0, phai = ${phai}: ban đầu mọi vị trí đều có thể chứa x = ${x}.`);
  while (trai <= phai) {
    push(2, `trai = ${trai} ≤ phai = ${phai}: còn ${phai - trai + 1} vị trí cần xét.`);
    const giua = Math.floor((trai + phai) / 2); rounds++;
    push(3, `giua = (${trai} + ${phai}) // 2 = ${giua}. Xét số ở giữa mang[${giua}] = ${a[giua]}.`, { giua });
    if (a[giua] === x) {
      push(4, `mang[${giua}] = ${x}: tìm thấy!`, { giua, found: giua });
      push(5, `Trả về ${giua}. Chỉ cần ${rounds} lần so sánh, trong khi duyệt tuần tự có thể cần tới ${a.length}.`, { giua, found: giua, done: true });
      return S;
    } else if (a[giua] < x) {
      push(6, `${a[giua]} < ${x}: x phải nằm bên phải giua, loại bỏ nửa trái.`, { giua });
      trai = giua + 1;
      push(7, `trai = giua + 1 = ${trai}.`);
    } else {
      push(8, `${a[giua]} > ${x}: x phải nằm bên trái giua, loại bỏ nửa phải.`, { giua });
      phai = giua - 1;
      push(9, `phai = giua - 1 = ${phai}.`);
    }
  }
  push(2, `trai = ${trai} > phai = ${phai}: không còn vị trí nào để xét.`);
  push(10, `Không có ${x} trong mảng: trả về -1.`, { done: true });
  return S;
}

function buildSieve({ n }) {
  const st = Array(n + 1).fill("p"); const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, grid: [...st], ...x });
  push(1, `Tạo bảng is_prime cho các số từ 0 đến ${n}. Ban đầu coi tất cả là số nguyên tố.`, { vars: { n } });
  st[0] = "n"; st[1] = "n";
  push(2, "0 và 1 không phải số nguyên tố nên đánh dấu loại.", { vars: { n } });
  for (let i = 2; i * i <= n; i++) {
    push(3, `i = ${i} (vì ${i}² = ${i * i} ≤ ${n}): xét số ${i}.`, { cur: i, vars: { n, i } });
    if (st[i] === "p") {
      push(4, `${i} chưa bị gạch nên là số nguyên tố. Gạch tất cả bội của ${i}, bắt đầu từ ${i}² = ${i * i}.`, { cur: i, vars: { n, i } });
      for (let j = i * i; j <= n; j += i) {
        const was = st[j] === "c"; st[j] = "c";
        push(6, was ? `${j} = ${i} × ${j / i} đã bị gạch từ trước.` : `${j} = ${i} × ${j / i} là hợp số, gạch bỏ.`, { cur: i, mark: j, vars: { n, i, j } });
      }
    } else push(4, `${i} đã bị gạch (là hợp số), bỏ qua vì bội của nó đã bị gạch rồi.`, { cur: i, vars: { n, i } });
  }
  const primes = []; for (let k = 2; k <= n; k++) if (st[k] === "p") primes.push(k);
  push(7, `Những số chưa bị gạch là số nguyên tố: ${primes.join(", ")} (${primes.length} số).`, { done: true, vars: { n } });
  return S;
}

function buildGcd({ a: a0, b: b0 }) {
  let a = a0; let b = b0; const hist = [[a, b]]; const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, a, b, hist: hist.map((p) => [...p]), ...x });
  push(0, `Tìm ƯCLN(${a0}, ${b0}) bằng thuật toán Euclid: ƯCLN(a, b) = ƯCLN(b, a mod b).`, { vars: { a, b } });
  while (b !== 0) {
    push(1, `b = ${b} ≠ 0 nên tiếp tục lặp.`, { vars: { a, b } });
    const r = a % b; const q = Math.floor(a / b);
    push(2, `du = a % b: ${a} = ${b} × ${q} + ${r}, nên số dư là ${r}.`, { r, q, calc: true, vars: { a, b, du: r } });
    const na = b; const nb = r;
    push(3, `Gán a = b = ${na} và b = du = ${nb}. Bài toán thu nhỏ lại thành (${na}, ${nb}).`, { r, q, calc: true, vars: { a, b, du: r } });
    a = na; b = nb; hist.push([a, b]);
  }
  push(1, "b = 0 nên dừng vòng lặp.", { vars: { a, b } });
  push(4, `ƯCLN(${a0}, ${b0}) = a = ${a}.`, { done: true, result: a, vars: { a, b } });
  return S;
}

function buildFib({ n }) {
  const f = Array(n + 1).fill(null); const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, arr: [...f], ...x });
  f[0] = 0;
  push(1, `Tạo bảng f gồm ${n + 1} ô; f[i] sẽ lưu số Fibonacci thứ i. Ban đầu chỉ có f[0] = 0 là biết.`, { roles: { 0: "src" }, vars: { n } });
  f[1] = 1;
  push(2, "Điều kiện đầu: f[1] = 1.", { roles: { 1: "src" }, vars: { n } });
  for (let i = 2; i <= n; i++) {
    push(3, `i = ${i}: cần tính f[${i}] từ hai ô đứng ngay trước.`, { roles: { [i]: "cur", [i - 1]: "src", [i - 2]: "src" }, vars: { n, i } });
    f[i] = f[i - 1] + f[i - 2];
    push(4, `f[${i}] = f[${i - 1}] + f[${i - 2}] = ${f[i - 1]} + ${f[i - 2]} = ${f[i]}. Kết quả được lưu lại, không phải tính lại lần sau.`, { roles: { [i]: "cur", [i - 1]: "src", [i - 2]: "src" }, vars: { n, i } });
  }
  push(5, `Trả về f[${n}] = ${f[n]}.`, { roles: { [n]: "found" }, done: true, vars: { n } });
  return S;
}

function buildBfs({ start }) {
  const visited = new Set([start]); const queue = [start]; const order = []; const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, visited: [...visited], frontier: [...queue], order: [...order], ...x });
  visited.clear();
  push(1, `Duyệt rộng (BFS) từ đỉnh ${start}: thăm mọi đỉnh gần nhất trước, rồi mới ra xa dần.`, {});
  visited.add(start);
  push(2, `Đánh dấu đỉnh xuất phát ${start} đã thăm.`, {});
  push(3, `Đưa ${start} vào hàng đợi.`, {});
  while (queue.length) {
    push(4, `Hàng đợi còn ${queue.length} đỉnh nên tiếp tục.`, {});
    const u = queue.shift(); order.push(u);
    push(5, `Lấy đỉnh ${u} ở đầu hàng đợi ra để xử lý.`, { cur: u });
    for (const v of ALGO_GRAPH[u]) {
      push(6, `Xét láng giềng ${v} của ${u}.`, { cur: u, edge: [u, v] });
      if (!visited.has(v)) {
        push(7, `${v} chưa được thăm.`, { cur: u, edge: [u, v] });
        visited.add(v);
        push(8, `Đánh dấu ${v} đã thăm.`, { cur: u, edge: [u, v] });
        queue.push(v);
        push(9, `Đưa ${v} vào cuối hàng đợi.`, { cur: u, edge: [u, v] });
      } else push(7, `${v} đã được thăm rồi nên bỏ qua.`, { cur: u, edge: [u, v], skip: true });
    }
  }
  push(4, `Hàng đợi rỗng nên kết thúc. Thứ tự thăm: ${order.join(" → ")}.`, { done: true });
  return S;
}

function buildDfs({ start }) {
  const visited = new Set(); const stack = []; const order = []; const S = [];
  const push = (line, note, x = {}) => S.push({ line, note, visited: [...visited], frontier: [...stack], order: [...order], ...x });
  push(0, `Duyệt sâu (DFS) từ đỉnh ${start}: đi sâu theo một nhánh đến khi hết đường mới quay lui.`, {});
  const dfs = (u) => {
    stack.push(u); visited.add(u); order.push(u);
    push(1, `Vào dfs(${u}): đánh dấu ${u} đã thăm.`, { cur: u });
    for (const v of ALGO_GRAPH[u]) {
      push(2, `Xét láng giềng ${v} của ${u}.`, { cur: u, edge: [u, v] });
      if (!visited.has(v)) {
        push(3, `${v} chưa được thăm nên đi sâu vào ${v}.`, { cur: u, edge: [u, v] });
        push(4, `Gọi đệ quy dfs(${v}).`, { cur: u, edge: [u, v] });
        dfs(v);
      } else push(3, `${v} đã được thăm rồi nên bỏ qua.`, { cur: u, edge: [u, v], skip: true });
    }
    stack.pop();
    const back = stack[stack.length - 1];
    push(2, back ? `Hết láng giềng của ${u}: quay lui về ${back}.` : `Hết láng giềng của ${u}: dfs kết thúc.`, { cur: back, backFrom: u });
  };
  dfs(start);
  push(2, `Duyệt xong. Thứ tự thăm: ${order.join(" → ")}.`, { done: true });
  return S;
}

function buildTwoSum({ nums, x: s }) {
  const a = [...nums]; const n = a.length; const S = [];
  let trai = 0; let phai = n - 1;
  const push = (line, note, x2 = {}) => {
    const tags = {}; const tag = (k, t) => { (tags[k] = tags[k] || []).push(t); };
    tag(trai, "trai"); tag(phai, "phai");
    S.push({ line, note, arr: a, active: [trai, phai], tags, vars: { trai, phai, ...(x2.tong !== undefined ? { tong: x2.tong } : {}), s }, ...x2 });
  };
  push(1, `Tìm hai số có tổng S = ${s}. Mảng đã sắp xếp nên mang[trai] là số nhỏ nhất, mang[phai] là số lớn nhất của đoạn đang xét.`);
  while (trai < phai) {
    push(2, `trai = ${trai} < phai = ${phai}: còn ít nhất 2 số để ghép cặp.`);
    const tong = a[trai] + a[phai];
    push(3, `tong = mang[${trai}] + mang[${phai}] = ${a[trai]} + ${a[phai]} = ${tong}.`, { tong, roles: { [trai]: "cur", [phai]: "cur" } });
    if (tong === s) {
      push(4, `tong = ${tong} = S: tìm được cặp!`, { tong, roles: { [trai]: "found", [phai]: "found" } });
      push(5, `Trả về (${trai}, ${phai}): ${a[trai]} + ${a[phai]} = ${s}. Mỗi con trỏ chỉ đi một chiều nên tối đa ${n} bước, không cần thử mọi cặp.`, { tong, roles: { [trai]: "found", [phai]: "found" }, done: true });
      return S;
    } else if (tong < s) {
      push(6, `${tong} < ${s}: tổng nhỏ quá. mang[phai] đã là số lớn nhất, nên chỉ còn cách tăng số bên trái.`, { tong, roles: { [trai]: "bad", [phai]: "cur" } });
      trai++;
      push(7, `trai += 1, nay trai = ${trai}. Số ${a[trai - 1]} bị loại vì không còn cặp nào hợp lệ với nó.`, { tong });
    } else {
      push(8, `${tong} > ${s}: tổng lớn quá. mang[trai] đã là số nhỏ nhất, nên chỉ còn cách giảm số bên phải.`, { tong, roles: { [trai]: "cur", [phai]: "bad" } });
      phai--;
      push(9, `phai -= 1, nay phai = ${phai}. Số ${a[phai + 1]} bị loại.`, { tong });
    }
  }
  push(2, `trai = ${trai} ≥ phai = ${phai}: hết cặp để xét.`);
  push(10, `Không có cặp nào có tổng ${s}: trả về None.`, { done: true });
  return S;
}

function buildPalin({ xau }) {
  const c = [...xau]; const n = c.length; const S = [];
  let trai = 0; let phai = n - 1; const okIdx = [];
  const push = (line, note, x2 = {}) => {
    const roles = {}; okIdx.forEach((k) => { roles[k] = "found"; }); Object.assign(roles, x2.roles || {});
    const tags = {}; if (trai < n) (tags[trai] = tags[trai] || []).push("trai"); if (phai >= 0) (tags[phai] = tags[phai] || []).push("phai");
    S.push({ line, note, arr: c, roles, tags, vars: { trai, phai }, ...x2 });
  };
  push(1, `Xâu "${xau}" có ${n} ký tự. Đặt trai ở đầu, phai ở cuối rồi so sánh từng cặp ký tự đối nhau, tiến dần vào giữa.`);
  while (trai < phai) {
    push(2, `trai = ${trai} < phai = ${phai}: còn cặp ký tự cần so sánh.`);
    const eq = c[trai] === c[phai];
    push(3, `So sánh xau[${trai}] = '${c[trai]}' với xau[${phai}] = '${c[phai]}': ${eq ? "giống nhau." : "khác nhau."}`, { roles: { [trai]: eq ? "cur" : "bad", [phai]: eq ? "cur" : "bad" } });
    if (!eq) {
      push(4, `Có một cặp khác nhau nên xâu không đối xứng: trả về False. Không cần xét các cặp còn lại.`, { roles: { [trai]: "bad", [phai]: "bad" }, done: true, bad: true });
      return S;
    }
    okIdx.push(trai, phai);
    trai++;
    push(5, `Cặp giống nhau. Tăng trai lên ${trai}.`);
    phai--;
    push(6, `Giảm phai xuống ${phai}.`);
  }
  push(2, `trai = ${trai} ≥ phai = ${phai}: hai con trỏ đã gặp nhau, đã so sánh hết.`);
  push(7, `Mọi cặp đều giống nhau: xâu đối xứng. Trả về True.`, { done: true });
  return S;
}

function buildDedup({ nums }) {
  const a = [...nums]; const n = a.length; const S = [];
  let cham = 0;
  const push = (line, note, x2 = {}) => {
    const roles = {}; for (let k = 0; k <= cham; k++) roles[k] = "keep";
    if (x2.nhanh !== undefined) roles[x2.nhanh] = x2.nhanhRole || "cur";
    if (x2.final) for (let k = cham + 1; k < n; k++) roles[k] = "dim";
    const tags = {}; (tags[cham] = tags[cham] || []).push("cham"); if (x2.nhanh !== undefined) (tags[x2.nhanh] = tags[x2.nhanh] || []).push("nhanh");
    S.push({ line, note, arr: [...a], roles, tags, vars: { cham, ...(x2.nhanh !== undefined ? { nhanh: x2.nhanh } : {}) }, ...x2 });
  };
  push(1, `cham = 0: mang[0] luôn được giữ lại. Đoạn từ 0 đến cham là phần "đã lọc, không trùng".`);
  for (let nhanh = 1; nhanh < n; nhanh++) {
    push(2, `nhanh = ${nhanh}: con trỏ nhanh đi tìm số mới, xét mang[${nhanh}] = ${a[nhanh]}.`, { nhanh });
    if (a[nhanh] !== a[cham]) {
      push(3, `${a[nhanh]} ≠ mang[cham] = ${a[cham]}: đây là số mới, cần giữ lại.`, { nhanh, nhanhRole: "new" });
      cham++;
      push(4, `Mở rộng phần đã lọc: cham += 1, nay cham = ${cham}.`, { nhanh, nhanhRole: "new" });
      a[cham] = a[nhanh];
      push(5, `Chép ${a[nhanh]} vào mang[${cham}].`, { nhanh, nhanhRole: "new" });
    } else push(3, `${a[nhanh]} = mang[cham] = ${a[cham]}: số trùng, bỏ qua (cham đứng yên).`, { nhanh, nhanhRole: "bad" });
  }
  push(6, `Kết quả là ${cham + 1} số đầu: [${a.slice(0, cham + 1).join(", ")}]. Các ô phía sau không còn dùng nữa.`, { final: true, done: true });
  return S;
}

function buildMerge2({ a: A, b: B }) {
  const S = []; const total = A.length + B.length; const kq = [];
  let i = 0; let j = 0;
  const push = (line, note, x2 = {}) => {
    const kqArr = Array(total).fill(null); kq.forEach((v, k) => { kqArr[k] = v; });
    const ra = {}; for (let k = 0; k < i; k++) ra[k] = "miss"; if (i < A.length) ra[i] = x2.cmp ? "cur" : "";
    const rb = {}; for (let k = 0; k < j; k++) rb[k] = "miss"; if (j < B.length) rb[j] = x2.cmp ? "cur" : "";
    const rk = {}; if (x2.wrote !== undefined) rk[x2.wrote] = "found";
    S.push({
      line, note,
      rows: [
        { label: "mảng a", arr: A, roles: ra, tags: i < A.length ? { [i]: ["i"] } : {} },
        { label: "mảng b", arr: B, roles: rb, tags: j < B.length ? { [j]: ["j"] } : {} },
        { label: "kq", arr: kqArr, roles: rk, tags: {} },
      ],
      vars: { i, j }, ...x2,
    });
  };
  push(1, "Hai mảng đã sắp xếp. Mỗi mảng dùng một con trỏ (i cho a, j cho b), luôn lấy số nhỏ hơn trong hai số đang chỉ tới.");
  push(2, "kq là mảng kết quả, ban đầu rỗng.");
  while (i < A.length && j < B.length) {
    push(3, `i = ${i} < ${A.length} và j = ${j} < ${B.length}: cả hai mảng còn số.`);
    const takeA = A[i] <= B[j];
    push(4, `So sánh a[${i}] = ${A[i]} với b[${j}] = ${B[j]}: ${takeA ? `${A[i]} ≤ ${B[j]}, lấy từ a.` : `${B[j]} < ${A[i]}, lấy từ b.`}`, { cmp: true });
    if (takeA) { kq.push(A[i]); i++; push(5, `Thêm ${kq[kq.length - 1]} vào kq, tăng i lên ${i}.`, { wrote: kq.length - 1 }); }
    else { kq.push(B[j]); j++; push(7, `Thêm ${kq[kq.length - 1]} vào kq, tăng j lên ${j}.`, { wrote: kq.length - 1 }); }
  }
  while (i < A.length) { kq.push(A[i]); i++; push(8, `Mảng b đã hết, chép nốt ${kq[kq.length - 1]} từ a vào kq.`, { wrote: kq.length - 1 }); }
  while (j < B.length) { kq.push(B[j]); j++; push(8, `Mảng a đã hết, chép nốt ${kq[kq.length - 1]} từ b vào kq.`, { wrote: kq.length - 1 }); }
  push(8, `Hoàn thành: kq = [${kq.join(", ")}]. Chỉ duyệt mỗi số một lần nên mất ${total} bước.`, { done: true });
  return S;
}

function buildWindow({ nums, x: s }) {
  const a = [...nums]; const n = a.length; const S = [];
  let trai = 0; let tong = 0; let phai = -1;
  const push = (line, note, x2 = {}) => {
    const roles = {}; for (let k = trai; k <= phai; k++) roles[k] = x2.foundWin ? "found" : "win";
    const tags = {}; if (phai >= 0) (tags[phai] = tags[phai] || []).push("phai"); if (trai < n) (tags[trai] = tags[trai] || []).push("trai");
    S.push({ line, note, arr: a, roles, tags, vars: { trai, phai: Math.max(phai, 0), tong, s }, ...x2 });
  };
  push(1, `Tìm đoạn liên tiếp có tổng S = ${s}. Các số đều dương, nên thêm số vào thì tổng tăng, bớt số ra thì tổng giảm. Cửa sổ là đoạn từ trai đến phai.`);
  push(2, "tong = 0: tổng các số trong cửa sổ, hiện chưa có số nào.");
  for (let p = 0; p < n; p++) {
    phai = p;
    push(3, `phai = ${phai}: mở rộng cửa sổ sang phải để thêm mang[${phai}] = ${a[phai]}.`);
    tong += a[phai];
    push(4, `tong += ${a[phai]} nên tong = ${tong}.`);
    while (tong > s && trai <= phai) {
      push(5, `tong = ${tong} > S = ${s}: cửa sổ quá lớn, cần thu hẹp từ bên trái.`, { roles: { [trai]: "bad" } });
      tong -= a[trai];
      push(6, `Bỏ mang[${trai}] = ${a[trai]} khỏi cửa sổ: tong = ${tong}.`, { roles: { [trai]: "bad" } });
      trai++;
      push(7, `trai += 1, nay trai = ${trai}.`);
    }
    if (tong === s && trai <= phai) {
      push(8, `tong = ${tong} = S: cửa sổ từ ${trai} đến ${phai} thỏa mãn!`, { foundWin: true });
      push(9, `Trả về (${trai}, ${phai}): các số ${a.slice(trai, phai + 1).join(" + ")} = ${s}. Mỗi con trỏ chỉ đi tới, tổng cộng không quá ${2 * n} bước.`, { foundWin: true, done: true });
      return S;
    }
    push(8, `tong = ${tong} ${tong < s ? "<" : ">"} S = ${s}: chưa đúng, tiếp tục mở rộng sang phải.`);
  }
  push(10, `Đã duyệt hết mảng mà không có đoạn nào có tổng ${s}: trả về None.`, { done: true });
  return S;
}

const ALGO_GROUPS = [
  { key: "sort", label: "Sắp xếp", hint: "Xếp dãy số tăng dần" },
  { key: "search", label: "Tìm kiếm", hint: "Tìm một số trong mảng" },
  { key: "two", label: "Hai con trỏ", hint: "Duyệt bằng hai chỉ số" },
  { key: "math", label: "Số học", hint: "Số nguyên tố, ƯCLN" },
  { key: "dp", label: "Quy hoạch động", hint: "Nhớ kết quả đã tính" },
  { key: "graph", label: "Đồ thị", hint: "Duyệt các đỉnh" },
];

const ALGOS = [
  {
    key: "bubble", group: "sort", name: "Sắp xếp nổi bọt", en: "Bubble Sort", viz: "bars", input: "array", build: buildBubble,
    defaults: { arr: "64, 34, 25, 12, 22, 11, 90" }, time: "O(n²)", space: "O(1)",
    desc: "So sánh từng cặp số đứng cạnh nhau, nếu sai thứ tự thì đổi chỗ. Sau mỗi lượt, số lớn nhất “nổi” lên cuối mảng như bọt khí.",
    idea: ["Duyệt từ đầu mảng, so sánh hai số liền kề mang[j] và mang[j + 1].", "Nếu số trước lớn hơn số sau thì đổi chỗ hai số.", "Hết một lượt, số lớn nhất của phần đang xét đã nằm đúng cuối mảng nên lượt sau bỏ qua nó.", "Lặp n − 1 lượt thì cả mảng có thứ tự."],
    tip: "Dễ hiểu, dễ viết nhưng chậm với mảng lớn (n² phép so sánh). Phù hợp để học nguyên lý sắp xếp.",
    code: ["def noi_bot(mang):", "    n = len(mang)", "    for i in range(n - 1):  # mỗi lượt đưa số lớn nhất về cuối", "        for j in range(n - 1 - i):", "            if mang[j] > mang[j + 1]:  # sai thứ tự thì đổi chỗ", "                mang[j], mang[j + 1] = mang[j + 1], mang[j]", "    return mang"],
  },
  {
    key: "selection", group: "sort", name: "Sắp xếp chọn", en: "Selection Sort", viz: "bars", input: "array", build: buildSelection,
    defaults: { arr: "29, 10, 14, 37, 13, 5, 21" }, time: "O(n²)", space: "O(1)",
    desc: "Mỗi lượt tìm số nhỏ nhất trong phần chưa xếp, rồi đổi chỗ nó về đầu phần đó. Số lần đổi chỗ rất ít (tối đa n − 1).",
    idea: ["Coi số đầu của phần chưa xếp là số nhỏ nhất tạm thời (vt_min = i).", "Duyệt các số còn lại, gặp số nhỏ hơn thì ghi nhớ vị trí của nó.", "Duyệt xong, đổi chỗ số nhỏ nhất tìm được với số ở vị trí i.", "Phần đã xếp dài thêm 1 số, lặp lại cho đến hết."],
    tip: "Luôn so sánh gần n²/2 lần dù mảng đã gần xếp sẵn, nhưng ít đổi chỗ hơn nổi bọt.",
    code: ["def chon(mang):", "    n = len(mang)", "    for i in range(n - 1):", "        vt_min = i  # vị trí số nhỏ nhất tạm thời", "        for j in range(i + 1, n):", "            if mang[j] < mang[vt_min]:", "                vt_min = j  # tìm được số nhỏ hơn", "        mang[i], mang[vt_min] = mang[vt_min], mang[i]", "    return mang"],
  },
  {
    key: "insertion", group: "sort", name: "Sắp xếp chèn", en: "Insertion Sort", viz: "bars", input: "array", build: buildInsertion,
    defaults: { arr: "12, 11, 13, 5, 6, 9, 2" }, time: "O(n²)", space: "O(1)",
    desc: "Giống cách xếp bài trên tay: lấy từng quân bài mới, dịch các quân lớn hơn sang phải rồi chèn vào đúng chỗ.",
    idea: ["Coi số đầu tiên là phần đã sắp xếp.", "Lấy số tiếp theo ra (can_chen), so sánh với các số đứng trước nó.", "Số nào lớn hơn can_chen thì dịch sang phải một ô để chừa chỗ trống.", "Gặp số nhỏ hơn hoặc bằng thì dừng, đặt can_chen vào chỗ trống."],
    tip: "Rất nhanh nếu mảng gần như đã sắp xếp (gần O(n)). Hay dùng cho mảng nhỏ.",
    code: ["def chen(mang):", "    for i in range(1, len(mang)):", "        can_chen = mang[i]  # số cần chèn", "        j = i - 1", "        while j >= 0 and mang[j] > can_chen:", "            mang[j + 1] = mang[j]  # dịch sang phải", "            j -= 1", "        mang[j + 1] = can_chen  # đặt vào chỗ trống", "    return mang"],
  },
  {
    key: "merge", group: "sort", name: "Sắp xếp trộn", en: "Merge Sort", viz: "bars", input: "array", build: buildMerge,
    defaults: { arr: "38, 27, 43, 3, 9, 82, 10, 55" }, time: "O(n log n)", space: "O(n)",
    desc: "Chia đôi mảng liên tục cho đến khi mỗi đoạn chỉ còn 1 số, sau đó trộn các đoạn đã có thứ tự lại với nhau. Đây là kỹ thuật “chia để trị”.",
    idea: ["Chia: cắt mảng thành hai nửa trái và phải.", "Trị: sắp xếp từng nửa bằng chính thuật toán này (đệ quy). Đoạn 1 số thì đã có thứ tự.", "Trộn: so sánh hai số đầu của hai nửa, lấy số nhỏ hơn bỏ vào kết quả (đây chính là kỹ thuật hai con trỏ).", "Lặp lại đến khi trộn hết hai nửa."],
    tip: "Nhanh và ổn định với mảng lớn. Là nền tảng cho nhiều thuật toán chia để trị khác.",
    code: ["def tron(mang):", "    if len(mang) <= 1:  # 1 số thì đã có thứ tự", "        return mang", "    giua = len(mang) // 2", "    trai = tron(mang[:giua])  # sắp xếp nửa trái", "    phai = tron(mang[giua:])  # sắp xếp nửa phải", "    return gop(trai, phai)", "", "def gop(trai, phai):  # trộn hai mảng đã sắp xếp", "    kq = []", "    i = j = 0", "    while i < len(trai) and j < len(phai):", "        if trai[i] <= phai[j]:", "            kq.append(trai[i]); i += 1", "        else:", "            kq.append(phai[j]); j += 1", "    return kq + trai[i:] + phai[j:]"],
  },
  {
    key: "linear", group: "search", name: "Tìm kiếm tuần tự", en: "Linear Search", viz: "cells", input: "search", build: buildLinear,
    defaults: { arr: "7, 3, 9, 14, 5, 21, 8, 12", x: "21" }, time: "O(n)", space: "O(1)",
    desc: "Duyệt lần lượt từng phần tử từ đầu đến cuối cho đến khi gặp số cần tìm hoặc hết mảng.",
    idea: ["Bắt đầu từ vị trí 0.", "So sánh mang[i] với số cần tìm x.", "Bằng nhau thì trả về vị trí i.", "Duyệt hết mà không thấy thì trả về -1."],
    tip: "Dùng được cho mảng bất kỳ, không cần sắp xếp. Chậm khi mảng rất lớn.",
    code: ["def tim_tuan_tu(mang, x):", "    for i in range(len(mang)):", "        if mang[i] == x:", "            return i", "    return -1  # không tìm thấy"],
  },
  {
    key: "binary", group: "search", name: "Tìm kiếm nhị phân", en: "Binary Search", viz: "cells", input: "search", build: buildBinary,
    defaults: { arr: "2, 5, 8, 12, 16, 23, 38, 56, 72, 91", x: "23" }, time: "O(log n)", space: "O(1)",
    desc: "Với mảng đã sắp xếp: so sánh với số ở giữa, rồi loại bỏ một nửa mảng không thể chứa số cần tìm. Mỗi bước giảm một nửa.",
    idea: ["Giữ một đoạn [trai, phai] có thể chứa x, ban đầu là cả mảng.", "Lấy số ở giữa mang[giua] so sánh với x.", "Nếu x lớn hơn thì bỏ nửa trái (trai = giua + 1), nhỏ hơn thì bỏ nửa phải (phai = giua − 1).", "Lặp đến khi tìm thấy hoặc đoạn rỗng (trai > phai)."],
    tip: "Mảng 1 triệu phần tử chỉ cần khoảng 20 lần so sánh. Điều kiện bắt buộc: mảng phải sắp xếp.",
    code: ["def tim_nhi_phan(mang, x):", "    trai, phai = 0, len(mang) - 1  # đoạn đang xét", "    while trai <= phai:", "        giua = (trai + phai) // 2", "        if mang[giua] == x:", "            return giua", "        elif mang[giua] < x:", "            trai = giua + 1  # bỏ nửa trái", "        else:", "            phai = giua - 1  # bỏ nửa phải", "    return -1"],
  },
  {
    key: "twosum", group: "two", name: "Tìm cặp có tổng S", en: "Two Sum (mảng đã sắp xếp)", viz: "cells", input: "pair", build: buildTwoSum,
    defaults: { arr: "2, 4, 7, 11, 15, 19, 23, 31", x: "26" }, time: "O(n)", space: "O(1)",
    desc: "Tìm hai số trong mảng đã sắp xếp có tổng bằng S. Hai con trỏ đứng ở hai đầu mảng rồi tiến dần vào giữa.",
    idea: ["trai chỉ số nhỏ nhất, phai chỉ số lớn nhất. Tính tong = mang[trai] + mang[phai].", "tong = S thì xong. tong nhỏ hơn S thì cần số lớn hơn nên tăng trai.", "tong lớn hơn S thì cần số nhỏ hơn nên giảm phai.", "Hai con trỏ gặp nhau mà chưa thấy thì không có cặp nào."],
    tip: "Cách vét cạn thử mọi cặp mất n² bước, hai con trỏ chỉ mất n bước. Điều kiện: mảng phải sắp xếp tăng dần.",
    code: ["def tim_cap(mang, s):  # mang đã sắp xếp tăng dần", "    trai, phai = 0, len(mang) - 1", "    while trai < phai:", "        tong = mang[trai] + mang[phai]", "        if tong == s:", "            return trai, phai", "        elif tong < s:", "            trai += 1  # tổng nhỏ quá: lấy số lớn hơn", "        else:", "            phai -= 1  # tổng lớn quá: lấy số nhỏ hơn", "    return None"],
  },
  {
    key: "palin", group: "two", name: "Kiểm tra xâu đối xứng", en: "Palindrome", viz: "cells", input: "text", build: buildPalin,
    defaults: { xau: "racecar" }, time: "O(n)", space: "O(1)",
    desc: "Xâu đối xứng là xâu đọc xuôi hay ngược đều giống nhau (ví dụ radar, abcba). Hai con trỏ so sánh các ký tự đối nhau từ hai đầu.",
    idea: ["trai ở ký tự đầu, phai ở ký tự cuối.", "So sánh xau[trai] với xau[phai]. Khác nhau thì kết luận ngay: không đối xứng.", "Giống nhau thì tăng trai, giảm phai rồi so sánh cặp tiếp theo.", "Hai con trỏ gặp nhau hoặc vượt qua nhau mà không có cặp khác: xâu đối xứng."],
    tip: "Chỉ cần so sánh n/2 cặp. Không cần tạo xâu đảo ngược nên tiết kiệm bộ nhớ.",
    code: ["def doi_xung(xau):", "    trai, phai = 0, len(xau) - 1", "    while trai < phai:", "        if xau[trai] != xau[phai]:", "            return False  # có cặp khác nhau", "        trai += 1", "        phai -= 1", "    return True"],
  },
  {
    key: "dedup", group: "two", name: "Loại bỏ số trùng", en: "Remove Duplicates (chậm – nhanh)", viz: "cells", input: "dups", build: buildDedup,
    defaults: { arr: "1, 1, 2, 2, 2, 3, 5, 5, 8" }, time: "O(n)", space: "O(1)",
    desc: "Với mảng đã sắp xếp, các số trùng nằm cạnh nhau. Hai con trỏ cùng chiều: nhanh đi tìm số mới, cham ghi lại các số không trùng.",
    idea: ["cham chỉ ô cuối của phần đã lọc, ban đầu là ô 0.", "nhanh chạy từ ô 1 đến hết mảng.", "Nếu mang[nhanh] khác mang[cham] thì đó là số mới: tăng cham rồi chép số đó vào mang[cham].", "Cuối cùng, cham + 1 ô đầu chính là mảng không có số trùng."],
    tip: "Đây là dạng hai con trỏ cùng chiều (một con trỏ đọc, một con trỏ ghi). Làm tại chỗ, không cần mảng phụ.",
    code: ["def bo_trung(mang):  # mang đã sắp xếp", "    cham = 0  # ô cuối của phần không trùng", "    for nhanh in range(1, len(mang)):", "        if mang[nhanh] != mang[cham]:  # gặp số mới", "            cham += 1", "            mang[cham] = mang[nhanh]", "    return mang[:cham + 1]"],
  },
  {
    key: "merge2", group: "two", name: "Gộp hai mảng đã sắp xếp", en: "Merge Two Sorted Arrays", viz: "rows", input: "two", build: buildMerge2,
    defaults: { arr: "1, 4, 7, 10, 15", arr2: "2, 3, 8, 12" }, time: "O(n + m)", space: "O(n + m)",
    desc: "Gộp hai mảng đã sắp xếp thành một mảng sắp xếp. Mỗi mảng có một con trỏ, luôn lấy số nhỏ hơn trong hai số đang chỉ tới.",
    idea: ["i chỉ số đầu chưa xét của mảng a, j chỉ số đầu chưa xét của mảng b.", "So sánh a[i] với b[j], số nhỏ hơn được thêm vào kq, con trỏ của mảng đó tiến lên.", "Khi một mảng hết số, chép phần còn lại của mảng kia vào kq.", "Mỗi số chỉ được xét đúng một lần."],
    tip: "Chính là bước “trộn” của sắp xếp trộn. Ý tưởng hai con trỏ trên hai mảng còn dùng để tìm phần giao của hai mảng.",
    code: ["def gop_hai_mang(a, b):", "    i = j = 0  # mỗi mảng một con trỏ", "    kq = []", "    while i < len(a) and j < len(b):", "        if a[i] <= b[j]:", "            kq.append(a[i]); i += 1", "        else:", "            kq.append(b[j]); j += 1", "    return kq + a[i:] + b[j:]  # chép phần còn lại"],
  },
  {
    key: "window", group: "two", name: "Đoạn con có tổng S", en: "Sliding Window", viz: "cells", input: "window", build: buildWindow,
    defaults: { arr: "2, 1, 4, 3, 7, 1, 2, 5", x: "10" }, time: "O(n)", space: "O(1)",
    desc: "Tìm đoạn các số liên tiếp có tổng bằng S (các số đều dương). Hai con trỏ tạo thành một “cửa sổ” trượt từ trái sang phải.",
    idea: ["Cửa sổ là đoạn từ trai đến phai; tong là tổng các số trong cửa sổ.", "Cho phai tiến lên một ô, cộng số mới vào tong.", "Nếu tong lớn hơn S thì thu hẹp cửa sổ: trừ mang[trai] khỏi tong rồi tăng trai.", "Nếu tong đúng bằng S thì tìm được đoạn cần tìm."],
    tip: "Cách vét cạn thử mọi đoạn mất n². Cửa sổ trượt chỉ mất n bước vì trai và phai chỉ tiến, không bao giờ lùi. Chỉ đúng khi các số đều dương.",
    code: ["def doan_con(mang, s):", "    trai = 0", "    tong = 0  # tổng trong cửa sổ", "    for phai in range(len(mang)):", "        tong += mang[phai]  # mở rộng sang phải", "        while tong > s:", "            tong -= mang[trai]  # thu hẹp bên trái", "            trai += 1", "        if tong == s:", "            return trai, phai", "    return None"],
  },
  {
    key: "sieve", group: "math", name: "Sàng nguyên tố", en: "Sieve of Eratosthenes", viz: "sieve", input: "sieve", build: buildSieve,
    defaults: { n: "50" }, time: "O(n log log n)", space: "O(n)",
    desc: "Liệt kê mọi số, gặp số nguyên tố thì gạch bỏ các bội của nó. Những số còn lại không bị gạch chính là số nguyên tố.",
    idea: ["Ban đầu coi mọi số từ 2 đến n là số nguyên tố (la_nt = True).", "Xét i từ 2: nếu i chưa bị gạch thì i là số nguyên tố.", "Gạch tất cả bội của i, bắt đầu từ i × i (các bội nhỏ hơn đã bị gạch từ trước).", "Chỉ cần xét i đến căn bậc hai của n. Số chưa bị gạch là số nguyên tố."],
    tip: "Tìm tất cả số nguyên tố đến 10⁶ chỉ mất chưa đến 1 giây.",
    code: ["def sang(n):", "    la_nt = [True] * (n + 1)", "    la_nt[0] = la_nt[1] = False  # 0 và 1 không phải số nguyên tố", "    for i in range(2, int(n ** 0.5) + 1):", "        if la_nt[i]:  # i là số nguyên tố", "            for j in range(i * i, n + 1, i):", "                la_nt[j] = False  # gạch bội của i", "    return [i for i in range(n + 1) if la_nt[i]]"],
  },
  {
    key: "gcd", group: "math", name: "Thuật toán Euclid (ƯCLN)", en: "Euclid GCD", viz: "gcd", input: "gcd", build: buildGcd,
    defaults: { a: "252", b: "105" }, time: "O(log min(a, b))", space: "O(1)",
    desc: "Ước chung lớn nhất của a và b không đổi khi thay (a, b) bằng (b, a mod b). Lặp lại cho đến khi b bằng 0.",
    idea: ["Chia a cho b, lấy số dư du = a mod b.", "Thay (a, b) bằng (b, du): bài toán nhỏ hơn mà ƯCLN không đổi.", "Lặp lại đến khi b = 0.", "Lúc đó a chính là ƯCLN."],
    tip: "Rất nhanh. Trong Python dùng sẵn math.gcd, lưu ý bộ chấm Python 3.8 chỉ nhận đúng 2 số.",
    code: ["def ucln(a, b):", "    while b != 0:", "        du = a % b  # số dư của a chia b", "        a, b = b, du", "    return a"],
  },
  {
    key: "fib", group: "dp", name: "Fibonacci quy hoạch động", en: "Fibonacci DP", viz: "cells", input: "fib", build: buildFib,
    defaults: { fn: "10" }, time: "O(n)", space: "O(n)",
    desc: "Lưu lại kết quả của các bài toán con trong bảng f để mỗi giá trị chỉ tính một lần: f[i] = f[i−1] + f[i−2].",
    idea: ["Tạo bảng f, f[i] là số Fibonacci thứ i.", "Điều kiện đầu: f[0] = 0, f[1] = 1.", "Tính lần lượt f[2], f[3], … mỗi ô bằng tổng hai ô liền trước.", "Mỗi giá trị chỉ tính một lần rồi dùng lại."],
    tip: "Nếu dùng đệ quy thuần, fib(40) phải tính hàng trăm triệu lần. Quy hoạch động chỉ cần 40 phép cộng.",
    code: ["def fib(n):", "    f = [0] * (n + 1)", "    f[1] = 1", "    for i in range(2, n + 1):", "        f[i] = f[i - 1] + f[i - 2]  # dùng lại hai kết quả trước", "    return f[n]"],
  },
  {
    key: "bfs", group: "graph", name: "Duyệt rộng BFS", en: "Breadth-First Search", viz: "graph", input: "graph", build: buildBfs, frontierLabel: "Hàng đợi (ra ở đầu, vào ở cuối)",
    defaults: { start: "A" }, time: "O(V + E)", space: "O(V)",
    desc: "Dùng hàng đợi để thăm các đỉnh theo từng lớp: đỉnh cách xuất phát 1 cạnh, rồi 2 cạnh, rồi 3 cạnh…",
    idea: ["Đánh dấu đỉnh xuất phát đã thăm và cho vào hàng đợi.", "Lấy đỉnh u ở đầu hàng đợi ra.", "Với mỗi đỉnh kề v chưa thăm: đánh dấu đã thăm, cho vào cuối hàng đợi.", "Lặp đến khi hàng đợi rỗng."],
    tip: "BFS tìm được đường đi ít cạnh nhất trong đồ thị không trọng số, như bài tìm đường trong mê cung.",
    code: ["from collections import deque", "def bfs(do_thi, bat_dau):", "    da_tham = {bat_dau}", "    hang_doi = deque([bat_dau])", "    while hang_doi:", "        u = hang_doi.popleft()  # lấy đỉnh ở đầu hàng", "        for v in do_thi[u]:  # các đỉnh kề của u", "            if v not in da_tham:", "                da_tham.add(v)", "                hang_doi.append(v)  # xếp vào cuối hàng"],
  },
  {
    key: "dfs", group: "graph", name: "Duyệt sâu DFS", en: "Depth-First Search", viz: "graph", input: "graph", build: buildDfs, frontierLabel: "Ngăn xếp lời gọi (đỉnh đang xét ở cuối)",
    defaults: { start: "A" }, time: "O(V + E)", space: "O(V)",
    desc: "Đi sâu theo một nhánh đến khi không còn đỉnh mới, rồi quay lui sang nhánh khác. Dùng đệ quy (ngăn xếp lời gọi).",
    idea: ["Vào đỉnh u: đánh dấu đã thăm.", "Với mỗi đỉnh kề v chưa thăm: gọi dfs(v) để đi sâu hơn.", "Hết đỉnh kề thì kết thúc hàm, tự động quay lui về đỉnh trước.", "Ngăn xếp lời gọi lưu đường đi từ đỉnh xuất phát đến đỉnh hiện tại."],
    tip: "Hay dùng để đếm số thành phần liên thông, kiểm tra chu trình, giải mê cung bằng quay lui.",
    code: ["def dfs(do_thi, u, da_tham):", "    da_tham.add(u)", "    for v in do_thi[u]:", "        if v not in da_tham:", "            dfs(do_thi, v, da_tham)  # đi sâu vào v"],
  },
];

function algoPrepare(algo, p) {
  const int = (v) => (/^-?\d+$/.test(String(v).trim()) ? Number(v) : NaN);
  const sorted = (l) => [...l].sort((a, b) => a - b);
  switch (algo.input) {
    case "array": { const r = algoParseNumbers(p.arr, { min: 2, max: 12 }); return r.error ? r : { args: { nums: r.value } }; }
    case "search": {
      const r = algoParseNumbers(p.arr, { min: 2, max: 14 }); if (r.error) return r;
      const x = int(p.x);
      if (!Number.isInteger(x) || x < 1 || x > 99) return { error: "Số cần tìm x là số nguyên từ 1 đến 99." };
      return { args: { nums: algo.key === "binary" ? sorted(r.value) : r.value, x } };
    }
    case "pair": {
      const r = algoParseNumbers(p.arr, { min: 2, max: 14 }); if (r.error) return r;
      const x = int(p.x);
      if (!(x >= 2 && x <= 198)) return { error: "Tổng cần tìm S là số nguyên từ 2 đến 198." };
      return { args: { nums: sorted(r.value), x } };
    }
    case "window": {
      const r = algoParseNumbers(p.arr, { min: 2, max: 14, lo: 1, hi: 20 }); if (r.error) return r;
      const x = int(p.x);
      if (!(x >= 1 && x <= 280)) return { error: "Tổng cần tìm S là số nguyên từ 1 đến 280." };
      return { args: { nums: r.value, x } };
    }
    case "dups": { const r = algoParseNumbers(p.arr, { min: 2, max: 14, lo: 1, hi: 99 }); return r.error ? r : { args: { nums: sorted(r.value) } }; }
    case "two": {
      const ra = algoParseNumbers(p.arr, { min: 1, max: 7 }); if (ra.error) return { error: `Mảng a: ${ra.error}` };
      const rb = algoParseNumbers(p.arr2, { min: 1, max: 7 }); if (rb.error) return { error: `Mảng b: ${rb.error}` };
      return { args: { a: sorted(ra.value), b: sorted(rb.value) } };
    }
    case "text": {
      const t = String(p.xau || "").trim();
      if (t.length < 2 || t.length > 14 || /\s/.test(t)) return { error: "Nhập xâu từ 2 đến 14 ký tự, không có dấu cách." };
      return { args: { xau: t } };
    }
    case "sieve": { const n = int(p.n); if (!(n >= 10 && n <= 100)) return { error: "Nhập n là số nguyên từ 10 đến 100." }; return { args: { n } }; }
    case "gcd": {
      const a = int(p.a); const b = int(p.b);
      if (!(a >= 1 && a <= 9999 && b >= 1 && b <= 9999)) return { error: "a và b là số nguyên từ 1 đến 9999." };
      return { args: { a, b } };
    }
    case "fib": { const n = int(p.fn); if (!(n >= 2 && n <= 20)) return { error: "Nhập n là số nguyên từ 2 đến 20." }; return { args: { n } }; }
    case "graph": { const s = String(p.start || "").trim().toUpperCase(); if (!ALGO_GRAPH[s]) return { error: "Chọn đỉnh xuất phát từ A đến H." }; return { args: { start: s } }; }
    default: return { error: "Thuật toán chưa hỗ trợ." };
  }
}

function algoRandomParams(algo, current) {
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const uniq = (k, lo = 3, hi = 95) => { const s = new Set(); while (s.size < k) s.add(rnd(lo, hi)); return [...s]; };
  const pickNot = (arr, lo, hi) => { let v = rnd(lo, hi); while (arr.includes(v)) v = rnd(lo, hi); return v; };
  switch (algo.input) {
    case "array": return { arr: uniq(algo.key === "merge" ? 8 : 7).join(", ") };
    case "search": {
      const arr = uniq(10); const hit = Math.random() < 0.75;
      return { arr: arr.join(", "), x: String(hit ? arr[rnd(0, arr.length - 1)] : pickNot(arr, 3, 95)) };
    }
    case "pair": {
      const arr = uniq(8, 2, 40).sort((a, b) => a - b); const hit = Math.random() < 0.8;
      let s; if (hit) { const i = rnd(0, 6); s = arr[i] + arr[rnd(i + 1, 7)]; } else s = rnd(4, 70);
      return { arr: arr.join(", "), x: String(s) };
    }
    case "window": {
      const arr = Array.from({ length: 9 }, () => rnd(1, 9)); const i = rnd(0, 5); const j = rnd(i + 1, 8);
      const s = arr.slice(i, j + 1).reduce((x, y) => x + y, 0);
      return { arr: arr.join(", "), x: String(Math.random() < 0.85 ? s : s + 1) };
    }
    case "dups": return { arr: Array.from({ length: 10 }, () => rnd(1, 6)).sort((a, b) => a - b).join(", ") };
    case "two": return { arr: uniq(rnd(4, 6), 1, 30).sort((a, b) => a - b).join(", "), arr2: uniq(rnd(3, 5), 1, 30).sort((a, b) => a - b).join(", ") };
    case "text": { const w = ["level", "radar", "abcba", "noon", "hello", "python", "civic", "12321", "kayak", "abcd", "tenet", "robot"]; return { xau: w[rnd(0, w.length - 1)] }; }
    case "sieve": return { n: String([30, 40, 50, 60, 70, 100][rnd(0, 5)]) };
    case "gcd": { const g = rnd(2, 12); return { a: String(g * rnd(3, 20)), b: String(g * rnd(3, 20)) }; }
    case "fib": return { fn: String(rnd(8, 16)) };
    case "graph": return { start: Object.keys(ALGO_GRAPH)[rnd(0, 7)] };
    default: return current;
  }
}
// </ALGO-CORE>

/* ---------- Giao diện mô phỏng ---------- */
function AlgoBars({ step }) {
  const arr = step.arr; const max = Math.max(...arr, 1);
  const inRange = (i) => !step.range || (i >= step.range[0] && i <= step.range[1]);
  return (
    <div className="nb-av-bars" role="img" aria-label="Biểu đồ cột thể hiện mảng">
      {step.key !== undefined && <div className="nb-av-keycard">can_chen = <b>{step.key}</b></div>}
      {arr.map((v, i) => {
        const c = ["nb-av-bar"];
        if (step.done) c.push("ok");
        else {
          if (step.sorted?.includes(i)) c.push("ok");
          if (step.okRange && i >= step.okRange[0] && i <= step.okRange[1]) c.push("ok");
          if (step.zone != null && i < step.zone) c.push("zone");
          if (step.cmp?.includes(i)) c.push("cmp");
          if (step.swap?.includes(i) || step.wrote === i) c.push("swap");
          if (step.min === i) c.push("min");
          if (step.keyAt === i) c.push("key");
          if (step.placed === i) c.push("placed");
          if (step.hole === i) c.push("hole");
          if (!inRange(i)) c.push("dim");
        }
        return (
          <div key={i} className={c.join(" ")}>
            <div className="nb-av-barwrap"><div className="nb-av-barfill" style={{ height: `${Math.max(7, (v / max) * 100)}%` }}><b>{v}</b></div></div>
            <small>{i}</small>
          </div>
        );
      })}
    </div>
  );
}

function AlgoMergeBuffer({ merge }) {
  if (!merge) return null;
  const row = (label, list, hot) => (
    <div className="nb-av-mrow"><span>{label}</span><div>{list.length === 0 ? <em>(trống)</em> : list.map((v, i) => <i key={i} className={i === 0 && hot ? "hot" : ""}>{v}</i>)}</div></div>
  );
  return (
    <div className="nb-av-merge">
      {row("Nửa trái còn lại", merge.L, merge.pick === "L")}
      {row("Nửa phải còn lại", merge.R, merge.pick === "R")}
      {row("Kết quả trộn", merge.out, false)}
    </div>
  );
}

function AlgoCells({ step }) {
  const arr = step.arr;
  const act = step.active;
  const cls = (i) => {
    if (step.found === i) return "found";
    if (step.roles?.[i]) return step.roles[i];
    if (act && (i < act[0] || i > act[1])) return "dim";
    if (step.mid === i) return "mid";
    return "";
  };
  const tagsOf = (i) => step.tags?.[i] || [];
  const maxTags = Math.max(1, ...arr.map((_, i) => tagsOf(i).length));
  return (
    <div className="nb-av-cells" role="img" aria-label="Các ô của mảng">
      {arr.map((v, i) => (
        <div key={i} className={`nb-av-cellcol ${cls(i)}`}>
          <div className="nb-av-ptr" style={{ minHeight: maxTags * 13 + 3 }}>{tagsOf(i).map((t) => <span key={t}>{t}</span>)}</div>
          <div className={`nb-av-cell ${v === null ? "empty" : ""}`}>{v === null ? "·" : v}</div>
          <small>{i}</small>
        </div>
      ))}
    </div>
  );
}

function AlgoRows({ step }) {
  return (
    <div className="nb-av-rows">
      {step.rows.map((r) => (
        <div key={r.label} className="nb-av-rowbox"><span className="nb-av-rowlbl">{r.label}</span><AlgoCells step={r} /></div>
      ))}
    </div>
  );
}

function AlgoSieve({ step }) {
  const g = step.grid;
  return (
    <div className="nb-av-sieve" role="img" aria-label="Bảng các số từ 0 đến n">
      {g.map((s, i) => {
        const c = ["nb-av-snum", s];
        if (step.done && s === "p") c.push("prime");
        if (step.cur === i) c.push("cur");
        if (step.mark === i) c.push("mark");
        return <div key={i} className={c.join(" ")}>{i}</div>;
      })}
    </div>
  );
}

function AlgoGcd({ step }) {
  return (
    <div className="nb-av-gcd">
      <div className="nb-av-gcd-main">
        <div className={`nb-av-gbox ${step.done ? "res" : ""}`}><small>a</small><b>{step.a}</b></div>
        <div className={`nb-av-gbox ${step.b === 0 ? "zero" : ""}`}><small>b</small><b>{step.b}</b></div>
        {step.calc && <div className="nb-av-gcalc">{step.a} mod {step.b} = <b>{step.r}</b></div>}
        {step.done && <div className="nb-av-gres">ƯCLN = <b>{step.result}</b></div>}
      </div>
      <div className="nb-av-ghist">
        <span>Các cặp (a, b) qua từng vòng lặp</span>
        <div>{step.hist.map((p, i) => <i key={i} className={i === step.hist.length - 1 ? "last" : ""}>({p[0]}, {p[1]})</i>)}</div>
      </div>
    </div>
  );
}

function AlgoGraph({ step, label }) {
  const cls = (n) => (step.cur === n ? "cur" : step.frontier.includes(n) ? "front" : step.visited.includes(n) ? "done" : "");
  const edgeOn = (a, b) => step.edge && ((step.edge[0] === a && step.edge[1] === b) || (step.edge[0] === b && step.edge[1] === a));
  return (
    <div className="nb-av-graphwrap">
      <svg viewBox="0 0 410 230" className="nb-av-graph" role="img" aria-label="Đồ thị 8 đỉnh">
        {ALGO_GRAPH_EDGES.map(([a, b]) => {
          const [x1, y1] = ALGO_GRAPH_POS[a]; const [x2, y2] = ALGO_GRAPH_POS[b];
          return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} className={`nb-av-edge ${edgeOn(a, b) ? (step.skip ? "skip" : "on") : ""}`} />;
        })}
        {Object.keys(ALGO_GRAPH).map((n) => {
          const [x, y] = ALGO_GRAPH_POS[n];
          return (
            <g key={n} className={`nb-av-node ${cls(n)}`}>
              <circle cx={x} cy={y} r="20" /><text x={x} y={y + 5} textAnchor="middle">{n}</text>
            </g>
          );
        })}
      </svg>
      <div className="nb-av-legend2"><span className="cur">đang xử lý</span><span className="front">đang chờ</span><span className="done">đã xong</span><span>chưa thăm</span></div>
      <div className="nb-av-lists">
        <div><span>{label}</span><div>{step.frontier.length === 0 ? <em>(rỗng)</em> : step.frontier.map((n, i) => <i key={i + n}>{n}</i>)}</div></div>
        <div><span>Thứ tự thăm</span><div>{step.order.length === 0 ? <em>(chưa có)</em> : step.order.map((n, i) => <i key={i + n} className="ord">{n}</i>)}</div></div>
      </div>
    </div>
  );
}

function AlgoCode({ code, active }) {
  return (
    <pre className="nb-av-code" aria-label="Mã Python">
      {code.map((ln, i) => (
        <div key={i} className={`nb-av-line ${i === active ? "on" : ""}`}>
          <span>{i + 1}</span><code>{ln === "" ? " " : highlightCodeLine(ln, "python")}</code>
        </div>
      ))}
    </pre>
  );
}

const ALGO_SPEEDS = [["Chậm", 1200], ["Vừa", 700], ["Nhanh", 330], ["Rất nhanh", 130]];

function AlgoVisualizerView() {
  const initKey = (() => { const k = lsGet("algo-last"); return ALGOS.some((a) => a.key === k) ? k : "bubble"; })();
  const [algoKey, setAlgoKey] = useState(initKey);
  const algo = ALGOS.find((a) => a.key === algoKey) || ALGOS[0];
  const [params, setParams] = useState(algo.defaults);
  const [applied, setApplied] = useState(() => algoPrepare(algo, algo.defaults));
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const steps = useMemo(() => (applied.args ? algo.build(applied.args) : []), [algo, applied]);
  const last = Math.max(0, steps.length - 1);
  const step = steps[Math.min(idx, last)] || null;
  const atEnd = idx >= last;

  useEffect(() => {
    if (!playing) return undefined;
    if (idx >= last) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, last)), speed);
    return () => clearTimeout(t);
  }, [playing, idx, speed, last]);

  function loadParams(a, p) {
    setParams(p);
    const r = algoPrepare(a, p);
    if (r.error) { setError(r.error); return; }
    setError(""); setApplied(r); setIdx(0); setPlaying(false);
  }
  function pickAlgo(k) {
    const a = ALGOS.find((x) => x.key === k); if (!a) return;
    setAlgoKey(k); lsSet("algo-last", k);
    loadParams(a, a.defaults);
  }
  const run = () => loadParams(algo, params);
  const randomize = () => loadParams(algo, algoRandomParams(algo, params));
  const setP = (key, value) => setParams((p) => ({ ...p, [key]: value }));
  const go = (n) => { setPlaying(false); setIdx(Math.max(0, Math.min(last, n))); };
  const togglePlay = () => { if (atEnd) { setIdx(0); setPlaying(true); } else setPlaying((v) => !v); };
  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(last);
  };
  const onEnter = (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } };
  const vars = step?.vars ? Object.entries(step.vars) : [];
  const done = !!step?.done;

  const inputs = (() => {
    const f = (key, label, w) => (<label className="nb-av-field" key={key} style={w ? { maxWidth: w } : undefined}><span>{label}</span><input value={params[key] ?? ""} onChange={(e) => setP(key, e.target.value)} onKeyDown={onEnter} inputMode={key === "arr" ? "text" : "numeric"} /></label>);
    switch (algo.input) {
      case "array": return [f("arr", "Dãy số (cách nhau bằng dấu phẩy, tối đa 12 số)")];
      case "search": return [f("arr", `Dãy số (tối đa 14 số${algo.key === "binary" ? ", sẽ tự sắp xếp tăng dần" : ""})`), f("x", "Số cần tìm x", 130)];
      case "pair": return [f("arr", "Dãy số (tối đa 14 số, sẽ tự sắp xếp tăng dần)"), f("x", "Tổng cần tìm S", 150)];
      case "window": return [f("arr", "Dãy số dương (1 đến 20, tối đa 14 số)"), f("x", "Tổng cần tìm S", 150)];
      case "dups": return [f("arr", "Dãy số (tối đa 14 số, sẽ tự sắp xếp tăng dần)")];
      case "two": return [f("arr", "Mảng a (tối đa 7 số, tự sắp xếp)"), f("arr2", "Mảng b (tối đa 7 số, tự sắp xếp)")];
      case "text": return [f("xau", "Xâu ký tự (2 đến 14 ký tự, không có dấu cách)", 340)];
      case "sieve": return [f("n", "n (10 đến 100)", 160)];
      case "gcd": return [f("a", "a (1–9999)", 150), f("b", "b (1–9999)", 150)];
      case "fib": return [f("fn", "n (2 đến 20)", 160)];
      case "graph": return [(
        <label className="nb-av-field" key="start" style={{ maxWidth: 170 }}><span>Đỉnh xuất phát</span>
          <select value={params.start} onChange={(e) => loadParams(algo, { ...params, start: e.target.value })}>{Object.keys(ALGO_GRAPH).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>)];
      default: return [];
    }
  })();

  return (
    <div className="nb-av" tabIndex={-1} onKeyDown={onKey}>
      <header className="nb-av-hero">
        <div>
          <span className="nb-tg-hero-tag"><Code2 size={14} /> Giải trí · Mô phỏng thuật toán</span>
          <h2>Xem thuật toán chạy từng bước</h2>
          <p>Chọn một thuật toán, bấm chạy và theo dõi từng dòng code, từng biến thay đổi. Em có thể lùi lại bất cứ lúc nào để xem kỹ.</p>
        </div>
        <div className="nb-av-hero-count"><strong>{ALGOS.length}</strong><span>thuật toán</span></div>
      </header>

      <div className="nb-av-layout">
        <nav className="nb-av-side" aria-label="Danh sách thuật toán">
          {ALGO_GROUPS.map((g) => (
            <div key={g.key} className="nb-av-group">
              <h4>{g.label}<small>{g.hint}</small></h4>
              {ALGOS.filter((a) => a.group === g.key).map((a) => (
                <button key={a.key} type="button" className={a.key === algoKey ? "on" : ""} onClick={() => pickAlgo(a.key)}>
                  <strong>{a.name}</strong><small>{a.time}</small>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="nb-av-main">
          <section className="nb-av-card nb-av-info">
            <div className="nb-av-info-top">
              <div><h3>{algo.name}</h3><span>{algo.en}</span></div>
              <div className="nb-av-badges"><i title="Độ phức tạp thời gian">Thời gian {algo.time}</i><i title="Bộ nhớ phụ">Bộ nhớ {algo.space}</i></div>
            </div>
            <p>{algo.desc}</p>
            <div className="nb-av-tip">
              <b>Ghi nhớ · Cách hoạt động</b>
              <ol>{algo.idea.map((t, k) => <li key={k}>{t}</li>)}</ol>
              <p><b>Lưu ý:</b> {algo.tip}</p>
            </div>
          </section>

          <section className="nb-av-card nb-av-inputs">
            <div className="nb-av-input-row">{inputs}</div>
            <div className="nb-av-input-actions">
              {algo.input !== "graph" && <button type="button" className="nb-btn nb-btn-primary" onClick={run}><Play size={15} /> Chạy mô phỏng</button>}
              <button type="button" className="nb-btn" onClick={randomize}><RefreshCw size={15} /> Dữ liệu ngẫu nhiên</button>
            </div>
            {error && <div className="nb-login-error" role="alert"><AlertCircle size={14} /> {error}</div>}
          </section>

          {step && (
            <div className="nb-av-work">
              <section className="nb-av-card nb-av-stage-card">
                <div className="nb-av-stage">
                  {algo.viz === "bars" && <><AlgoBars step={step} />{algo.key === "merge" && <AlgoMergeBuffer merge={step.merge} />}</>}
                  {algo.viz === "cells" && <AlgoCells step={step} />}
                  {algo.viz === "rows" && <AlgoRows step={step} />}
                  {algo.viz === "sieve" && <AlgoSieve step={step} />}
                  {algo.viz === "gcd" && <AlgoGcd step={step} />}
                  {algo.viz === "graph" && <AlgoGraph step={step} label={algo.frontierLabel} />}
                </div>
                <div className={`nb-av-note ${done ? "done" : ""}`} aria-live="polite">
                  <span>Bước {Math.min(idx, last) + 1}/{steps.length}</span>
                  <p>{step.note}</p>
                </div>
                {vars.length > 0 && <div className="nb-av-vars">{vars.map(([k, v]) => <span key={k}><em>{k}</em> = <b>{String(v)}</b></span>)}</div>}
                <div className="nb-av-controls">
                  <button type="button" className="nb-av-ctl" onClick={() => go(0)} disabled={idx === 0} aria-label="Về đầu" title="Về đầu"><SkipBack size={16} /></button>
                  <button type="button" className="nb-av-ctl" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Lùi một bước" title="Lùi một bước (←)"><ChevronLeft size={18} /></button>
                  <button type="button" className="nb-av-ctl play" onClick={togglePlay} aria-label={playing ? "Tạm dừng" : atEnd ? "Chạy lại" : "Tự chạy"} title="Tự chạy (phím cách)">{playing ? <Pause size={18} /> : atEnd ? <RefreshCw size={17} /> : <Play size={18} />}</button>
                  <button type="button" className="nb-av-ctl" onClick={() => go(idx + 1)} disabled={atEnd} aria-label="Tiến một bước" title="Tiến một bước (→)"><ChevronRight size={18} /></button>
                  <button type="button" className="nb-av-ctl" onClick={() => go(last)} disabled={atEnd} aria-label="Đến cuối" title="Đến cuối"><SkipForward size={16} /></button>
                  <input className="nb-av-range" type="range" min={0} max={last} value={Math.min(idx, last)} onChange={(e) => go(Number(e.target.value))} aria-label="Tiến độ" />
                  <select className="nb-av-speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Tốc độ">{ALGO_SPEEDS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
              </section>
              <section className="nb-av-card nb-av-code-card">
                <h4>Code Python</h4>
                <AlgoCode code={algo.code} active={step.line} />
                <p className="nb-av-hint">Dòng sáng là dòng đang chạy. Phím ← → để lùi/tiến, phím cách để chạy.</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntertainmentView({ currentUser }) {
  const [sub, setSub] = useState(() => (lsGet("fun-tab") === "algo" ? "algo" : "typing"));
  const pick = (k) => { setSub(k); lsSet("fun-tab", k); };
  return (
    <div className={`nb-fun ${sub}`}>
      <div className="nb-fun-tabs" role="tablist" aria-label="Mục giải trí">
        <button type="button" role="tab" aria-selected={sub === "typing"} className={sub === "typing" ? "on" : ""} onClick={() => pick("typing")}><Keyboard size={16} /> Gõ lệnh Python</button>
        <button type="button" role="tab" aria-selected={sub === "algo"} className={sub === "algo" ? "on" : ""} onClick={() => pick("algo")}><Code2 size={16} /> Mô phỏng thuật toán <i>Mới</i></button>
      </div>
      {sub === "typing" ? <TypingGameView currentUser={currentUser} /> : <AlgoVisualizerView />}
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
  { key: "typing", label: "Giải trí", shortLabel: "Giải trí", icon: Keyboard },
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
      // Nếu máy chủ không phản hồi (quá tải băng thông, dự án tạm dừng, mạng chậm) thì báo lỗi thay vì treo mãi ở "Đang tải"
      const data = await Promise.race([fetchAll(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 40000))]);
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

  // Nhận xét của giáo viên dành cho học sinh đang đăng nhập (bảng nhỏ, chỉ đọc các dòng của chính em)
  const [myFeedback, setMyFeedback] = useState([]);
  const myFeedbackRef = useRef([]);
  useEffect(() => { myFeedbackRef.current = myFeedback; }, [myFeedback]);
  const loadMyFeedback = useCallback(async () => {
    if (!currentUser || isTeacher) return;
    try {
      const rows = await dbFetchFeedbackForStudent(currentUser.id);
      if (rows) setMyFeedback(rows);
    } catch (e) { /* mạng chập chờn: lượt sau thử lại */ }
  }, [currentUser?.id, isTeacher]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentUser || isTeacher) { setMyFeedback([]); return undefined; }
    loadMyFeedback();
    const timer = setInterval(() => { if (!document.hidden) loadMyFeedback(); }, 120000);
    const onVisible = () => { if (document.visibilityState === "visible") loadMyFeedback(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [currentUser?.id, isTeacher, loadMyFeedback]); // eslint-disable-line react-hooks/exhaustive-deps
  const markFeedbackSeen = useCallback((ids) => {
    const fresh = ids.filter((id) => myFeedbackRef.current.some((f) => f.submissionId === id && !f.seenAt));
    if (!fresh.length) return;
    const stamp = new Date().toISOString();
    setMyFeedback((prev) => prev.map((f) => (fresh.includes(f.submissionId) ? { ...f, seenAt: stamp } : f)));
    dbMarkFeedbackSeen(fresh).catch(() => {});
  }, []);

  // Giáo viên: biết em nào đã nộp lại sau khi được nhận xét (chỉ tải 4 cột nhẹ, các lần sau chỉ tải phần mới)
  const [fbIndex, setFbIndex] = useState([]);
  const fbIndexSince = useRef(null);
  const [fbAck, setFbAck] = useState(readFbAck);
  const loadFbIndex = useCallback(async () => {
    if (!currentUser || !isTeacher) return;
    try {
      const rows = await dbFetchFeedbackIndex(fbIndexSince.current);
      if (!rows || rows.length === 0) return;
      setFbIndex((prev) => { const m = new Map(prev.map((r) => [r.submissionId, r])); rows.forEach((r) => m.set(r.submissionId, r)); return [...m.values()]; });
      fbIndexSince.current = rows.reduce((mx, r) => (r.updatedAt > mx ? r.updatedAt : mx), fbIndexSince.current || "");
    } catch (e) { /* lượt sau thử lại */ }
  }, [currentUser?.id, isTeacher]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentUser || !isTeacher) { setFbIndex([]); fbIndexSince.current = null; return undefined; }
    loadFbIndex();
    const timer = setInterval(() => { if (!document.hidden) loadFbIndex(); }, 150000);
    const onVisible = () => { if (document.visibilityState === "visible") loadFbIndex(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [currentUser?.id, isTeacher, loadFbIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const ackFollowUp = useCallback((studentId, problemId, latestSubId) => {
    setFbAck((prev) => { const k = `${studentId}:${problemId}`; if (prev[k] === latestSubId) return prev; const next = { ...prev, [k]: latestSubId }; writeFbAck(next); return next; });
  }, []);
  const noteFeedbackSaved = useCallback((fb) => {
    setFbIndex((prev) => { const m = new Map(prev.map((r) => [r.submissionId, r])); m.set(fb.submissionId, { submissionId: fb.submissionId, studentId: fb.studentId, problemId: fb.problemId, createdAt: fb.createdAt || m.get(fb.submissionId)?.createdAt || fb.updatedAt, updatedAt: fb.updatedAt }); return [...m.values()]; });
    if (fb.updatedAt && (!fbIndexSince.current || fb.updatedAt > fbIndexSince.current)) fbIndexSince.current = fb.updatedAt;
  }, []);
  const noteFeedbackDeleted = useCallback((submissionId) => setFbIndex((prev) => prev.filter((r) => r.submissionId !== submissionId)), []);
  const followData = useMemo(() => {
    const out = { list: [], subIds: new Set(), bySub: new Map() };
    if (!isTeacher || fbIndex.length === 0) return out;
    const latestFb = new Map();
    fbIndex.forEach((f) => { const k = `${f.studentId}:${f.problemId}`; const c = latestFb.get(k); if (!c || new Date(f.updatedAt) > new Date(c.updatedAt)) latestFb.set(k, f); });
    const subsByKey = new Map();
    submissions.forEach((x) => { const k = `${x.studentId}:${x.problemId}`; if (!latestFb.has(k)) return; if (!subsByKey.has(k)) subsByKey.set(k, []); subsByKey.get(k).push(x); });
    latestFb.forEach((fb, k) => {
      const t = new Date(fb.updatedAt).getTime();
      const later = (subsByKey.get(k) || []).filter((x) => new Date(x.createdAt || 0).getTime() > t).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (later.length === 0) return;
      const item = { key: k, studentId: fb.studentId, problemId: fb.problemId, feedbackSubmissionId: fb.submissionId, feedbackAt: fb.updatedAt, latest: later[0], count: later.length, acked: fbAck[k] === later[0].id };
      later.forEach((x) => { out.subIds.add(x.id); out.bySub.set(x.id, item); });
      out.list.push(item);
    });
    out.list.sort((a, b) => new Date(b.latest.createdAt || 0) - new Date(a.latest.createdAt || 0));
    return out;
  }, [isTeacher, fbIndex, submissions, fbAck]);
  const followList = useMemo(() => followData.list.filter((f) => !f.acked), [followData]);
  const feedbackCtx = useMemo(() => ({
    role: isTeacher ? "teacher" : "student", teacherName: currentUser?.name || "",
    byId: new Map(myFeedback.map((f) => [f.submissionId, f])), list: myFeedback,
    unseenCount: myFeedback.filter((f) => !f.seenAt).length, markSeen: markFeedbackSeen, refresh: loadMyFeedback,
    followList, followSubIds: followData.subIds, followBySub: followData.bySub, followCount: followList.length, ackFollowUp,
    badgeCount: isTeacher ? followList.length : myFeedback.filter((f) => !f.seenAt).length,
    noteFeedbackSaved, noteFeedbackDeleted, fbIndex,
  }), [isTeacher, currentUser?.name, myFeedback, markFeedbackSeen, loadMyFeedback, followList, followData, ackFollowUp, noteFeedbackSaved, noteFeedbackDeleted, fbIndex]);

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
    <FeedbackContext.Provider value={feedbackCtx}>
    <div className="nb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Inconsolata:wght@400;500;700&display=swap');

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
        /* ---- Tổng quan ---- */
        .nb-ov { --ov-shadow: 0 1px 2px rgba(16,42,67,.04), 0 10px 28px -14px rgba(16,42,67,.14); --ov-line: #E3EEF1; display: flex; flex-direction: column; gap: 18px; }
        .nb-ov > * { animation: nbOvIn .45s ease both; }
        .nb-ov > *:nth-child(2) { animation-delay: .04s; } .nb-ov > *:nth-child(3) { animation-delay: .08s; } .nb-ov > *:nth-child(4) { animation-delay: .12s; } .nb-ov > *:nth-child(5) { animation-delay: .16s; }
        @keyframes nbOvIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .nb-ov > * { animation: none; } }
        .nb-ov-head { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; padding: 24px 28px; border-radius: 20px; overflow: hidden; border: 1px solid var(--ov-line); background: linear-gradient(120deg, #EAF7FA 0%, #F7FCFD 55%, #FFFFFF 100%); box-shadow: var(--ov-shadow); }
        .nb-ov-head::before { content: ""; position: absolute; right: -60px; top: -90px; width: 300px; height: 300px; border-radius: 50%; background: radial-gradient(circle, rgba(4,166,199,.16), rgba(4,166,199,0) 68%); pointer-events: none; }
        .nb-ov-head::after { content: ""; position: absolute; right: 140px; bottom: -110px; width: 220px; height: 220px; border-radius: 50%; background: radial-gradient(circle, rgba(46,158,109,.10), rgba(46,158,109,0) 70%); pointer-events: none; }
        .nb-ov-head > * { position: relative; z-index: 1; }
        .nb-ov-date { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 8px; padding: 3px 11px; border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: .02em; color: #0A7389; background: rgba(4,166,199,.1); text-transform: capitalize; }
        .nb-ov-head h1 { margin: 0; font-size: 27px; font-weight: 800; letter-spacing: -.025em; color: var(--ink); line-height: 1.2; }
        .nb-ov-head p { margin: 6px 0 0; font-size: 14px; color: #52677A; } .nb-ov-head p b { color: var(--ink); font-weight: 700; }
        .nb-ov-head-actions, .nb-ov-head-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .nb-ov-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700; background: #fff; border: 1px solid var(--ov-line); box-shadow: 0 1px 2px rgba(16,42,67,.04); }
        .nb-ov-chip.gold { color: #8a5a00; } .nb-ov-chip.red { color: #a12b2b; }

        .nb-ov-todo { padding: 6px 8px 8px; border-radius: 18px; background: #fff; border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); }
        .nb-ov-todo > header { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; font-size: 13px; color: var(--ink); }
        .nb-ov-count { display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; font-size: 11.5px; font-weight: 800; color: #fff; background: var(--red-pen); }
        .nb-ov-todo-rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 4px; }
        .nb-ov-todo-ok { display: flex; align-items: center; gap: 10px; margin: 2px 4px 4px; padding: 12px 14px; border-radius: 12px; background: #F0FAF5; color: #0B5A38; font-size: 13.5px; font-weight: 600; }
        .nb-ov-todo-row { position: relative; display: flex; align-items: center; gap: 12px; padding: 11px 12px 11px 16px; text-align: left; font: inherit; color: var(--ink); cursor: pointer; border: 0; border-radius: 12px; background: transparent; transition: background .15s; }
        .nb-ov-todo-row::before { content: ""; position: absolute; left: 4px; top: 12px; bottom: 12px; width: 3px; border-radius: 3px; background: currentColor; opacity: .85; }
        .nb-ov-todo-row.red { color: var(--red-pen); } .nb-ov-todo-row.green { color: var(--ac-green); } .nb-ov-todo-row.gold { color: var(--gold); }
        .nb-ov-todo-row:hover { background: #F4FAFB; }
        .nb-ov-todo-icon { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, currentColor 11%, #fff); }
        .nb-ov-todo-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; color: var(--ink); }
        .nb-ov-todo-text strong { font-size: 13.5px; } .nb-ov-todo-text small { font-size: 12px; color: #6B7F90; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-ov-todo-row > svg:last-child { color: #9FB2BF; flex: none; }

        .nb-ov-focus { display: flex; align-items: center; gap: 16px; padding: 18px 20px; border-radius: 18px; background: #fff; border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); }
        .nb-ov-focus.live { background: linear-gradient(120deg, #EDF9F3, #FFFFFF 70%); border-color: #CBEBDC; }
        .nb-ov-focus-icon { flex: none; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: #E5F5F9; color: var(--pen-blue); }
        .nb-ov-focus.live .nb-ov-focus-icon { background: #DDF3E8; }
        .nb-ov-focus-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .nb-ov-focus-text small { font-size: 11px; font-weight: 800; color: #0A7389; text-transform: uppercase; letter-spacing: .07em; }
        .nb-ov-focus.live .nb-ov-focus-text small { color: #1B7A52; }
        .nb-ov-focus-text strong { font-size: 16.5px; letter-spacing: -.01em; }
        .nb-ov-focus-text span { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 12.5px; color: #6B7F90; }

        .nb-ov-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-radius: 18px; background: #fff; border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); overflow: hidden; }
        .nb-ov-kpi { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 20px 22px; min-width: 0; position: relative; }
        .nb-ov-kpi + .nb-ov-kpi::before { content: ""; position: absolute; left: 0; top: 22px; bottom: 22px; width: 1px; background: var(--ov-line); }
        .nb-ov-kpi-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .nb-ov-kpi-main small { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #6B7F90; }
        .nb-ov-kpi-main strong { font-size: 30px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; color: var(--ink); font-variant-numeric: tabular-nums; }
        .nb-ov-kpi-main > span { font-size: 12px; color: #6B7F90; }
        .nb-ov-kpi-main em { margin-left: 6px; font-style: normal; font-weight: 700; } .nb-ov-kpi-main em.up { color: var(--ac-green); } .nb-ov-kpi-main em.down { color: var(--red-pen); }
        .nb-ov-ring { flex: none; width: 52px; height: 52px; transform: rotate(-90deg); }
        .nb-ov-ring circle { fill: none; stroke-width: 4.5; stroke-linecap: round; }
        .nb-ov-ring .bg { stroke: #E8F0F3; } .nb-ov-ring .fg { stroke: var(--pen-blue); transition: stroke-dashoffset .8s ease; }
        .nb-ov-ring.green .fg { stroke: var(--ac-green); } .nb-ov-ring.gold .fg { stroke: var(--gold); }
        .nb-ov-ring text { transform: rotate(90deg); transform-origin: 22px 22px; font: 800 11px 'Be Vietnam Pro', sans-serif; fill: var(--ink); stroke: none; }
        .nb-ov-spark { flex: none; width: 72px; height: 34px; overflow: visible; }
        .nb-ov-spark .line { fill: none; stroke: #2F6FB0; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .nb-ov-spark .area { fill: rgba(47,111,176,.10); stroke: none; } .nb-ov-spark .dot { fill: #2F6FB0; }

        .nb-ov-grid { display: grid; gap: 18px; align-items: start; }
        .nb-ov-grid.main { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
        .nb-goal { display: flex; align-items: center; gap: 18px; padding: 20px 22px; border-radius: 18px; background: #fff; border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); position: relative; overflow: hidden; }
        .nb-goal::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: #2f6fed; }
        .nb-goal.start::before { background: #e0a020; } .nb-goal.warn::before { background: #e5603c; } .nb-goal.done::before { background: #1f9d6b; }
        .nb-goal.done { background: linear-gradient(100deg, #f0faf5 0%, #fff 60%); }
        .nb-goal.warn { background: linear-gradient(100deg, #fff6f2 0%, #fff 60%); }
        .nb-goal.start { background: linear-gradient(100deg, #fffaf0 0%, #fff 60%); }
        .nb-goal-icon { flex: none; width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: #e8f0ff; color: #2f6fed; }
        .nb-goal.start .nb-goal-icon { background: #fdf1d6; color: #b9770e; } .nb-goal.warn .nb-goal-icon { background: #ffe5dc; color: #d2491f; } .nb-goal.done .nb-goal-icon { background: #d9f3e7; color: #1f9d6b; }
        .nb-goal-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .nb-goal-main small { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; color: #6b7a90; }
        .nb-goal-main > strong { font-size: 17px; color: #102a43; line-height: 1.35; }
        .nb-goal-main > span { font-size: 13.5px; color: #52606d; }
        .nb-goal-steps { display: flex; align-items: center; gap: 5px; margin-top: 6px; flex-wrap: wrap; }
        .nb-goal-steps i { width: 30px; height: 9px; border-radius: 999px; background: #e3e8ef; }
        .nb-goal-steps i.on { background: #2f6fed; } .nb-goal.done .nb-goal-steps i.on { background: #1f9d6b; } .nb-goal.warn .nb-goal-steps i.on { background: #e5603c; }
        .nb-goal-steps b { margin-left: 6px; font-size: 13px; color: #102a43; font-family: var(--code-font, monospace); }
        .nb-goal-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; margin-top: 8px; font-size: 12.5px; color: #6b7a90; }
        .nb-goal-foot > span { display: inline-flex; align-items: center; gap: 6px; }
        .nb-goal-pick button { border: 1px solid #d5dce6; background: #fff; border-radius: 8px; padding: 1px 9px; font-weight: 700; color: #52606d; cursor: pointer; font-size: 12.5px; }
        .nb-goal-pick button.active { background: #102a43; color: #fff; border-color: #102a43; }
        .nb-goal > .nb-btn { flex: none; }
        .nb-ov-tag.ok { background: #d9f3e7; color: #137a52; }
        @media (max-width: 760px) { .nb-goal { flex-wrap: wrap; padding: 16px; } .nb-goal > .nb-btn { width: 100%; justify-content: center; } .nb-goal-steps i { width: 22px; } }
        .nb-goal-strip-wrap { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin-top: 10px; }
        .nb-goal-strip { display: flex; gap: 6px; }
        .nb-gs { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .nb-gs em { font-style: normal; font-size: 10.5px; font-weight: 700; color: #8795a8; }
        .nb-gs b { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-size: 12.5px; font-weight: 800; background: #eef1f6; color: #9aa6b8; }
        .nb-gs.ok b { background: #1f9d6b; color: #fff; } .nb-gs.part b { background: #fdeccb; color: #b9770e; }
        .nb-gs.today b { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #2f6fed; } .nb-gs.today em { color: #2f6fed; }
        .nb-goal-streak { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: #52606d; } .nb-goal-streak svg { color: #e5603c; } .nb-goal-streak b { font-size: 16px; color: #102a43; }
        .nb-badge .nb-medal:not(.has-img) { margin: 4px 0 10px; }
        .nb-medal.has-img .nb-medal-face { width: 100%; height: 100%; background: none !important; box-shadow: none !important; }
        .nb-medal.has-img img { width: 100%; height: 100%; object-fit: contain; display: block; user-select: none; }
        .nb-badge.earned .nb-medal.has-img { background: none; box-shadow: none; width: 80px; height: 80px; } .nb-badge.earned .nb-medal.has-img img { filter: drop-shadow(0 6px 10px var(--cs)); }
        .nb-badge.locked .nb-medal.has-img { background: conic-gradient(var(--c2) var(--p), #e6ebf2 0); padding: 5px; width: 80px; height: 80px; border-radius: 50%; }
        .nb-badge.locked .nb-medal.has-img .nb-medal-face { background: #fff !important; border-radius: 50%; padding: 7px; box-sizing: border-box; }
        .nb-badge.locked .nb-medal.has-img img { filter: grayscale(1) opacity(.45); }
        .nb-medal-lock { position: absolute; right: -2px; bottom: -2px; z-index: 2; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #7b8aa0; box-shadow: 0 1px 4px rgba(16,42,67,.25); }
        .nb-badge-next { display: flex; align-items: center; gap: 7px; margin: -2px 0 14px; padding: 9px 12px; border-radius: 10px; background: #f3f7ff; color: #3b4f6b; font-size: 13px; } .nb-badge-next svg { color: #2f6fed; flex: none; } .nb-badge-next b { color: #102a43; }
        .nb-badges { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
        .nb-badge { --c1: #5aa7ff; --c2: #2f6fed; --cs: rgba(47,111,237,.35); --ct: #eaf2ff; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 18px 12px 14px; border-radius: 16px; border: 1px solid #e6ebf2; background: #fff; transition: transform .18s ease, box-shadow .18s ease; }
        .nb-badge.t-sky { --c1: #6cc4ff; --c2: #2f8fe8; --cs: rgba(47,143,232,.38); --ct: #eaf6ff; }
        .nb-badge.t-emerald { --c1: #4fd6a0; --c2: #1f9d6b; --cs: rgba(31,157,107,.36); --ct: #e8f8f0; }
        .nb-badge.t-amber { --c1: #ffb347; --c2: #e5762c; --cs: rgba(229,118,44,.36); --ct: #fff1e3; }
        .nb-badge.t-violet { --c1: #a78bfa; --c2: #6d4bd8; --cs: rgba(109,75,216,.34); --ct: #f1ecff; }
        .nb-badge.t-rose { --c1: #ff7f9a; --c2: #d9365b; --cs: rgba(217,54,91,.34); --ct: #ffeaf0; }
        .nb-badge.t-gold { --c1: #ffd45e; --c2: #d9961a; --cs: rgba(217,150,26,.4); --ct: #fff6dc; }
        .nb-badge.t-teal { --c1: #4fd1d9; --c2: #158a98; --cs: rgba(21,138,152,.34); --ct: #e4f7f9; }
        .nb-medal { position: relative; width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 6px; }
        .nb-medal-face { width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; z-index: 1; }
        .nb-badge.earned .nb-medal { background: linear-gradient(145deg, var(--c1), var(--c2)); box-shadow: 0 6px 16px var(--cs), inset 0 1px 0 rgba(255,255,255,.55); }
        .nb-badge.earned .nb-medal-face { color: #fff; background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.28), rgba(255,255,255,0) 60%), linear-gradient(145deg, var(--c1), var(--c2)); box-shadow: inset 0 0 0 2px rgba(255,255,255,.5); }
        .nb-badge.earned .nb-medal-face svg { filter: drop-shadow(0 1px 1px rgba(0,0,0,.25)); }
        .nb-badge.earned { background: linear-gradient(180deg, var(--ct) 0%, #fff 62%); border-color: color-mix(in srgb, var(--c2) 28%, #fff); }
        .nb-badge.earned:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(16,42,67,.1); }
        .nb-medal-check { position: absolute; right: -2px; bottom: -2px; z-index: 2; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: var(--c2); box-shadow: 0 1px 4px rgba(16,42,67,.25); }
        .nb-badge.locked .nb-medal { background: conic-gradient(var(--c2) var(--p), #e6ebf2 0); }
        .nb-badge.locked .nb-medal-face { background: #f4f6fa; color: #a3afc0; width: 62px; height: 62px; box-shadow: inset 0 0 0 1px #e6ebf2; }
        .nb-badge strong { font-size: 14px; color: #102a43; } .nb-badge.locked strong { color: #52606d; }
        .nb-badge small { font-size: 11.5px; color: #7b8aa0; line-height: 1.35; min-height: 31px; }
        .nb-badge-state { margin-top: 6px; padding: 3px 11px; border-radius: 999px; font-size: 11.5px; font-weight: 800; letter-spacing: .01em; }
        .nb-badge.earned .nb-badge-state { background: var(--c2); color: #fff; }
        .nb-badge.locked .nb-badge-state { background: #eef1f6; color: #66748a; font-family: var(--code-font, monospace); }
        .nb-badge-note { margin: 14px 0 0; font-size: 12.5px; color: #7b8aa0; } .nb-badge-note b { color: #102a43; }
        .nb-gt { display: flex; flex-direction: column; gap: 10px; }
        .nb-gt > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .nb-gt > header h2 { margin: 3px 0 0; font-size: 17px; } .nb-gt > header h2 b { color: #1f9d6b; font-size: 19px; }
        .nb-gt-progress { display: flex; height: 6px; border-radius: 999px; background: #eef1f6; overflow: hidden; }
        .nb-gt-progress i { display: block; background: #1f9d6b; transition: width .4s; } .nb-gt-progress i.part { background: #f3c15f; }
        .nb-gt-tools { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .nb-gt-tiles { display: flex; gap: 6px; flex-wrap: wrap; }
        .nb-gt-tile { display: inline-flex; align-items: baseline; gap: 6px; padding: 5px 12px; border-radius: 10px; border: 1px solid #e1e7f0; background: #fff; cursor: pointer; font: inherit; color: #52667a; transition: all .15s; }
        .nb-gt-tile b { font-size: 15px; color: #102a43; } .nb-gt-tile span { font-size: 12.5px; font-weight: 600; }
        .nb-gt-tile:hover { border-color: #b8c4d6; }
        .nb-gt-tile.on { background: #102a43; border-color: #102a43; color: #d9e2ec; } .nb-gt-tile.on b { color: #fff; }
        .nb-gt-tile.ok:not(.on) b { color: #1f9d6b; } .nb-gt-tile.part:not(.on) b { color: #b9770e; } .nb-gt-tile.none:not(.on) b { color: #c8391a; }
        .nb-gt-right { display: flex; gap: 8px; align-items: center; }
        .nb-gt-search { display: flex; align-items: center; gap: 6px; border: 1px solid #d9e1ec; border-radius: 10px; padding: 5px 9px; background: #fff; color: #829ab1; }
        .nb-gt-search input { border: 0; outline: 0; font: inherit; font-size: 13px; width: 110px; color: #102a43; background: transparent; }
        .nb-gt .nb-gt-sort { width: auto; flex: none; padding: 5px 10px; font-size: 13px; border-radius: 10px; }
        .nb-gt-scroll { overflow-x: auto; border: 1px solid #edf0f6; border-radius: 12px; }
        .nb-gt-table { width: 100%; border-collapse: collapse; min-width: 600px; }
        .nb-gt-table th { font-size: 11.5px; color: #7b8aa0; font-weight: 700; text-align: center; padding: 6px 3px; background: #f8fafc; border-bottom: 1px solid #e6ebf2; line-height: 1.2; } .nb-gt-table th:first-child { text-align: left; padding-left: 12px; }
        .nb-gt-table th small { display: block; font-weight: 500; font-size: 10px; color: #a0abbb; } .nb-gt-table th.today { color: #2f6fed; background: #eaf1ff; }
        .nb-gt-table td { padding: 2px 2px; text-align: center; border-bottom: 1px solid #f3f5f9; height: 30px; }
        .nb-gt-table td.today { background: #f3f7ff; } .nb-gt-table td:first-child { padding-left: 12px; }
        .nb-gt-table tbody tr:hover td { background: #f7f9fc; } .nb-gt-table tbody tr:hover td.today { background: #ebf2ff; }
        .nb-gt-table tr.done .nb-gt-name span { color: #137a52; }
        .nb-gt-name { display: flex; align-items: center; gap: 8px; text-align: left; font-size: 13px; font-weight: 600; color: #102a43; } .nb-gt-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
        .nb-gt-cell { display: inline-grid; place-items: center; width: 30px; height: 18px; border-radius: 6px; font-size: 11.5px; font-weight: 700; font-style: normal; line-height: 1; background: #f1f4f8; color: #8a6a1f; vertical-align: middle; }
        .nb-gt-cell.part { background: linear-gradient(90deg, #f7d58b var(--fill, 50%), #fdf3dc var(--fill, 50%)); } .nb-gt-cell.ok { background: #35b27f; color: #fff; } .nb-gt-cell.chal { background: #1f9d6b; color: #fff; } .nb-gt-cell.super { background: linear-gradient(135deg, #0f7a52, #17a673); color: #fff; box-shadow: 0 0 0 1.5px #bfe9d5; }
        .nb-gt-reach { font-size: 13px; font-weight: 800; color: #102a43; } .nb-gt-reach small { font-size: 10.5px; font-weight: 600; color: #a0abbb; }
        .nb-gt-streak { display: inline-flex; align-items: center; gap: 3px; font-size: 12.5px; font-weight: 800; color: #b3bdcb; } .nb-gt-streak.on { color: #d2491f; }
        .nb-gt-empty { color: #7b8aa0; font-size: 13px; padding: 18px 0 !important; }
        .nb-gt-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #d3dbe6; } .nb-gt-dot.part { background: #f0b73e; } .nb-gt-dot.ok, .nb-gt-dot.chal, .nb-gt-dot.super { background: #1f9d6b; }
        .nb-gt-table tr.done .nb-gt-name span { color: #102a43; }
        .nb-gt-table td:first-child, .nb-gt-table th:first-child { position: sticky; left: 0; background: #fff; z-index: 1; } .nb-gt-table th:first-child { background: #f8fafc; }
        .nb-gt-table tbody tr:hover td:first-child { background: #f7f9fc; }
        .nb-gt-name { font-weight: 600; } .nb-gt-name span:last-child { font-size: 13px; }
        .nb-gt-reach { color: #52667a; font-weight: 700; } .nb-gt-streak { font-size: 12px; }
        .nb-gt-scroll { border-color: #eaeef5; box-shadow: 0 1px 0 rgba(16,42,67,.03); }
        .nb-gt-foot { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #7b8aa0; } .nb-gt-foot > span { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; } .nb-gt-foot .nb-gt-cell { width: 20px; height: 12px; margin-left: 4px; } .nb-gt-legend { gap: 5px !important; }
        @media (max-width: 1100px) { .nb-badges { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 420px) { .nb-badges { gap: 10px; } .nb-badge { padding: 14px 8px 12px; } .nb-badge small { display: none; } }
        .nb-chip-n { margin-left: 3px; padding: 0 6px; border-radius: 999px; background: rgba(16,42,67,.08); font-size: 10px; font-weight: 800; } .nb-chip.active .nb-chip-n { background: rgba(255,255,255,.28); }
        .nb-practice-points { display: flex; align-items: center; gap: 6px; } .nb-practice-points i { font-style: normal; color: #8795a8; }
        .nb-practice-points .nb-input { width: 84px; padding: 6px 8px; font-size: 13px; }
        .nb-practice-clear { align-self: flex-end; padding: 6px 12px; font-size: 12px; }
        /* ===== Học sinh nộp lại sau nhận xét ===== */
        .nb-fui { display: flex; gap: 16px; padding: 18px 20px; border-radius: 18px; background: linear-gradient(100deg, #fff1ec 0%, #fff 62%); border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); position: relative; overflow: hidden; }
        .nb-fui::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: #e5603c; }
        .nb-fui-icon { flex: none; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: #ffe5dc; color: #d2491f; }
        .nb-fui-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .nb-fui-main small { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; color: #b8502f; } .nb-fui-main > strong { font-size: 16.5px; color: #102a43; }
        .nb-fui ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .nb-fui li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #f3dcd3; border-radius: 12px; background: #fff; flex-wrap: wrap; }
        .nb-fui li.more { border: 0; background: none; color: #8795a8; font-size: 12.5px; padding: 2px 4px; }
        .nb-fui-who { display: flex; flex-direction: column; min-width: 0; flex: 1 1 180px; } .nb-fui-who b { font-size: 13.5px; color: #102a43; } .nb-fui-who span { font-size: 12.5px; color: #66748a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-fui-meta { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: #52606d; flex-wrap: wrap; } .nb-fui-meta em { font-style: normal; font-weight: 800; color: #102a43; font-family: var(--code-font, monospace); } .nb-fui-meta i { font-style: normal; padding: 1px 8px; border-radius: 999px; background: #fff0d6; color: #a05a08; font-size: 11px; font-weight: 700; } .nb-fui-meta small { text-transform: none; letter-spacing: 0; font-weight: 500; color: #8795a8; }
        .nb-fui li .nb-btn { padding: 6px 12px; font-size: 12.5px; }
        .nb-fbe-follow { padding: 12px 14px; border-radius: 12px; background: #fff3e6; border: 1px solid #f3d3b0; display: flex; flex-direction: column; gap: 8px; }
        .nb-fbe-follow-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; color: #7a4310; } .nb-fbe-follow-head svg { flex: none; color: #d2491f; } .nb-fbe-follow-head span { flex: 1 1 220px; } .nb-fbe-follow-head .nb-btn { padding: 5px 10px; font-size: 12px; }
        .nb-fbe-prev { padding: 10px 12px; border-radius: 10px; background: #fff; border: 1px dashed #e6c9a3; font-size: 13.5px; color: #102a43; } .nb-fbe-prev p { margin: 6px 0; white-space: pre-wrap; } .nb-fbe-prev ul { margin: 4px 0 0; padding-left: 18px; font-size: 13px; } .nb-fbe-prev small { color: #8a7a55; }
        @media (max-width: 760px) { .nb-fui { padding: 14px; } .nb-fui-icon { display: none; } }
        /* ===== Theo dõi sửa bài sau nhận xét ===== */
        .nb-ft { background: #fff; border: 1px solid var(--ov-line, #e4e9f1); border-radius: 18px; box-shadow: var(--ov-shadow, 0 1px 3px rgba(16,42,67,.06)); padding: 18px 20px 16px; display: flex; flex-direction: column; gap: 12px; }
        .nb-ft.has-modal { position: relative; z-index: 60; }
        .nb-ft-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .nb-ft-head h2 { margin: 2px 0 0; font-size: 18px; color: #102a43; }
        .nb-ft-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .nb-ft-kpi { background: #f6f8fb; border: 1px solid #e9edf4; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .nb-ft-kpi small { font-size: 11.5px; color: #627d98; font-weight: 600; }
        .nb-ft-kpi strong { font-size: 24px; line-height: 1.15; color: #102a43; }
        .nb-ft-kpi span { font-size: 12px; color: #829ab1; }
        .nb-ft-kpi.good strong { color: #17803d; } .nb-ft-kpi.bad { background: #fff1ee; border-color: #f7cfc4; } .nb-ft-kpi.bad strong { color: #c8391a; }
        .nb-ft-kpi.warn { background: #fff8e6; border-color: #f3dfa5; } .nb-ft-kpi.warn strong { color: #a56a00; }
        .nb-ft-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: #eef1f6; }
        .nb-ft-bar i { display: block; height: 100%; }
        .nb-ft-bar .fixed, .nb-ft-legend .fixed::before { background: #2f9e5b; } .nb-ft-bar .ok, .nb-ft-legend .ok::before { background: #9ad3b0; }
        .nb-ft-bar .retrying, .nb-ft-legend .retrying::before { background: #e8a527; } .nb-ft-bar .pending, .nb-ft-legend .pending::before { background: #e5603c; }
        .nb-ft-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #52667a; margin-top: -4px; }
        .nb-ft-legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
        .nb-ft-tabs { display: flex; gap: 4px; border-bottom: 1px solid #e9edf4; }
        .nb-ft-tabs button { background: none; border: 0; padding: 8px 14px; font: inherit; font-weight: 600; font-size: 14px; color: #627d98; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        .nb-ft-tabs button.on { color: #0b6e6e; border-bottom-color: #0b6e6e; }
        .nb-ft-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
        .nb-ft-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .nb-ft-search { display: flex; align-items: center; gap: 6px; border: 1px solid #d9e1ec; border-radius: 10px; padding: 6px 10px; background: #fff; color: #829ab1; }
        .nb-ft-search input { border: 0; outline: 0; font: inherit; font-size: 13.5px; width: 190px; color: #102a43; background: transparent; }
        .nb-ft-filtered { font-size: 13px; color: #52667a; display: flex; gap: 8px; align-items: center; }
        .nb-ft-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
        .nb-ft-list li { display: flex; align-items: center; gap: 12px; padding: 9px 4px; border-bottom: 1px solid #eef1f6; }
        .nb-ft-list li.stale { background: linear-gradient(90deg, #fff4f0, transparent 60%); }
        .nb-ft-list li.more { justify-content: center; color: #829ab1; font-size: 13px; border-bottom: 0; }
        .nb-ft-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .nb-ft-who b { font-size: 14px; color: #102a43; } .nb-ft-who span { font-size: 12.5px; color: #627d98; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nb-ft-state { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 150px; }
        .nb-ft-state small { font-size: 12px; color: #829ab1; }
        .nb-ft-chip { display: inline-block; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
        .nb-ft-chip.fixed { background: #dff5e7; color: #17803d; } .nb-ft-chip.ok { background: #eaf6ef; color: #3c7b57; }
        .nb-ft-chip.retrying { background: #fff1cc; color: #8a5a00; } .nb-ft-chip.pending { background: #ffe5dc; color: #c8391a; }
        .nb-ft-chip.stale { background: #e5603c; color: #fff; }
        .nb-ft-table-wrap { overflow-x: auto; }
        .nb-ft-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .nb-ft-table th { text-align: left; font-size: 12px; color: #627d98; font-weight: 700; padding: 6px 10px; border-bottom: 1px solid #e9edf4; white-space: nowrap; }
        .nb-ft-table td { padding: 8px 10px; border-bottom: 1px solid #eef1f6; color: #243b53; }
        .nb-ft-table tbody tr { cursor: pointer; } .nb-ft-table tbody tr:hover { background: #f6f8fb; }
        .nb-ft-table td.bad { color: #c8391a; font-weight: 700; } .nb-ft-table td.bad i { font-style: normal; margin-left: 4px; background: #e5603c; color: #fff; border-radius: 999px; padding: 0 6px; font-size: 11px; }
        .nb-ft-cell-who { display: inline-flex; align-items: center; gap: 8px; }
        .nb-ft-rate { position: relative; display: inline-block; min-width: 74px; padding: 1px 8px; border-radius: 6px; background: #eef1f6; overflow: hidden; font-weight: 700; z-index: 0; }
        .nb-ft-rate i { position: absolute; left: 0; top: 0; bottom: 0; background: #bfe7cd; z-index: -1; }
        .nb-ft-modal { max-width: 640px; }
        .nb-ft-modal-body { padding: 14px 22px; display: flex; flex-direction: column; gap: 12px; }
        .nb-ft-modal-sum { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13.5px; color: #334e68; }
        .nb-ft-timeline { list-style: none; margin: 0; padding: 0 0 0 6px; display: flex; flex-direction: column; border-left: 2px solid #e1e7f0; margin-left: 6px; }
        .nb-ft-timeline li { position: relative; padding: 0 0 16px 20px; }
        .nb-ft-dot { position: absolute; left: -8px; top: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 3px solid #627d98; }
        .nb-ft-timeline li.fb .nb-ft-dot { border-color: #0b6e6e; background: #0b6e6e; } .nb-ft-timeline li.sub .nb-ft-dot { border-color: #3b82c4; }
        .nb-ft-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; } .nb-ft-line em { font-style: normal; font-size: 12.5px; color: #627d98; }
        .nb-ft-timeline small { display: block; color: #829ab1; font-size: 12px; margin-top: 2px; }
        .nb-ft-quote { margin: 6px 0 4px; padding: 8px 12px; border-left: 3px solid #0b6e6e; background: #f0f8f8; border-radius: 0 8px 8px 0; font-size: 13.5px; color: #243b53; white-space: pre-wrap; }
        .nb-ft-last { font-style: normal; font-size: 11px; font-weight: 700; background: #e7f0fb; color: #2b6cb0; padding: 1px 8px; border-radius: 999px; }
        .nb-ft-seen, .nb-ft-unseen { font-style: normal; font-size: 11.5px; padding: 1px 8px; border-radius: 999px; } .nb-ft-seen { background: #eaf6ef; color: #3c7b57; } .nb-ft-unseen { background: #fff1cc; color: #8a5a00; }
        .nb-ft-modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 22px 18px; border-top: 1px solid var(--paper-line, #e9edf4); }
        @media (max-width: 860px) { .nb-ft-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .nb-ft-list li { flex-wrap: wrap; } .nb-ft-state { align-items: flex-start; min-width: 0; } .nb-ft-search input { width: 130px; } }

        /* ===== Nút sao chép code ===== */
        .nb-copywrap { position: relative; }
        .nb-copy-btn { position: absolute; top: 8px; right: 14px; z-index: 3; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; border: 1px solid #cdd6e3; background: rgba(255,255,255,.94); color: #3b4f6b; font: 700 12px "Be Vietnam Pro", system-ui, sans-serif; cursor: pointer; box-shadow: 0 1px 4px rgba(16,42,67,.12); opacity: .85; transition: opacity .15s, background .15s; backdrop-filter: blur(2px); }
        .nb-copywrap:hover .nb-copy-btn, .nb-copy-btn:focus-visible, .nb-copy-btn.ok, .nb-copy-btn.fail { opacity: 1; }
        .nb-copy-btn:hover { background: #eef4ff; border-color: #9fbbef; color: #1f4fb8; }
        .nb-copy-btn.ok { background: #e3f7ec; border-color: #9fdcbc; color: #14804f; } .nb-copy-btn.fail { background: #fff0d6; border-color: #f0cd8c; color: #a05a08; }
        @media (hover: none) { .nb-copy-btn { opacity: 1; } }
        /* ===== Nhận xét bài nộp ===== */
        .nb-fb-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #e8f0ff; color: #2f5fc9; white-space: nowrap; }
        .nb-fb-chip.fresh { background: #fff0d6; color: #b4590b; }
        .nb-fb-chip.wide { grid-column: 1 / -1; width: fit-content; }
        .nb-fb-new { font-style: normal; display: inline-block; padding: 1px 7px; border-radius: 999px; background: #e5603c; color: #fff; font-size: 10.5px; font-weight: 800; margin-right: 6px; }
        .nb-fb-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
        .nb-fb-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid transparent; font-family: inherit; }
        .nb-fb-tag.red { background: #ffe9e5; color: #b8321c; } .nb-fb-tag.amber { background: #fff0d6; color: #a05a08; } .nb-fb-tag.blue { background: #e8f0ff; color: #2f5fc9; } .nb-fb-tag.green { background: #dcf5e8; color: #14804f; }
        .nb-fb-tags.pick .nb-fb-tag { cursor: pointer; background: #f4f6fa; color: #66748a; border-color: #e2e7ef; }
        .nb-fb-tags.pick .nb-fb-tag.on.red { background: #ffe9e5; color: #b8321c; border-color: #f2b5aa; } .nb-fb-tags.pick .nb-fb-tag.on.amber { background: #fff0d6; color: #a05a08; border-color: #f0cd8c; } .nb-fb-tags.pick .nb-fb-tag.on.blue { background: #e8f0ff; color: #2f5fc9; border-color: #b6ccf5; } .nb-fb-tags.pick .nb-fb-tag.on.green { background: #dcf5e8; color: #14804f; border-color: #9fdcbc; }

        .nb-ann { background: #fff; border: 1px solid #d8dde6; border-radius: 8px; overflow: auto; font-family: var(--code-font, Consolas, monospace); font-size: 14px; max-height: 420px; }
        .nb-ann-row { display: grid; grid-template-columns: 46px minmax(0, 1fr); line-height: 22px; }
        .nb-ann-no { border: 0; background: #ececec; color: #8a8a8a; text-align: right; padding: 0 10px 0 0; font: inherit; font-size: 13px; cursor: default; }
        .nb-ann.clickable .nb-ann-no { cursor: pointer; } .nb-ann.clickable .nb-ann-no:hover { background: #cfe0ff; color: #1f4fb8; font-weight: 700; }
        .nb-ann-code { margin: 0; padding: 0 12px; white-space: pre; overflow-x: auto; font: inherit; }
        .nb-ann-row.flagged { background: #fff6e0; } .nb-ann-row.flagged .nb-ann-no { background: #f5c76b; color: #7a4b00; font-weight: 800; }
        .nb-ann-row.active { background: #eaf2ff; } .nb-ann-row.active .nb-ann-no { background: #8db4f5; color: #fff; }
        .nb-ann-note { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 0 46px; padding: 6px 12px; background: #fff3d1; border-left: 3px solid #e0a020; color: #6b4300; font: 600 13px/1.45 var(--font-body, inherit); font-family: "Be Vietnam Pro", system-ui, sans-serif; }
        .nb-ann-note svg { flex: none; margin-top: 2px; color: #c47f00; }

        .nb-diff { border: 1px solid #d8dde6; border-radius: 8px; overflow: hidden; background: #fff; margin-top: 8px; }
        .nb-diff-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 7px 10px; background: #f4f6fa; font-size: 12px; color: #52606d; }
        .nb-diff-toggle { display: inline-flex; border: 1px solid #d5dce6; border-radius: 8px; overflow: hidden; }
        .nb-diff-toggle button { border: 0; background: #fff; padding: 4px 10px; font-size: 12px; font-weight: 700; color: #66748a; cursor: pointer; font-family: inherit; } .nb-diff-toggle button.on { background: #102a43; color: #fff; }
        .nb-diff-body { max-height: 360px; overflow: auto; font-family: var(--code-font, Consolas, monospace); font-size: 14px; }
        .nb-diff-row { display: grid; grid-template-columns: 40px 22px minmax(0, 1fr); line-height: 22px; }
        .nb-diff-row pre { margin: 0; font: inherit; white-space: pre; padding-right: 10px; }
        .nb-diff-no { text-align: right; padding-right: 8px; color: #9aa6b8; background: #f1f3f7; font-size: 12.5px; }
        .nb-diff-mark { text-align: center; font-weight: 800; color: #8a8a8a; }
        .nb-diff-row.add { background: #e5f7ec; } .nb-diff-row.add .nb-diff-mark { color: #14804f; background: #c9efd9; }
        .nb-diff-row.del { background: #ffeceb; } .nb-diff-row.del .nb-diff-mark { color: #c0392b; background: #ffd6d2; } .nb-diff-row.del pre { text-decoration: line-through; text-decoration-color: rgba(192,57,43,.45); opacity: .85; }

        .nb-fbs { margin-top: 12px; padding: 14px 16px; border-radius: 12px; background: linear-gradient(180deg, #fffaf0, #fff 70%); border: 1px solid #f0dcae; }
        .nb-fbs-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #7a4b00; } .nb-fbs-head small { margin-left: auto; color: #8a7a55; font-size: 12px; }
        .nb-fbs-comment { margin: 6px 0 4px; white-space: pre-wrap; line-height: 1.6; color: #102a43; font-size: 14.5px; }
        .nb-fbs-hint { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: 12.5px; color: #8a6a1c; }
        .nb-fbs-fix { margin-top: 10px; } .nb-fbs-fix-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; color: #102a43; }
        .nb-fbs-fix-head .nb-btn { padding: 5px 10px; font-size: 12px; }

        .nb-fbe { display: flex; flex-direction: column; gap: 12px; }
        .nb-fbe-tip { margin: 8px 2px 0; font-size: 12.5px; color: #66748a; display: flex; align-items: center; gap: 6px; }
        .nb-fbe-panel { padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid #e2e7ef; display: flex; flex-direction: column; gap: 6px; }
        .nb-fbe-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; } .nb-fbe-head strong { display: inline-flex; align-items: center; gap: 7px; color: #102a43; }
        .nb-fbe-saved { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #14804f; font-weight: 700; }
        .nb-fbe-label { margin-top: 8px; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #7b8aa0; } .nb-fbe-label span { color: #b4590b; }
        .nb-fbe-text { width: 100%; resize: vertical; min-height: 76px; font-family: inherit; }
        .nb-fbe-phrases { display: flex; flex-wrap: wrap; gap: 6px; } .nb-fbe-phrases button { border: 1px dashed #c4cedd; background: #f8fafc; color: #52606d; border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; font-family: inherit; } .nb-fbe-phrases button:hover { background: #eaf2ff; border-color: #8db4f5; color: #1f4fb8; }
        .nb-fbe-empty { margin: 2px 0; font-size: 12.5px; color: #8795a8; }
        .nb-fbe-notes { display: flex; flex-direction: column; gap: 6px; }
        .nb-fbe-note-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px; border-radius: 8px; } .nb-fbe-note-row.active { background: #fff6e0; }
        .nb-fbe-line { font: 800 12px var(--code-font, monospace); color: #7a4b00; background: #f5c76b; border-radius: 6px; padding: 3px 8px; white-space: nowrap; }
        .nb-fbe-check { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13.5px; color: #102a43; cursor: pointer; }
        .nb-fbe-fix { display: flex; flex-direction: column; gap: 8px; }
        .nb-fbe-note { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px; font-size: 13px; }
        .nb-fbe-note.ok { background: #dcf5e8; color: #14804f; } .nb-fbe-note.err, .nb-fbe-note.warn { background: #fff0d6; color: #a05a08; }
        .nb-fbe-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

        .nb-fbi { display: flex; gap: 16px; padding: 18px 20px; border-radius: 18px; background: #fff; border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); position: relative; overflow: hidden; }
        .nb-fbi::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: #8db4f5; }
        .nb-fbi.fresh { background: linear-gradient(100deg, #fff6e6 0%, #fff 62%); } .nb-fbi.fresh::before { background: #e0a020; }
        .nb-fbi-icon { flex: none; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: #e8f0ff; color: #2f6fed; } .nb-fbi.fresh .nb-fbi-icon { background: #fdf1d6; color: #b9770e; }
        .nb-fbi-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .nb-fbi-main small { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; color: #6b7a90; } .nb-fbi-main > strong { font-size: 16.5px; color: #102a43; }
        .nb-fbi ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .nb-fbi li button { width: 100%; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr) auto auto; gap: 12px; align-items: center; text-align: left; padding: 9px 10px; border: 1px solid #edf0f5; border-radius: 10px; background: #fff; cursor: pointer; font-family: inherit; color: #52606d; font-size: 13px; }
        .nb-fbi li button:hover { background: #f5f8ff; border-color: #c9d8f5; }
        .nb-fbi-title { font-weight: 700; color: #102a43; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nb-fbi-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nb-fbi-time { font-size: 12px; color: #8795a8; white-space: nowrap; }
        .nb-nav-dot { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: #e5603c; color: #fff; font-size: 11px; font-weight: 800; display: inline-grid; place-items: center; font-style: normal; }
        .nb-bottom-nav-item { position: relative; } .nb-nav-dot.small { position: absolute; top: 2px; right: 18%; min-width: 16px; height: 16px; font-size: 10px; padding: 0 4px; margin: 0; }
        @media (max-width: 760px) { .nb-fbi { padding: 14px; } .nb-fbi li button { grid-template-columns: minmax(0, 1fr) auto; } .nb-fbi-text { display: none; } .nb-fbi-time { grid-column: 1; } }
        /* ===== Thống kê AC theo bài ===== */
        .nb-solve { display: flex; align-items: center; gap: 9px; margin-top: 7px; padding: 0; border: 0; background: none; font-family: inherit; text-align: left; max-width: 100%; }
        button.nb-solve { cursor: pointer; padding: 4px 8px 4px 6px; margin-left: -6px; border-radius: 8px; } button.nb-solve:hover { background: rgba(47,111,237,.07); }
        .nb-solve-track { flex: none; width: 96px; height: 7px; border-radius: 999px; background: #e6ebf2; overflow: hidden; } .nb-solve-track b { display: block; height: 100%; border-radius: 999px; background: #2f6fed; }
        .nb-solve.high .nb-solve-track b { background: #1f9d6b; } .nb-solve.mid .nb-solve-track b { background: #2f6fed; } .nb-solve.low .nb-solve-track b { background: #e5762c; } .nb-solve.none .nb-solve-track b { background: #c4cedd; }
        .nb-solve-text { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #52606d; white-space: nowrap; } .nb-solve-text svg { color: #1f9d6b; } .nb-solve.none .nb-solve-text svg { color: #a3afc0; } .nb-solve-text b { color: #102a43; font-family: var(--code-font, monospace); }
        .nb-solve-flag { padding: 1px 8px; border-radius: 999px; background: #fff0d6; color: #a05a08; font-size: 11px; font-weight: 800; white-space: nowrap; }
        .nb-solve-go { color: #8795a8; }
        .nb-practice-sort { width: auto; min-width: 150px; padding: 6px 10px; font-size: 13px; }
        .nb-cls-modal { max-width: 640px; }
        .nb-cls-summary { display: flex; align-items: center; gap: 22px; padding: 18px 22px 6px; }
        .nb-cls-ring { flex: none; width: 92px; height: 92px; border-radius: 50%; background: conic-gradient(#1f9d6b var(--p), #e6ebf2 0); display: grid; place-items: center; }
        .nb-cls-ring span { width: 74px; height: 74px; border-radius: 50%; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10.5px; color: #7b8aa0; line-height: 1.2; } .nb-cls-ring b { font-size: 21px; color: #102a43; }
        .nb-cls-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; flex: 1; }
        .nb-cls-stats > div { padding: 10px 12px; border-radius: 12px; background: #f4f6fa; display: flex; flex-direction: column; } .nb-cls-stats b { font-size: 24px; color: #102a43; } .nb-cls-stats span { font-size: 12px; color: #66748a; }
        .nb-cls-stats .ac { background: #e6f7ef; } .nb-cls-stats .ac b { color: #14804f; } .nb-cls-stats .tried { background: #fff4de; } .nb-cls-stats .tried b { color: #a05a08; }
        .nb-cls-highlights { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 22px 0; }
        .nb-cls-highlights > div { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: center; padding: 10px 12px; border-radius: 12px; background: linear-gradient(100deg, #fff7e3, #fff); border: 1px solid #f0dcae; } .nb-cls-highlights svg { color: #c47f00; grid-row: span 3; }
        .nb-cls-highlights span { font-size: 11.5px; color: #8a7a55; } .nb-cls-highlights b { font-size: 14px; color: #102a43; } .nb-cls-highlights small { font-size: 11.5px; color: #8a7a55; }
        .nb-cls-tabs { display: flex; gap: 6px; padding: 14px 22px 0; flex-wrap: wrap; }
        .nb-cls-tabs button { border: 1px solid #dde3ec; background: #fff; border-radius: 999px; padding: 5px 12px; font: 700 12.5px inherit; font-family: inherit; color: #66748a; cursor: pointer; } .nb-cls-tabs button i { font-style: normal; margin-left: 4px; padding: 0 6px; border-radius: 999px; background: #eef1f6; color: #52606d; font-size: 11.5px; }
        .nb-cls-tabs button.on { color: #fff; border-color: transparent; } .nb-cls-tabs button.on.ac { background: #1f9d6b; } .nb-cls-tabs button.on.tried { background: #d98a1d; } .nb-cls-tabs button.on.none { background: #66748a; } .nb-cls-tabs button.on i { background: rgba(255,255,255,.25); color: #fff; }
        .nb-cls-list { margin: 10px 22px 0; border: 1px solid #e6ebf2; border-radius: 12px; max-height: 320px; overflow-y: auto; }
        .nb-cls-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid #f0f3f8; } .nb-cls-row:last-child { border-bottom: 0; }
        .nb-cls-name { display: flex; flex-direction: column; min-width: 0; flex: 1; } .nb-cls-name strong { font-size: 13.5px; color: #102a43; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nb-cls-name small { color: #8795a8; font-size: 11.5px; }
        .nb-cls-detail { display: flex; flex-direction: column; align-items: flex-end; font-size: 12.5px; color: #52606d; text-align: right; } .nb-cls-detail small { color: #8795a8; font-size: 11.5px; }
        .nb-cls-first { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 999px; background: #fdecc0; color: #7a4b00; font-size: 11px; font-weight: 800; margin-bottom: 2px; }
        .nb-cls-modal .nb-modal-actions { padding: 14px 22px 18px; }
        @media (max-width: 760px) { .nb-cls-summary { flex-direction: column; align-items: stretch; padding: 14px 16px 4px; } .nb-cls-ring { align-self: center; } .nb-cls-highlights { grid-template-columns: 1fr; padding: 10px 16px 0; } .nb-cls-tabs, .nb-cls-modal .nb-modal-actions { padding-left: 16px; padding-right: 16px; } .nb-cls-list { margin: 10px 16px 0; } .nb-solve-track { width: 70px; } }
        .nb-ov-grid.two { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
        .nb-ov-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .nb-ov-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
        .nb-ov-panel { padding: 18px 20px; border-radius: 18px; background: #fff; border: 1px solid var(--ov-line); box-shadow: var(--ov-shadow); min-width: 0; }
        .nb-ov-panel > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .nb-ov-eyebrow { display: block; font-size: 10.5px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: #8296A4; }
        .nb-ov-panel h2 { margin: 3px 0 0; font-size: 16px; font-weight: 800; letter-spacing: -.01em; color: var(--ink); }
        .nb-ov .nb-link-button { font-size: 12.5px; font-weight: 700; color: #0A7389; white-space: nowrap; }
        .nb-ov-list { list-style: none; margin: 0 -8px; padding: 0; display: flex; flex-direction: column; }
        .nb-ov-list li { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-radius: 10px; min-width: 0; transition: background .15s; }
        .nb-ov-list li + li { box-shadow: 0 -1px 0 #EEF4F6; }
        .nb-ov-list li:hover { background: #F6FBFC; }
        .nb-ov-list li.clickable { cursor: pointer; }
        .nb-ov-list li.more { justify-content: center; font-size: 12px; color: #8296A4; } .nb-ov-list li.more:hover { background: transparent; }
        .nb-ov-list li > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nb-ov-list strong { font-size: 13.5px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-ov-list small { font-size: 12px; color: #6B7F90; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nb-ov-list li > b { flex: none; font-size: 13px; font-weight: 800; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
        .nb-ov-list li > b.ok { color: var(--ac-green); } .nb-ov-list li > b.rate { color: var(--red-pen); }
        .nb-ov-list .nb-avatar { flex: none; }
        .nb-ov-dot { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; }
        .nb-ov-dot.ok { background: #E3F5EC; color: var(--ac-green); } .nb-ov-dot.warn { background: #FBF0DC; color: var(--gold); } .nb-ov-dot.info { background: #E3F2F8; color: #1B7FA5; }
        .nb-ov-tag { flex: none; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .nb-ov-tag.risk { background: #FBEAEA; color: #A12B2B; }
        .nb-ov-rank { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 800; background: #EEF2F6; color: #6B7F90; }
        .nb-ov-rank.r1 { background: #FCE7A6; color: #6b4a00; } .nb-ov-rank.r2 { background: #E3E9F0; color: #44546a; } .nb-ov-rank.r3 { background: #F3D7BC; color: #6b3d12; }
        .nb-ov-meter { display: block; height: 6px; border-radius: 99px; background: #EAF1F4; overflow: hidden; margin-top: 5px; }
        .nb-ov-meter b { display: block; height: 100%; background: var(--pen-blue); border-radius: 99px; } .nb-ov-meter b.low { background: #D96B6B; }
        .nb-ov-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 26px 10px; text-align: center; color: #8296A4; font-size: 12.5px; }
        .nb-ov-empty strong { color: var(--ink); font-size: 13.5px; }
        .nb-ov-links { display: flex; flex-direction: column; gap: 4px; margin: 0 -8px; }
        .nb-ov-links button { display: flex; align-items: center; gap: 12px; padding: 10px 8px; text-align: left; font: inherit; color: var(--ink); cursor: pointer; border: 0; border-radius: 12px; background: transparent; transition: background .15s; }
        .nb-ov-links button:hover { background: #F4FAFB; }
        .nb-ov-links button > span:nth-child(2) { flex: 1; display: flex; flex-direction: column; gap: 1px; } .nb-ov-links strong { font-size: 13.5px; } .nb-ov-links small { color: #6B7F90; font-size: 12px; }
        .nb-ov-links > button > svg { color: #9FB2BF; }
        .nb-ov-link-icon { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; }
        .nb-ov-link-icon.blue { background: #E3F2F8; color: #1B7FA5; } .nb-ov-link-icon.green { background: #E3F5EC; color: var(--ac-green); } .nb-ov-link-icon.gold { background: #FBF0DC; color: var(--gold); } .nb-ov-link-icon.red { background: #FBEAEA; color: var(--red-pen); }
        @media (max-width: 1100px) { .nb-ov-grid.three { grid-template-columns: 1fr 1fr; } .nb-ov-grid.three > :last-child { grid-column: 1 / -1; } }
        @media (max-width: 900px) {
          .nb-ov-grid.main, .nb-ov-grid.two { grid-template-columns: 1fr; }
          .nb-ov-kpis { grid-template-columns: 1fr 1fr; } .nb-ov-kpi + .nb-ov-kpi::before { display: none; }
          .nb-ov-kpi:nth-child(odd) { box-shadow: 1px 0 0 var(--ov-line); } .nb-ov-kpi:nth-child(n+3) { box-shadow: 0 -1px 0 var(--ov-line); } .nb-ov-kpi:nth-child(3) { box-shadow: 1px -1px 0 var(--ov-line); }
        }
        @media (max-width: 640px) {
          .nb-ov-grid.three { grid-template-columns: 1fr; } .nb-ov-head { padding: 18px; } .nb-ov-head h1 { font-size: 21px; }
          .nb-ov-focus { flex-wrap: wrap; } .nb-ov-focus .nb-btn { width: 100%; justify-content: center; }
          .nb-ov-kpi { padding: 14px; } .nb-ov-kpi-main strong { font-size: 24px; } .nb-ov-ring { width: 40px; height: 40px; } .nb-ov-spark { display: none; }
          .nb-ov-head-actions { width: 100%; } .nb-ov-head-actions .nb-btn { flex: 1; justify-content: center; }
        }
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
        .nb-practice-modal { max-width: min(1480px, 96vw); max-height: 94vh; }
        .nb-practice-modal .nb-modal-body { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 26px; }
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
        /* ---- Trình soạn thảo: giao diện sáng giống Thonny ---- */
        .nb-thonny-editor { --code-font: Consolas, "Cascadia Mono", Inconsolata, "JetBrains Mono", "Courier New", monospace; border: 1px solid #c9ccd1; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 2px 10px rgba(16,42,67,0.08); }
        .nb-editor-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; padding: 6px 10px 0; background: #ECECEC; border-bottom: 1px solid #c9ccd1; font: 12.5px/1.2 'Be Vietnam Pro', sans-serif; }
        .nb-editor-tab { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; margin-bottom: -1px; border: 1px solid #c9ccd1; border-bottom-color: #fff; border-radius: 7px 7px 0 0; background: #fff; color: #222; font: 600 12.5px var(--code-font); }
        .nb-editor-tab svg { color: #3b6fb6; }
        .nb-editor-lang { padding: 0 4px 7px; color: #6b6f76; font-size: 11.5px; }
        .nb-editor-status { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 12px; color: #5b5f66; background: #ECECEC; border-top: 1px solid #c9ccd1; font: 11px/1.3 'Be Vietnam Pro', sans-serif; }
        .nb-editor-workspace { display: flex; position: relative; min-height: 340px; max-height: 520px; overflow: hidden; background: #fff; }
        .nb-editor-gutter { flex: 0 0 52px; padding: 12px 10px 12px 0; color: #8a8a8a; background: #E2E2E2; text-align: right; user-select: none; font: 16px/24px var(--code-font); }
        .nb-editor-gutter span { display: block; height: 24px; }
        .nb-editor-gutter span.active { color: #333; font-weight: 700; }
        .nb-editor-code-layer { position: relative; flex: 1; min-width: 0; overflow: hidden; }
        .nb-editor-active-line { position: absolute; left: 0; right: 0; top: 12px; height: 24px; background: #F1F6FD; box-shadow: inset 0 1px 0 #E3ECF8, inset 0 -1px 0 #E3ECF8; pointer-events: none; z-index: 0; }
        .nb-code-highlight, .nb-code-input {
          position: absolute; inset: 0; width: max-content; min-width: 100%; min-height: 100%; margin: 0; padding: 12px 14px; border: 0; box-sizing: border-box;
          font: 16px/24px var(--code-font); letter-spacing: 0; tab-size: 4; white-space: pre; font-variant-ligatures: none;
        }
        .nb-code-highlight { pointer-events: none; color: #000; background: transparent; z-index: 1; }
        .nb-code-highlight code { font: inherit; }
        .nb-code-input { z-index: 2; resize: none; overflow: auto; color: transparent; caret-color: #000; background: transparent; outline: none; -webkit-text-fill-color: transparent; }
        .nb-code-input::selection { background: rgba(70, 140, 230, 0.32); -webkit-text-fill-color: transparent; }
        .nb-code-input::-moz-selection { background: rgba(70, 140, 230, 0.32); }
        .nb-syntax-keyword { color: #7F0055; font-weight: 700; }
        .nb-syntax-builtin { color: #7F0055; }
        .nb-syntax-def { color: #1F3C9E; font-weight: 700; }
        .nb-syntax-number { color: #B35900; }
        .nb-syntax-string { color: #2B8A00; }
        .nb-syntax-comment { color: #7a7a7a; font-style: italic; }
        .nb-syntax-function, .nb-syntax-operator { color: inherit; }
        /* Code chỉ-đọc (bài đã nộp, code mẫu) */
        .nb-codeview { --code-font: Consolas, "Cascadia Mono", Inconsolata, "JetBrains Mono", "Courier New", monospace; display: flex; max-height: 420px; overflow: auto; border: 1px solid #c9ccd1; border-radius: 8px; background: #fff; }
        .nb-codeview-gutter { position: sticky; left: 0; flex: none; padding: 10px 10px 10px 8px; min-width: 44px; text-align: right; color: #8a8a8a; background: #E2E2E2; user-select: none; font: 14px/22px var(--code-font); }
        .nb-codeview-gutter span { display: block; }
        .nb-codeview-code { flex: 1; margin: 0; padding: 10px 14px; width: max-content; min-width: 0; color: #000; font: 14px/22px var(--code-font); white-space: pre; tab-size: 4; background: transparent; }
        .nb-codeview-code code { font: inherit; }
        .nb-history-code-wrap { padding: 8px; }
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
        /* ---- Code mẫu trong đề thi ---- */
        .nb-xm-solution-input { min-height: 160px; line-height: 1.55; resize: vertical; font-size: 12.5px; }
        .nb-xm-solution { margin: 0 22px 12px; border: 1px solid #bfe7d4; border-radius: 12px; background: #f3fbf7; overflow: hidden; flex-shrink: 0; }
        .nb-xm-solution-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; background: #e3f6ec; color: #0b5a38; font-size: 13px; }
        .nb-xm-solution-head strong { display: inline-flex; align-items: center; gap: 6px; }
        .nb-xm-solution-head span { font: 600 11.5px 'JetBrains Mono', monospace; }
        .nb-xm-solution-note, .nb-xm-solution-teacher { margin: 0; padding: 10px 14px 0; font-size: 13px; color: var(--ink); }
        .nb-xm-solution-teacher { color: var(--slate); font-size: 12px; }
        .nb-xm-solution .nb-codeview { margin: 10px 14px 14px; max-height: 300px; }
        .nb-xm-solution-banner { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 12px 16px; border-radius: 12px; border: 1px solid #f3d38a; background: #fff8e6; color: #7a4a00; }
        .nb-xm-solution-banner.open { border-color: #bfe7d4; background: #f0faf5; color: #0b5a38; }
        .nb-xm-solution-banner > div { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
        .nb-xm-solution-banner svg { flex-shrink: 0; }
        .nb-xm-solution-ctl { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 14px; padding: 14px 16px; border-radius: 14px; border: 1px solid #f3d38a; background: #fff8e6; }
        .nb-xm-solution-ctl.open { border-color: #bfe7d4; background: #f0faf5; }
        .nb-xm-solution-ctl-text { display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
        .nb-xm-solution-ctl-text strong { display: inline-flex; align-items: center; gap: 6px; }
        .nb-xm-solution-ctl-text span { color: var(--slate); font-size: 12px; }
        .nb-xm-solution-modes { display: flex; gap: 8px; flex-wrap: wrap; }
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
        .nb-xm-code .nb-codeview { margin: 0; border: 0; border-radius: 0; max-height: none; }
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
                /* ===== Giải trí: mô phỏng thuật toán ===== */
        .nb-fun-tabs { display: flex; gap: 6px; max-width: 960px; margin: 0 auto 14px; padding: 4px; background: #eef2f8; border-radius: 12px; width: fit-content; }
        .nb-fun.algo .nb-fun-tabs { max-width: 1240px; margin-left: 0; }
        .nb-fun-tabs button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border: 0; border-radius: 9px; background: transparent; font: inherit; font-weight: 700; font-size: 14px; color: #52627a; cursor: pointer; }
        .nb-fun-tabs button.on { background: #fff; color: #1b4fc4; box-shadow: 0 1px 4px rgba(15,42,82,.12); }
        .nb-fun-tabs i { font-style: normal; font-size: 10.5px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: #e5603c; color: #fff; }
        .nb-av { display: flex; flex-direction: column; gap: 16px; max-width: 1240px; --av-ok: #1f9d6b; --av-cmp: #f0b73e; --av-swap: #e5603c; --av-blue: #2f6fed; --av-min: #8b5cf6; }
        .nb-av:focus { outline: none; }
        .nb-av-hero { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 22px 26px; border-radius: 18px; color: #fff; background: radial-gradient(120% 140% at 0% 0%, #1b4fc4 0%, #0f2a52 48%, #0b1b33 100%); }
        .nb-av-hero h2 { margin: 10px 0 6px; font-size: 26px; letter-spacing: -.02em; } .nb-av-hero p { margin: 0; color: #c3d4ec; font-size: 14px; line-height: 1.6; max-width: 560px; }
        .nb-av-hero-count { display: flex; flex-direction: column; align-items: center; padding: 12px 20px; border-radius: 14px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14); }
        .nb-av-hero-count strong { font: 700 30px 'JetBrains Mono', monospace; color: #7fe3f2; } .nb-av-hero-count span { font-size: 11px; color: #b9cbe4; }
        .nb-av-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 16px; align-items: start; }
        .nb-av-side { background: #fff; border: 1px solid #e3e9f3; border-radius: 16px; padding: 10px; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto; }
        .nb-av-group h4 { margin: 4px 8px 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #7b8aa0; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .nb-av-group h4 small { font-size: 10.5px; text-transform: none; letter-spacing: 0; font-weight: 500; color: #a0abbb; }
        .nb-av-group button { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 8px 10px; margin-bottom: 3px; border: 1px solid transparent; border-radius: 10px; background: transparent; font: inherit; text-align: left; cursor: pointer; color: #243b53; }
        .nb-av-group button strong { font-size: 13.5px; } .nb-av-group button small { font: 600 11px 'JetBrains Mono', monospace; color: #8a97ab; }
        .nb-av-group button:hover { background: #f3f6fb; } .nb-av-group button.on { background: #eaf1ff; border-color: #b9cffa; } .nb-av-group button.on strong { color: #1b4fc4; }
        .nb-av-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .nb-av-card { background: #fff; border: 1px solid #e3e9f3; border-radius: 16px; padding: 16px 18px; }
        .nb-av-info-top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
        .nb-av-info h3 { margin: 0; font-size: 20px; color: #102a43; } .nb-av-info-top span { font-size: 12.5px; color: #7b8aa0; font-weight: 600; }
        .nb-av-badges { display: flex; gap: 6px; flex-wrap: wrap; } .nb-av-badges i { font: 700 12px 'JetBrains Mono', monospace; font-style: normal; padding: 4px 10px; border-radius: 999px; background: #eaf1ff; color: #1b4fc4; }
        .nb-av-info p { margin: 10px 0 0; font-size: 14px; line-height: 1.65; color: #334e68; } .nb-av-info .nb-av-tip { padding: 9px 12px; border-radius: 10px; background: #fff8e6; color: #7a5a10; font-size: 13.5px; }
        .nb-av-inputs { display: flex; flex-direction: column; gap: 10px; }
        .nb-av-input-row { display: flex; gap: 12px; flex-wrap: wrap; } .nb-av-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 130px; }
        .nb-av-field span { font-size: 12px; font-weight: 700; color: #627d98; }
        .nb-av-field input, .nb-av-field select { padding: 8px 11px; border: 1.5px solid #d9e1ec; border-radius: 10px; font: 600 14px 'JetBrains Mono', monospace; color: #102a43; background: #fff; } .nb-av-field input:focus, .nb-av-field select:focus { outline: none; border-color: #2f6fed; }
        .nb-av-input-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .nb-av-work { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(330px, 1fr); gap: 14px; align-items: start; }
        .nb-av-stage-card { display: flex; flex-direction: column; gap: 12px; }
        .nb-av-stage { min-height: 250px; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 8px 4px; background: linear-gradient(#fbfcfe, #f4f7fb); border-radius: 12px; }
        .nb-av-bars { position: relative; display: flex; gap: 6px; align-items: stretch; height: 250px; padding: 4px 8px 0; }
        .nb-av-bar { flex: 1; min-width: 0; display: flex; flex-direction: column; } .nb-av-barwrap { flex: 1; display: flex; align-items: flex-end; padding-top: 24px; }
        .nb-av-barfill { position: relative; width: 100%; border-radius: 7px 7px 0 0; background: #bccbe2; transition: height .25s, background .2s, opacity .2s; }
        .nb-av-barfill b { position: absolute; left: -4px; right: -4px; top: -21px; text-align: center; font: 700 13px 'JetBrains Mono', monospace; color: #334e68; }
        .nb-av-bar small { text-align: center; padding-top: 4px; font: 600 11px 'JetBrains Mono', monospace; color: #9aa7ba; }
        .nb-av-bar.zone .nb-av-barfill { background: #a9d9c3; } .nb-av-bar.ok .nb-av-barfill { background: var(--av-ok); } .nb-av-bar.ok .nb-av-barfill b { color: #137a52; }
        .nb-av-bar.cmp .nb-av-barfill { background: var(--av-cmp); } .nb-av-bar.swap .nb-av-barfill { background: var(--av-swap); } .nb-av-bar.min .nb-av-barfill { background: var(--av-min); }
        .nb-av-bar.key .nb-av-barfill, .nb-av-bar.placed .nb-av-barfill { background: var(--av-blue); } .nb-av-bar.hole .nb-av-barfill { background: repeating-linear-gradient(45deg, #e9eef6, #e9eef6 5px, #f6f8fc 5px, #f6f8fc 10px); border: 1.5px dashed #9fb2cf; border-bottom: 0; }
        .nb-av-bar.dim { opacity: .3; }
        .nb-av-keycard { position: absolute; top: 4px; left: 8px; z-index: 2; padding: 4px 10px; border-radius: 8px; background: var(--av-blue); color: #fff; font: 600 12.5px 'JetBrains Mono', monospace; }
        .nb-av-merge { display: flex; flex-direction: column; gap: 5px; padding: 6px 8px; } .nb-av-mrow { display: flex; align-items: center; gap: 10px; } .nb-av-mrow > span { flex: none; width: 118px; font-size: 12px; font-weight: 700; color: #627d98; }
        .nb-av-mrow > div { display: flex; flex-wrap: wrap; gap: 4px; min-height: 26px; align-items: center; } .nb-av-mrow em { font-size: 12px; color: #a0abbb; }
        .nb-av-mrow i, .nb-av-lists i, .nb-av-ghist i { font: 700 12.5px 'JetBrains Mono', monospace; font-style: normal; min-width: 28px; text-align: center; padding: 3px 7px; border-radius: 7px; background: #e6edf8; color: #243b53; } .nb-av-mrow i.hot { background: var(--av-cmp); color: #4a3200; }
        .nb-av-cells { display: flex; flex-wrap: nowrap; justify-content: center; gap: 5px; padding: 10px 6px; }
        .nb-av-cellcol { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1 1 0; min-width: 0; max-width: 56px; }
        .nb-av-cell { width: 100%; height: 46px; display: grid; place-items: center; border-radius: 10px; border: 2px solid #c7d4e8; background: #fff; font: 700 clamp(11px, 1.15vw, 15px) 'JetBrains Mono', monospace; color: #102a43; transition: all .2s; }
        .nb-av-cell.empty { color: #b3bdcb; border-style: dashed; background: #f6f8fc; } .nb-av-cellcol small { font: 600 11px 'JetBrains Mono', monospace; color: #9aa7ba; }
        .nb-av-cellcol.cur .nb-av-cell { border-color: var(--av-cmp); background: #fff4d6; } .nb-av-cellcol.src .nb-av-cell { border-color: var(--av-blue); background: #e6efff; }
        .nb-av-cellcol.mid .nb-av-cell { border-color: var(--av-cmp); background: #fff4d6; transform: translateY(-3px); } .nb-av-cellcol.found .nb-av-cell { border-color: var(--av-ok); background: var(--av-ok); color: #fff; transform: translateY(-3px); }
        .nb-av-cellcol.miss .nb-av-cell { background: #eef1f6; color: #a9b4c4; text-decoration: line-through; } .nb-av-cellcol.dim { opacity: .28; }
        .nb-av-sieve { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px; padding: 6px; }
        .nb-av-snum { aspect-ratio: 1.15; display: grid; place-items: center; border-radius: 7px; font: 700 12.5px 'JetBrains Mono', monospace; background: #fff; border: 1.5px solid #d3deee; color: #243b53; transition: all .2s; }
        .nb-av-snum.n { background: #eef1f6; color: #b3bdcb; border-color: #eef1f6; } .nb-av-snum.c { background: #fde3dc; color: #c8745c; border-color: #fde3dc; text-decoration: line-through; }
        .nb-av-snum.cur { border-color: var(--av-blue); background: #dce8ff; color: #1b4fc4; box-shadow: 0 0 0 2px #b9cffa; } .nb-av-snum.mark { background: var(--av-swap); color: #fff; border-color: var(--av-swap); text-decoration: none; transform: scale(1.12); }
        .nb-av-snum.prime { background: var(--av-ok); color: #fff; border-color: var(--av-ok); }
        .nb-av-gcd { display: flex; flex-direction: column; gap: 14px; padding: 8px; } .nb-av-gcd-main { display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; min-height: 110px; }
        .nb-av-gbox { width: 110px; padding: 10px; border-radius: 14px; border: 2px solid #c7d4e8; background: #fff; text-align: center; } .nb-av-gbox small { display: block; font: 700 12px 'JetBrains Mono', monospace; color: #7b8aa0; } .nb-av-gbox b { font: 800 34px 'JetBrains Mono', monospace; color: #102a43; }
        .nb-av-gbox.res { background: var(--av-ok); border-color: var(--av-ok); } .nb-av-gbox.res b, .nb-av-gbox.res small { color: #fff; } .nb-av-gbox.zero b { color: #b3bdcb; }
        .nb-av-gcalc { padding: 8px 14px; border-radius: 12px; background: #fff4d6; font: 600 15px 'JetBrains Mono', monospace; color: #6b4a00; } .nb-av-gres { padding: 8px 16px; border-radius: 12px; background: #dff5e7; font: 700 17px 'JetBrains Mono', monospace; color: #137a52; }
        .nb-av-ghist > span { font-size: 12px; font-weight: 700; color: #627d98; } .nb-av-ghist > div { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .nb-av-ghist i.last { background: var(--av-blue); color: #fff; }
        .nb-av-graphwrap { display: flex; flex-direction: column; gap: 8px; padding: 4px 6px; } .nb-av-graph { width: 100%; max-height: 250px; }
        .nb-av-edge { stroke: #c3cfe2; stroke-width: 2.5; } .nb-av-edge.on { stroke: var(--av-blue); stroke-width: 4; } .nb-av-edge.skip { stroke: #d6a19a; stroke-width: 3; stroke-dasharray: 6 5; }
        .nb-av-node circle { fill: #fff; stroke: #aebdd3; stroke-width: 2.5; transition: fill .2s, stroke .2s; } .nb-av-node text { font: 800 15px 'JetBrains Mono', monospace; fill: #243b53; }
        .nb-av-node.front circle { fill: #ffeab8; stroke: var(--av-cmp); } .nb-av-node.done circle { fill: var(--av-ok); stroke: var(--av-ok); } .nb-av-node.done text, .nb-av-node.cur text { fill: #fff; } .nb-av-node.cur circle { fill: var(--av-blue); stroke: #1b4fc4; stroke-width: 4; }
        .nb-av-legend2 { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: #627d98; justify-content: center; } .nb-av-legend2 span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; background: #fff; border: 2px solid #aebdd3; }
        .nb-av-legend2 .cur::before { background: var(--av-blue); border-color: var(--av-blue); } .nb-av-legend2 .front::before { background: #ffeab8; border-color: var(--av-cmp); } .nb-av-legend2 .done::before { background: var(--av-ok); border-color: var(--av-ok); }
        .nb-av-lists { display: flex; flex-direction: column; gap: 6px; } .nb-av-lists > div { display: flex; align-items: center; gap: 10px; } .nb-av-lists > div > span { flex: none; width: 150px; font-size: 12px; font-weight: 700; color: #627d98; }
        .nb-av-lists > div > div { display: flex; flex-wrap: wrap; gap: 4px; min-height: 26px; align-items: center; } .nb-av-lists em { font-size: 12px; color: #a0abbb; } .nb-av-lists i.ord { background: #dff5e7; color: #137a52; }
        .nb-av-note { display: flex; gap: 12px; align-items: flex-start; padding: 11px 14px; border-radius: 12px; background: #eaf1ff; border: 1px solid #cddcfa; min-height: 56px; } .nb-av-note.done { background: #e4f6ec; border-color: #b7e3c9; }
        .nb-av-note > span { flex: none; font: 700 11.5px 'JetBrains Mono', monospace; color: #1b4fc4; padding-top: 3px; } .nb-av-note.done > span { color: #137a52; } .nb-av-note p { margin: 0; font-size: 14.5px; line-height: 1.55; color: #102a43; font-weight: 500; }
        .nb-av-vars { display: flex; gap: 8px; flex-wrap: wrap; } .nb-av-vars span { font: 600 13px 'JetBrains Mono', monospace; padding: 3px 10px; border-radius: 8px; background: #f1f4f9; color: #52627a; } .nb-av-vars em { font-style: normal; color: #1b4fc4; } .nb-av-vars b { color: #102a43; }
        .nb-av-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .nb-av-ctl { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #d9e1ec; border-radius: 10px; background: #fff; color: #334e68; cursor: pointer; } .nb-av-ctl:hover:not(:disabled) { background: #f1f5fb; } .nb-av-ctl:disabled { opacity: .35; cursor: default; }
        .nb-av-ctl.play { width: 44px; background: #2f6fed; border-color: #2f6fed; color: #fff; } .nb-av-ctl.play:hover { background: #1b4fc4; }
        .nb-av-range { flex: 1; min-width: 100px; accent-color: #2f6fed; } .nb-av-speed { padding: 7px 8px; border: 1px solid #d9e1ec; border-radius: 10px; font: inherit; font-size: 13px; background: #fff; }
        .nb-av-code-card h4 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #7b8aa0; }
        .nb-av-code { margin: 0; padding: 8px 0; border-radius: 12px; background: #fdfdfe; border: 1px solid #e3e9f3; overflow-x: auto; font: 13.5px/1.7 'JetBrains Mono', Consolas, monospace; }
        .nb-av-line { display: flex; min-width: max-content; padding-right: 14px; border-left: 4px solid transparent; } .nb-av-line > span { flex: none; width: 34px; text-align: right; padding-right: 12px; color: #b1bccd; user-select: none; } .nb-av-line code { font: inherit; white-space: pre; color: #243b53; }
        .nb-av-line.on { background: #fff3c7; border-left-color: var(--av-cmp); } .nb-av-line.on > span { color: #9a6b00; font-weight: 700; }
        .nb-av-hint { margin: 10px 0 0; font-size: 12px; color: #8a97ab; line-height: 1.5; }
        @media (max-width: 1180px) { .nb-av-work { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 820px) {
          .nb-av-layout { grid-template-columns: minmax(0, 1fr); } .nb-av-side { position: static; max-height: none; overflow: visible; gap: 6px; }
          .nb-av-group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .nb-av-group h4 { width: 100%; margin: 4px 2px 0; } .nb-av-group h4 small { display: none; }
          .nb-av-group button { width: auto; margin: 0; flex-direction: row; gap: 6px; align-items: center; border-color: #e3e9f3; padding: 7px 11px; } .nb-av-group button small { display: none; } .nb-av-hero { padding: 18px; } .nb-av-hero-count { display: none; }
          .nb-av-hero h2 { font-size: 21px; } .nb-av-rowlbl { width: 40px; font-size: 11px; } .nb-av-bars { height: 210px; } .nb-av-cells { flex-wrap: wrap; } .nb-av-cellcol { flex: none; width: 40px; } .nb-av-mrow > span, .nb-av-lists > div > span { width: 96px; }
        }
        @media (prefers-reduced-motion: reduce) { .nb-av *, .nb-av *::before { transition: none !important; } }
        /* ---- bổ sung: hai con trỏ ---- */
        .nb-av-ptr { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: auto; white-space: nowrap; line-height: 13px; } .nb-av-ptr span { font: 800 10.5px 'JetBrains Mono', monospace; color: var(--av-blue); }
        .nb-av-cellcol.bad .nb-av-cell { border-color: var(--av-swap); background: #fde3dc; color: #a2341a; } .nb-av-cellcol.keep .nb-av-cell { border-color: #7fcaa5; background: #e4f6ec; }
        .nb-av-cellcol.new .nb-av-cell { border-color: var(--av-blue); background: #dce8ff; transform: translateY(-3px); } .nb-av-cellcol.win .nb-av-cell { border-color: var(--av-min); background: #efe7ff; color: #4a2a99; }
        .nb-av-rows { display: flex; flex-direction: column; gap: 4px; } .nb-av-rowbox { display: flex; align-items: center; gap: 8px; } .nb-av-rowbox .nb-av-cells { flex: 1; justify-content: flex-start; padding: 4px 4px; min-width: 0; }
        .nb-av-rowlbl { flex: none; width: 56px; font-size: 12px; font-weight: 800; color: #627d98; text-align: right; }
        .nb-av-info .nb-av-tip { margin: 12px 0 0; padding: 12px 14px; border-radius: 12px; background: #fff8e6; color: #5f4710; } .nb-av-tip > b { font-size: 12.5px; text-transform: uppercase; letter-spacing: .05em; color: #9a6b00; }
        .nb-av-tip ol { margin: 8px 0 8px 20px; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.55; } .nb-av-info .nb-av-tip p { margin: 6px 0 0; font-size: 13.5px; color: #5f4710; }

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
                  {n.key === "problems" && feedbackCtx.badgeCount > 0 && <span className="nb-nav-dot" title={isTeacher ? "Có học sinh nộp lại sau nhận xét" : "Có nhận xét mới của thầy cô"}>{feedbackCtx.badgeCount}</span>}
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
              {tab === "typing" && <EntertainmentView currentUser={currentUser} />}
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
                  {n.key === "problems" && feedbackCtx.badgeCount > 0 && <i className="nb-nav-dot small">{feedbackCtx.badgeCount}</i>}
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
    </FeedbackContext.Provider>
  );
}

const rootEl = document.getElementById("root");
createRoot(rootEl).render(<App />);
