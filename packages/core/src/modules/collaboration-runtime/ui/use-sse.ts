"use client";

/**
 * Collaboration event hook.
 * 同一 session 只保持一条事件连接；Web 使用 EventSource，Electron 使用 IPC event stream。
 */

import { useEffect, useRef, useCallback } from "react";
import { useCollaborationUi, eventActivityAgentId, eventToAgentStatus } from "./store";
import type { RuntimeEvent } from "../session/types";
import { subscribeCollaborationEvents } from "../../../lib/integrations/electron/services/collaboration";

/** 全局事件连接池 — 同一 session 只保持一条连接 */
const globalConnections = new Map<string, () => void>();

/** 每个 session 的消息回调列表，支持多个组件同时订阅 */
const globalCallbacks = new Map<string, Set<(data: unknown) => void>>();

/** 事件缓冲区：回调注册前到来的事件先缓存，注册后立即回放（最多保留 30s） */
const eventBuffer = new Map<string, { events: unknown[]; timer: ReturnType<typeof setTimeout> }>();
const EVENT_BUFFER_TTL = 30_000;

function bufferEvent(sessionId: string, data: unknown): void {
  const existing = eventBuffer.get(sessionId);
  if (existing) {
    existing.events.push(data);
    return;
  }
  const timer = setTimeout(() => eventBuffer.delete(sessionId), EVENT_BUFFER_TTL);
  eventBuffer.set(sessionId, { events: [data], timer });
}

/**
 * 预先建立指定 session 的事件连接，不等 React 重渲。
 * 通常在拿到 sessionId 后、执行 execute 前调用，消除竞态。
 */
export function preconnect(sessionId: string): void {
  if (!sessionId) return;
  getOrCreateConnection(sessionId);
}

function getOrCreateConnection(sessionId: string): void {
  const existing = globalConnections.get(sessionId);
  if (existing) return;

  const unsubscribe = subscribeCollaborationEvents(sessionId, (rawData) => {
    try {
      const data = JSON.parse(rawData) as RuntimeEvent;
      if (data.sessionId !== sessionId) return;
      const callbacks = globalCallbacks.get(sessionId);
      if (callbacks && callbacks.size > 0) {
        for (const cb of callbacks) {
          cb(data);
        }
      } else {
        // 回调还没注册，先缓冲事件
        bufferEvent(sessionId, data);
      }
    } catch {
      // ignore non-JSON or heartbeat
    }
  });
  globalConnections.set(sessionId, unsubscribe);
}

function addCallback(sessionId: string, cb: (data: unknown) => void): void {
  const set = globalCallbacks.get(sessionId) ?? new Set();
  set.add(cb);
  globalCallbacks.set(sessionId, set);

  // 回放缓冲区中的事件
  const buffered = eventBuffer.get(sessionId);
  if (buffered) {
    clearTimeout(buffered.timer);
    eventBuffer.delete(sessionId);
    for (const evt of buffered.events) {
      try { cb(evt); } catch { /* ignore */ }
    }
  }
}

function removeCallback(sessionId: string, cb: (data: unknown) => void): void {
  const set = globalCallbacks.get(sessionId);
  if (!set) return;
  set.delete(cb);
  if (set.size === 0) {
    globalCallbacks.delete(sessionId);
  }
}

export function useSSEConnection(sessionId: string) {
  const addEvent = useCollaborationUi((state) => state.addEvent);
  const updateAgentActivity = useCollaborationUi((state) => state.updateAgentActivity);
  const setConnected = useCollaborationUi((state) => state.setConnected);
  const setConnecting = useCollaborationUi((state) => state.setConnecting);

  const connectedRef = useRef(false);
  const prevSessionIdRef = useRef<string>("");
  const callbackRef = useRef<((data: unknown) => void) | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;

    // Session 切换时清理旧订阅
    if (sessionId !== prevSessionIdRef.current) {
      if (prevSessionIdRef.current && callbackRef.current) {
        removeCallback(prevSessionIdRef.current, callbackRef.current);
      }
      connectedRef.current = false;
      prevSessionIdRef.current = sessionId;
    }
    if (connectedRef.current) return;

    setConnecting(true);

    const onMessage = (raw: unknown) => {
      const event = raw as RuntimeEvent;
      connectedRef.current = true;
      setConnected(true);
      setConnecting(false);
      addEvent(event);

      const activity = eventToAgentStatus(event);
      const activityAgentId = eventActivityAgentId(event);
      if (activity && activityAgentId) {
        updateAgentActivity(activityAgentId, activity);
      }
    };

    callbackRef.current = onMessage;
    addCallback(sessionId, onMessage);

    getOrCreateConnection(sessionId);
  }, [sessionId, addEvent, updateAgentActivity, setConnected, setConnecting]);

  useEffect(() => {
    connect();
    return () => {
      setConnecting(false);
      if (sessionId && callbackRef.current) {
        removeCallback(sessionId, callbackRef.current);
        callbackRef.current = null;
      }
    };
  }, [connect, sessionId, setConnecting]);

  // 页面卸载时关闭所有 SSE 连接
  useEffect(() => {
    const onUnload = () => {
      for (const [, unsubscribe] of globalConnections) {
        unsubscribe();
      }
      globalConnections.clear();
      globalCallbacks.clear();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return { connect };
}
