/* eslint-disable @typescript-eslint/explicit-function-return-type */
// 首页无项目时的欢迎面板展示组件。
'use client';

import { LayoutGrid, Search, FolderOpen, Command, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';

const DESKTOP_WIDGETS = [
  { label: '工作区', value: 'Workspace', icon: FolderOpen },
  { label: '快捷指令', value: 'Command K', icon: Command },
];

export function WelcomeSection({ onCreateProject }: {
  onCreateProject: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:p-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.2),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_32%)]" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center justify-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <Star className="h-3.5 w-3.5 text-amber-300" />
          桌面已就绪
        </div>

        <div className="w-24 h-24 mx-auto mb-8 rounded-[1.75rem] bg-gradient-to-br from-primary/30 via-sky-400/20 to-emerald-400/10 flex items-center justify-center border border-primary/30 shadow-[0_20px_60px_rgba(37,99,235,0.25)]">
          <div className="relative scale-[2]">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="absolute -right-4 top-0 w-2 h-2 rounded-full bg-primary" />
            <div className="absolute -left-2 top-2 w-2 h-2 rounded-full bg-primary" />
            <div className="absolute -right-2 top-2 w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>

        <h1 className="mb-3 text-4xl font-bold text-text-primary md:text-5xl">
          欢迎进入 OriginOS
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-white/70 md:text-xl">
          这是一个可对话、可编排、可打开多个工作窗口的 AI Native 桌面。先创建一个项目，或者直接从应用启动器进入工作流。
        </p>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={onCreateProject}
            className="gap-2 rounded-2xl bg-primary px-6 text-primary-foreground shadow-[0_12px_40px_rgba(37,99,235,0.35)] hover:bg-primary/90"
          >
            <span className="text-xl">✦</span>
            创建项目
          </Button>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
            <Search className="h-4 w-4" />
            按下 Command/Ctrl + K 打开 Spotlight
          </div>
        </div>

        <div className="mx-auto mb-8 grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
          {DESKTOP_WIDGETS.map((widget) => (
            <div key={widget.label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-left backdrop-blur-xl">
              <widget.icon className="mb-3 h-5 w-5 text-primary" />
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">{widget.label}</div>
              <div className="mt-1 text-base font-semibold text-white/90">{widget.value}</div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            document.querySelector('[data-tour="apps-section"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition-colors hover:border-primary/30 hover:bg-white/10"
        >
          <LayoutGrid className="h-4 w-4 text-primary" />
          打开应用启动器
        </button>
      </div>
    </div>
  );
}
