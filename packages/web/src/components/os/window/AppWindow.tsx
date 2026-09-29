/**
 * OS.9: 通用窗口组件
 */

'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { AcrylicPanel } from '@/components/os/acrylic';
import { useAppWindow } from '@/hooks/useAppWindow';
import { AppWindowConfig, DEFAULT_WINDOW_CONSTRAINTS } from '@originos/core/types';
import { isElectron } from '@originos/core/lib/integrations/electron';
import { WindowTitleBar } from './WindowTitleBar';
import { WindowResizer } from './WindowResizer';
import { ViewRenderer } from './ViewRenderer';

export interface AppWindowProps {
  windowId: string;
  config: AppWindowConfig;
  children?: React.ReactNode;
}

export function AppWindow({ windowId, config, children }: AppWindowProps) {
  const {
    window: windowData,
    isOpen,
    isFocused,
    isMinimized,
    isMaximized,
    isDragging,
    position,
    close,
    minimize,
    maximize,
    focus,
    setPosition,
    setDragging,
    setResizing,
  } = useAppWindow({ windowId });

  const windowRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // 客户端挂载检查
  useEffect(() => {
    setMounted(true);
  }, []);

  // 聚焦窗口
  const handleFocus = useCallback(() => {
    if (!isFocused) {
      focus();
    }
  }, [isFocused, focus]);

  // 关闭窗口
  const handleClose = useCallback(() => {
    config.onClose?.();
    close();
  }, [config, close]);

  // 拖拽开始
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isMaximized) return;
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return;

      setDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [isMaximized, position, setDragging]
  );

  // 拖拽中
  useEffect(() => {
    if (!isDragging || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
      setDragStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, setPosition, setDragging]);

  // ESC 关闭 (可选)
  useEffect(() => {
    const handleKeyDown = (_e: KeyboardEvent) => {
      // 可以根据需要启用 ESC 关闭
      // if (e.key === 'Escape' && isFocused) {
      //   handleClose();
      // }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, handleClose]);

  // 未挂载或已关闭时不渲染；最小化时保活但隐藏
  if (!mounted || !isOpen || !windowData) return null;

  const constraints = { ...DEFAULT_WINDOW_CONSTRAINTS, ...config.constraints };

  const windowElement = (
    <div
      ref={windowRef}
      className={`fixed outline-none ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        zIndex: position.zIndex,
        display: isMinimized ? 'none' : undefined,
      }}
      tabIndex={-1}
      onClick={handleFocus}
      onMouseDown={handleFocus}
    >
      <AcrylicPanel
        variant="standard"
        dragging={isDragging}
        className={`h-full flex flex-col rounded-lg overflow-hidden transition-shadow duration-200 ${
          isFocused ? 'ring-2 ring-blue-500/50 shadow-blue-500/20' : 'shadow-black/30'
        }`}
      >
        {/* Electron 环境下不显示标题栏，因为有原生窗体控制 */}
        {!isElectron() && (
          <WindowTitleBar
            title={windowData.title}
            icon={windowData.icon}
            isFocused={isFocused}
            isMaximized={isMaximized}
            constraints={constraints}
            onClose={handleClose}
            onMinimize={minimize}
            onMaximize={maximize}
            onDragStart={handleDragStart}
          />
        )}

        {/* 内容区：透明背景让 AcrylicPanel 毛玻璃效果透出 */}
        <div className="flex-1 overflow-hidden">
          {children || <ViewRenderer content={config.content} windowId={windowId} />}
        </div>

        {constraints.allowResize && !isMaximized && (
          <WindowResizer
            windowId={windowId}
            position={position}
            constraints={constraints}
            onResize={setPosition}
            onResizeStart={() => setResizing(true)}
            onResizeEnd={() => setResizing(false)}
          />
        )}
      </AcrylicPanel>
    </div>
  );

  return createPortal(windowElement, document.body);
}

export default AppWindow;
