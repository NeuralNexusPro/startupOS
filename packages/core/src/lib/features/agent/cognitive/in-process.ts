import { MemoryCore, MemoryProvider, ArchivalMemoryTools } from '../../../../modules/memory-core';
import { CognitiveManager } from '../../../integrations/pi-agent/cognitive/manager';
import { PracticeLogger } from '../../../integrations/pi-agent/cognitive/practice-logger';
import { createAutoModel } from '../../../integrations/pi-agent/server-config';
import type { OriginOSAgent } from '../../../integrations/pi-agent/core/agent';
import type { InProcessAgentOptions } from '../../../integrations/pi-agent/agent-manager';
import { PatternProvider } from './pattern';
import { createOwnedCognitiveProviders } from './provider-factory';

export async function integrateAgentMemory(agent: OriginOSAgent, sessionId: string, options: InProcessAgentOptions & { agentBaseDir: string }) {



        const owned = options.memoryOwnership && options.observationContext
          ? createOwnedCognitiveProviders({
              ...options.memoryOwnership,
              workingDirectory: options.agentBaseDir,
              sessionId,
            }, options.observationContext)
          : null;
        const memoryCore = owned?.memoryCore ?? new MemoryCore(options.agentBaseDir, sessionId);
        const memoryProvider = owned?.memoryProvider ?? new MemoryProvider(
          memoryCore,
          sessionId,
          undefined,
          undefined,
          { createAutoModel },
        );
        const cognitiveManager = new CognitiveManager(options.agentBaseDir);
        cognitiveManager.register(new PracticeLogger(options.agentBaseDir));
        cognitiveManager.register(memoryProvider);
        if (owned) {
          cognitiveManager.register(owned.knowledgeProvider);
        }
        const patternProvider = owned?.patternProvider ?? new PatternProvider(options.agentBaseDir, memoryCore.archival);
        patternProvider.initialize()
          .then(() => console.log(`[AgentManager] PatternProvider initialized in background for ${sessionId}`))
          .catch((e: unknown) => console.warn('[AgentManager] PatternProvider init error:', e));
        cognitiveManager.register(patternProvider);

        const coreMemoryTools = memoryCore.coreTools;
        const archivalMemoryTools = new ArchivalMemoryTools(memoryCore.archival);

        const registerMemoryTool = (name: string, description: string, label: string, params: unknown, execute: (toolCallId: string, args: any) => Promise<{ content: { type: string; text: string }[]; details: {} }>) => {
          agent.registerTool({ name, description, label, parameters: params, execute } as any);
        };

        registerMemoryTool('core_memory_append', 'Append content to a core memory block. Available blocks: human, persona, project, scratchpad, temporal.',
          'core_memory_append',
          { type: 'object', properties: { label: { type: 'string' }, content: { type: 'string' } }, required: ['label', 'content'] },
          async (_toolCallId, args) => {
            if (!args?.label) return { content: [{ type: 'text', text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
            if (!args?.content) return { content: [{ type: 'text', text: "Error: 'content' parameter is required." }], details: {} };
            const result = await coreMemoryTools.core_memory_append(args.label, args.content);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('core_memory_replace', 'Replace content in a core memory block. Available blocks: human, persona, project, scratchpad, temporal.',
          'core_memory_replace',
          { type: 'object', properties: { label: { type: 'string' }, old_content: { type: 'string' }, new_content: { type: 'string' } }, required: ['label', 'old_content', 'new_content'] },
          async (_toolCallId, args) => {
            if (!args?.label) return { content: [{ type: 'text', text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
            if (!args?.old_content) return { content: [{ type: 'text', text: "Error: 'old_content' parameter is required." }], details: {} };
            if (!args?.new_content) return { content: [{ type: 'text', text: "Error: 'new_content' parameter is required." }], details: {} };
            const result = await coreMemoryTools.core_memory_replace(args.label, args.old_content, args.new_content);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('insert_memory_block', 'Create a new custom core memory block.',
          'insert_memory_block',
          { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'value'] },
          async (_toolCallId, args) => {
            const result = await coreMemoryTools.insert_memory_block(args.label, args.value, args.description);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('read_memory_block', 'Read a core memory block.',
          'read_memory_block',
          { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
          async (_toolCallId, args) => {
            const result = await coreMemoryTools.read_memory_block(args.label);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('archival_memory_insert', 'Insert text into archival memory.',
          'archival_memory_insert',
          { type: 'object', properties: { text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['text'] },
          async (_toolCallId, args) => {
            const result = await archivalMemoryTools.archival_memory_insert(args.text, args.tags);
            return { content: [{ type: 'text', text: result }], details: {} };
          });
        registerMemoryTool('archival_memory_search', 'Semantically search archival memory.',
          'archival_memory_search',
          { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
          async (_toolCallId, args) => {
            const result = await archivalMemoryTools.archival_memory_search(args.query, args.limit);
            return { content: [{ type: 'text', text: result }], details: {} };
          });


return { cognitiveManager, memoryProvider };
}
