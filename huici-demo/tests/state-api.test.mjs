import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as session from "../app/lib/session.ts";

const routeSource = readFileSync(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// A small D1-shaped memory store exercises the actual route's ownership filters
// and compare-and-set logic without depending on a hosted Cloudflare runtime.
function setup({ alwaysConflict = false } = {}) {
  const rows = new Map();
  const columns = { userId: "userId", revision: "revision" };
  const eq = (column, value) => (row) => row[column] === value;
  const and = (...conditions) => (row) => conditions.every((condition) => condition(row));
  const db = {
    select: () => ({ from: () => ({ where: (condition) => ({ limit: async () => [...rows.values()].filter(condition).map((row) => structuredClone(row)) }) }) }),
    insert: () => ({ values: (row) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (rows.has(row.userId)) return [];
      rows.set(row.userId, structuredClone(row));
      return [structuredClone(row)];
    } }) }) }),
    update: () => ({ set: (values) => ({ where: (condition) => ({ returning: async () => {
      if (alwaysConflict) return [];
      const row = [...rows.values()].find(condition);
      if (!row) return [];
      const updated = { ...row, ...structuredClone(values) };
      rows.set(row.userId, updated);
      return [structuredClone(updated)];
    } }) }) }),
  };
  const exports = {};
  const require = (specifier) => {
    if (specifier === "drizzle-orm") return { eq, and };
    if (specifier === "../../../db") return { getDb: () => db };
    if (specifier === "../../../db/schema") return { attentionStates: columns };
    if (specifier === "../../lib/session") return session;
    throw new Error(`Unexpected import ${specifier}`);
  };
  vm.runInNewContext(compiled, { exports, require, Response, URL, Date, console });
  return { GET: exports.GET, POST: exports.POST, rows };
}

function request(user, operation, extra = {}) {
  return new Request("https://huici.test/api/state", {
    method: operation ? "POST" : "GET",
    headers: { ...(user ? { "oai-authenticated-user-id": user } : {}), ...(operation ? { "content-type": "application/json", origin: "https://huici.test" } : {}), ...extra.headers },
    ...(operation ? { body: JSON.stringify({ operation, ...extra.body }) } : {}),
  });
}

const start = (id) => ({ id, type: "start", payload: { title: "私人的方案", nextStep: "写下目标用户", durationMinutes: 25 } });

test("anonymous requests cannot read or modify state", async () => {
  const api = setup();
  assert.equal((await api.GET(request(null))).status, 401);
  assert.equal((await api.POST(request(null, start("one")))).status, 401);
  assert.equal(api.rows.size, 0);
});

test("user identity comes from the trusted header, never from posted userId", async () => {
  const api = setup();
  const response = await api.POST(request("alice", start("alice-session"), { body: { userId: "bob" } }));
  assert.equal(response.status, 200);
  assert.equal(api.rows.has("alice"), true);
  assert.equal(api.rows.has("bob"), false);
  const alice = await (await api.GET(request("alice"))).json();
  const bob = await (await api.GET(request("bob"))).json();
  assert.equal(alice.state.session.title, "私人的方案");
  assert.equal(bob.state.session, null);
  assert.equal(bob.state.notes.length, 0);
});

test("a second device receives saved state, and retries do not duplicate operations", async () => {
  const api = setup();
  await api.POST(request("alice", start("session-one")));
  const note = { id: "note-one", type: "add-note", payload: { text: "稍后查合同" } };
  await api.POST(request("alice", note));
  const retry = await (await api.POST(request("alice", note))).json();
  const secondDevice = await (await api.GET(request("alice"))).json();
  assert.equal(secondDevice.state.notes.length, 1);
  assert.equal(secondDevice.revision, 2);
  assert.equal(retry.revision, 2);
});

test("simultaneous changes from two devices retain both notes", async () => {
  const api = setup();
  await api.POST(request("alice", start("session-one")));
  const responses = await Promise.all([
    api.POST(request("alice", { id: "desktop-note", type: "add-note", payload: { text: "电脑念头" } })),
    api.POST(request("alice", { id: "phone-note", type: "add-note", payload: { text: "手机念头" } })),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  const snapshot = await (await api.GET(request("alice"))).json();
  assert.equal(snapshot.state.notes.length, 2);
  assert.equal(snapshot.revision, 3);
  assert.deepEqual(snapshot.state.notes.map((note) => note.text).sort(), ["手机念头", "电脑念头"].sort());
});

test("two concurrent starts cannot overwrite each other", async () => {
  const api = setup();
  const responses = await Promise.all([
    api.POST(request("alice", start("session-one"))),
    api.POST(request("alice", start("session-two"))),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(api.rows.get("alice").revision, 1);
});

test("another account cannot update or delete an owner's notes", async () => {
  const api = setup();
  await api.POST(request("alice", { id: "private-note", type: "add-note", payload: { text: "只属于 alice" } }));
  const foreignUpdate = await api.POST(request("bob", { id: "attempt-update", type: "update-note", payload: { id: "private-note", status: "done" } }));
  assert.equal(foreignUpdate.status, 404);
  await api.POST(request("bob", { id: "attempt-delete", type: "delete-note", payload: { id: "private-note" } }));
  const snapshot = await (await api.GET(request("alice"))).json();
  assert.equal(snapshot.state.notes[0].text, "只属于 alice");
  assert.equal(snapshot.state.notes[0].status, "parked");
});

test("cross-origin writes and malformed operations are rejected", async () => {
  const api = setup();
  assert.equal((await api.POST(request("alice", start("one"), { headers: { origin: "https://other.test" } }))).status, 403);
  assert.equal((await api.POST(request("alice", { id: "one", type: "nope" }))).status, 400);
  const badJson = new Request("https://huici.test/api/state", { method: "POST", headers: { "oai-authenticated-user-id": "alice" }, body: "{" });
  assert.equal((await api.POST(badJson)).status, 400);
  const oversized = request("alice", { id: "one", type: "add-note", payload: { text: "x".repeat(13_000) } });
  assert.equal((await api.POST(oversized)).status, 413);
  assert.equal(api.rows.size, 0);
});

test("a stale device cannot finish the other device's newer task", async () => {
  const api = setup();
  await api.POST(request("alice", start("old-session")));
  await api.POST(request("alice", { id: "finish-old", type: "finish", payload: { sessionId: "old-session" } }));
  await api.POST(request("alice", start("new-session")));
  const stale = await api.POST(request("alice", { id: "stale-finish", type: "finish", payload: { sessionId: "old-session" } }));
  assert.equal(stale.status, 409);
  const snapshot = await (await api.GET(request("alice"))).json();
  assert.equal(snapshot.state.session.id, "new-session");
  assert.equal(snapshot.state.history.length, 1);
});

test("an offline start/finish sequence retains ten minutes when it reaches the API later", async () => {
  const api = setup();
  const occurredAt = Date.now() - 3_600_000;
  await api.POST(request("alice", { ...start("offline-session"), occurredAt }));
  const response = await api.POST(request("alice", { id: "offline-finish", type: "finish", occurredAt: occurredAt + 600_000, payload: { sessionId: "offline-session" } }));
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.state.history[0].focusedSeconds, 600);
  assert.equal(snapshot.state.history[0].startedAt, occurredAt);
});

test("the API rejects illegal future event timestamps", async () => {
  const api = setup();
  const response = await api.POST(request("alice", { ...start("future-session"), occurredAt: Date.now() + 600_000 }));
  assert.equal(response.status, 400);
  assert.equal(api.rows.size, 0);
});

test("exhausted concurrent write retries return a retriable status", async () => {
  const api = setup({ alwaysConflict: true });
  await api.POST(request("alice", start("session-one")));
  const response = await api.POST(request("alice", { id: "retry-note", type: "add-note", payload: { text: "保留在客户端队列" } }));
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /自动重试/);
  assert.equal(api.rows.get("alice").revision, 1);
  assert.equal(api.rows.get("alice").state.notes.length, 0);
});
