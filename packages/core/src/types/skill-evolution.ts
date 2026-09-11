export interface EvolutionRun {
  timestamp: string;
  sessionId: string;
  success: boolean;
  turnCount: number;
  duration: number; // ms
  error?: string;
}

export interface EvolutionState {
  runs: EvolutionRun[];
  lastEvolution?: string; // ISO timestamp
  version: number;
}

export interface EvolutionResult {
  evolved: boolean;
  changes?: string[];
  error?: string;
}

export interface SkillEvolutionRequest {
  skillDir?: string;
  skillName?: string;
  run?: EvolutionRun;
}

