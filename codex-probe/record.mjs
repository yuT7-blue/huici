import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const events = new Set(["UserPromptSubmit", "Stop", "Interrupt", "PermissionRequest"]);
const stateDir = fileURLToPath(new URL("./.events/", import.meta.url));

export function recordHook(input, directory = stateDir) {
  if (!events.has(input?.hook_event_name)) return;
  const { session_id, turn_id, hook_event_name: event } = input;
  if (typeof session_id !== "string" || !session_id ||
      typeof turn_id !== "string" || !turn_id) {
    // Keep this visible so a different Codex hook schema cannot silently pass a trial.
    saveEvent(directory, { event, missingIds: true, observedAt: Date.now() });
    return;
  }
  const turn = createHash("sha256")
    .update(JSON.stringify([session_id, turn_id]))
    .digest("hex");
  saveEvent(directory, {
    turn,
    event,
    observedAt: Date.now(),
    ...(event === "UserPromptSubmit" && {
      hasPrompt: typeof input.prompt === "string" && Boolean(input.prompt.trim()),
    }),
  });
}

function saveEvent(directory, entry) {
  mkdirSync(directory, { recursive: true });
  const id = randomUUID();
  const temporary = join(directory, id + ".tmp");
  try {
    writeFileSync(temporary, JSON.stringify(entry), { flag: "wx" });
    renameSync(temporary, join(directory, id + ".json"));
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readObservations(directory = stateDir) {
  const turns = new Map();
  const missingIds = {};
  let files;
  try {
    files = readdirSync(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    files = [];
  }
  for (const name of files.filter(name => name.endsWith(".json"))) {
    const { turn, event, observedAt, hasPrompt } = JSON.parse(readFileSync(join(directory, name), "utf8"));
    if (!turn) {
      missingIds[event] = (missingIds[event] ?? 0) + 1;
      continue;
    }
    const entry = turns.get(turn) ?? { turn, observed: {}, hasPrompt: false };
    entry.observed[event] = Math.min(entry.observed[event] ?? Infinity, observedAt);
    entry.hasPrompt ||= Boolean(hasPrompt);
    turns.set(turn, entry);
  }
  return { turns: [...turns.values()], missingIds };
}

if (import.meta.main) {
  try {
    if (process.argv[2] === "status") {
      console.log(JSON.stringify(readObservations(), null, 2));
    } else {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      recordHook(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    }
  } catch {
    console.error("回此未能记录或读取本次 Codex 事件。");
    process.exitCode = 1;
  }
}
