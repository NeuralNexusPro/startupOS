// task-runtime coordinator 的 host 桥接与配置类型定义。

import type { OriginOSAgent } from "../core/agent";
import type { PiTaskSnapshotLike } from "./projection";
import type {
	AgentTaskRuntimePersistenceV1,
	AgentTaskRuntimeSnapshotV1,
} from "./types";

export type TaskBranchEntry = Record<string, unknown> & { id: string };
export type RuntimeAgentTool = ReturnType<OriginOSAgent["getTools"]>[number];

export interface TaskHostScope {
	sessionId: string;
	cursor: string | null;
	revision: number;
	bridgeEpoch: number;
}

export interface TaskHostTool {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	execute(
		toolCallId: string,
		input: Record<string, unknown>,
		signal?: AbortSignal,
		onUpdate?: (update: unknown) => void,
	): Promise<unknown>;
}

export interface TaskHostState {
	scope: TaskHostScope;
	snapshot: PiTaskSnapshotLike;
}

export interface TaskSessionHost {
	restore(entries: readonly TaskBranchEntry[]): Promise<TaskHostState>;
	getSnapshot(): PiTaskSnapshotLike;
	getScope(): TaskHostScope;
	getAgentTools(): readonly TaskHostTool[];
	invoke(command: {
		version: 1;
		requestId: string;
		toolName: string;
		scope: {
			sessionId: string;
			expectedCursor: string | null;
			expectedRevision: number;
			bridgeEpoch: number;
		};
		input: Record<string, unknown>;
	}): Promise<unknown>;
	subscribeState(listener: (state: TaskHostState) => void): () => void;
	invalidate(): void;
}

export interface TaskSessionHostFactoryOptions {
	sessionId: string;
	bridgeEpoch: number;
	entries: readonly TaskBranchEntry[];
	persistEntries(
		entries: readonly TaskBranchEntry[],
		context: unknown,
	): void | Promise<void>;
}

export type TaskSessionHostFactory = (
	options: TaskSessionHostFactoryOptions,
) => Promise<TaskSessionHost>;

export interface AgentTaskRuntimeCoordinatorOptions {
	sessionId: string;
	/** Project ownership is required by project metadata mutation requests. */
	projectId?: string;
	agent: OriginOSAgent;
	initialState?: AgentTaskRuntimePersistenceV1;
	persist(state: AgentTaskRuntimePersistenceV1): void | Promise<void>;
	onState?(snapshot: AgentTaskRuntimeSnapshotV1): void;
	onAssistantMessage?(content: string): void;
	hasPendingUserMessage?(): boolean;
	hasBudgetRemaining?(): boolean;
	hostFactory?: TaskSessionHostFactory;
	maxContinuations?: number;
	maxNoProgressTurns?: number;
}
