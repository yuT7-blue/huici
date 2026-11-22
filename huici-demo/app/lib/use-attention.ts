"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyOperation, createInitialState, normalizeTime, type Operation, type State } from "./session";

const STORAGE_KEY = "huici-workspace-v1";
type SyncStatus = "connecting" | "synced" | "saving" | "offline" | "local";
type Snapshot = { state: State; revision: number; updatedAt: number };

export function useAttention() {
  const [state, setState] = useState<State>(createInitialState);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const stateRef = useRef(state);
  const pending = useRef<Operation[]>([]);
  const busy = useRef(false);
  const mounted = useRef(false);
  const remote = useRef(false);

  const commit = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: next, pending: pending.current }));
    } catch {
      setError("浏览器存储空间不足，请先保留重要念头。");
    }
  }, []);

  const synchronize = useCallback(async () => {
    if (busy.current || !mounted.current) return;
    busy.current = true;
    try {
      let response = await fetch("/api/state", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (response.status === 401) {
        remote.current = false;
        setSync("local");
        return;
      }
      if (!response.ok) throw new Error("同步暂时不可用");
      remote.current = true;
      let snapshot = await response.json() as Snapshot;
      while (pending.current.length) {
        setSync("saving");
        const operation = pending.current[0];
        response = await fetch("/api/state", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation }), signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429) {
            const rejected = await response.json() as { error?: string };
            pending.current.shift();
            commit(stateRef.current);
            setError(rejected.error || "另一端的任务已变化，这次操作未能同步。");
            continue;
          }
          throw new Error("同步暂时不可用");
        }
        snapshot = await response.json() as Snapshot;
        pending.current.shift();
        commit(stateRef.current);
      }
      commit(snapshot.state);
      setSync("synced");
    } catch {
      setSync(remote.current ? "offline" : "local");
    } finally {
      busy.current = false;
    }
  }, [commit]);

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.state && Array.isArray(saved.state.notes) && Array.isArray(saved.state.history)) {
        pending.current = Array.isArray(saved.pending) ? saved.pending : [];
        commit(normalizeTime(saved.state, Date.now()));
      }
    } catch { /* A damaged local cache starts an empty workspace. */ }
    setReady(true);
    void synchronize();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void synchronize(); }, 4000);
    const wake = () => { setNow(Date.now()); void synchronize(); };
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      mounted.current = false;
      window.clearInterval(clock); window.clearInterval(poll);
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [commit, synchronize]);

  const dispatch = useCallback((type: Operation["type"], payload: Record<string, unknown> = {}) => {
    const sessionPayload = ["start", "update-note", "delete-note", "tick"].includes(type)
      ? payload : { sessionId: stateRef.current.session?.id ?? null, ...payload };
    const operation: Operation = { id: crypto.randomUUID(), type, payload: sessionPayload, occurredAt: Date.now() };
    try {
      const next = applyOperation(stateRef.current, operation, Date.now());
      pending.current.push(operation);
      commit(next);
      if (remote.current) setSync("saving");
      void synchronize();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "这次操作没有完成，请重试。");
      return false;
    }
  }, [commit, synchronize]);

  return { state: normalizeTime(state, now), ready, sync, now, error, clearError: () => setError(""), dispatch, synchronize };
}
