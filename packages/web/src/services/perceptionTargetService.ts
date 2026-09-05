import type { PerceptionTargetKind } from '@originos/core/types';

export interface PerceptionTargetAsset {
  id: string;
  name: string;
  description?: string;
  detail?: string;
}

interface ApiPayload<T> { success: boolean; data?: T }

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json() as ApiPayload<T>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error('TARGET_ASSETS_UNAVAILABLE');
  }
  return payload.data;
}

export async function listPerceptionTargetAssets(kind: PerceptionTargetKind): Promise<PerceptionTargetAsset[]> {
  if (kind === 'project') {
    const projects = await getData<Array<{ id: string; name: string; description?: string; domain?: string }>>('/api/projects?limit=100');
    return projects.map((project) => ({ id: project.id, name: project.name, description: project.description, detail: project.domain }));
  }
  if (kind === 'role-agent') {
    const data = await getData<{ agents: Array<{ id: string; name: string; description?: string; agentType?: string; role?: string }> }>('/api/user-agents');
    return data.agents.map((agent) => ({ id: agent.id, name: agent.name, description: agent.description, detail: agent.role || (agent.agentType === 'role-agent' ? '角色 Agent' : 'Agent') }));
  }
  const data = await getData<{ skills: Array<{ name: string; code?: string; description?: string; source: string }> }>('/api/skills?includeDiagnostics=false');
  return data.skills.map((skill) => ({ id: skill.code || skill.name, name: skill.name, description: skill.description, detail: skill.source }));
}
