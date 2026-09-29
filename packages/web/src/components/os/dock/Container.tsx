/**
 * Dock Container
 * - Web: horizontal at bottom
 * - Desktop (Electron): vertical on left side, collapsed by default, expands on hover
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { isElectron } from '@originos/core/lib/integrations/electron';
import type { DockSide } from '@originos/core/types';

export default function DockContainer({
  children,
  forceExpanded = false,
  side,
}: {
  children: React.ReactNode;
  forceExpanded?: boolean;
  side: DockSide;
}) {
  const [expanded, setExpanded] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const visible = expanded || forceExpanded;

  useEffect(() => {
    setDesktop(isElectron());
  }, []);

  const handleMouseEnter = useCallback(() => {
    setExpanded(true);
    window.dispatchEvent(new CustomEvent('dock:hover', { detail: { expanded: true, side } }));
  }, [side]);

  const handleMouseLeave = useCallback(() => {
    setExpanded(false);
    window.dispatchEvent(new CustomEvent('dock:hover', { detail: { expanded: false, side } }));
  }, [side]);

  if (desktop) {
    if (side === 'bottom') {
      return (
        <div
          className={`fixed bottom-0 left-0 z-50 flex w-full items-end justify-center transition-[height] duration-300 ease-in-out ${visible ? 'h-20' : 'h-2'}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={`flex items-center gap-4 px-4 py-3 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {children}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full z-50 flex transition-[width] duration-300 ease-in-out ${visible ? 'w-16' : 'w-2'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`flex flex-col items-center gap-4 py-4 w-full overflow-hidden transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {children}
        </div>
      </div>
    );
  }

  // Web: horizontal at bottom
  if (side === 'left' || side === 'right') {
    return (
      <div
        className={`fixed top-1/2 ${side === 'right' ? 'right-0' : 'left-0'} z-50 -translate-y-1/2`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col items-center gap-4 px-2 py-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center gap-4 px-4 py-2">
        {children}
      </div>
    </div>
  );
}
