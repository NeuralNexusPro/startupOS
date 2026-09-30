/* eslint-disable @typescript-eslint/explicit-function-return-type */
// 首页项目卡片展示组件（含草稿徽标、删除确认、协作/方案入口）。
'use client';

import * as React from 'react';
import { Trash2, Sparkles, Network } from 'lucide-react';

import { cn } from '@originos/core/lib/utils';

export interface ProjectCardProps {
  id: string;
  name: string;
  description: string;
  domain: string;
  lastModified: number;
  ontologySize: number;
  color: string;
  status?: string;
  hasSolution: boolean;
}

export function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours < 1) {
    return '刚刚更新';
  }
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function ProjectCard({ project, onClick, onDelete, onSolutionDesign, onCollaborate }: {
  project: ProjectCardProps;
  onClick?: () => void;
  onDelete?: (projectId: string) => void;
  onSolutionDesign?: (projectId: string) => void;
  onCollaborate?: (projectId: string) => void;
}) {
  const isDraft = project.status === 'draft';
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(project.id);
    setShowDeleteConfirm(false);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:bg-white/[0.08]',
        'from-[var(--tw-gradient-from)] to-[var(--tw-gradient-to)] border-0'
      )}
      style={
        {
          '--tw-gradient-from': `${project.color}20`,
          '--tw-gradient-to': `${project.color}10`,
        } as React.CSSProperties
      }
    >
      {/* Draft Badge */}
      {isDraft && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-600 text-xs font-medium">
          访谈中
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-10">
          <p className="text-white text-sm font-medium px-4 text-center">
            确定要删除项目 "{project.name}" 吗？
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmDelete}
              className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium"
            >
              删除
            </button>
            <button
              onClick={cancelDelete}
              className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors text-sm font-medium"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* App Icon */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold bg-gradient-to-br',
            'from-[var(--tw-gradient-from)] to-[var(--tw-gradient-to)]',
            'shadow-md'
          )}
          style={{
            '--tw-gradient-from': `${project.color}`,
            '--tw-gradient-to': `${project.color}88`,
          } as React.CSSProperties}
        >
          {isDraft ? '📝' : '📁'}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
            title="删除项目"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      {/* Project Info */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2 group-hover:text-primary transition-colors">
          {project.name}
        </h3>
        <p className="text-sm text-text-secondary mb-4 line-clamp-2 min-h-[2.5rem]">
          {project.description}
        </p>

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 21l-4.44-4.44M10.07 10.07l1.59 1.59" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
            </svg>
            {project.ontologySize} 节点
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="2" y="2" width="20" height="20" rx="2" strokeWidth={1.5} />
              <path d="M12 20v-2M10 14H6m12 4h-6m12-4h-4l-2 2" strokeWidth={1.5} />
            </svg>
            {formatRelativeTime(project.lastModified)}
          </span>
        </div>

        {/* Action Buttons */}
        {(onSolutionDesign || onCollaborate) && project.ontologySize > 0 && (
          <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
            {onCollaborate && project.hasSolution && (
              <button
                onClick={(e) => { e.stopPropagation(); onCollaborate(project.id); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 text-xs font-medium transition-colors"
              >
                <Network className="w-3.5 h-3.5" />
                多 Agent 协作
              </button>
            )}
            {onSolutionDesign && (
              <button
                onClick={(e) => { e.stopPropagation(); onSolutionDesign(project.id); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI 解决方案设计
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hover Effect */}
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="absolute inset-0 rounded-[1.75rem] bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
