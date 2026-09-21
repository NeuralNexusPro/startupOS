/**
 * Global mocks setup for pi-mono dependencies
 * These mocks are loaded before the tested code is imported
 */

// Mock @originos/pi-agent-adapter module
vi.mock("@originos/pi-agent-adapter", () => ({
	Agent: class MockAgent {
		options?: unknown;
		state: {
			systemPrompt: "",
			model: { provider: "anthropic", id: "test" },
			thinkingLevel: "low",
			tools: [],
			messages: [],
		};

		_listeners = new Set<(event: any) => void>();

		constructor(config?: unknown) {
			this.options = config;
			if (config?.initialState) {
				this.state = { ...this.state, ...config.initialState };
			}
			// Store convertToLlm function if needed
			if (config?.convertToLlm) {
				this.convertToLlm = config.convertToLlm;
			}
			if (config?.transformContext) {
				this.transformContext = config.transformContext;
			}
			if (config?.streamFn) {
				this.streamFn = config.streamFn;
			}
		}

		state: {
			systemPrompt: string;
			model: { provider: string; id: string };
			thinkingLevel: string;
			tools: any[];
			messages: any[];
		};

		_listeners: Set<(event: any) => void>;

		convertToLlm?: (messages: any[]) => any[];
		transformContext?: (messages: any[]) => Promise<any[]>;
		streamFn?: (model: any, context: any, options?: any) => any;

		prompt = vi.fn(async (message?: string) => {
			if (!this.streamFn) return;
			const stream = this.streamFn(
				this.state.model,
				{
					systemPrompt: this.state.systemPrompt,
					messages: typeof this.convertToLlm === "function"
						? this.convertToLlm(this.state.messages)
						: this.state.messages,
					message,
				},
				{},
			);
			if (stream && typeof stream[Symbol.asyncIterator] === "function") {
				for await (const _event of stream) {
					// Drain the stream to exercise streamFn logic in tests.
				}
			}
		});
		continue = vi.fn();
		abort = vi.fn();
		waitForIdle = vi.fn();

		subscribe(listener: (event: any) => void): () => void {
			this._listeners.add(listener);
			return () => this._listeners.delete(listener);
		}

		emit(event: any): void {
			for (const listener of this._listeners) {
				listener(event);
			}
		}

		setSystemPrompt = vi.fn((prompt: string) => {
			this.state.systemPrompt = prompt;
		});

		setModel = vi.fn((model: any) => {
			this.state.model = model;
		});

		setTools = vi.fn((tools: any[]) => {
			this.state.tools = tools;
		});

		clearMessages = vi.fn(() => {
			this.state.messages = [];
		});

		replaceMessages = vi.fn((messages: any[]) => {
			this.state.messages = messages;
		});

		appendMessage = vi.fn((message: any) => {
			this.state.messages.push(message);
		});

		get State() {
			return this.state;
		}
	},
}));

// Mock @originos/pi-agent-adapter/ai module
vi.mock("@originos/pi-agent-adapter/ai", () => {
	const streamCalls: Array<{ model: any; context: any; options: any }> = [];

	return {
		__streamCalls: streamCalls,

		getModel: vi.fn((provider: string, id: string) => ({
			provider,
			id,
		})),

		createMessage: vi.fn((role: string, content: string) => ({
			role,
			content: [{ type: "text", text: content }],
		})),

		compressMessage: vi.fn((messages: any[]) => messages),

		streamSimple: vi.fn((model: any, context: any, options: any) => {
			streamCalls.push({ model, context, options });
			return {
				async *[Symbol.asyncIterator]() {
					yield {
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "mock response" }],
						},
					};
				},
				result: async () => ({
					role: "assistant",
					content: [{ type: "text", text: "mock response" }],
					provider: model?.provider ?? "anthropic",
				}),
			};
		}),

		completeSimple: vi.fn(async (_model: any, context: any) => {
			const prompt = context?.messages?.[0]?.content ?? "";
			const responseMatch = String(prompt).match(
				/## Assistant final response\n([\s\S]*?)\n\n## Tool execution trace/u,
			);
			const response = responseMatch?.[1] ?? "";
			const incomplete = /(?:我会|接下来|马上|随后|让我|will|next)/iu.test(response);
			return {
				role: "assistant",
				content: [{
					type: "text",
					text: JSON.stringify({
						status: incomplete ? "incomplete" : "complete",
						reason: incomplete ? "work is only promised" : "result was delivered",
					}),
				}],
				stopReason: "stop",
			};
		}),

		// Add mock for the Agent type
		Agent: class MockPiAiAgent {
			constructor(config?: unknown) {
				this.state = {
					temperature: 0.7,
				};
			}
		},
	};
});

// Re-export MockAgent for test use
export { MockAgentMock as MockAgent } from "@originos/pi-agent-adapter";
