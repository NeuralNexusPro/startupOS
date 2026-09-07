/**
 * Dock Component - Dock 任务栏 (with AppWindow Integration)
 * Story OS.2: Dock 任务栏基础 + OS.3: Agent 对象定义 + OS.7: Agent 托管服务 + OS.9: 应用窗口系统
 */

import React, { useEffect } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import useDockStore from '@/store/dockStore';
import { useAppWindowStore } from '@/store/appWindowStore';
import { useAgentRegistryStore } from '@/store/agentRegistry';
import { AgentStatus } from '@originos/core/types';
import type { DockApp } from '@originos/core/types';
import { sendDockAction } from '@originos/core/lib/integrations/electron/window';
import DockContainer from './Container';
import DockIcon from './DockIcon';

interface DraggableData {
  index: number;
}

export function resolveSystemDockAction(appId: string): { action: string } | undefined {
  if (appId === 'app-sense-center') return { action: 'open-sense-center' };
  return undefined;
}

export default function Dock({ forceExpanded = false }: { forceExpanded?: boolean }) {
  const {
    apps,
    moveApp,
    setDraggedApp,
    openDockContextMenu,
    setAppRunning,
    updateApp,
  } = useDockStore();
  const dockSide = useDockStore((state) => state.dockSide);

  // 窗口状态
  const windows = useAppWindowStore((state) => state.windows);

  // Agent registry
  const setActiveAgent = useAgentRegistryStore((state) => state.setActiveAgent);
  const setAgentStatus = useAgentRegistryStore((state) => state.setAgentStatus);

  // 调试: 打印 apps 状态
  useEffect(() => {
    console.log('[Dock] Apps loaded:', apps.length, apps.map(a => a.name));
  }, [apps]);

  // 监听窗口状态变化，同步到 Dock app 的 isMinimized 状态
  useEffect(() => {
    const currentApps = useDockStore.getState().apps;

    Object.entries(windows).forEach(([windowId, win]) => {
      // 窗口 ID 就是 appId，不需要转换
      const appId = windowId;

      // 检查 app 是否已存在于 Dock
      const existingApp = currentApps.find(a => a.id === appId);

      if (existingApp) {
        // 更新现有 app
        updateApp(appId, { isRunning: true });
      } else {
        // 添加新 app 到 Dock
        const newApp: DockApp = {
          id: appId,
          name: win.title,
          icon: win.icon || '📄',
          iconType: 'emoji',
          isRunning: true,
          isPinned: false,
          index: currentApps.length,
        };
        useDockStore.getState().addApp(newApp);
      }
    });

    // 清理已关闭窗口的 app（仅非固定的）
    currentApps.forEach(app => {
      if (!app.isPinned) {
        // 直接使用 app.id 作为 windowId
        if (!windows[app.id]) {
          useDockStore.getState().removeApp(app.id);
        }
      }
    });
  }, [windows, updateApp]); // eslint-disable-line react-hooks/exhaustive-deps

  // 拖拽结束处理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setDraggedApp(null);

    if (over && active.id !== over.id) {
      const activeData = active.data.current as DraggableData;
      const overData = over.data.current as DraggableData;

      if (activeData !== undefined && overData !== undefined) {
        moveApp(activeData.index, overData.index);
      }
    }
  };

  // 处理图标点击 - 使用 sendDockAction 确保 Electron 跨窗口通信
  const handleIconClick = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;

    // 如果窗体已打开，恢复并聚焦（而非打开新窗体）
    const existingWindow = windows[appId];
    if (existingWindow) {
      const { restoreWindow, focusWindow } = useAppWindowStore.getState();
      if (existingWindow.state === 'minimized') {
        restoreWindow(appId);
      }
      focusWindow(appId);
      return;
    }

    // 对于正在运行的 app（native 原生窗口，由主窗口 renderer 管理），
    // dock 窗口的 appWindowStore 为空，需要通过 IPC 让主窗口聚焦对应窗体
    if (app.isRunning) {
      sendDockAction({ action: 'focus-window', windowId: appId });
      return;
    }

    // 快捷入口：通过 IPC/CustomEvent 发送到主窗口
    if (appId === 'app-project-create') {
      sendDockAction({ action: 'create-project' });
      return;
    }
    if (appId === 'app-workspace') {
      sendDockAction({ action: 'open-workspace' });
      return;
    }
    const systemAction = resolveSystemDockAction(appId);
    if (systemAction) {
      sendDockAction(systemAction);
      return;
    }

    // Skill 类型
    if (app.appType === 'skill' && app.skillName) {
      sendDockAction({ action: 'launch-skill', skillId: app.skillName });
      return;
    }

    // Sandbox 类型
    if (app.appType === 'sandbox') {
      sendDockAction({ action: 'launch-sandbox' });
      return;
    }

    // Agent 类型：通过 IPC/CustomEvent 发送到主窗口
    setActiveAgent(appId);
    sendDockAction({
      action: 'launch-agent',
      agentId: app.id,
      agentName: app.name,
      agentType: app.id.startsWith('agent-') ? 'role-agent' : 'agent',
    });
    setAppRunning(appId, true);
    setAgentStatus(appId, AgentStatus.RUNNING as AgentStatus);
  };

  // 处理右键菜单
  const handleIconRightClick = (e: React.MouseEvent, appId: string) => {
    openDockContextMenu(appId, { x: e.clientX, y: e.clientY });
  };

  return (
    <DockContainer forceExpanded={forceExpanded} side={dockSide}>
      <DndContext onDragEnd={handleDragEnd}>
        {apps.map((app, index) => (
          <DockIcon
            key={app.id}
            app={app}
            index={index}
            side={dockSide}
            onClick={handleIconClick}
            onRightClick={handleIconRightClick}
          />
        ))}
      </DndContext>
    </DockContainer>
  );
}
