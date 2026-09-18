import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { buildAgentSessionContext, buildProjectLauncherSessionContext } from './prompt-boundary';
import { loadRoleContext } from './role-agent/role-context';
import { parseStateMachine } from './role-agent/state-machine';
import { buildRolePromptBoundary } from './role-agent/system-prompt';

interface FrozenSessionContextInput {
  agentType?: string;
  workingDirectory?: string;
}

export async function loadFrozenSessionContext(
  input: FrozenSessionContextInput,
): Promise<string> {
  const workingDirectory = input.workingDirectory;
  if (!workingDirectory || !existsSync(workingDirectory)) return '';

  if (input.agentType === 'role-agent') {
    const context = await loadRoleContext(workingDirectory);
    if (context) {
      const stateMachine = parseStateMachine(context.roleMd);
      context.currentPhase = stateMachine.currentPhase;
      return buildRolePromptBoundary(context, stateMachine).sessionContext;
    }
    return buildAgentSessionContext({
      role: readFile(workingDirectory, 'Role.md'),
      memory: readFile(workingDirectory, 'Memory.md'),
      knowledge: readFile(workingDirectory, 'Knowledge.md'),
      patterns: readFile(workingDirectory, 'Patterns.md'),
      baseDir: workingDirectory,
    });
  }

  if (input.agentType === 'project') {
    return buildProjectLauncherSessionContext({
      memory: readFile(workingDirectory, 'Memory.md'),
      baseDir: workingDirectory,
      businessModel: readFile(path.join(workingDirectory, 'ontology'), 'business-model.json'),
    });
  }

  return buildAgentSessionContext({
    memory: readFile(workingDirectory, 'Memory.md'),
    knowledge: readFile(workingDirectory, 'Knowledge.md'),
    patterns: readFile(workingDirectory, 'Patterns.md'),
    baseDir: workingDirectory,
  });
}

function readFile(directory: string, name: string): string | undefined {
  const file = path.join(directory, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}
