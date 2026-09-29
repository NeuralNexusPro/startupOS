/**
 * Agent Feature Module
 *
 * Public API for agent-related functionality
 */

export * from '../../../types/agent';
export * from '../../../types/agent-object';
export * from './session-service';
export * from './defaults';
export * from './registry';
export * from './project-agent';

// Runtime managers (AG.9 B-batch1 facade completion): the agent/server deep
// path remains available as a transitional entry, but these hot symbols are
// part of the feature facade so callers do not need the server internals.
export type { AgentTaskRuntimeBindingOptions, AgentMemoryOwnership } from '../../integrations/pi-agent/agent-manager';
