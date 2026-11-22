import assert from "node:assert/strict";
import test from "node:test";
import { applyOperation, createInitialState, normalizeTime, SessionError, validateOperation } from "../app/lib/session.ts";

const startAt = 1_000_000;
const start = (id = "session-1") => applyOperation(createInitialState(), {
  id, type: "start", payload: { title: "写完方案", nextStep: "先写目标用户", durationMinutes: 25 },
}, startAt);
const command = (state, type, payload = {}, now = startAt + 1000, id = `${type}-${now}`) => applyOperation(state, { id, type, payload }, now);

test("starting a session validates the task and does not mutate input", () => {
  const initial = createInitialState();
  const state = start();
  assert.equal(initial.session, null);
  assert.equal(state.session.title, "写完方案");
  assert.equal(state.session.endsAt, startAt + 25 * 60_000);
  assert.throws(() => command(initial, "start", { title: " ", durationMinutes: 25 }), SessionError);
  assert.throws(() => command(initial, "start", { title: "任务", durationMinutes: -1 }), SessionError);
  assert.throws(() => command(state, "start", { title: "另一件事", durationMinutes: 25 }), { status: 409 });
});

test("a retry with the same operation id cannot create duplicate notes", () => {
  const operation = { id: "note-one", type: "add-note", payload: { text: "查一下租房合同" } };
  const once = applyOperation(start(), operation, startAt + 2000);
  const twice = applyOperation(once, operation, startAt + 3000);
  assert.equal(twice.notes.length, 1);
  assert.equal(twice.notes[0].sessionId, "session-1");
  assert.equal(twice.notes[0].createdAt, startAt + 2000);
});

test("notes remain manageable after a session ends", () => {
  let state = command(start(), "add-note", { text: "新想法" }, startAt + 1000, "note-one");
  state = command(state, "finish", { completed: false }, startAt + 20_000);
  assert.equal(state.session, null);
  assert.equal(state.history[0].notesCount, 1);
  assert.equal(state.history[0].completed, false);
  state = command(state, "update-note", { id: "note-one", status: "later" });
  assert.equal(state.notes[0].status, "later");
  state = command(state, "delete-note", { id: "note-one" });
  assert.equal(state.notes.length, 0);
});

test("AI readiness follows real deadlines after a suspended tab", () => {
  const state = command(start(), "wait", { seconds: 30, style: "question" }, startAt + 5000);
  const later = normalizeTime(state, startAt + 200_000);
  assert.equal(state.session.aiReady, false);
  assert.equal(later.session.aiReady, true);
  assert.equal(later.session.mode, "waiting");
  assert.equal(later.session.endsAt, startAt + 25 * 60_000);
  const resumed = command(later, "resume", {}, startAt + 201_000);
  assert.equal(resumed.session.mode, "focus");
  assert.equal(resumed.session.aiReady, false);
  assert.equal(resumed.session.returnCount, 1);
});

test("leaving a break early pauses work timing only for actual break time", () => {
  const state = command(start(), "break", { minutes: 3 }, startAt + 10_000);
  const resumed = command(state, "resume", {}, startAt + 40_000);
  assert.equal(resumed.session.mode, "focus");
  assert.equal(resumed.session.totalBreakMs, 30_000);
  assert.equal(resumed.session.endsAt, startAt + 25 * 60_000 + 30_000);
  assert.equal(resumed.session.breakEndsAt, null);
  const finished = command(resumed, "finish", {}, startAt + 100_000);
  assert.equal(finished.history[0].focusedSeconds, 70);
});

test("AI continues during a break; reopening later does not stretch the break indefinitely", () => {
  let state = command(start(), "wait", { seconds: 30 }, startAt + 10_000);
  state = command(state, "break", { minutes: 1 }, startAt + 20_000);
  const later = normalizeTime(state, startAt + 500_000);
  assert.equal(later.session.mode, "waiting");
  assert.equal(later.session.aiReady, true);
  assert.equal(later.session.totalBreakMs, 60_000);
  assert.equal(later.session.endsAt, startAt + 25 * 60_000 + 60_000);
  assert.equal(normalizeTime(later, startAt + 600_000), later);
});

test("ending during a break excludes the elapsed break from this round's timing", () => {
  const state = command(start(), "break", { minutes: 3 }, startAt + 20_000);
  const finished = command(state, "finish", {}, startAt + 50_000);
  assert.equal(finished.history[0].focusedSeconds, 20);
});

test("invalid transitions and unbounded data are rejected", () => {
  const initial = createInitialState();
  for (const type of ["wait", "wait-ready", "resume", "break", "finish", "update-next-step", "update-answer", "distraction"]) {
    assert.throws(() => command(initial, type), { status: 409 });
  }
  assert.throws(() => command(start(), "update-answer", { answer: "提前回答" }), { status: 409 });
  assert.throws(() => command(start(), "add-note", { text: "x".repeat(501) }), SessionError);
  assert.throws(() => command(start(), "break", { minutes: 0 }), SessionError);
  assert.throws(() => command(start(), "wait", { seconds: 0 }), SessionError);
  assert.throws(() => command(start(), "update-note", { id: "missing", status: "done" }), { status: 404 });
  assert.throws(() => validateOperation({ id: "bad", type: "unknown" }), SessionError);
  assert.throws(() => validateOperation({ id: "bad", type: "tick", payload: [] }), SessionError);
});

test("a duplicate finish request stays idempotent after session is cleared", () => {
  const operation = { id: "finish-once", type: "finish" };
  const once = applyOperation(start(), operation, startAt + 90_000);
  const twice = applyOperation(once, operation, startAt + 95_000);
  assert.equal(twice.history.length, 1);
  assert.equal(twice.history[0].endedAt, startAt + 90_000);
});

test("new ideas may be parked before a session, without false attribution", () => {
  const state = command(createInitialState(), "add-note", { text: "开始前想起的事情" });
  assert.equal(state.notes[0].sessionId, null);
  assert.equal(state.history.length, 0);
});

test("stale offline commands cannot finish or change a newer session", () => {
  let state = command(start("old-session"), "finish", {}, startAt + 1000);
  state = command(state, "start", { title: "新一轮", nextStep: "第一步", durationMinutes: 15 }, startAt + 2000, "new-session");
  for (const type of ["finish", "break", "resume", "wait", "wait-ready", "distraction", "update-next-step", "update-answer"]) {
    assert.throws(() => command(state, type, { sessionId: "old-session", nextStep: "错误的下一步", answer: "旧回答" }, startAt + 3000), { status: 409 });
  }
  assert.equal(state.session.id, "new-session");
  assert.equal(state.session.nextStep, "第一步");
});

test("an offline note retains the session in which it was captured", () => {
  const state = command(start("new-session"), "add-note", { text: "上一轮想到的", sessionId: "old-session" }, startAt + 1000, "old-note");
  assert.equal(state.notes[0].sessionId, "old-session");
  const withoutSession = command(state, "add-note", { text: "开始前想到的", sessionId: null }, startAt + 2000, "before-note");
  assert.equal(withoutSession.notes[0].sessionId, null);
  assert.throws(() => command(state, "add-note", { text: "念头", sessionId: 123 }), SessionError);
});

test("replaying a completed offline round preserves its original ten minutes", () => {
  const occurredAt = Date.UTC(2026, 9, 21, 12);
  const syncAt = occurredAt + 3_600_000;
  const state = applyOperation(createInitialState(), { id: "offline-session", type: "start", occurredAt, payload: { title: "离线写方案", durationMinutes: 25 } }, syncAt);
  const finished = applyOperation(state, { id: "offline-finish", type: "finish", occurredAt: occurredAt + 600_000, payload: { sessionId: "offline-session" } }, syncAt + 10);
  assert.equal(finished.history[0].startedAt, occurredAt);
  assert.equal(finished.history[0].endedAt, occurredAt + 600_000);
  assert.equal(finished.history[0].focusedSeconds, 600);
});

test("historical break and early resume replay without inflating break duration", () => {
  const occurredAt = Date.UTC(2026, 9, 21, 12);
  const syncAt = occurredAt + 3_600_000;
  let state = applyOperation(createInitialState(), { id: "offline-session", type: "start", occurredAt, payload: { title: "离线工作", durationMinutes: 25 } }, syncAt);
  state = applyOperation(state, { id: "offline-break", type: "break", occurredAt: occurredAt + 60_000, payload: { sessionId: "offline-session", minutes: 3 } }, syncAt);
  // API responses normalize for display; the event result remains the stored state.
  assert.equal(normalizeTime(state, syncAt).session.mode, "focus");
  assert.equal(state.session.mode, "break");
  state = applyOperation(state, { id: "offline-resume", type: "resume", occurredAt: occurredAt + 120_000, payload: { sessionId: "offline-session" } }, syncAt);
  const finished = applyOperation(state, { id: "offline-finish", type: "finish", occurredAt: occurredAt + 600_000, payload: { sessionId: "offline-session" } }, syncAt);
  assert.equal(finished.history[0].focusedSeconds, 540);
});

test("event timestamps reject invalid or far future times and clamp minor future skew", () => {
  const now = Date.UTC(2026, 9, 21);
  for (const occurredAt of [Date.UTC(2019, 11, 31), now + 300_001, NaN, Infinity, now + 0.5]) {
    assert.throws(() => applyOperation(createInitialState(), { id: "bad-time", type: "tick", occurredAt }, now), SessionError);
  }
  const state = applyOperation(createInitialState(), { id: "small-skew", type: "start", occurredAt: now + 1000, payload: { title: "设备稍有时差", durationMinutes: 15 } }, now);
  assert.equal(state.session.startedAt, now);
});

test("older session events cannot move state backwards in time", () => {
  const occurredAt = Date.UTC(2026, 9, 21);
  const syncAt = occurredAt + 3_600_000;
  let state = applyOperation(createInitialState(), { id: "session", type: "start", occurredAt, payload: { title: "任务", durationMinutes: 15 } }, syncAt);
  state = applyOperation(state, { id: "newer", type: "update-next-step", occurredAt: occurredAt + 60_000, payload: { nextStep: "新进展", sessionId: "session" } }, syncAt);
  assert.throws(() => applyOperation(state, { id: "older", type: "finish", occurredAt: occurredAt + 10_000, payload: { sessionId: "session" } }, syncAt), { status: 409 });
  assert.equal(state.session.nextStep, "新进展");
});
