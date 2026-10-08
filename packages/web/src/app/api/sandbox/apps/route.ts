/**
 * API Route: List Sandbox Apps
 * GET /api/sandbox/apps
 *
 * Scan /data directory for frontend app products (directories containing index.html)
 */

import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import type { ApiResponse } from '@originos/core/types';
import { getDataRoot } from '@originos/core/lib/paths';

interface SandboxAppInfo {
  id: string;
  name: string;
  path: string;
  updatedAt: number;
}

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const dataDir = getDataRoot();

    if (!existsSync(dataDir)) {
      return NextResponse.json<ApiResponse<{ apps: SandboxAppInfo[] }>>({
        success: true,
        data: { apps: [] },
        timestamp: new Date().toISOString(),
      });
    }

    const apps: SandboxAppInfo[] = [];

    // Only scan skills/ and agents/ — not projects/
    const scanRoots = ['skills', 'agents'];

    // Recursively scan for directories containing index.html
    function scan(dir: string, relPath: string) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      if (entries.includes('index.html')) {
        const stat = statSync(dir);
        const appId = relPath.replace(/^data\//, '');
        apps.push({
          id: appId,
          name: path.basename(dir),
          path: relPath,
          updatedAt: stat.mtimeMs,
        });
      }

      // 也识别独立的 .html 文件（非 index.html）作为可预览产出物
      for (const entry of entries) {
        if (entry.endsWith('.html') && entry !== 'index.html') {
          const htmlPath = path.join(dir, entry);
          const stat = statSync(htmlPath);
          const appId = relPath.replace(/^data\//, '') + '/' + entry;
          apps.push({
            id: appId,
            name: entry.replace(/\.html$/, ''),
            path: relPath + '/' + entry,
            updatedAt: stat.mtimeMs,
          });
        }
      }

      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const entryPath = path.join(dir, entry);
        const entryStat = statSync(entryPath);
        if (entryStat.isDirectory()) {
          const depth = relPath.split('/').length;
          if (depth < 4) {
            scan(entryPath, path.join(relPath, entry));
          }
        }
      }
    }

    for (const root of scanRoots) {
      const rootPath = path.join(dataDir, root);
      if (existsSync(rootPath)) {
        scan(rootPath, path.join('data', root));
      }
    }

    // Sort by update time descending
    apps.sort((a, b) => b.updatedAt - a.updatedAt);

    return NextResponse.json<ApiResponse<{ apps: SandboxAppInfo[] }>>({
      success: true,
      data: { apps },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Sandbox API] Error listing apps:', error);
    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
