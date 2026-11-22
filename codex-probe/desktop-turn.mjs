import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function readDesktopTurn(filename, { includeTask = false } = {}) {
  const stream = createReadStream(filename, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const turns = new Map();
  let isDesktop = false;
  let latest;
  try {
    for await (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        // Codex may still be writing the last line.
        continue;
      }
      if (row?.type === "session_meta") {
        isDesktop = row.payload?.originator === "Codex Desktop";
      }
      if (includeTask && latest?.phase === "running" && latest.task === undefined &&
          row?.type === "response_item" && row.payload?.type === "message" && row.payload.role === "user") {
        const text = row.payload.content?.find(part => part.type === "input_text")?.text?.trim();
        if (text && !/^<(environment_context|permissions instructions|collaboration_mode|skills_instructions|send_user_message_question_reply|user_instructions)([\s>])/i.test(text)) {
          latest.task = Array.from(text.replace(/\s+/g, " ")).slice(0, 100).join("");
        }
      }
      if (row?.type !== "event_msg") continue;
      const { type, turn_id: id } = row.payload ?? {};
      if (typeof id !== "string" || !id) continue;
      if (type === "task_started" && !turns.has(id)) {
        latest = { phase: "running", startedAt: row.timestamp };
        turns.set(id, latest);
      } else if (type === "task_complete" || type === "turn_aborted") {
        const turn = turns.get(id);
        if (!turn) continue;
        if (turn.phase === "running" || type === "turn_aborted") {
          turn.phase = type === "turn_aborted" ? "interrupted" : "ended";
          turn.endedAt = row.timestamp;
          delete turn.task;
        }
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  if (!isDesktop) throw new Error("这个文件缺少 Codex Desktop 会话标记。");
  const observations = [...turns.values()];
  return {
    observedTurns: observations.length,
    latest: observations.at(-1) ?? null,
    ended: observations.filter(turn => turn.phase === "ended").length,
    interrupted: observations.filter(turn => turn.phase === "interrupted").length,
  };
}

if (import.meta.main) {
  const filename = process.argv[2];
  if (!filename) {
    console.error("请传入一个指定的 Codex Desktop 会话记录路径。");
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await readDesktopTurn(filename, {
        includeTask: process.argv[3] === "--task",
      }), null, 2));
    } catch {
      console.error("无法读取该 Codex Desktop 会话记录。");
      process.exitCode = 1;
    }
  }
}
