import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readDesktopTurn } from "./desktop-turn.mjs";
import { readObservations, recordHook } from "./record.mjs";

test("retains independent, private observations for concurrent Codex turns", () => {
  const directory = mkdtempSync(join(tmpdir(), "huici-hooks-"));
  try {
    const cwd = "D:/same-project";
    const record = (session_id, turn_id, hook_event_name, fields = {}) =>
      recordHook({ cwd, session_id, turn_id, hook_event_name, ...fields }, directory);

    assert.deepEqual(readObservations(join(directory, "empty")), { turns: [], missingIds: {} });
    record("session-a", "turn-a", "UserPromptSubmit", { prompt: "private prompt" });
    record("session-b", "turn-b", "UserPromptSubmit");
    record("session-a", "turn-a", "PermissionRequest", { tool_input: { command: "private tool input" } });
    record("session-a", "turn-a", "Stop", { last_assistant_message: "private reply" });
    const { turns: concurrent } = readObservations(directory);
    assert.equal(concurrent.length, 2);
    assert.equal(concurrent.filter(turn => turn.observed.Stop).length, 1);
    assert.equal(concurrent.filter(turn => turn.observed.PermissionRequest).length, 1);

    record("session-b", "turn-b", "Interrupt");
    record("session-a", "turn-a", "Stop");
    record("session-a", "turn-c", "Interrupt");
    record("session-a", "turn-c", "UserPromptSubmit");
    record("session-a", "", "Interrupt");
    const { turns, missingIds } = readObservations(directory);
    assert.equal(turns.length, 3);
    assert.equal(turns.filter(turn => turn.observed.Stop).length, 1);
    assert.equal(turns.filter(turn => turn.observed.Interrupt).length, 2);
    assert.ok(turns.every(turn => turn.observed.UserPromptSubmit));
    assert.equal(turns.filter(turn => turn.hasPrompt).length, 1);
    assert.deepEqual(missingIds, { Interrupt: 1 });
    for (const file of readdirSync(directory)) {
      const raw = readFileSync(join(directory, file), "utf8");
      assert.doesNotMatch(raw, /private|session-a|same-project|turn-a/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reads the active desktop turn while ignoring late events from an old turn", async () => {
  const directory = mkdtempSync(join(tmpdir(), "huici-desktop-turn-"));
  try {
    const filename = join(directory, "session.jsonl");
    const desktop = { type: "session_meta", payload: { originator: "Codex Desktop" } };
    const event = (type, turn_id, timestamp) => ({
      type: "event_msg",
      timestamp,
      payload: { type, turn_id, last_agent_message: "private reply" },
    });
    const events = [
      desktop,
      event("task_started", "old", "1"),
      event("task_started", "current", "2"),
      { type: "response_item", payload: { type: "message", role: "user", content: [
        { type: "input_text", text: "<environment_context>private metadata</environment_context>" },
      ] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [
        { type: "input_text", text: "核对安卓打开微信后提醒的时机" },
      ] } },
      event("task_complete", "old", "3"),
    ];
    const save = () => writeFileSync(filename, events.map(row => JSON.stringify(row)).join("\n") + '\n{"partial":');
    save();
    assert.deepEqual(await readDesktopTurn(filename), {
      observedTurns: 2, latest: { phase: "running", startedAt: "2" }, ended: 1, interrupted: 0,
    });
    assert.equal((await readDesktopTurn(filename, { includeTask: true })).latest.task,
                 "核对安卓打开微信后提醒的时机");
    events.push(event("turn_aborted", "current", "4"), event("task_complete", "current", "5"));
    save();
    assert.deepEqual(await readDesktopTurn(filename, { includeTask: true }), {
      observedTurns: 2, latest: { phase: "interrupted", startedAt: "2", endedAt: "4" },
      ended: 1, interrupted: 1,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
