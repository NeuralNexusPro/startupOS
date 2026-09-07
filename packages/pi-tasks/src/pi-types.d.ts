import type { Schema } from "./schema.ts";
import type { BranchEntry } from "./store.ts";
export interface ToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    details?: unknown;
    isError?: boolean;
}
export interface ToolDefinition<TParams extends Record<string, unknown>> {
    name: string;
    label: string;
    description: string;
    promptSnippet: string;
    promptGuidelines: string[];
    parameters: Schema;
    execute(toolCallId: string, params: TParams, signal: AbortSignal | undefined, onUpdate: unknown, ctx: ExtensionContext): Promise<ToolResult>;
}
export interface RegisteredCommand {
    description: string;
    handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}
export interface ExtensionAPI {
    events: {
        emit<T = unknown>(event: string, data: T): void;
    };
    on(event: "session_start" | "session_tree", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
    on(event: "session_before_compact", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
    registerTool<TParams extends Record<string, unknown>>(tool: ToolDefinition<TParams>): void;
    registerCommand(name: string, options: RegisteredCommand): void;
    appendEntry<T = unknown>(customType: string, data?: T): void;
}
export interface ExtensionContext {
    mode: "tui" | "rpc" | "print" | string;
    sessionManager: {
        getBranch(): BranchEntry[];
        getSessionId(): string;
    };
    ui: {
        notify(message: string, type?: "info" | "warning" | "error"): void;
        setStatus(key: string, text: string | undefined): void;
        setWidget(key: string, content: string[] | undefined, options?: {
            placement?: "aboveEditor" | "belowEditor";
        }): void;
    };
}
