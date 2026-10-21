import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { body } from '../../../../lib/features/solution/__tests__/execution-contract-fixtures';
import type { SolutionExecutionContract } from '../../../../lib/features/solution';
import type {
  CollaborationRunSnapshot,
  WorkItemStatus,
} from '../contract-execution-types';
import {
  collaborationArtifactPath,
  createCollaborationArtifactRef,
} from '../artifact-reference';
import { readSupervisorTaskBoard } from '../task-board-projection';

describe('readSupervisorTaskBoard', () => {
  it('groups persisted Supervisor tasks by project and exposes concise agent output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-task-board-'));
    const project = path.join(root, 'projects', 'proj-a');
    const session = path.join(project, 'collaboration-sessions', 'session-a');
    await mkdir(session, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '采购项目', description: '供应商管理' }));
    await writeFile(path.join(project, 'project-collaboration-context.json'), JSON.stringify({ agents: [{ id: 'buyer', name: '采购专员' }] }));
    await writeFile(path.join(project, 'collaboration-sessions', 'collaboration-sessions.state.json'), JSON.stringify({
      sessions: [{ id: 'session-a', projectId: 'proj-a', status: 'running', globalGoal: '完成供应商准入', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z', config: { apiKey: 'must-not-leak' } }],
    }));
    await writeFile(path.join(session, 'protocol-observation.json'), JSON.stringify({
      tasks: [{
        id: 'task-a', description: '核验供应商材料', status: 'reported', assignedTo: 'buyer', createdAt: '2026-10-13T00:00:00.000Z',
        input: { request: '核验材料', acceptanceCriteria: '材料齐全' },
        output: { output: JSON.stringify({ messages: [
          { role: 'assistant', content: [
            { type: 'thinking', thinking: 'hidden' },
            { type: 'toolCall', id: 'call-file', name: 'write_file', arguments: { filePath: 'output/供应商准入单.md', content: 'secret body' } },
            { type: 'toolCall', id: 'call-data', name: 'create_instance', arguments: { conceptId: 'supplier', data: { name: '测试供应商' } } },
          ] },
          { role: 'toolResult', toolCallId: 'call-file', toolName: 'write_file', content: [{ type: 'text', text: JSON.stringify({ success: true, filePath: 'data/projects/proj-a/agents/buyer/output/供应商准入单.md' }) }] },
          { role: 'toolResult', toolCallId: 'call-data', toolName: 'create_instance', content: [{ type: 'text', text: JSON.stringify({ success: true, instanceId: 'supplier-1' }) }] },
          { role: 'assistant', content: [{ type: 'text', text: '材料已核验完成' }] },
        ] }) },
      }],
    }));
    await writeFile(path.join(session, 'events.jsonl'), [
      { id: 'e-user', sessionId: 'session-a', seq: 1, type: 'USER_INPUT', source: 'user', payload: { message: '帮我完成供应商准入评估' }, timestamp: '2026-10-13T00:00:01.000Z' },
      { id: 'e-start', sessionId: 'session-a', seq: 2, type: 'SUPERVISOR_AGENT_START', source: 'supervisor', payload: {}, timestamp: '2026-10-13T00:00:02.000Z' },
      { id: 'e-dispatch', sessionId: 'session-a', seq: 3, type: 'SUPERVISOR_TOOL_CALL', source: 'supervisor-session-a', payload: { toolName: 'dispatch_worker', args: { workerId: 'buyer', taskTitle: '供应商材料核验', specificAction: '核验供应商材料是否完整' } }, timestamp: '2026-10-13T00:00:03.000Z' },
    ].map((event) => JSON.stringify(event)).join('\n'));

    const projection = await readSupervisorTaskBoard(root);

    expect(projection.taskCount).toBe(1);
    expect(projection.projects[0]).toMatchObject({ projectId: 'proj-a', projectName: '采购项目', sessionCount: 1 });
    expect(projection.projects[0]?.tasks[0]).toMatchObject({
      id: 'task-a', title: '核验供应商材料', agentName: '采购专员', sessionGoal: '完成供应商准入', output: '材料已核验完成',
      artifacts: [{ kind: 'file', name: '供应商准入单.md', ref: 'data/projects/proj-a/agents/buyer/output/供应商准入单.md', operation: '创建' }],
      dataChanges: [{ operation: 'create_instance', label: '创建业务数据', reference: 'supplier-1' }],
    });
    expect(projection.projects[0]?.conversations[0]?.entries).toMatchObject([
      { role: 'user', actorName: '我', content: '帮我完成供应商准入评估' },
      { role: 'status', actorName: 'Supervisor', content: '正在理解请求并组织协作', state: 'working' },
      { role: 'status', actorName: '采购专员', content: '正在承接「供应商材料核验」', state: 'working' },
    ]);
    expect(JSON.stringify(projection)).not.toContain('must-not-leak');
    expect(JSON.stringify(projection)).not.toContain('hidden');

    const scopedProjection = await readSupervisorTaskBoard(root, 'proj-a');
    expect(scopedProjection.projects.map((item) => item.projectId)).toEqual(['proj-a']);
    expect((await readSupervisorTaskBoard(root, 'missing-project')).projects).toEqual([]);
  });

  it('projects frozen contract statuses and the exact pending acceptance subject', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-contract-board-'));
    const project = path.join(root, 'projects', 'proj-a');
    const runs = path.join(project, 'collaboration-runs');
    await mkdir(runs, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '采购项目' }));
    await writeFile(path.join(project, 'project-collaboration-context.json'), JSON.stringify({
      agents: [
        { id: 'buyer', name: '采购专员' },
        { id: 'reviewer-role', name: '质量负责人' },
      ],
    }));

    const createdAt = '2026-10-13T00:00:00.000Z';
    const binding = {
      parentTaskId: 'project-task-1',
      parentStepId: 'step-1',
      parentSessionId: 'session-contract',
      runId: 'run-1',
      solutionId: 'orders-solution',
      solutionVersion: '1.0',
      executionContractId: 'orders-solution@1.0',
      contractHash: 'sha256:contract',
      taskRevision: 1,
    };
    const statuses: ReadonlyArray<{
      id: string;
      status: WorkItemStatus;
      approverRole?: string;
    }> = [
      { id: 'verify', status: 'verifying' },
      { id: 'user-review', status: 'waiting_hitl', approverRole: 'user' },
      { id: 'role-review', status: 'waiting_hitl', approverRole: 'reviewer-role' },
      { id: 'revise', status: 'revision' },
    ];
    const contractBody = body();
    const contract: SolutionExecutionContract = {
      ...contractBody,
      projectId: 'proj-a',
      semanticContext: {
        ...contractBody.semanticContext,
        taskTemplates: statuses.map(({ id }) => ({
          id: `template-${id}`,
          designNodeId: id,
          objective: `处理 ${id}`,
          candidateAgentIds: ['buyer'],
          candidateSkillIds: [],
        })),
      },
      contractHash: binding.contractHash,
    };
    const snapshot: CollaborationRunSnapshot = {
      runId: binding.runId,
      projectId: 'proj-a',
      binding,
      contract,
      status: 'running',
      revision: 4,
      createdAt,
      updatedAt: '2026-10-13T00:04:00.000Z',
      workItems: statuses.map(({ id, status, approverRole }, index) => ({
        id: `work-${id}`,
        binding,
        designNodeId: id,
        assignedAgentId: 'buyer',
        skillRefs: [],
        dependsOn: [],
        inputRefs: [`input:${id}`],
        outputRefs: [],
        status,
        revision: 1,
        leaseEpoch: 1,
        attempts: [{
          attemptId: `attempt-${id}`,
          leaseEpoch: 1,
          requestId: `request-${id}`,
          payloadHash: `sha256:${id}`,
          status: status === 'verifying' ? 'verifying' : status,
          createdAt,
          updatedAt: `2026-10-13T00:0${index + 1}:00.000Z`,
          ...(approverRole ? {
            hitlRequests: [{
              requestId: `hitl-${id}`,
              policyId: `policy-${id}`,
              trigger: id === 'user-review' ? 'before_execution' as const : 'after_verification' as const,
              approverRole,
              parentTaskId: binding.parentTaskId,
              parentStepId: binding.parentStepId,
              parentSessionId: binding.parentSessionId,
              workItemId: `work-${id}`,
              attemptId: `attempt-${id}`,
              leaseEpoch: 1,
              question: '是否接受本次产出？',
              options: ['approve', 'reject'] as const,
              createdAt,
              status: 'pending' as const,
              updatedAt: createdAt,
            }],
          } : {}),
        }],
      })),
    };
    await writeFile(path.join(runs, 'run-1.json'), JSON.stringify(snapshot));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');
    const tasks = projection.projects[0]?.tasks ?? [];

    expect(tasks.map((task) => task.status)).toEqual([
      'verifying',
      'waiting_hitl',
      'waiting_hitl',
      'revision',
    ]);
    expect(tasks.find((task) => task.id === 'work-user-review')?.acceptance).toMatchObject({
      mode: 'user', approverRole: 'user', approverName: '用户', question: '是否接受本次产出？',
      options: ['approve', 'reject'], leaseEpoch: 1,
    });
    expect(tasks.find((task) => task.id === 'work-role-review')?.acceptance).toMatchObject({
      mode: 'role', approverRole: 'reviewer-role', approverName: '质量负责人',
    });
    expect(tasks.every((task) => task.source === 'contract')).toBe(true);
  });

  it('presents contract worker content and keeps internal receipt envelopes out of file products', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-contract-output-'));
    const project = path.join(root, 'projects', 'proj-a');
    const runs = path.join(project, 'collaboration-runs');
    await mkdir(runs, { recursive: true });
    const session = path.join(project, 'collaboration-sessions', 'session-contract');
    await mkdir(session, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '趋势项目' }));
    await writeFile(path.join(project, 'project-collaboration-context.json'), JSON.stringify({
      agents: [{ id: 'preparer', name: '趋势研究员' }],
    }));
    const contractBody = body();
    const runId = 'run-1';
    const workItemId = 'run-1:analyze';
    const attemptId = 'run-1:analyze:attempt-1';
    const binding = {
      parentTaskId: 'project-task-1', parentStepId: 'step-1', runId,
      parentSessionId: 'session-contract',
      solutionId: contractBody.solutionId, solutionVersion: contractBody.solutionVersion,
      executionContractId: contractBody.contractId, contractHash: contractBody.contractHash,
      taskRevision: 1,
    };
    await writeFile(path.join(project, 'collaboration-sessions', 'collaboration-sessions.state.json'), JSON.stringify({
      sessions: [{
        id: 'session-contract', projectId: 'proj-a', status: 'completed',
        globalGoal: '跟踪技术趋势', createdAt: '2026-10-13T00:00:00.000Z',
        updatedAt: '2026-10-13T00:01:00.000Z',
        formalExecution: { requestId: 'request-1', parentTaskId: binding.parentTaskId, parentStepId: binding.parentStepId, runId },
      }],
    }));
    await writeFile(path.join(session, 'events.jsonl'), `${JSON.stringify({
      id: 'status-message', sessionId: 'session-contract', seq: 1,
      type: 'ASSISTANT_MESSAGE', source: 'supervisor',
      payload: { content: '任务已完成，产出已写入任务看板。' },
      timestamp: '2026-10-13T00:01:00.000Z',
    })}\n`);
    const ref = createCollaborationArtifactRef('proj-a', runId, workItemId, attemptId);
    const filePath = collaborationArtifactPath(root, 'proj-a', runId, workItemId, attemptId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({
      schemaVersion: '1.0.0',
      content: JSON.stringify({
        outcome: {
          outputs: [{
            factId: 'trend-1',
            factTypeId: 'trend',
            value: { 项目名: 'openclaw', 一句话定位: '跨平台通用 AI 执行体' },
          }],
        },
        result: 'success',
      }),
    }));
    const snapshot: CollaborationRunSnapshot = {
      runId, projectId: 'proj-a', binding, contract: contractBody,
      status: 'running', revision: 1,
      createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z',
      workItems: [{
        id: workItemId, binding, designNodeId: contractBody.topology.nodes[0]!.id,
        assignedAgentId: contractBody.agents[0]!.agentId,
        skillRefs: [], dependsOn: [], inputRefs: [], outputRefs: [],
        status: 'completed', revision: 1, leaseEpoch: 1,
        attempts: [{
          attemptId, leaseEpoch: 1, requestId: 'request-1', payloadHash: 'sha256:request-1',
          status: 'completed', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z',
          workerReceipt: {
            receiptId: 'worker-1', outputRefs: [ref], outputHash: 'sha256:output',
          },
          verifierResult: { status: 'passed' },
        }],
      }],
    };
    await writeFile(path.join(runs, 'run-1.json'), JSON.stringify(snapshot));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');
    const task = projection.projects[0]?.tasks[0];

    expect(task?.output).toContain('**项目名**：openclaw');
    expect(task?.output).toContain('**一句话定位**：跨平台通用 AI 执行体');
    expect(task?.artifacts).toEqual([]);
    expect(JSON.stringify(task)).not.toContain('artifact://');
    expect(projection.projects[0]?.conversations[0]?.entries.at(-1)).toMatchObject({
      role: 'supervisor',
      actorName: '趋势研究员',
      content: expect.stringContaining('**项目名**：openclaw'),
    });
  });

  it('recovers project files declared by a canonical output rootPath for pre-metadata receipts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-contract-board-files-'));
    const project = path.join(root, 'projects', 'proj-a');
    const runs = path.join(project, 'collaboration-runs');
    const target = path.join(project, 'agents', 'curator', 'skills', 'organize-wiki');
    await mkdir(runs, { recursive: true });
    await mkdir(path.join(target, 'wiki', 'concepts'), { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '知识项目' }));
    await writeFile(path.join(project, 'project-collaboration-context.json'), JSON.stringify({ agents: [{ id: 'curator', name: '知识沉淀 Agent' }] }));
    await writeFile(path.join(target, 'wiki', 'SUMMARY.md'), '# 总览');
    await writeFile(path.join(target, 'wiki', 'concepts', '理念.md'), '# 理念');

    const contractBody = body();
    const node = contractBody.topology.nodes[0]!;
    const contract = {
      ...contractBody,
      topology: { ...contractBody.topology, nodes: [{ ...node, id: 'organize-wiki', contractRef: 'organize-wiki', kind: 'skill' as const }] },
      agents: [{ ...contractBody.agents[0]!, agentId: 'curator' }],
    };
    const runId = 'run-files';
    const workItemId = 'run-files:organize-wiki';
    const attemptId = 'run-files:organize-wiki:attempt-1';
    const binding = {
      parentTaskId: 'task-files', parentStepId: 'step-files', runId,
      solutionId: contract.solutionId, solutionVersion: contract.solutionVersion,
      executionContractId: contract.contractId, contractHash: contract.contractHash, taskRevision: 1,
    };
    const ref = createCollaborationArtifactRef('proj-a', runId, workItemId, attemptId);
    const receiptPath = collaborationArtifactPath(root, 'proj-a', runId, workItemId, attemptId);
    await mkdir(path.dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, JSON.stringify({
      schemaVersion: '1.0.0',
      content: JSON.stringify({
        outcome: { outputs: [{ value: { rootPath: 'wiki/' } }] },
        result: 'success',
      }),
    }));
    const snapshot: CollaborationRunSnapshot = {
      runId, projectId: 'proj-a', binding, contract,
      status: 'completed', revision: 1,
      createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z',
      workItems: [{
        id: workItemId, binding, designNodeId: 'organize-wiki', assignedAgentId: 'curator',
        skillRefs: [], dependsOn: [], inputRefs: [], outputRefs: [], status: 'completed', revision: 1, leaseEpoch: 1,
        attempts: [{
          attemptId, leaseEpoch: 1, requestId: 'request-files', payloadHash: 'sha256:files', status: 'completed',
          createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z',
          workerReceipt: { receiptId: 'worker-files', outputRefs: [ref], outputHash: 'sha256:output' },
          verifierResult: { status: 'passed' },
        }],
      }],
    };
    await writeFile(path.join(runs, `${runId}.json`), JSON.stringify(snapshot));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');
    expect(projection.projects[0]?.tasks[0]?.artifacts).toEqual(expect.arrayContaining([
      { kind: 'file', name: 'SUMMARY.md', ref: 'agents/curator/skills/organize-wiki/wiki/SUMMARY.md', operation: '产出' },
      { kind: 'file', name: '理念.md', ref: 'agents/curator/skills/organize-wiki/wiki/concepts/理念.md', operation: '产出' },
    ]));
  });

  it('projects dependency-blocked WorkItems as planned instead of actionable pending tasks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-contract-board-planned-'));
    const project = path.join(root, 'projects', 'proj-a');
    const runs = path.join(project, 'collaboration-runs');
    await mkdir(runs, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '采购项目' }));

    const contractBody = body();
    const binding = {
      parentTaskId: 'project-task-1', parentStepId: 'step-1', runId: 'run-1',
      solutionId: contractBody.solutionId, solutionVersion: contractBody.solutionVersion,
      executionContractId: contractBody.contractId, contractHash: contractBody.contractHash,
      taskRevision: 1,
    };
    const workItem = (id: string, dependsOn: string[]) => ({
      id,
      binding,
      designNodeId: contractBody.topology.nodes[0]!.id,
      assignedAgentId: contractBody.agents[0]!.agentId,
      skillRefs: [],
      dependsOn,
      inputRefs: [],
      outputRefs: [],
      status: 'pending' as const,
      revision: 0,
      leaseEpoch: 0,
      attempts: [],
    });
    const snapshot: CollaborationRunSnapshot = {
      runId: binding.runId,
      projectId: 'proj-a',
      binding,
      contract: contractBody,
      status: 'running',
      revision: 1,
      createdAt: '2026-10-13T00:00:00.000Z',
      updatedAt: '2026-10-13T00:00:00.000Z',
      workItems: [workItem('root-work', []), workItem('downstream-work', ['root-work'])],
    };
    await writeFile(path.join(runs, 'run-1.json'), JSON.stringify(snapshot));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');

    expect(projection.projects[0]?.tasks.find(({ id }) => id === 'root-work')?.status).toBe('pending');
    expect(projection.projects[0]?.tasks.find(({ id }) => id === 'downstream-work')?.status).toBe('planned');
  });

  it('hides downstream WorkItems that never started after their Run terminates', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-contract-board-terminal-'));
    const project = path.join(root, 'projects', 'proj-a');
    const runs = path.join(project, 'collaboration-runs');
    await mkdir(runs, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '采购项目' }));
    const contractBody = body();
    const binding = {
      parentTaskId: 'project-task-1', parentStepId: 'step-1', runId: 'run-1',
      solutionId: contractBody.solutionId, solutionVersion: contractBody.solutionVersion,
      executionContractId: contractBody.contractId, contractHash: contractBody.contractHash,
      taskRevision: 1,
    };
    const failed: CollaborationRunSnapshot['workItems'][number] = {
      id: 'failed-root', binding, designNodeId: contractBody.topology.nodes[0]!.id,
      assignedAgentId: contractBody.agents[0]!.agentId, skillRefs: [], dependsOn: [],
      inputRefs: [], outputRefs: [], status: 'failed', revision: 1, leaseEpoch: 1,
      attempts: [{
        attemptId: 'attempt-1', leaseEpoch: 1, requestId: 'request-1',
        payloadHash: 'sha256:request-1', status: 'failed',
        createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z',
        reason: 'MAX_DURATION_EXCEEDED',
      }],
    };
    const downstream = {
      ...failed,
      id: 'never-started',
      status: 'pending' as const,
      dependsOn: ['failed-root'],
      attempts: [],
    };
    const snapshot: CollaborationRunSnapshot = {
      runId: binding.runId, projectId: 'proj-a', binding, contract: contractBody,
      status: 'running', terminalStatus: 'failed', failureReason: 'MAX_DURATION_EXCEEDED',
      revision: 2, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:01:00.000Z',
      workItems: [failed, downstream],
    };
    await writeFile(path.join(runs, 'run-1.json'), JSON.stringify(snapshot));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');

    expect(projection.projects[0]?.tasks.map(({ id }) => id)).toEqual(['failed-root']);
  });

  it('keeps historical tasks from the event stream when the latest observation only contains the current run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-task-board-history-'));
    const project = path.join(root, 'projects', 'proj-a');
    const session = path.join(project, 'collaboration-sessions', 'session-a');
    await mkdir(session, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '采购项目' }));
    await writeFile(path.join(project, 'collaboration-sessions', 'collaboration-sessions.state.json'), JSON.stringify({
      sessions: [{ id: 'session-a', projectId: 'proj-a', status: 'running', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:10:00.000Z' }],
    }));
    await writeFile(path.join(session, 'protocol-observation.json'), JSON.stringify({
      tasks: [{
        id: 'task-current', description: '处理当前请求', status: 'reported', assignedTo: 'buyer', createdAt: '2026-10-13T00:10:00.000Z',
      }],
    }));
    const historicalTask = {
      id: 'task-old', description: '处理历史请求', status: 'pending', assignedTo: 'buyer', createdAt: '2026-10-13T00:00:00.000Z',
    };
    await writeFile(path.join(session, 'events.jsonl'), [
      { id: 'e1', sessionId: 'session-a', seq: 1, type: 'TASK_CREATED', source: 'supervisor', payload: { task: historicalTask }, timestamp: '2026-10-13T00:00:00.000Z' },
      { id: 'e2', sessionId: 'session-a', seq: 2, type: 'TASK_ASSIGNED', source: 'supervisor', payload: { taskId: 'task-old', agentId: 'buyer' }, timestamp: '2026-10-13T00:01:00.000Z' },
      { id: 'e3', sessionId: 'session-a', seq: 3, type: 'TASK_STARTED', source: 'buyer', payload: { taskId: 'task-old' }, timestamp: '2026-10-13T00:02:00.000Z' },
      { id: 'e4', sessionId: 'session-a', seq: 4, type: 'TASK_REPORTED', source: 'buyer', payload: { taskId: 'task-old', output: '历史产出' }, timestamp: '2026-10-13T00:03:00.000Z' },
      { id: 'e5', sessionId: 'session-a', seq: 5, type: 'TASK_COMPLETED', source: 'supervisor', payload: { taskId: 'task-old', output: '验收通过' }, timestamp: '2026-10-13T00:04:00.000Z' },
    ].map((event) => JSON.stringify(event)).join('\n'));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');

    expect(projection.taskCount).toBe(2);
    expect(projection.projects[0]?.tasks.find((task) => task.id === 'task-old')).toMatchObject({
      status: 'completed',
      output: '验收通过',
      completedAt: '2026-10-13T00:04:00.000Z',
    });
    expect(projection.projects[0]?.tasks.find((task) => task.id === 'task-current')).toMatchObject({
      status: 'reported',
    });
  });

  it('uses formal WorkItems as the only task projection for a bound Supervisor session', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'originos-task-board-formal-binding-'));
    const project = path.join(root, 'projects', 'proj-a');
    const session = path.join(project, 'collaboration-sessions', 'session-a');
    const runs = path.join(project, 'collaboration-runs');
    await mkdir(session, { recursive: true });
    await mkdir(runs, { recursive: true });
    await writeFile(path.join(project, 'project.json'), JSON.stringify({ id: 'proj-a', name: '采购项目' }));
    await writeFile(path.join(project, 'collaboration-sessions', 'collaboration-sessions.state.json'), JSON.stringify({
      sessions: [{
        id: 'session-a',
        projectId: 'proj-a',
        status: 'running',
        globalGoal: '完成供应商准入',
        createdAt: '2026-10-13T00:00:00.000Z',
        updatedAt: '2026-10-13T00:01:00.000Z',
        formalExecution: {
          requestId: 'request-a',
          parentTaskId: 'task-parent',
          parentStepId: 'step-parent',
          runId: 'run-a',
        },
      }],
    }));
    await writeFile(path.join(session, 'protocol-observation.json'), JSON.stringify({
      tasks: [{
        id: 'legacy-task',
        description: '旧黑板重复任务',
        status: 'running',
        assignedTo: 'buyer',
        createdAt: '2026-10-13T00:00:00.000Z',
      }],
    }));
    await writeFile(path.join(session, 'events.jsonl'), `${JSON.stringify({
      id: 'user-a',
      sessionId: 'session-a',
      seq: 1,
      type: 'USER_INPUT',
      source: 'user',
      payload: { message: '完成供应商准入' },
      timestamp: '2026-10-13T00:00:00.000Z',
    })}\n`);

    const contractBody = body();
    const binding = {
      parentTaskId: 'task-parent',
      parentStepId: 'step-parent',
      parentSessionId: 'approved-task-session',
      runId: 'run-a',
      solutionId: contractBody.solutionId,
      solutionVersion: contractBody.solutionVersion,
      executionContractId: contractBody.contractId,
      contractHash: contractBody.contractHash,
      taskRevision: 1,
    };
    const snapshot: CollaborationRunSnapshot = {
      runId: 'run-a',
      projectId: 'proj-a',
      binding,
      contract: contractBody,
      status: 'running',
      revision: 1,
      createdAt: '2026-10-13T00:00:00.000Z',
      updatedAt: '2026-10-13T00:01:00.000Z',
      workItems: [{
        id: 'formal-work',
        binding,
        designNodeId: contractBody.topology.nodes[0]!.id,
        assignedAgentId: contractBody.agents[0]!.agentId,
        skillRefs: [],
        dependsOn: [],
        inputRefs: [],
        outputRefs: [],
        status: 'failed',
        revision: 1,
        leaseEpoch: 1,
        attempts: [{
          attemptId: 'attempt-formal-work-1',
          leaseEpoch: 1,
          requestId: 'request-formal-work-1',
          payloadHash: 'sha256:formal-work',
          status: 'failed',
          createdAt: '2026-10-13T00:00:00.000Z',
          updatedAt: '2026-10-13T00:01:00.000Z',
          readinessReceipt: {
            receiptId: 'ready-formal-work-1',
            status: 'ready',
            checkedAt: '2026-10-13T00:00:00.000Z',
            inputRefs: [],
            grantedPermissions: [],
            targetAvailable: true,
          },
          reason: 'WORKER_TIMEOUT:模型调用超时',
        }],
      }],
    };
    await writeFile(path.join(runs, 'run-a.json'), JSON.stringify(snapshot));

    const projection = await readSupervisorTaskBoard(root, 'proj-a');

    expect(projection.taskCount).toBe(1);
    expect(projection.projects[0]?.tasks[0]).toMatchObject({
      id: 'formal-work',
      source: 'contract',
      sessionId: 'session-a',
      sessionGoal: '完成供应商准入',
      sessionStatus: 'running',
      runId: 'run-a',
      failure: {
        stage: 'worker',
        code: 'WORKER_TIMEOUT',
        reason: 'WORKER_TIMEOUT:模型调用超时',
        occurredAt: '2026-10-13T00:01:00.000Z',
        recoveryAction: 'retry',
      },
    });
    expect(projection.projects[0]?.tasks.map((task) => task.id)).not.toContain('legacy-task');
    expect(projection.projects[0]?.conversations[0]?.sessionId).toBe('session-a');

    snapshot.workItems[0]!.status = 'blocked';
    snapshot.workItems[0]!.attempts[0]!.status = 'blocked';
    snapshot.workItems[0]!.attempts[0]!.reason = 'INPUT_FACT_NOT_FOUND:fact-type-missing';
    snapshot.workItems[0]!.attempts[0]!.readinessReceipt!.status = 'blocked';
    await writeFile(path.join(runs, 'run-a.json'), JSON.stringify(snapshot));
    const blockedProjection = await readSupervisorTaskBoard(root, 'proj-a');
    expect(blockedProjection.projects[0]?.tasks[0]?.failure).toMatchObject({
      stage: 'readiness',
      code: 'INPUT_FACT_NOT_FOUND',
      occurredAt: '2026-10-13T00:01:00.000Z',
      recoveryAction: 'fix_input',
    });
  });
});
