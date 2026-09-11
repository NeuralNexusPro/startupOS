export interface UserAgent {
  id: string;
  name: string;
  description: string;
  agentType: 'assistant' | 'role-agent' | 'unknown';
  role?: string;
  domain?: string;
  version?: string;
  dirPath: string;
  hasSkillMd: boolean;
}

export interface UserSkill {
  id: string;
  name: string;
  code: string;
  description: string;
  type?: string;
  tags?: string[];
  dirPath: string;
}

