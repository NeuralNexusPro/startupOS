/**
 * Facade — HITL → OriginOS 通知中心 转发挂点（Story 9.44 模块 5）
 *
 * 职责：订阅协作事件总线（复用 event-bus.ts 的 addElectronForwarder 全局转发器模式），
 * 过滤 HUMAN_REVIEW_REQUEST 事件，按 hitlEventId 幂等写入既有 NotificationManager 通知中心。
 *
 * 边界：facade 组装层，允许 import lib/integrations/pi-agent/notification-system
 * （与 hitl-dispatcher.ts 引用 lib/features 同模式）。
 * 防御性约束：任何失败仅 console.error，绝不向上抛——通知失败不得影响协作引擎执行。
 */

import {
  getNotificationManager,
  NotificationType,
} from "../../../lib/integrations/pi-agent/notification-system";
import { addElectronForwarder } from "./event-bus";

const HITL_NOTIFICATION_TITLE = "多 Agent 协作等待回复";
const HITL_NOTIFICATION_FALLBACK_BODY = "协作会话需要你的人工输入";
const HITL_QUESTION_MAX_LENGTH = 120;

/**
 * HMR 安全的幂等去重集合（进程内，按事件 id 去重）。
 * 保存在 globalThis：模块热重载/重复注册时不会对同一 HITL 事件重复通知。
 */
declare global {
  // eslint-disable-next-line no-var
  var __collaborationHitlNotifiedEventIds: Set<string> | undefined;
}

function getSeenHitlEventIds(): Set<string> {
  if (!globalThis.__collaborationHitlNotifiedEventIds) {
    globalThis.__collaborationHitlNotifiedEventIds = new Set<string>();
  }
  return globalThis.__collaborationHitlNotifiedEventIds;
}

/**
 * 注册 HITL → 通知中心 转发（幂等去重，HMR 安全可重复调用）。
 * 返回取消注册函数。
 */
export function registerHitlNotificationForwarder(): () => void {
  return addElectronForwarder((event) => {
    if (event.type !== "HUMAN_REVIEW_REQUEST") return;

    const seen = getSeenHitlEventIds();
    if (seen.has(event.id)) return;
    seen.add(event.id);

    try {
      const question = String(event.payload?.["question"] ?? "").slice(0, HITL_QUESTION_MAX_LENGTH);
      void getNotificationManager()
        .createNotification(
          NotificationType.SYSTEM_MESSAGE,
          HITL_NOTIFICATION_TITLE,
          question || HITL_NOTIFICATION_FALLBACK_BODY,
          {
            hitlEventId: event.id,
            sessionId: event.sessionId,
            source: event.source,
          },
          { sessionId: event.sessionId },
        )
        .catch((error: unknown) => {
          console.error("[collaboration] HITL notification failed:", error);
        });
    } catch (error) {
      console.error("[collaboration] HITL notification failed:", error);
    }
  });
}
