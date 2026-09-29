/**
 * AppWindowContainer - 应用窗口容器
 * Story OS.9: 应用窗口系统
 *
 * 渲染所有打开的应用窗口
 */

'use client';

import React from 'react';
import { useAppWindowStore } from '@/store/appWindowStore';
import { AppWindow } from './AppWindow';
import { isElectron } from '@originos/core/lib/integrations/electron';

export function AppWindowContainer() {
  const windows = useAppWindowStore((state) => state.windows);
  const windowOrder = useAppWindowStore((state) => state.windowOrder);

  // 获取所有窗口（包括最小化），按 z-index 排序；最小化窗口保活但隐藏
  const allWindows = windowOrder
    .map((id) => windows[id])
    .filter((win): win is NonNullable<typeof win> => win != null)
    .filter((win) => !(isElectron() && win.metadata?.['renderMode'] === 'native'))
    .sort((a, b) => a.position.zIndex - b.position.zIndex);

  if (allWindows.length === 0) {
    return null;
  }

  return (
    <>
      {allWindows.map((windowData) => (
        <AppWindow
          key={windowData.id}
          windowId={windowData.id}
          config={{
            id: windowData.id,
            type: windowData.type,
            title: windowData.title,
            icon: windowData.icon,
            position: windowData.position,
            constraints: windowData.constraints,
            content: windowData.content,
            metadata: windowData.metadata,
          }}
        />
      ))}
    </>
  );
}

export default AppWindowContainer;
