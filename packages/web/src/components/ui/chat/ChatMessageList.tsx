'use client';

import { useRef, useEffect } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { cn } from '@originos/core/lib/utils';
import { sanitizeAgentDisplayContent } from '@originos/core/lib/integrations/pi-agent/display-content';
import ToolExecutionFrame, { type ToolExecution } from '@/components/os/agent-dialog/ToolExecutionFrame';
import { MarkdownContent, normalizeAskUserQuestion, parseAskUserQuestion, removeYamlBlock, AskUserQuestionComponent, type ChatMessageData } from '@/components/ui/chat-message';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessageItem extends ChatMessageData {
  id?: string;
}

export interface ChatMessageListProps {
  messages: ChatMessageItem[];
  /** Agent is thinking (processing request, no content yet) */
  isLoading: boolean;
  /** Agent is actively generating content */
  isThinking: boolean;
  /** Tool execution list (optional — some dialogs don't have tools) */
  toolExecutions?: ToolExecution[];
  /** Callback for AskUserQuestion answers */
  onQuestionAnswer?: (messageIndex: number | string, selectedLabels: string[]) => void;
  /** Set of already-answered question indices */
  answeredQuestions?: Set<number | string>;
  /** Custom empty state */
  emptyState?: React.ReactNode;
  /** Whether to show timestamps on messages */
  showTimestamps?: boolean;
  /** Custom className for the scroll container */
  className?: string;
  /** Content wrapper className for each assistant message */
  assistantMessageClassName?: string;
  /** Additional content to render inside each assistant message bubble (e.g. ThinkingProcess) */
  assistantMessageExtra?: (message: ChatMessageItem, index: number) => React.ReactNode;
  /** Message indices to skip rendering (e.g. hidden system messages) */
  skipIndices?: Set<number>;
  /** Interactive task content rendered inside the conversation scroll area. */
  footerContent?: React.ReactNode;
}

// ============================================================================
// Streaming animation components
// ============================================================================

function StreamingDots() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

function parseToolQuestion(toolExecution: ToolExecution) {
  const fromArgs = normalizeAskUserQuestion((toolExecution.args ?? {}) as Record<string, unknown>);
  if (fromArgs) return fromArgs;

  const result = toolExecution.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
  const contentText = result?.content?.find((content) => content.type === 'text')?.text ?? '';
  if (!contentText) return null;

  return parseAskUserQuestion(contentText);
}

// ============================================================================
// ChatMessageList Component
// ============================================================================

export function ChatMessageList({
  messages,
  isLoading,
  isThinking,
  toolExecutions,
  onQuestionAnswer,
  answeredQuestions = new Set(),
  emptyState,
  showTimestamps = false,
  className,
  assistantMessageClassName,
  assistantMessageExtra,
  skipIndices = new Set(),
  footerContent,
}: ChatMessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const pendingScrollFrameRef = useRef<number | null>(null);

  const SCROLL_THROTTLE_MS = 100;
  const BOTTOM_THRESHOLD_PX = 80;

  const scheduleScroll = (force = false) => {
    if (!force && !isNearBottomRef.current) return;
    const now = Date.now();
    if (now - lastScrollTimeRef.current < SCROLL_THROTTLE_MS) return;
    lastScrollTimeRef.current = now;
    if (pendingScrollFrameRef.current !== null) return;
    pendingScrollFrameRef.current = requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      const list = listRef.current;
      if (!list || (!force && !isNearBottomRef.current)) return;
      list.scrollTo({ top: list.scrollHeight, behavior: 'auto' });
      isNearBottomRef.current = true;
    });
  };

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
  };

  useEffect(() => () => {
    if (pendingScrollFrameRef.current !== null) {
      cancelAnimationFrame(pendingScrollFrameRef.current);
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      lastScrollTimeRef.current = 0; // reset throttle for new messages
      scheduleScroll(true);
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Also scroll on streaming content updates (throttled)
  useEffect(() => {
    const hasStreaming = messages.some(m => m.isStreaming);
    if (hasStreaming) scheduleScroll();
  }, [messages]);

  // Also scroll when tool executions change
  useEffect(() => {
    scheduleScroll();
  }, [toolExecutions]);

  // Keep an interactive task form/card in view when it is opened or updated.
  const hasFooterContent = Boolean(footerContent);
  useEffect(() => {
    if (hasFooterContent) scheduleScroll(true);
  }, [hasFooterContent]);

  // Determine if we should show thinking/loading indicators
  const lastMsg = messages[messages.length - 1];
  const hasStreamingMsg = lastMsg?.role === 'assistant' && lastMsg?.isStreaming;
  const showThinkingIndicator = isThinking && (!hasStreamingMsg);

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-transparent', className)}
    >
      {/* Empty state */}
      {messages.length === 0 && !isLoading && !isThinking && (
        emptyState || (
          <div className="text-center text-gray-500 text-sm">
            开始对话...
          </div>
        )
      )}

      {/* Messages */}
      {messages.map((msg, index) => {
        // Skip indices (e.g. hidden system messages)
        if (skipIndices.has(index)) return null;

        const key = msg.id || `msg-${index}`;
        const isUser = msg.role === 'user';

        if (isUser) {
          return (
            <div key={key} className="flex min-w-0 justify-end">
              <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm bg-primary text-white">
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {showTimestamps && msg.timestamp && (
                  <div className="text-xs mt-1 text-white/60">
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          );
        }

        const safeContent = sanitizeAgentDisplayContent(msg.content);

        // Skip empty non-streaming assistant messages
        if (!safeContent && !msg.isStreaming) return null;

        // Parse AskUserQuestion
        const parsedQuestion = onQuestionAnswer ? parseAskUserQuestion(safeContent) : null;
        const isAnswered = answeredQuestions.has(index);
        const displayContent = parsedQuestion ? removeYamlBlock(safeContent) : safeContent;

        return (
          <div key={key} className="flex min-w-0 justify-start gap-2 items-start">
            <div className="w-2 h-2 rounded-full bg-primary mt-3 shrink-0" />
            <div className={cn('min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white/60 border border-white/40 text-gray-900', assistantMessageClassName)}>
              {assistantMessageExtra?.(msg, index)}
              {displayContent && (
                <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                  <MarkdownContent content={displayContent} isStreaming={msg.isStreaming} />
                </div>
              )}
              {msg.isStreaming && !displayContent && (
                <StreamingDots />
              )}
              {parsedQuestion && onQuestionAnswer && !isAnswered && (
                <AskUserQuestionComponent
                  parsedQuestion={parsedQuestion}
                  onAnswer={onQuestionAnswer.bind(null, index)}
                  disabled={false}
                />
              )}
              {showTimestamps && msg.timestamp && (
                <div className="text-xs mt-1 text-gray-500">
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Thinking indicator (no streaming content yet) */}
      {showThinkingIndicator && (
        <div className="flex justify-start gap-2 items-start">
          <div className="w-2 h-2 rounded-full bg-primary mt-3 shrink-0" />
          <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white/60 border border-white/40">
            <StreamingDots />
          </div>
        </div>
      )}

      {/* Processing indicator (thinking with placeholder assistant message) */}
      {isThinking && lastMsg?.role === 'assistant' && !lastMsg?.isStreaming && !lastMsg?.content && (
        <div className="flex justify-start gap-2 items-start">
          <div className="w-2 h-2 rounded-full bg-primary mt-3 shrink-0" />
          <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white/60 border border-white/40 text-gray-500">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-xs">正在处理...</span>
            </div>
          </div>
        </div>
      )}

      {/* Tool execution frames */}
      {toolExecutions && toolExecutions.length > 0 && (
        <>
          <div className="flex justify-start items-start">
            <div className="w-2 h-2 rounded-full bg-primary mt-3 shrink-0" />
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white/60 border border-white/40">
              <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
                <Wrench className="w-3 h-3" />
                <span className="font-medium">工具执行</span>
              </div>
              <ToolExecutionFrame executions={toolExecutions} />
              {/* AskUserQuestion tool args/results rendered as interactive cards */}
              {toolExecutions
                .filter(t => t.name === 'ask_user_question')
                .map((toolExec) => {
                  const parsed = parseToolQuestion(toolExec);
                  if (!parsed) return null;
                  const questionKey = `tool-question-${toolExec.id}`;
                  const isAnswered = answeredQuestions.has(questionKey);
                  return (
                    <div key={toolExec.id} className="mt-3 pt-3 border-t border-gray-200/50">
                      {parsed && onQuestionAnswer && !isAnswered && (
                        <AskUserQuestionComponent
                          parsedQuestion={parsed}
                          onAnswer={onQuestionAnswer.bind(null, questionKey)}
                          disabled={toolExec.status === 'error'}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {footerContent}
    </div>
  );
}
