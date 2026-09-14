/**
 * API Route: Start Project Agent
 * POST /api/agent/projects/{projectId}/start
 *
 * 启动项目的持久化 Agent
 * 支持 runtime 模式（子进程）和 in-process 模式
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistentAgentManager } from '@originos/core/lib/features/agent/server';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import { setRuntimeAgent } from '@/app/api/agent/_runtime-agent-registry';
import type { ApiResponse } from '@originos/core/types';
import type { RuntimeEvent } from '@originos/core/modules/collaboration-runtime/session/types';
import type { RuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/server';
import path from 'path';
import fs from 'fs/promises';
import { getDataRoot } from '@originos/core/lib/paths';
import { persistRuntimeLLMConfig } from '@originos/core/lib/features/user-config';

// 运行时模式：通过环境变量控制是否使用 collaboration-runtime 子进程
const USE_RUNTIME_MODE = process.env['USE_COLLABORATION_RUNTIME'] === 'true';

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ projectId: string }> }
) {
	try {
		const { projectId } = await params;
		const body = await request.json();
		const sessionId: string = body?.sessionId ?? `project-${projectId}`;
		const llmConfig = body?.llmConfig as RuntimeLLMConfig | undefined;
		persistRuntimeLLMConfig(llmConfig);

		console.log(`[API] Starting agent for project: ${projectId}`, {
			runtimeMode: USE_RUNTIME_MODE,
		});

		let status: any;

		if (USE_RUNTIME_MODE) {
			status = await startAgentViaRuntime(projectId, sessionId);
		} else {
			// In-process 模式（原有逻辑）
			const agent = await persistentAgentManager.startAgent(projectId, llmConfig);
			status = agent.getStatus();
		}

		return NextResponse.json<ApiResponse<{ status: any }>>(
			{
				success: true,
				data: {
					status,
				},
				timestamp: new Date().toISOString(),
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[API] Error starting agent:', error);

		return NextResponse.json<ApiResponse<unknown>>(
			{
				success: false,
				error: {
					code: 'AGENT_START_FAILED',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				timestamp: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
}

/**
 * Runtime 模式：通过 AgentSpawner 启动子进程
 */
async function startAgentViaRuntime(projectId: string, sessionId: string): Promise<any> {
	const projectDir = path.join(getDataRoot(), 'projects', projectId);

	// 检查项目目录是否存在
	try {
		await fs.access(projectDir);
	} catch {
		throw new Error(`Project directory not found: ${projectDir}`);
	}

	// 根据 Agent.md frontmatter 中的 agentType 决定运行时类型
	let agentType: 'persistent' | 'originos' = 'persistent';
	let systemPrompt: string | undefined;
	try {
		const agentMd = await fs.readFile(path.join(projectDir, 'Agent.md'), 'utf-8');
		systemPrompt = agentMd;
		const fmMatch = agentMd.match(/^---\n([\s\S]*?)\n---/);
		if (fmMatch?.[1]) {
			const agentTypeMatch = fmMatch[1].match(/^agentType:\s*(.+)$/m);
			if (agentTypeMatch?.[1]) {
				const rawType = agentTypeMatch[1].trim().toLowerCase();
				agentType = rawType === 'interview' ? 'persistent' : 'originos';
			}
		}
	} catch {
		console.warn(`[API] Agent.md not found for project ${projectId}, using default prompt`);
		systemPrompt = 'You are a helpful project assistant.';
	}

	const agentId = sessionId;
	const spawner = getGlobalSpawner();

	console.log(`[API] Runtime mode: Spawning agent worker for project ${projectId}`, {
		projectId,
		workingDirectory: projectDir,
		agentType,
	});

	const agentProcess = await spawner.spawn(
		{
			projectId,
			agentId,
			workingDirectory: projectDir,
			agentType,
			systemPrompt,
		},
		(event: RuntimeEvent) => {
			console.log(`[API] Runtime event from project ${projectId}: ${event.type}`);
		}
	);

	// 注册到共享注册表，仅存 process，不存 spawner
	setRuntimeAgent(projectId, { process: agentProcess, projectId });

	console.log(`[API] Runtime mode: Agent worker started for project ${projectId}, status: ${agentProcess.getStatus()}`);

	return agentProcess.getStatus();
}
