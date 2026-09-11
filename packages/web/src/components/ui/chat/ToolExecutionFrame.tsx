/**
 * Shared ToolExecutionFrame component
 * Displays tool execution status in agent/skill/skill dialog messages
 */

import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export interface ToolExecution {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  args?: unknown;
  result?: unknown;
  timestamp: number;
}

interface ToolExecutionFrameProps {
  executions: ToolExecution[];
}

/**
 * 工具名称中文映射
 */
const TOOL_NAME_CN: Record<string, string> = {
  read_file: '读取文件',
  write_file: '写入文件',
  list_files: '列出目录',
  delete_file: '删除文件',
  query_ontology: '查询本体',
  create_domain: '创建领域',
  create_concept: '创建概念',
  search_ontology: '搜索本体',
  get_current_time: '获取时间',
  get_system_info: '系统信息',
  calculate: '计算',
  get_help: '帮助',
  execute_command: '执行命令',
  send_system_message: '发送系统消息',
};

/**
 * ToolExecutionFrame - 工具执行帧组件
 * 在对话流中以友好的方式展示工具调用过程
 */
export default function ToolExecutionFrame({ executions }: ToolExecutionFrameProps) {
  if (executions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {executions.map((tool) => {
        const isRunning = tool.status === 'running';
        const isCompleted = tool.status === 'completed';
        const isError = tool.status === 'error';
        const cnName = TOOL_NAME_CN[tool.name] || tool.name;

        return (
          <div
            key={tool.id}
            className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-white/40 border border-white/30 text-xs"
          >
            {/* 状态图标 */}
            {isRunning && (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
            )}
            {isCompleted && (
              <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            )}
            {isError && (
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            )}

            {/* 工具名称 */}
            <span className="text-gray-700 font-medium truncate">{cnName}</span>
            {isRunning && (
              <span className="text-gray-400 ml-auto shrink-0">执行中...</span>
            )}

            {/* 进度条（运行时） */}
            {isRunning && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary/30 to-transparent rounded-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}
