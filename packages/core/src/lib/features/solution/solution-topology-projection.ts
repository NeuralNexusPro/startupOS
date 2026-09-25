import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { getDataRoot } from '../../paths';

export type SolutionTopologyEdgeType = 'trigger' | 'notify' | 'depend';

export interface SolutionTopologyAgentProjection {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly responsibility: string;
  readonly capabilities: readonly string[];
  readonly dataOperations: Readonly<Record<string, readonly string[]>>;
  readonly skills: readonly string[];
}

export interface SolutionTopologyEdgeProjection {
  readonly from: string;
  readonly to: string;
  readonly type: SolutionTopologyEdgeType;
  readonly description: string;
}

export interface ProjectSolutionTopologyProjection {
  readonly agents: Readonly<Record<string, SolutionTopologyAgentProjection>>;
  readonly edges: readonly SolutionTopologyEdgeProjection[];
  readonly entryPoints: readonly string[];
  readonly exitPoints: readonly string[];
  readonly mode: 'workflow' | 'system';
}

export interface LoadProjectSolutionTopologyProjectionInput {
  readonly projectId: string;
  readonly dataRoot?: string;
}

interface PersistedCollaboration {
  readonly targetAgentId?: unknown;
  readonly type?: unknown;
  readonly description?: unknown;
}

interface PersistedAgent {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly responsibility?: unknown;
  readonly businessDomain?: unknown;
  readonly skills?: unknown;
  readonly dataOperations?: unknown;
  readonly collaborations?: unknown;
}

interface PersistedAgentsDocument {
  readonly agents?: unknown;
}

function assertSafeProjectId(projectId: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(projectId) || projectId === '.' || projectId === '..') {
    throw new Error('INVALID_PROJECT_ID');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`INVALID_SOLUTION_TOPOLOGY:${field}`);
  }
  return value.trim();
}

function readStringArray(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`INVALID_SOLUTION_TOPOLOGY:${field}`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readDataOperations(value: unknown): Readonly<Record<string, readonly string[]>> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error('INVALID_SOLUTION_TOPOLOGY:dataOperations');
  return Object.fromEntries(
    Object.entries(value).map(([key, operations]) => [
      key,
      readStringArray(operations, `dataOperations.${key}`),
    ])
  );
}

function extractCapabilities(responsibility: string): readonly string[] {
  return responsibility
    .split(/[.;，。；\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => {
      const match = sentence.match(
        /^(?:负责|处理|管理|执行|分析|生成|创建|验证|协调|驱动|实现)\s*[:：]?\s*(.{2,30}?)(?:，|,|。|;|$)/i
      ) ?? sentence.match(/^(\w+(?:\s+\w+){0,3})\s*[-:：]/);
      return match?.[1]?.trim() ?? sentence.slice(0, 30).trim();
    })
    .filter((capability) => capability.length > 1);
}

function readEdgeType(value: unknown): SolutionTopologyEdgeType {
  if (value === 'trigger' || value === 'notify' || value === 'depend') return value;
  throw new Error('INVALID_SOLUTION_TOPOLOGY:collaboration.type');
}

function createsPath(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  const visited = new Set<string>();
  const pending = [from];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (next === to) return true;
      if (!visited.has(next)) pending.push(next);
    }
  }
  return false;
}

function parseProjection(document: PersistedAgentsDocument): ProjectSolutionTopologyProjection {
  if (!Array.isArray(document.agents)) {
    throw new Error('INVALID_SOLUTION_TOPOLOGY:agents');
  }

  const persistedAgents = document.agents as readonly PersistedAgent[];
  const agents: Record<string, SolutionTopologyAgentProjection> = {};
  for (const item of persistedAgents) {
    if (!isRecord(item)) throw new Error('INVALID_SOLUTION_TOPOLOGY:agent');
    const id = readString(item['id'], 'agent.id');
    if (agents[id] !== undefined) throw new Error(`INVALID_SOLUTION_TOPOLOGY:duplicate-agent:${id}`);
    const responsibility = readString(item['responsibility'], `agent.${id}.responsibility`);
    agents[id] = {
      id,
      name: readString(item['name'], `agent.${id}.name`),
      domain: typeof item['businessDomain'] === 'string' ? item['businessDomain'] : '',
      responsibility,
      capabilities: extractCapabilities(responsibility),
      dataOperations: readDataOperations(item['dataOperations']),
      skills: readStringArray(item['skills'], `agent.${id}.skills`),
    };
  }

  const edges: SolutionTopologyEdgeProjection[] = [];
  const seen = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  for (const item of persistedAgents) {
    const from = readString(item['id'], 'agent.id');
    if (item['collaborations'] === undefined) continue;
    if (!Array.isArray(item['collaborations'])) {
      throw new Error(`INVALID_SOLUTION_TOPOLOGY:agent.${from}.collaborations`);
    }
    for (const rawCollaboration of item['collaborations'] as readonly PersistedCollaboration[]) {
      if (!isRecord(rawCollaboration)) throw new Error('INVALID_SOLUTION_TOPOLOGY:collaboration');
      const to = readString(rawCollaboration['targetAgentId'], 'collaboration.targetAgentId');
      if (agents[to] === undefined || from === to) continue;
      const edgeKey = `${from}->${to}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const reverseKey = `${to}->${from}`;
      let type = readEdgeType(rawCollaboration['type']);
      if (seen.has(reverseKey) || ((type === 'trigger' || type === 'depend') && createsPath(adjacency, to, from))) {
        type = 'notify';
      }
      if (type === 'trigger' || type === 'depend') {
        const outgoing = adjacency.get(from) ?? new Set<string>();
        outgoing.add(to);
        adjacency.set(from, outgoing);
      }
      edges.push({
        from,
        to,
        type,
        description: typeof rawCollaboration['description'] === 'string'
          ? rawCollaboration['description']
          : '',
      });
    }
  }

  const incoming = new Set(edges.map((edge) => edge.to));
  const outgoing = new Set(edges.map((edge) => edge.from));
  const agentIds = Object.keys(agents);
  return {
    agents,
    edges,
    entryPoints: agentIds.filter((id) => !incoming.has(id)),
    exitPoints: agentIds.filter((id) => !outgoing.has(id)),
    mode: edges.some((edge) => edge.type !== 'trigger') ? 'system' : 'workflow',
  };
}

async function findLatestVersionDirectory(
  dataRoot: string,
  projectId: string
): Promise<string | null> {
  for (const persistedProjectId of [projectId, `proj-${projectId}`]) {
    const solutionsDirectory = path.join(dataRoot, 'projects', persistedProjectId, 'solutions');
    try {
      const entries = await readdir(solutionsDirectory, { withFileTypes: true });
      const versions = entries
        .filter((entry) => entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      if (versions[0] !== undefined) return path.join(solutionsDirectory, versions[0]);
    } catch (error) {
      const code = isRecord(error) && typeof error['code'] === 'string' ? error['code'] : undefined;
      if (code !== 'ENOENT') throw error;
    }
  }
  return null;
}

/**
 * Read-only compatibility projection for the solution-design topology viewer.
 * This function deliberately lives in the solution feature: collaboration runtime
 * must not own or publicly expose design-manifest selection or compilation.
 */
export async function loadProjectSolutionTopologyProjection(
  input: LoadProjectSolutionTopologyProjectionInput
): Promise<ProjectSolutionTopologyProjection | null> {
  assertSafeProjectId(input.projectId);
  const versionDirectory = await findLatestVersionDirectory(
    input.dataRoot ?? getDataRoot(),
    input.projectId
  );
  if (versionDirectory === null) return null;
  const source = await readFile(path.join(versionDirectory, 'agents.json'), 'utf8');
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed)) throw new Error('INVALID_SOLUTION_TOPOLOGY:document');
  return parseProjection(parsed);
}
