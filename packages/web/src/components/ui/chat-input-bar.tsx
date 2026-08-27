'use client';

import { useState, useCallback, useId, type ReactElement } from 'react';
import { Send, Paperclip, X, Loader2, ListTodo } from 'lucide-react';
import { cn } from '@originos/core/lib/utils';

export interface UploadedFileDisplay {
  name: string;
  path?: string;
  size: number;
}

interface ChatInputBarProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onUpload?: () => void;
  className?: string;
  /** Optional stop button — rendered above the send button during generation */
  onStop?: () => void;
  isGenerating?: boolean;
  /** Whether to use white background (for light theme contexts) */
  lightBg?: boolean;
  /** Files that have been uploaded and should be shown as chips */
  uploadedFiles?: UploadedFileDisplay[];
  /** Remove an uploaded file chip */
  onRemoveFile?: (index: number) => void;
  /** Upload error message to display */
  uploadError?: string | null;
  /** Whether an upload is in progress */
  uploading?: boolean;
  /** Open a renderer-local task draft in Agent/RoleAgent conversations. */
  onCreateTask?: () => void;
  /** Disable task creation without disabling uploads. */
  createTaskDisabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CreateTaskButtonProps {
  disabled: boolean;
  buttonClassName: string;
  onCreateTask(): void;
}

function CreateTaskButton({
  disabled,
  buttonClassName,
  onCreateTask,
}: CreateTaskButtonProps): ReactElement {
  const tooltipId = useId();
  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onCreateTask}
        disabled={disabled}
        className={cn(
          'p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          buttonClassName,
        )}
        aria-label="创建任务"
        aria-describedby={tooltipId}
      >
        <ListTodo className="w-4 h-4" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        创建任务
      </span>
    </div>
  );
}

export function ChatInputBar({
  onSubmit,
  disabled,
  placeholder = '输入消息...',
  onUpload,
  className,
  onStop,
  isGenerating,
  lightBg = false,
  uploadedFiles,
  onRemoveFile,
  uploadError,
  uploading,
  onCreateTask,
  createTaskDisabled = false,
}: ChatInputBarProps): ReactElement {
  const [input, setInput] = useState('');

  const canSend = input.trim().length > 0 && !disabled;

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    onSubmit(input.trim());
    setInput('');
  }, [canSend, input, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const inputBgClass = lightBg
    ? 'bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-primary/50'
    : 'bg-white/10 border border-white/20 text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-primary';

  const uploadBtnClass = lightBg
    ? 'bg-gray-200 border border-gray-300 text-gray-700 hover:bg-gray-300'
    : 'bg-white/10 border border-white/20 text-gray-400 hover:text-gray-300 hover:bg-white/20';

  return (
    <div className={cn('border-t border-white/20 px-4 py-3', className)}>
      {/* Upload progress / error indicators */}
      {(uploading || uploadError) && (
        <div className="mb-2 px-3">
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>上传中...</span>
            </div>
          )}
          {uploadError && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <span>{uploadError}</span>
              <button
                onClick={() => onRemoveFile?.(-1)}
                className="shrink-0 hover:text-red-800"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Uploaded file chips */}
      {uploadedFiles && uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 px-3">
          {uploadedFiles.map((file, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              <Paperclip className="w-3 h-3" />
              {file.name}
              <span className="text-gray-400 font-normal">{formatFileSize(file.size)}</span>
              {onRemoveFile && (
                <button
                  onClick={() => onRemoveFile(idx)}
                  className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isGenerating}
          className={cn(
            'flex-1 px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 text-sm',
            inputBgClass,
          )}
        />
        {onUpload && (
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className={cn('p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0', uploadBtnClass)}
            title="上传文件"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        )}
        {onCreateTask && (
          <CreateTaskButton
            disabled={createTaskDisabled || Boolean(disabled) || Boolean(isGenerating)}
            buttonClassName={uploadBtnClass}
            onCreateTask={onCreateTask}
          />
        )}
        {onStop && isGenerating && (
          <button
            type="button"
            onClick={onStop}
            className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 transition-colors shrink-0 flex items-center justify-center"
            title="停止生成"
          >
            <div className="w-3 h-3 bg-white rounded-sm" />
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
