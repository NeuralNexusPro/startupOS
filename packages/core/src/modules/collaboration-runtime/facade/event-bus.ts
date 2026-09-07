/**
 * Facade — SSE 客户端注册表 + 事件分发
 *
 * 迁移自 src/lib/collaboration-runtime-service/index.ts（Story 9.38）
 * 职责：SseEventEmitter、SSE client 注册/注销、grace 定时器、全局 eventEmitter
 */

import path from "path";
import { FsEventStore } from "../../../modules/collaboration-runtime/session/fs-event-store";
import type { RuntimeEvent } from "../../../modules/collaboration-runtime/session/types";
import type { EventEmitter } from "../../../modules/collaboration-runtime";
import { sessions, eventStores, STATE_ROOT_DIR } from "./session-store";
import { getDataRoot } from "../../../lib/paths";

// ============================================================================
// SseClient + SseEventEmitter
// ============================================================================

export type SseClient = {
  send: (event: string, data: string) => void;
  close: () => void;
};

class SseEventEmitter implements EventEmitter {
  // Map from sessionId → clients subscribed to that session
  private sessionClients = new Map<string, SseClient[]>();

  emit(event: RuntimeEvent): void {
    const data = JSON.stringify(event);
    const targets = this.sessionClients.get(event.sessionId) ?? [];
    for (const client of targets) {
      try {
        client.send("message", data);
      } catch {
        // client disconnected, will be cleaned up
      }
    }

    // Electron 转发（同步，不依赖 SSE 客户端）
    for (const forwarder of globalThis.__collaborationElectronForwarders ?? []) {
      try { forwarder(event); } catch { /* ignore */ }
    }
  }

  addClient(sessionId: string, client: SseClient): void {
    const existing = this.sessionClients.get(sessionId) ?? [];
    if (!existing.includes(client)) {
      this.sessionClients.set(sessionId, [...existing, client]);
    }
  }

  removeClient(client: SseClient): void {
    for (const [sid, clients] of this.sessionClients) {
      const filtered = clients.filter((c) => c !== client);
      if (filtered.length !== clients.length) {
        this.sessionClients.set(sid, filtered);
      }
    }
  }
}

// ============================================================================
// 全局 EventEmitter（HMR 安全：保存在 globalThis 避免热重载后实例被替换）
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var __collaborationEventEmitter: SseEventEmitter | undefined;
  // eslint-disable-next-line no-var
  var __collaborationElectronForwarders: Set<(event: RuntimeEvent) => void> | undefined;
}

if (!globalThis.__collaborationEventEmitter) {
  globalThis.__collaborationEventEmitter = new SseEventEmitter();
}
if (!globalThis.__collaborationElectronForwarders) {
  globalThis.__collaborationElectronForwarders = new Set();
}
export const eventEmitter = globalThis.__collaborationEventEmitter;

/**
 * 注册 Electron 转发回调（同步，不需要 await facade）。
 * 每个 RuntimeEvent 发出时都会调用所有已注册的回调。
 * 返回取消注册函数。
 */
export function addElectronForwarder(cb: (event: RuntimeEvent) => void): () => void {
  globalThis.__collaborationElectronForwarders!.add(cb);
  return () => { globalThis.__collaborationElectronForwarders!.delete(cb); };
}

/** Public, transport-neutral subscription used by Channel adapters. */
export function subscribeToRuntimeEvents(sessionId: string, cb: (event: RuntimeEvent) => void): () => void {
  return addElectronForwarder((event) => {
    if (event.sessionId === sessionId) cb(event);
  });
}

// ============================================================================
// SSE Consumer Tracking + Grace Period Disconnect
// ============================================================================

/** 每会话 SSE client 集合 */
const sessionClients = new Map<string, Set<SseClient>>();
/** 每会话断开 grace 定时器 */
const graceTimers = new Map<string, NodeJS.Timeout>();
const GRACE_PERIOD_MS = 30_000; // 30s for page refresh reconnect

/** 注册客户端，如果有重连则取消 grace 定时器 */
export function registerClient(id: string, client: SseClient): void {
  const clients = sessionClients.get(id) ?? new Set();
  clients.add(client);
  sessionClients.set(id, clients);

  // 页面刷新后重连，取消 grace 定时器
  const existing = graceTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    graceTimers.delete(id);
  }
}

/** 移除客户端，最后一个离开时启动 grace 定时器 */
export function unregisterClient(id: string, client: SseClient): void {
  const clients = sessionClients.get(id);
  if (!clients) {return;}

  clients.delete(client);
  if (clients.size === 0) {
    sessionClients.delete(id);
    startGraceTimer(id);
  }
}

/** 获取会话当前 SSE client 数量 */
export function getClientCount(id: string): number {
  return sessionClients.get(id)?.size ?? 0;
}

/** grace 定时器到期後如果没有新客户端连接，仅记录日志，不自动终止（进程由 window 关闭时手动回收） */
export function startGraceTimer(id: string): void {
  const timer = setTimeout(() => {
    graceTimers.delete(id);
    if (getClientCount(id) === 0) {
      console.error(`[collaboration] SSE disconnect: session ${id} has no clients after ${GRACE_PERIOD_MS}ms grace — waiting for explicit close`);
    }
  }, GRACE_PERIOD_MS);
  graceTimers.set(id, timer);
}

// ============================================================================
// Public API — SSE 订阅/取消订阅
// ============================================================================

export function subscribeToEvents(id: string, client: SseClient): void {
  registerClient(id, client);
  eventEmitter.addClient(id, client);

  // Reconstruct store if lost (HMR / server restart)
  let store = eventStores.get(id);
  if (!store) {
    const session = sessions.get(id);
    if (session) {
      const sessionDir = path.join(getDataRoot(), "projects", session.projectId, "collaboration-sessions");
      store = new FsEventStore(sessionDir);
      eventStores.set(id, store);
    } else {
      // Session not in memory — scan filesystem to find the JSONL
      void (async () => {
        try {
          const { readdir } = await import("fs/promises");
          const projectIds = await readdir(STATE_ROOT_DIR);
          for (const pid of projectIds) {
            const dir = path.join(getDataRoot(), "projects", pid, "collaboration-sessions");
            const testStore = new FsEventStore(dir);
            const events = await testStore.read(id);
            if (events.length > 0) {
              eventStores.set(id, testStore);
              return;
            }
          }
        } catch { /* ignore */ }
      })();
    }
  }
}

export function unsubscribeFromEvents(client: SseClient): void {
  eventEmitter.removeClient(client);
  // Find which session this client belongs to and unregister
  for (const [id, clients] of sessionClients) {
    if (clients.has(client)) {
      unregisterClient(id, client);
      break;
    }
  }
}

/** 显式通知某个会话的客户端断开（由 SSE route 调用） */
export function clientDisconnected(id: string, client: SseClient): void {
  eventEmitter.removeClient(client);
  unregisterClient(id, client);
}
