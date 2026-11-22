export type SessionMode = "focus" | "waiting" | "break";
export type NoteStatus = "parked" | "later" | "done";
export type WaitingStyle = "quiet" | "question";

export type Session = {
  id: string;
  title: string;
  nextStep: string;
  durationMinutes: number;
  startedAt: number;
  lastEventAt: number;
  endsAt: number;
  mode: SessionMode;
  breakStartedAt: number | null;
  breakEndsAt: number | null;
  modeBeforeBreak: "focus" | "waiting" | null;
  totalBreakMs: number;
  waitingEndsAt: number | null;
  aiReady: boolean;
  returnCount: number;
  distractions: number;
  waitingStyle: WaitingStyle;
  questionAnswer: string;
};

export type Note = {
  id: string;
  text: string;
  createdAt: number;
  sessionId: string | null;
  status: NoteStatus;
};

export type Summary = {
  id: string;
  title: string;
  nextStep: string;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  focusedSeconds: number;
  returnCount: number;
  distractions: number;
  notesCount: number;
  completed: boolean;
};

export type AttentionState = {
  session: Session | null;
  notes: Note[];
  history: Summary[];
  recentOperations: string[];
};

export type State = AttentionState;

export type OperationType =
  | "start" | "add-note" | "update-note" | "delete-note" | "wait"
  | "wait-ready" | "resume" | "distraction" | "break" | "finish"
  | "update-next-step" | "update-answer" | "tick";

export type Operation = {
  id: string;
  type: OperationType;
  payload?: Record<string, unknown>;
  occurredAt?: number;
};

export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SessionError";
    this.status = status;
  }
}

export function createInitialState(): AttentionState {
  return { session: null, notes: [], history: [], recentOperations: [] };
}

function stringValue(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new SessionError(`${label}需要是文字`);
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maximum) {
    throw new SessionError(`${label}请填写${allowEmpty ? "不超过" : "1 至"} ${maximum} 个字`);
  }
  return text;
}

function numberValue(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new SessionError(`${label}应为 ${minimum} 至 ${maximum} 的整数`);
  }
  return value;
}

function finishBreak(session: Session, now: number): void {
  const until = Math.min(now, session.breakEndsAt ?? now);
  const elapsed = Math.max(0, until - (session.breakStartedAt ?? until));
  session.endsAt += elapsed;
  session.totalBreakMs += elapsed;
  session.mode = session.modeBeforeBreak ?? "focus";
  session.breakStartedAt = null;
  session.breakEndsAt = null;
  session.modeBeforeBreak = null;
}

// Deadlines, rather than interval counts, keep suspended tabs and devices aligned.
export function normalizeTime(state: AttentionState, now = Date.now()): AttentionState {
  const session = state.session;
  if (!session) return state;
  const ready = session.waitingEndsAt !== null && session.waitingEndsAt <= now && !session.aiReady;
  const breakOver = session.mode === "break" && session.breakEndsAt !== null && session.breakEndsAt <= now;
  if (!ready && !breakOver) return state;
  const next = structuredClone(state);
  if (ready) next.session!.aiReady = true;
  if (breakOver) finishBreak(next.session!, now);
  return next;
}

export function validateOperation(value: unknown, serverNow = Date.now()): Operation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SessionError("操作格式不正确");
  const operation = value as Record<string, unknown>;
  stringValue(operation.id, "操作编号", 128);
  const types: OperationType[] = ["start", "add-note", "update-note", "delete-note", "wait", "wait-ready", "resume", "distraction", "break", "finish", "update-next-step", "update-answer", "tick"];
  if (!types.includes(operation.type as OperationType)) throw new SessionError("无法识别这个操作");
  if (operation.payload !== undefined && (!operation.payload || typeof operation.payload !== "object" || Array.isArray(operation.payload))) {
    throw new SessionError("操作内容格式不正确");
  }
  if (operation.occurredAt !== undefined && (
    typeof operation.occurredAt !== "number" || !Number.isSafeInteger(operation.occurredAt)
    || operation.occurredAt < Date.UTC(2020, 0, 1) || operation.occurredAt > serverNow + 5 * 60_000
  )) {
    throw new SessionError("操作时间不正确，请检查设备时间");
  }
  return operation as Operation;
}

export function applyOperation(state: AttentionState, input: Operation, serverNow = Date.now()): AttentionState {
  const operation = validateOperation(input, serverNow);
  const now = operation.occurredAt === undefined ? serverNow : Math.min(operation.occurredAt, serverNow);
  if (state.recentOperations.includes(operation.id)) return normalizeTime(state, now);
  const next = structuredClone(normalizeTime(state, now));
  const payload = operation.payload ?? {};
  const active = (): Session => {
    if (!next.session) throw new SessionError("先开始一件想做的事", 409);
    if ("sessionId" in payload && payload.sessionId !== next.session.id) {
      throw new SessionError("这一轮已在另一台设备上变化，请查看当前任务", 409);
    }
    if (now < (next.session.lastEventAt ?? next.session.startedAt)) {
      throw new SessionError("这一轮已有更新的操作，请查看当前进展", 409);
    }
    next.session.lastEventAt = now;
    return next.session;
  };

  switch (operation.type) {
    case "start": {
      if (next.session) throw new SessionError("请先结束当前这一轮", 409);
      const title = stringValue(payload.title, "当前任务", 160);
      const nextStep = stringValue(payload.nextStep ?? "", "下一步", 240, true);
      const durationMinutes = numberValue(payload.durationMinutes, 1, 180, "专注分钟数");
      next.session = {
        id: operation.id, title, nextStep, durationMinutes, startedAt: now, lastEventAt: now,
        endsAt: now + durationMinutes * 60_000, mode: "focus",
        breakStartedAt: null, breakEndsAt: null, modeBeforeBreak: null, totalBreakMs: 0,
        waitingEndsAt: null, aiReady: false, returnCount: 0, distractions: 0,
        waitingStyle: "quiet", questionAnswer: "",
      };
      break;
    }
    case "add-note": {
      const text = stringValue(payload.text, "念头", 500);
      if (next.notes.length >= 200) throw new SessionError("暂存已满，先处理或删掉一些念头", 409);
      const sessionId = "sessionId" in payload
        ? payload.sessionId === null ? null : stringValue(payload.sessionId, "任务编号", 128)
        : next.session?.id ?? null;
      next.notes.unshift({ id: operation.id, text, createdAt: now, sessionId, status: "parked" });
      break;
    }
    case "update-note": {
      const id = stringValue(payload.id, "念头编号", 128);
      if (!["parked", "later", "done"].includes(payload.status as string)) throw new SessionError("念头状态不正确");
      const note = next.notes.find((item) => item.id === id);
      if (!note) throw new SessionError("这个念头已经不在了", 404);
      note.status = payload.status as NoteStatus;
      break;
    }
    case "delete-note": {
      const id = stringValue(payload.id, "念头编号", 128);
      next.notes = next.notes.filter((item) => item.id !== id);
      break;
    }
    case "wait": {
      const session = active();
      if (session.mode !== "focus") throw new SessionError("请先回到当前任务", 409);
      const seconds = numberValue(payload.seconds ?? 30, 5, 300, "模拟等待秒数");
      const style = payload.style ?? "quiet";
      if (style !== "quiet" && style !== "question") throw new SessionError("等待方式不正确");
      session.mode = "waiting";
      session.waitingEndsAt = now + seconds * 1000;
      session.waitingStyle = style;
      session.aiReady = false;
      session.questionAnswer = "";
      break;
    }
    case "wait-ready": {
      const session = active();
      if (session.waitingEndsAt === null) throw new SessionError("当前没有等待中的任务", 409);
      session.aiReady = true;
      session.waitingEndsAt = now;
      break;
    }
    case "resume": {
      const session = active();
      if (session.mode === "break") {
        finishBreak(session, now);
      } else if (session.mode === "waiting") {
        session.mode = "focus";
        session.waitingEndsAt = null;
        session.aiReady = false;
      }
      session.returnCount += 1;
      break;
    }
    case "distraction": {
      active().distractions += 1;
      break;
    }
    case "break": {
      const session = active();
      if (session.mode === "break") throw new SessionError("已经在休息了", 409);
      const minutes = numberValue(payload.minutes ?? 3, 1, 30, "休息分钟数");
      session.modeBeforeBreak = session.mode;
      session.mode = "break";
      session.breakStartedAt = now;
      session.breakEndsAt = now + minutes * 60_000;
      break;
    }
    case "finish": {
      const session = active();
      if (payload.completed !== undefined && typeof payload.completed !== "boolean") throw new SessionError("完成状态不正确");
      if (session.mode === "break") finishBreak(session, now);
      next.history.unshift({
        id: session.id, title: session.title, nextStep: session.nextStep,
        startedAt: session.startedAt, endedAt: now, durationMinutes: session.durationMinutes,
        focusedSeconds: Math.max(0, Math.floor((now - session.startedAt - session.totalBreakMs) / 1000)),
        returnCount: session.returnCount, distractions: session.distractions,
        notesCount: next.notes.filter((item) => item.sessionId === session.id).length,
        completed: payload.completed ?? true,
      });
      next.history = next.history.slice(0, 50);
      next.session = null;
      break;
    }
    case "update-next-step": {
      active().nextStep = stringValue(payload.nextStep, "下一步", 240, true);
      break;
    }
    case "update-answer": {
      const session = active();
      if (session.waitingEndsAt === null) throw new SessionError("当前没有等待中的任务", 409);
      session.questionAnswer = stringValue(payload.answer, "你的想法", 1000, true);
      break;
    }
    case "tick": break;
  }

  next.recentOperations = [...next.recentOperations.slice(-99), operation.id];
  return next;
}
