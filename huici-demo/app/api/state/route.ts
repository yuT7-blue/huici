import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { attentionStates } from "../../../db/schema";
import { applyOperation, createInitialState, normalizeTime, SessionError, validateOperation } from "../../lib/session";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "no-store", "Vary": "Cookie" };

function userIdFromRequest(request: Request): string {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) throw new SessionError("登录后即可在手机和电脑间同步", 401);
  return userId;
}

function checkOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new SessionError("请在回此页面内进行操作", 403);
}

function errorResponse(error: unknown): Response {
  if (error instanceof SessionError) return Response.json({ error: error.message }, { status: error.status, headers: responseHeaders });
  console.error("Attention state request failed", error);
  return Response.json({ error: "同步暂时没有连接上，稍后会重试" }, { status: 503, headers: responseHeaders });
}

export async function GET(request: Request) {
  try {
    const userId = userIdFromRequest(request);
    const db = getDb();
    const [row] = await db.select().from(attentionStates).where(eq(attentionStates.userId, userId)).limit(1);
    return Response.json(row
      ? { state: normalizeTime(row.state), revision: row.revision, updatedAt: row.updatedAt }
      : { state: createInitialState(), revision: 0, updatedAt: 0 },
    { headers: responseHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = userIdFromRequest(request);
    checkOrigin(request);
    const raw = await request.text();
    if (raw.length > 12_000) throw new SessionError("这次内容太长了", 413);
    let body: { operation?: unknown };
    try { body = JSON.parse(raw); } catch { throw new SessionError("操作内容格式不正确"); }
    if (!body || typeof body !== "object") throw new SessionError("操作内容格式不正确");
    const operation = validateOperation(body.operation);
    const db = getDb();

    // Apply commands to the latest row. A revision guard prevents one device
    // from replacing changes made by another device between the read and write.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const [row] = await db.select().from(attentionStates).where(eq(attentionStates.userId, userId)).limit(1);
      const current = row?.state ?? createInitialState();
      const now = Date.now();
      if (current.recentOperations.includes(operation.id)) {
        return Response.json({ state: normalizeTime(current, now), revision: row?.revision ?? 0, updatedAt: row?.updatedAt ?? 0 }, { headers: responseHeaders });
      }
      const state = applyOperation(current, operation, now);
      if (!row) {
        const inserted = await db.insert(attentionStates).values({ userId, state, revision: 1, updatedAt: now }).onConflictDoNothing().returning();
        if (inserted.length) return Response.json({ state: normalizeTime(state, now), revision: 1, updatedAt: now }, { headers: responseHeaders });
      } else {
        const revision = row.revision + 1;
        const updated = await db.update(attentionStates).set({ state, revision, updatedAt: now })
          .where(and(eq(attentionStates.userId, userId), eq(attentionStates.revision, row.revision))).returning();
        if (updated.length) return Response.json({ state: normalizeTime(state, now), revision, updatedAt: now }, { headers: responseHeaders });
      }
    }
    throw new SessionError("另一台设备正在更新，稍后会自动重试", 429);
  } catch (error) {
    return errorResponse(error);
  }
}
