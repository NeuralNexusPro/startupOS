'use client';

import * as React from 'react';
import {
  Bot,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  MousePointer2,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@originos/core/lib/utils';
import { getIpcRenderer, isElectron as detectElectron } from '@originos/core/lib/integrations/electron';
import type { DockSide } from '@originos/core/types';
import useDockStore from '@/store/dockStore';

// Removed localStorage keys - using user-config now

interface DesktopOnboardingProps {
  open: boolean;
  projectCount: number;
  agentCount: number;
  skillCount: number;
  llmConfigured: boolean;
  isElectron: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
  onDismiss: () => void;
}

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GuideStep {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  cue: string;
  selector?: string;
  fallbackSelector?: string;
  virtualTarget?: 'dock';
  placement: 'top' | 'right' | 'bottom' | 'left';
  icon: React.ComponentType<{ className?: string }>;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'llm-settings',
    eyebrow: '第一步：模型配置',
    title: '先配置要使用的大模型',
    description: 'OriginOS 不再预置默认模型。开始创建项目、运行 Agent 或技能之前，请先在右上角“设置”里填写你要使用的模型、Base URL 和凭证。',
    cue: '如果模型没配好，后面的 Agent、技能和多 Agent 协作都无法稳定运行。建议先打开设置完成 LLM 配置，再继续桌面导览。',
    selector: '[data-tour="settings-button"]',
    placement: 'left',
    icon: Settings,
  },
  {
    id: 'desktop',
    eyebrow: '桌面总览',
    title: '这里是你的 AI Native 桌面',
    description: '桌面把项目、Agent、技能和应用窗口放在同一个工作空间里。左侧和右侧概览区会告诉你当前有多少项目、Agent 和可启动能力。',
    cue: '系统概览会帮你理解项目、Agent 和技能分别负责什么，以及当前桌面已经沉淀了多少能力。',
    selector: '[data-tour="desktop-overview"]',
    fallbackSelector: '[data-tour="main-content"]',
    placement: 'right',
    icon: Sparkles,
  },
  {
    id: 'dock',
    eyebrow: 'Dock 区',
    title: 'Dock 是启动、切换和返回现场的位置',
    description: 'Dock 可以配置在屏幕左侧、底部或右侧。应用、项目窗口、Agent 和技能启动后都会通过 Dock 快速回到现场。',
    cue: '把 Dock 当成“正在进行的工作队列”。hover 展开，点击图标启动或聚焦窗口。',
    virtualTarget: 'dock',
    placement: 'right',
    icon: MousePointer2,
  },
  {
    id: 'projects',
    eyebrow: '项目区',
    title: '项目是业务工作的主上下文',
    description: '项目卡片在这里。创建项目会进入访谈，把模糊想法整理成业务模型，后续文件、方案、本体和协作记录都围绕项目沉淀。',
    cue: '有项目时点击项目卡继续访谈或打开工作区；没有项目时从”创建项目”开始。',
    selector: '[data-tour=”projects-section”]',
    fallbackSelector: '[data-tour=”welcome-section”]',
    placement: 'right',
    icon: FolderOpen,
  },
  {
    id: 'apps',
    eyebrow: '内置应用',
    title: '应用启动器放着系统内置能力',
    description: '这里包括创建 Agent、创建角色、技能市场、工作区、头脑风暴和工作流构建。它们像桌面应用一样打开窗口，背后由系统动作或技能驱动。',
    cue: '入口在这里，执行结果会进入项目、Agent 会话或技能工作目录。',
    selector: '[data-tour="apps-section"]',
    fallbackSelector: '[data-tour="welcome-apps"]',
    placement: 'top',
    icon: LayoutGrid,
  },
  {
    id: 'agents',
    eyebrow: 'Agent 区',
    title: 'Agent 是可持续工作的角色',
    description: '已创建的助手和角色 Agent 会显示在这里。Agent 拥有记忆、知识、工具和技能，适合长期陪伴、长期沉淀和反复调用。',
    cue: '如果当前还没有 Agent，请从“创建 Agent”或“创建角色”入口开始。',
    selector: '[data-tour="agents-section"]',
    fallbackSelector: '[data-tour="app-create-agent"]',
    placement: 'top',
    icon: Bot,
  },
  {
    id: 'skills',
    eyebrow: '技能区',
    title: '技能是可调用的专业流程',
    description: '自定义技能会显示在这里；内置技能也在应用启动器中，例如头脑风暴、工作流构建、技能市场和创建角色。',
    cue: '一次性任务或专业流程用技能；需要持续服务和记忆积累时用 Agent。',
    selector: '[data-tour="skills-section"]',
    fallbackSelector: '[data-tour="app-skill-market"]',
    placement: 'top',
    icon: Boxes,
  },
  {
    id: 'replay',
    eyebrow: '随时重看',
    title: '以后可以从这里重新打开引导',
    description: '顶部菜单右侧的问号按钮就是桌面引导入口。关闭首次引导后，需要回顾 Dock、项目、Agent 或技能时，从这里重新播放。',
    cue: '这不会改变你的数据，只是重新显示导览。',
    selector: '[data-tour="help-guide"]',
    placement: 'left',
    icon: HelpCircle,
  },
];

const FIRST_GUIDE_STEP = GUIDE_STEPS[0] as GuideStep;
const PADDING = 10;

function getVirtualDockRect(isElectron: boolean, dockSide: DockSide): HighlightRect {
  if (isElectron && dockSide !== 'bottom') {
    return {
      left: dockSide === 'right' ? window.innerWidth - 84 : 0,
      top: Math.max(40, window.innerHeight * 0.18),
      width: 84,
      height: Math.min(460, window.innerHeight * 0.64),
    };
  }

  return {
    left: Math.max(16, window.innerWidth / 2 - 260),
    top: window.innerHeight - 92,
    width: Math.min(520, window.innerWidth - 32),
    height: 76,
  };
}

function getPaddedRect(rect: DOMRect | HighlightRect): HighlightRect {
  return {
    left: Math.max(8, rect.left - PADDING),
    top: Math.max(8, rect.top - PADDING),
    width: Math.min(window.innerWidth - 16, rect.width + PADDING * 2),
    height: Math.min(window.innerHeight - 16, rect.height + PADDING * 2),
  };
}

function findGuideElement(step: GuideStep): Element | null {
  const target = step.selector ? document.querySelector(step.selector) : null;
  const fallback = !target && step.fallbackSelector ? document.querySelector(step.fallbackSelector) : null;
  return target ?? fallback;
}

function findTarget(step: GuideStep, isElectron: boolean, dockSide: DockSide): HighlightRect {
  if (step.virtualTarget === 'dock') {
    return getVirtualDockRect(isElectron, dockSide);
  }

  const element = findGuideElement(step);

  if (!element) {
    return {
      left: Math.max(16, window.innerWidth / 2 - 260),
      top: Math.max(72, window.innerHeight / 2 - 160),
      width: Math.min(520, window.innerWidth - 32),
      height: 280,
    };
  }

  return getPaddedRect(element.getBoundingClientRect());
}

function getBubbleStyle(rect: HighlightRect, placement: GuideStep['placement']): React.CSSProperties {
  const bubbleWidth = Math.min(420, window.innerWidth - 32);
  const bubbleHeight = Math.min(420, window.innerHeight - 32);
  const gap = 18;

  if (placement === 'right') {
    return {
      left: Math.min(rect.left + rect.width + gap, window.innerWidth - bubbleWidth - 16),
      top: Math.max(16, Math.min(rect.top, window.innerHeight - bubbleHeight - 16)),
      width: bubbleWidth,
    };
  }

  if (placement === 'left') {
    return {
      left: Math.max(16, rect.left - bubbleWidth - gap),
      top: Math.max(16, Math.min(rect.top, window.innerHeight - bubbleHeight - 16)),
      width: bubbleWidth,
    };
  }

  if (placement === 'top') {
    return {
      left: Math.max(16, Math.min(rect.left, window.innerWidth - bubbleWidth - 16)),
      top: Math.max(16, rect.top - bubbleHeight - gap),
      width: bubbleWidth,
    };
  }

  return {
    left: Math.max(16, Math.min(rect.left, window.innerWidth - bubbleWidth - 16)),
    top: Math.min(rect.top + rect.height + gap, window.innerHeight - bubbleHeight - 16),
    width: bubbleWidth,
  };
}

export function DesktopOnboarding({
  open,
  projectCount,
  agentCount,
  skillCount,
  llmConfigured,
  isElectron,
  onOpenSettings,
  onClose,
  onDismiss,
}: DesktopOnboardingProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [highlightRect, setHighlightRect] = React.useState<HighlightRect | null>(null);
  const targetTimerRef = React.useRef<number | null>(null);
  const dockSide = useDockStore((state) => state.dockSide);
  const currentStep = GUIDE_STEPS[stepIndex] ?? FIRST_GUIDE_STEP;
  const Icon = currentStep.icon;

  const updateTarget = React.useCallback((centerTarget = false) => {
    if (!open) return;
    if (targetTimerRef.current !== null) {
      window.clearTimeout(targetTimerRef.current);
    }

    const element = centerTarget && !currentStep.virtualTarget ? findGuideElement(currentStep) : null;
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    targetTimerRef.current = window.setTimeout(() => {
      setHighlightRect(findTarget(currentStep, isElectron, dockSide));
      targetTimerRef.current = null;
    }, element ? 360 : 120);
  }, [currentStep, dockSide, isElectron, open]);

  React.useEffect(() => {
    if (!open) return;
    updateTarget(true);

    const refreshTarget = () => updateTarget(false);
    window.addEventListener('resize', refreshTarget);
    window.addEventListener('scroll', refreshTarget, true);

    return () => {
      if (targetTimerRef.current !== null) {
        window.clearTimeout(targetTimerRef.current);
        targetTimerRef.current = null;
      }
      window.removeEventListener('resize', refreshTarget);
      window.removeEventListener('scroll', refreshTarget, true);
    };
  }, [open, updateTarget]);

  React.useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  React.useEffect(() => {
    if (!detectElectron()) return;
    const highlighted = open && currentStep.id === 'dock';
    void getIpcRenderer().invoke('dock:guide-highlight', highlighted, { side: dockSide });

    return () => {
      if (!detectElectron()) return;
      void getIpcRenderer().invoke('dock:guide-highlight', false, { side: dockSide });
    };
  }, [currentStep.id, dockSide, open]);

  React.useEffect(() => {
    const highlighted = open && currentStep.id === 'dock';
    window.dispatchEvent(new CustomEvent('dock:guide-highlight-local', { detail: { highlighted } }));
    return () => {
      window.dispatchEvent(new CustomEvent('dock:guide-highlight-local', { detail: { highlighted: false } }));
    };
  }, [currentStep.id, open]);

  if (!open) return null;

  const close = () => {
    console.log('[DesktopOnboarding] Dismissing onboarding');
    onDismiss();
    onClose();
  };

  const goToStep = (nextIndex: number) => {
    setStepIndex(Math.max(0, Math.min(GUIDE_STEPS.length - 1, nextIndex)));
  };

  const rect = highlightRect ?? {
    left: 24,
    top: 88,
    width: Math.min(520, window.innerWidth - 48),
    height: 300,
  };
  const bubbleStyle = getBubbleStyle(rect, currentStep.placement);
  const isDockStep = currentStep.id === 'dock';

  return (
    <div className="fixed inset-0 z-[90] text-white">
      <div className="absolute inset-0 bg-black/62 backdrop-blur-[2px]" />

      {!isDockStep && (
        <div
          className="pointer-events-none fixed rounded-[1.75rem] border border-sky-200/90 bg-white/[0.03] shadow-[0_0_0_9999px_rgba(0,0,0,0.58),0_0_48px_rgba(56,189,248,0.55)] transition-all duration-300"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        >
          <div className="absolute -inset-1 rounded-[2rem] border border-sky-300/45 animate-pulse" />
        </div>
      )}

      {isDockStep && (
        <div className="pointer-events-none fixed inset-0">
          <div
            className={cn(
              'absolute h-px bg-sky-200/80 shadow-[0_0_18px_rgba(125,211,252,0.8)]',
              isElectron ? 'w-24' : 'w-px h-20'
            )}
            style={isElectron
              ? {
                  left: rect.left + rect.width + 10,
                  top: rect.top + rect.height / 2,
                }
              : {
                  left: rect.left + rect.width / 2,
                  top: rect.top - 82,
                }}
          >
            <div
              className={cn(
                'absolute h-3 w-3 rotate-45 border-sky-200',
                isElectron
                  ? 'right-0 top-1/2 -translate-y-1/2 border-r border-t'
                  : 'bottom-0 left-1/2 -translate-x-1/2 border-b border-r'
              )}
            />
          </div>
          <div
            className="absolute flex items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-400/15 px-3 py-2 text-xs text-sky-100 shadow-[0_12px_42px_rgba(14,165,233,0.2)] backdrop-blur-xl"
            style={isElectron
              ? {
                  left: rect.left + rect.width + 118,
                  top: Math.max(24, rect.top + rect.height / 2 - 18),
                }
              : {
                  left: Math.max(16, Math.min(rect.left + rect.width / 2 - 92, window.innerWidth - 200)),
                  top: Math.max(24, rect.top - 130),
                }}
          >
            <MousePointer2 className="h-3.5 w-3.5" />
            {isElectron ? 'Dock 已保持展开' : 'Dock 已模拟 hover 展开'}
          </div>
        </div>
      )}

      <div
        className="fixed flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#08111f]/95 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all duration-300 md:p-6"
        style={{
          ...bubbleStyle,
          maxHeight: 'calc(100vh - 2rem)',
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/55">
            <Icon className="h-3.5 w-3.5 text-sky-300" />
            {currentStep.eyebrow}
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭引导"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-3 text-xs text-sky-200/70">
            {stepIndex + 1} / {GUIDE_STEPS.length}
          </div>
          <h2 className="text-2xl font-bold leading-tight text-white">{currentStep.title}</h2>
          <p className="mt-3 text-sm leading-6 text-white/68">{currentStep.description}</p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
              <Check className="h-4 w-4 text-emerald-300" />
              你现在看到的位置
            </div>
            <p className="text-sm leading-6 text-white/62">{currentStep.cue}</p>
          </div>

          {currentStep.id === 'llm-settings' ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/45">当前状态</div>
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                llmConfigured
                  ? 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100'
                  : 'border-amber-300/25 bg-amber-400/15 text-amber-100'
              }`}>
                <Check className="h-4 w-4" />
                {llmConfigured ? '已检测到可用 LLM 配置' : '尚未检测到可用 LLM 配置'}
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-white/55">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                <div className="text-base font-bold text-white">{projectCount}</div>
                项目
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                <div className="text-base font-bold text-white">{agentCount}</div>
                Agent
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
                <div className="text-base font-bold text-white">{skillCount}</div>
                技能
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          {currentStep.id === 'llm-settings' ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300/25 bg-sky-400/15 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
            >
              <Settings className="h-4 w-4" />
              打开模型设置
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => goToStep(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            上一步
          </button>
          <button
            type="button"
            onClick={() => {
              if (stepIndex === GUIDE_STEPS.length - 1) {
                close();
                return;
              }
              goToStep(stepIndex + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-500"
          >
            {stepIndex === GUIDE_STEPS.length - 1 ? '开始使用' : '下一步'}
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-xl px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.06] hover:text-white/80"
          >
            跳过
          </button>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {GUIDE_STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => goToStep(index)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === stepIndex ? 'bg-sky-300' : 'bg-white/18 hover:bg-white/35',
              )}
              aria-label={`跳到${step.title}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
