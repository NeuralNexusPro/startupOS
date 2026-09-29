'use client';

import { useCallback, useEffect, useState } from 'react';

import { isElectron } from '@originos/core/lib/integrations/electron';
import { exportWorkspaceEntry } from '@originos/core/lib/integrations/electron/services/workspace';
import { Download, Loader2 } from 'lucide-react';

import type { ExportableEntryType } from '@originos/core/lib/integrations/electron';

interface EntryExportButtonProps {
  entryType: ExportableEntryType;
  entryId: string;
}

export const EntryExportButton = ({ entryType, entryId }: EntryExportButtonProps): JSX.Element | null => {
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect((): (() => void) | undefined => {
    if (!errorMessage) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setErrorMessage(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [errorMessage]);

  const handleExport = useCallback(async (): Promise<void> => {
    if (isExporting || !entryId) {
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    try {
      const response = await exportWorkspaceEntry({ entryType, entryId });
      if (!response.success) {
        setErrorMessage(response.error?.message ?? '无法创建 ZIP 文件');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法创建 ZIP 文件');
    } finally {
      setIsExporting(false);
    }
  }, [entryId, entryType, isExporting]);

  if (!isElectron()) {
    return null;
  }

  return (
    <div className="native-no-drag relative">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting || !entryId}
        aria-label="导出 ZIP"
        aria-busy={isExporting}
        title="导出 ZIP"
        className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
      >
        {isExporting
          ? <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          : <Download className="h-4 w-4 text-gray-600 dark:text-gray-300" />}
      </button>
      {errorMessage && (
        <div
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-600 shadow-lg dark:border-red-900 dark:bg-gray-900"
        >
          导出失败：{errorMessage}
        </div>
      )}
    </div>
  );
};
