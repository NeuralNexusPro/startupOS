'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessageList } from '@/components/ui/chat';
import { ChatInputBar, type UploadedFileDisplay } from '@/components/ui/chat-input-bar';
import { useFileUpload, type UploadedFile } from '@/lib/hooks/use-file-upload';
import type { ToolExecution } from '@/components/ui/chat/ToolExecutionFrame';
import type { AgentContextTokenEstimate, AgentTokenUsage } from '@originos/core/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  usage?: AgentTokenUsage;
  contextTokenEstimate?: AgentContextTokenEstimate;
}

interface CUIDialogPanelProps {
  sessionId: string | null;
  messages: Message[];
  isLoading: boolean;
  currentStep?: number;
  totalSteps?: number;
  canGoBack?: boolean;
  toolExecutions?: ToolExecution[];
  onSendMessage: (content: string) => void;
  onGoBack?: () => void;
  /** Base path for file upload (optional — when provided, upload button appears) */
  uploadBasePath?: string;
  /** Stop generation callback */
  onStop?: () => void;
  /** Whether agent is currently generating response */
  isGenerating?: boolean;
}

/**
 * CUIDialogPanel - 对话界面组件
 */
export function CUIDialogPanel({
  sessionId: _sessionId,
  messages,
  isLoading,
  currentStep: _currentStep,
  totalSteps: _totalSteps,
  canGoBack: _canGoBack,
  toolExecutions,
  onSendMessage,
  onGoBack: _onGoBack,
  uploadBasePath,
  onStop,
  isGenerating,
}: CUIDialogPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set());
  const [visibleToolIds, setVisibleToolIds] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileDisplay[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUploaded = useCallback((files: UploadedFile[]) => {
    setUploadedFiles(prev => [...prev, ...files.map(f => ({ name: f.name, size: f.size }))]);
    setUploadError(null);
  }, []);

  const handleFileError = useCallback((error: Error) => {
    setUploadError(error.message);
    setTimeout(() => setUploadError(null), 5000);
  }, []);

  const handleUploadStateChange = useCallback((state: 'idle' | 'uploading' | 'done' | 'error') => {
    setUploading(state === 'uploading');
  }, []);

  const handleUpload = useFileUpload({
    basePath: uploadBasePath ?? '',
    onUploaded: handleFileUploaded,
    onError: handleFileError,
    onStateChange: handleUploadStateChange,
  });

  const handleRemoveFile = useCallback((index: number) => {
    if (index === -1) {
      setUploadError(null);
      return;
    }
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Wrap onSendMessage to include attachment info when sending, then clear chips
  const wrappedSendMessage = useCallback((content: string) => {
    if (uploadedFiles.length > 0) {
      const fileNames = uploadedFiles.map(f => f.name).join('、');
      const fileHint = `[附件: ${fileNames}]\n${content}`;
      setUploadedFiles([]);
      onSendMessage(fileHint);
    } else {
      onSendMessage(content);
    }
  }, [uploadedFiles, onSendMessage]);

  // 同步 toolExecutions，新增工具时加入可见集合
  useEffect(() => {
    if (!toolExecutions || toolExecutions.length === 0) {
      setVisibleToolIds(new Set());
      return;
    }
    const newIds = new Set(visibleToolIds);
    for (const tool of toolExecutions) {
      newIds.add(tool.id);
    }
    setVisibleToolIds(newIds);
  }, [toolExecutions]);

  // 工具执行完成后 1.5s 自动从可见集合中移除
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!toolExecutions || toolExecutions.length === 0) return;

    const completedTools = toolExecutions.filter(
      t => t.status === 'completed' || t.status === 'error'
    );

    for (const tool of completedTools) {
      if (visibleToolIds.has(tool.id) && !pendingTimersRef.current.has(tool.id)) {
        const timer = setTimeout(() => {
          setVisibleToolIds(prev => {
            const next = new Set(prev);
            next.delete(tool.id);
            return next;
          });
          pendingTimersRef.current.delete(tool.id);
        }, 1500);
        pendingTimersRef.current.set(tool.id, timer);
      }
    }
  }, [toolExecutions, visibleToolIds]);

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      pendingTimersRef.current.forEach(timer => clearTimeout(timer));
      pendingTimersRef.current.clear();
    };
  }, []);

  // 根据可见集合过滤工具执行帧
  const visibleToolExecutions = (toolExecutions || []).filter(t => visibleToolIds.has(t.id));

  const handleQuestionAnswer = (messageIndex: number, selectedLabels: string[]) => {
    setAnsweredQuestions(prev => new Set(prev).add(messageIndex));
    onSendMessage(selectedLabels.join(', '));
  };

  return (
    <div className="flex min-h-0 flex-col h-full">
      {/* Message list */}
      <ChatMessageList
        messages={messages}
        isLoading={isLoading}
        isThinking={isGenerating || isLoading}
        toolExecutions={visibleToolExecutions}
        onQuestionAnswer={handleQuestionAnswer as any}
        answeredQuestions={answeredQuestions}
        showTimestamps
        emptyState={
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">等待 Oracle 开始访谈...</p>
          </div>
        }
      />

      <div ref={messagesEndRef} />

      <ChatInputBar
        onSubmit={wrappedSendMessage}
        disabled={isLoading}
        placeholder="输入你的回答..."
        onUpload={uploadBasePath ? handleUpload : undefined}
        onStop={onStop}
        isGenerating={isGenerating}
        uploadedFiles={uploadedFiles}
        onRemoveFile={handleRemoveFile}
        uploadError={uploadError}
        uploading={uploading}
      />
    </div>
  );
}
