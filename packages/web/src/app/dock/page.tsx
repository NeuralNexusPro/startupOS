'use client';

/**
 * Dedicated Dock page for the Electron BrowserWindow overlay.
 * Loaded via: /dock?nativeWindow=1
 *
 * - Renders <Dock /> in a transparent, frameless window
 * - Bridges dock:action CustomEvents → IPC (Electron) or BroadcastChannel (Web)
 * - Listens for dock:animate IPC events for show/hide transitions
 * - Listens for dock:hover events from DockContainer to resize the Electron window
 */

import React, { useEffect } from 'react';
import { isElectron, getIpcRenderer } from '@originos/core/lib/integrations/electron';
import { IPC_CHANNELS } from '@originos/core/lib/integrations/electron';
import type { DockApp } from '@originos/core/types';
import useDockStore from '@/store/dockStore';
import Dock from '@/components/os/dock';

export default function DockPage() {
  const [guideHighlight, setGuideHighlight] = React.useState(false);
  const dockSide = useDockStore((state) => state.dockSide);

  // Override body background to transparent for dock overlay
  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevColor = document.body.style.color;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => {
      document.body.style.background = prevBg;
      document.body.style.color = prevColor;
      document.documentElement.style.background = '';
    };
  }, []);

  // Listen for app sync from main window (Electron only)
  useEffect(() => {
    if (!isElectron()) return;
    const unsubscribe = getIpcRenderer().on(IPC_CHANNELS.DOCK_SYNC_APPS, (incoming: unknown) => {
      if (!Array.isArray(incoming)) return;
      const incomingApps = incoming as DockApp[];
      const { apps, setApps } = useDockStore.getState();
      const incomingMap = new Map(incomingApps.map(a => [a.id, a]));
      // Update existing apps (merge isRunning/isMinimized state from main window)
      const merged = apps.map(a => {
        const updated = incomingMap.get(a.id);
        return updated ? { ...a, isRunning: updated.isRunning, isMinimized: updated.isMinimized } : a;
      });
      // Add truly new apps
      const existingIds = new Set(apps.map(a => a.id));
      const newApps = incomingApps.filter(a => !existingIds.has(a.id));
      // Remove apps the main window no longer has (non-pinned only)
      const incomingIds = new Set(incomingApps.map(a => a.id));
      const cleaned = merged.filter(a => a.isPinned || incomingIds.has(a.id));
      if (newApps.length > 0 || merged.length !== cleaned.length || newApps.length === 0) {
        setApps([...cleaned, ...newApps.map((a, i) => ({ ...a, index: cleaned.length + i }))]);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'originos-dock-store') {
        void useDockStore.persist.rehydrate();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!isElectron()) return;
    void getIpcRenderer().invoke(IPC_CHANNELS.DOCK_HIDE, { side: dockSide });
  }, [dockSide]);

  useEffect(() => {
    // Bridge dock:action CustomEvents → IPC (Electron) or BroadcastChannel (Web)
    const handleDockAction = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail) return;

      if (isElectron()) {
        void getIpcRenderer().invoke(IPC_CHANNELS.DOCK_ACTION, detail);
      } else {
        const channel = new BroadcastChannel('originos-dock-actions');
        channel.postMessage(detail);
        channel.close();
      }
    };

    window.addEventListener('dock:action', handleDockAction);

    // Listen for dock:animate IPC events from main process (Electron only)
    let cleanupAnimate: (() => void) | undefined;
    if (isElectron()) {
      const cleanupDockAnimate = getIpcRenderer().on('dock:animate', (action: unknown) => {
        if (action === 'show') {
          document.documentElement.classList.add('dock-expanded');
        } else if (action === 'hide') {
          document.documentElement.classList.remove('dock-expanded');
        }
      });
      const cleanupGuideHighlight = getIpcRenderer().on('dock:guide-highlight', (highlighted: unknown) => {
        setGuideHighlight(Boolean(highlighted));
      });
      cleanupAnimate = () => {
        cleanupDockAnimate?.();
        cleanupGuideHighlight?.();
      };
    }

    // Listen for dock:hover events from DockContainer to resize the Electron window
    const handleDockHover = (event: Event) => {
      const { expanded, side } = (event as CustomEvent<{ expanded: boolean; side?: typeof dockSide }>).detail;
      if (isElectron()) {
        void getIpcRenderer().invoke(
          expanded ? IPC_CHANNELS.DOCK_SHOW : IPC_CHANNELS.DOCK_HIDE,
          { side: side ?? dockSide }
        );
      }
    };

    window.addEventListener('dock:hover', handleDockHover);

    return () => {
      window.removeEventListener('dock:action', handleDockAction);
      window.removeEventListener('dock:hover', handleDockHover);
      cleanupAnimate?.();
    };
  }, [dockSide]);

  return (
    <div
      className={`w-full h-full flex transition-colors duration-200 ${
        dockSide === 'bottom'
          ? 'items-end justify-center'
          : dockSide === 'right'
            ? 'items-center justify-end'
            : 'items-center justify-start'
      } ${guideHighlight ? 'bg-sky-300/10' : ''}`}
      style={{ background: 'transparent' }}
    >
      <Dock forceExpanded={guideHighlight} />
    </div>
  );
}
