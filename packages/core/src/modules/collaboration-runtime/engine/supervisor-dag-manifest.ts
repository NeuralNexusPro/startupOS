/** Supervisor DAG manifest 加载与拓扑构建：agents.json 读取、协作边提取、CollaborationTopology 组装 */

import { readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getDataRoot } from '../../../lib/paths';
import { parseTopology } from './topology-parser';
import type { CollaborationTopology } from '../../../modules/collaboration-runtime/session/types';
import { AgentsJsonAgent, AgentsJson, ManifestAgent, SolutionManifest } from './supervisor-dag-types';

// ============================================================================
// Manifest 加载 + 拓扑构建
// ============================================================================

/** 查找项目 solutions 目录中最新的 manifest 路径 */
export async function findLatestManifestDir(projectId: string): Promise<string | null> {
  // 兼容两种 projectId 格式：有 proj- 前缀和没有前缀
  const candidates = [
    path.join(getDataRoot(), `projects/${projectId}/solutions`),
    path.join(getDataRoot(), `projects/proj-${projectId}/solutions`),
  ];

  for (const solutionsDir of candidates) {
    try {
      const entries = await (await import("fs/promises")).readdir(solutionsDir, { withFileTypes: true });
      const versionDirs = entries
        .filter((e) => e.isDirectory() && e.name.match(/^v\d+\.\d+$/))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      if (versionDirs.length > 0) {
        return path.join(solutionsDir, versionDirs[0]!.name);
      }
    } catch {
      // 目录不存在，尝试下一个
    }
  }
  return null;
}

/** 从 agents.json 加载 Agent 列表 */
export async function loadAgentsJson(manifestDir: string): Promise<AgentsJsonAgent[]> {
  const agentsPath = path.join(manifestDir, "agents.json");
  const content = await readFile(agentsPath, "utf-8");
  const data = JSON.parse(content) as AgentsJson;
  return data.agents;
}

/**
 * 将 agents.json 中的 per-agent collaborations 转换为扁平 edges 数组。
 *
 * 关键：将下游 → 上游的 back-edge（如 naming-reviewer → review-task-manager）
 * 标记为 notify 类型，避免 DAG 循环检测失败。
 * 只有上游 → 下游的 trigger 边参与 DAG 执行。
 */
export function extractEdges(agents: AgentsJsonAgent[]): Array<{ from: string; to: string; type: string; description: string }> {
  const agentIds = new Set(agents.map((a) => a.id));

  // 第一轮：收集所有正向边（上游 → 下游），按首次出现顺序确定方向
  // 当 A→B 和 B→A 同时存在时，先出现的保持 trigger，后出现的标记为 notify
  const seenEdges = new Map<string, { from: string; to: string; type: string; description: string }>();
  for (const agent of agents) {
    if (agent.collaborations) {
      for (const collab of agent.collaborations) {
        if (!agentIds.has(collab.targetAgentId)) {continue;}
        const forwardKey = `${agent.id}->${collab.targetAgentId}`;
        const reverseKey = `${collab.targetAgentId}->${agent.id}`;

        if (seenEdges.has(reverseKey)) {
          // 反向边已存在，当前边标记为 notify（back-edge）
          seenEdges.set(forwardKey, {
            from: agent.id,
            to: collab.targetAgentId,
            type: "notify",
            description: collab.description ?? "",
          });
        } else if (!seenEdges.has(forwardKey)) {
          // 正向边首次出现，保持原始类型
          seenEdges.set(forwardKey, {
            from: agent.id,
            to: collab.targetAgentId,
            type: collab.type,
            description: collab.description ?? "",
          });
        }
      }
    }
  }

  return Array.from(seenEdges.values());
}

/**
 * 为拓扑查看器规范化边：
 * - 保留原始协作关系，避免 UI 丢失 loop/back-edge
 * - 若 trigger/depend 会形成环，则仅将该边降级为 notify
 * - notify 本身不参与 DAG 依赖，因此不会触发 parseTopology 的循环检测
 */
export function normalizeEdgesForTopologyView(
  edgesInput: Array<{ from: string; to: string; type: string; description: string }>
): Array<{ from: string; to: string; type: string; description: string }> {
  const result: Array<{ from: string; to: string; type: string; description: string }> = [];
  const adjacency = new Map<string, Set<string>>();

  const ensureNode = (node: string): Set<string> => {
    let neighbors = adjacency.get(node);
    if (neighbors === undefined) {
      neighbors = new Set<string>();
      adjacency.set(node, neighbors);
    }
    return neighbors;
  };

  const hasPath = (from: string, to: string): boolean => {
    if (from === to) {
      return true;
    }

    const visited = new Set<string>();
    const stack = [from];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || visited.has(current)) {
        continue;
      }
      visited.add(current);

      for (const next of adjacency.get(current) ?? []) {
        if (next === to) {
          return true;
        }
        if (!visited.has(next)) {
          stack.push(next);
        }
      }
    }

    return false;
  };

  for (const edge of edgesInput) {
    const shouldParticipateInDag = edge.type === "trigger" || edge.type === "depend";
    if (!shouldParticipateInDag) {
      result.push(edge);
      continue;
    }

    if (hasPath(edge.to, edge.from)) {
      console.warn(
        `[Topology] preserving loop edge ${edge.from} -> ${edge.to} as notify for viewer`
      );
      result.push({
        ...edge,
        type: "notify",
      });
      continue;
    }

    ensureNode(edge.from).add(edge.to);
    result.push(edge);
  }

  return result;
}

export function toManifestAgent(a: AgentsJsonAgent): ManifestAgent {
  return {
    id: a.id,
    name: a.name,
    domain: a.businessDomain,
    responsibility: a.responsibility,
    dataOperations: a.dataOperations ?? {},
    skills: a.skills ?? [],
  };
}

/** 构建标准 CollaborationTopology（适配 field name: businessDomain → domain） */
export function buildTopology(agents: AgentsJsonAgent[], edges: Array<{ from: string; to: string; type: string; description: string }>): CollaborationTopology {
  const manifest: SolutionManifest = {
    agents: agents.map(toManifestAgent),
    collaboration: { edges },
  };
  return parseTopology(manifest as Parameters<typeof parseTopology>[0]);
}

/** 写入统一 manifest 供向后兼容（optional, 不影响执行） */
export async function writeUnifiedManifest(projectId: string, agents: AgentsJsonAgent[], edges: Array<{ from: string; to: string; type: string; description: string }>): Promise<void> {
  const solutionsDir = path.join(getDataRoot(), `projects/${projectId}/solutions`);
  await mkdir(solutionsDir, { recursive: true });
  const manifestPath = path.join(solutionsDir, "solution-v1.0-manifest.json");
  const manifest = {
    version: "1.0.0",
    agents: agents.map(toManifestAgent),
    collaboration: { edges },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}
