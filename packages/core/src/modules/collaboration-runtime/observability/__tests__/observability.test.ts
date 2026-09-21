import { describe, it, expect, beforeEach, vi } from "vitest";
import { CostController } from "../cost-controller";
import { StructuredLogger } from "../logging";
import { MetricsRegistry } from "../metrics";
import { Tracer } from "../tracing";

// ============================================================================
// CostController Tests
// ============================================================================

describe("CostController — Quota Management", () => {
  let cost: CostController;

  beforeEach(() => {
    cost = new CostController();
  });

  it("allows requests when no quota set", () => {
    const check = cost.checkTokenQuota("agent-a");
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(Infinity);
  });

  it("allows requests within quota", () => {
    cost.setQuota({ agentId: "agent-a", maxTokens: 1000 });

    cost.recordUsage("agent-a", { inputTokens: 500 });

    const check = cost.checkTokenQuota("agent-a");
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(500);
  });

  it("denies requests when quota exceeded", () => {
    cost.setQuota({ agentId: "agent-a", maxTokens: 1000 });

    cost.recordUsage("agent-a", { inputTokens: 1200 });

    const check = cost.checkTokenQuota("agent-a");
    expect(check.allowed).toBe(false);
    expect(check.remaining).toBe(0);
    expect(check.reason).toContain("exceeded");
  });

  it("checks tool call quota", () => {
    cost.setQuota({ agentId: "agent-a", maxTokens: 1000, maxToolCalls: 5 });

    cost.recordToolCall("agent-a");
    cost.recordToolCall("agent-a");

    const check = cost.checkToolCallQuota("agent-a");
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(3);
  });

  it("denies when tool call quota exceeded", () => {
    cost.setQuota({ agentId: "agent-a", maxTokens: 1000, maxToolCalls: 2 });

    cost.recordToolCall("agent-a");
    cost.recordToolCall("agent-a");
    cost.recordToolCall("agent-a");

    const check = cost.checkToolCallQuota("agent-a");
    expect(check.allowed).toBe(false);
  });
});

describe("CostController — Usage Tracking", () => {
  let cost: CostController;

  beforeEach(() => {
    cost = new CostController();
  });

  it("records input and output tokens separately", () => {
    cost.recordUsage("agent-a", { inputTokens: 100, outputTokens: 200 });
    const usage = cost.getUsage("agent-a");

    expect(usage!.tokensUsed).toBe(300);
    expect(usage).toMatchObject({ inputTokens: 100, outputTokens: 200 });
  });

  it("records cache classes and prefers provider cost", () => {
    cost.recordUsage("agent-a", {
      input: 100,
      output: 20,
      cacheRead: 70,
      cacheWrite: 10,
      totalTokens: 200,
      cost: { total: 0.42 },
    });

    const report = cost.getCostReport("session-1");
    expect(report.agentBreakdown["agent-a"]).toMatchObject({
      tokensUsed: 120,
      totalTokens: 200,
      cacheReadTokens: 70,
      cacheWriteTokens: 10,
      providerCostUsd: 0.42,
      estimatedCostUsd: 0,
      costUsd: 0.42,
    });
    expect(report).toMatchObject({ providerCostUsd: 0.42, estimatedCostUsd: 0, costUsd: 0.42 });
  });

  it("estimates missing cost from the real input/output split", () => {
    cost.recordUsage("agent-a", { input: 1000, output: 0, cacheRead: 500, cacheWrite: 0 });
    cost.recordUsage("agent-b", { input: 0, output: 1000, cacheRead: 0, cacheWrite: 0 });

    expect(cost.getUsage("agent-a")!.estimatedCostUsd).toBeCloseTo(0.0025);
    expect(cost.getUsage("agent-b")!.estimatedCostUsd).toBeCloseTo(0.01);
  });

  it("records turns, messages, tool calls", () => {
    cost.recordTurn("agent-a");
    cost.recordTurn("agent-a");
    cost.recordMessage("agent-a");
    cost.recordToolCall("agent-a");

    const usage = cost.getUsage("agent-a");
    expect(usage!.turnCount).toBe(2);
    expect(usage!.messagesSent).toBe(1);
    expect(usage!.toolCalls).toBe(1);
  });

  it("generates cost report with per-agent breakdown", () => {
    cost.setQuota({ agentId: "agent-a", maxTokens: 5000 });
    cost.setQuota({ agentId: "agent-b", maxTokens: 3000 });

    cost.recordUsage("agent-a", { inputTokens: 1000, outputTokens: 500 });
    cost.recordUsage("agent-b", { inputTokens: 200, outputTokens: 100 });
    cost.recordTurn("agent-a");
    cost.recordTurn("agent-a");
    cost.recordTurn("agent-b");
    cost.recordMessage("agent-a");

    const report = cost.getCostReport("session-1");

    expect(report.totalTokens).toBe(1800);
    expect(report.totalAgentTurns).toBe(3);
    expect(report.totalMessages).toBe(1);
    expect(report.agentBreakdown["agent-a"].tokensUsed).toBe(1500);
    expect(report.agentBreakdown["agent-a"].quotaRemaining).toBe(3500);
    expect(report.agentBreakdown["agent-b"].tokensUsed).toBe(300);
    expect(report.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("reports quota exceeded in breakdown", () => {
    cost.setQuota({ agentId: "agent-a", maxTokens: 100 });
    cost.recordUsage("agent-a", { inputTokens: 150 });

    const report = cost.getCostReport("session-1");
    expect(report.agentBreakdown["agent-a"].quotaExceeded).toBe(true);
  });

  it("resets usage for single agent", () => {
    cost.recordUsage("agent-a", { inputTokens: 500 });
    cost.recordUsage("agent-b", { inputTokens: 300 });

    cost.resetUsage("agent-a");
    expect(cost.getUsage("agent-a")!.tokensUsed).toBe(0);
    expect(cost.getUsage("agent-b")!.tokensUsed).toBe(300);
  });

  it("resets all usage", () => {
    cost.recordUsage("agent-a", { inputTokens: 500 });
    cost.recordUsage("agent-b", { inputTokens: 300 });

    cost.resetAllUsage();
    expect(cost.getUsage("agent-a")!.tokensUsed).toBe(0);
    expect(cost.getUsage("agent-b")!.tokensUsed).toBe(0);
  });
});

// ============================================================================
// StructuredLogger Tests
// ============================================================================

describe("StructuredLogger", () => {
  it("emits log entries to handlers", () => {
    const captured: any[] = [];
    const logger = new StructuredLogger("session-1");
    logger.on((entry) => captured.push(entry));

    logger.info("test message", { data: 42 });

    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("info");
    expect(captured[0].message).toBe("test message");
    expect(captured[0].sessionId).toBe("session-1");
    expect(captured[0].timestamp).toBeDefined();
  });

  it("emits at different log levels", () => {
    const captured: any[] = [];
    const logger = new StructuredLogger("session-1");
    logger.on((entry) => captured.push(entry));

    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");

    expect(captured).toHaveLength(4);
    expect(captured.map((c) => c.level)).toEqual(["debug", "info", "warn", "error"]);
  });

  it("includes agentId when set", () => {
    const captured: any[] = [];
    const logger = new StructuredLogger("session-1");
    logger.setAgentId("agent-a");
    logger.on((entry) => captured.push(entry));

    logger.info("test");
    expect(captured[0].agentId).toBe("agent-a");
  });

  it("handler failures don't crash", () => {
    const logger = new StructuredLogger("session-1");
    logger.on(() => { throw new Error("boom"); });

    expect(() => logger.info("test")).not.toThrow();
  });

  it("serializes to JSON line", () => {
    const logger = new StructuredLogger("session-1");
    const entry = {
      timestamp: "2024-01-01T00:00:00.000Z",
      level: "info" as const,
      sessionId: "s1",
      message: "test",
    };

    const line = logger.toLine(entry);
    const parsed = JSON.parse(line);
    expect(parsed.message).toBe("test");
  });
});

// ============================================================================
// MetricsRegistry Tests
// ============================================================================

describe("MetricsRegistry", () => {
  let metrics: MetricsRegistry;

  beforeEach(() => {
    metrics = new MetricsRegistry();
  });

  it("records agent turns", () => {
    metrics.recordAgentTurn("agent-a", "session-1");
    metrics.recordAgentTurn("agent-a", "session-1");

    const samples = metrics.collect();
    const turns = samples.filter((s) => s.name === "agent_turns_total");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.value).toBe(2);
  });

  it("records tool calls by name", () => {
    metrics.recordToolCall("agent-a", "file-read");
    metrics.recordToolCall("agent-a", "file-read");
    metrics.recordToolCall("agent-a", "bash");

    const samples = metrics.collect();
    const calls = samples.filter((s) => s.name === "agent_tool_calls_total");
    expect(calls.length).toBe(2); // file-read and bash
  });

  it("records token usage", () => {
    metrics.recordTokens("agent-a", "session-1", 500);
    metrics.recordTokens("agent-a", "session-1", 300);

    const samples = metrics.collect();
    const tokens = samples.filter((s) => s.name === "agent_tokens_used_total");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.value).toBe(800);
  });

  it("records provider token classes", () => {
    metrics.recordTokenUsage("agent-a", "session-1", {
      input: 500,
      output: 100,
      cacheRead: 300,
      cacheWrite: 50,
      totalTokens: 950,
    });

    const byName = Object.fromEntries(metrics.collect().map((sample) => [sample.name, sample.value]));
    expect(byName).toMatchObject({
      agent_tokens_used_total: 950,
      agent_input_tokens_total: 500,
      agent_output_tokens_total: 100,
      agent_cache_read_tokens_total: 300,
      agent_cache_write_tokens_total: 50,
    });
  });

  it("records messages", () => {
    metrics.recordMessage("agent-a", "agent-b", "inform");

    const samples = metrics.collect();
    const msgs = samples.filter((s) => s.name === "collaboration_messages_total");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.value).toBe(1);
  });

  it("records conflicts", () => {
    metrics.recordConflict("data_conflict", "lock_based");

    const samples = metrics.collect();
    const conflicts = samples.filter((s) => s.name === "collaboration_conflicts_total");
    expect(conflicts).toHaveLength(1);
  });

  it("records task outcomes", () => {
    metrics.recordTaskOutcome("agent-a", "task-1", true);
    metrics.recordTaskOutcome("agent-a", "task-2", false);

    const samples = metrics.collect();
    const outcomes = samples.filter((s) => s.name === "collaboration_task_success_total");
    expect(outcomes).toHaveLength(2);
  });

  it("sets duration", () => {
    metrics.setDuration("session-1", 45);

    const samples = metrics.collect();
    const durations = samples.filter((s) => s.name === "collaboration_duration_seconds");
    expect(durations).toHaveLength(1);
    expect(durations[0]!.value).toBe(45);
  });

  it("exports in Prometheus text format", () => {
    metrics.recordAgentTurn("agent-a", "session-1");
    metrics.recordTokens("agent-a", "session-1", 1000);

    const text = metrics.toPrometheusText();
    expect(text).toContain("agent_turns_total");
    expect(text).toContain("# TYPE");
  });

  it("resets all metrics", () => {
    metrics.recordAgentTurn("agent-a", "session-1");
    metrics.reset();

    const samples = metrics.collect();
    expect(samples).toHaveLength(0);
  });
});

// ============================================================================
// Tracer Tests
// ============================================================================

describe("Tracer", () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer();
  });

  it("creates and ends a span", () => {
    const spanId = tracer.startSpan("task.execute", {
      sessionId: "session-1",
      agentId: "agent-a",
      attributes: { taskId: "task-1" },
    });

    const active = tracer.getActiveSpans();
    expect(active).toHaveLength(1);
    expect(active[0]!.status).toBe("pending");

    tracer.endSpan(spanId, "ok");

    const ended = tracer.getActiveSpans();
    expect(ended).toHaveLength(0);

    const all = tracer.getAllSpans();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("ok");
    expect(all[0]!.endTime).toBeDefined();
  });

  it("withSpan automatically ends span", async () => {
    const result = await tracer.withSpan(
      "task.process",
      { sessionId: "session-1", agentId: "agent-a" },
      async () => {
        return 42;
      }
    );

    expect(result).toBe(42);
    expect(tracer.getActiveSpans()).toHaveLength(0);
  });

  it("withSpan marks error status on throw", async () => {
    await expect(
      tracer.withSpan(
        "task.fail",
        { sessionId: "session-1" },
        async () => {
          throw new Error("boom");
        }
      )
    ).rejects.toThrow("boom");

    const spans = tracer.getAllSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe("error");
  });

  it("supports parent-child spans", () => {
    const parentId = tracer.startSpan("task.parent", { sessionId: "session-1" });

    const childId = tracer.startSpan("task.child", {
      sessionId: "session-1",
      parentId,
    });

    const childSpan = tracer.getAllSpans().find((s) => s.id === childId);
    expect(childSpan!.parentId).toBe(parentId);
  });

  it("gets trace by id", () => {
    const traceId = "trace-123";

    tracer.startSpan("op1", { sessionId: "session-1", traceId });
    tracer.startSpan("op2", { sessionId: "session-1", traceId });

    const trace = tracer.getTrace(traceId);
    expect(trace).toBeDefined();
    expect(trace!.spans).toHaveLength(2);
  });

  it("gets traces by session", () => {
    tracer.startSpan("op1", { sessionId: "session-a", traceId: "t1" });
    tracer.startSpan("op2", { sessionId: "session-b", traceId: "t2" });

    const traces = tracer.getTracesBySession("session-a");
    expect(traces).toHaveLength(1);
    expect(traces[0]!.traceId).toBe("t1");
  });

  it("finds slow operations", () => {
    vi.useFakeTimers();

    const spanId = tracer.startSpan("slow.op", { sessionId: "session-1" });
    vi.advanceTimersByTime(500);
    tracer.endSpan(spanId);

    const slow = tracer.getSlowOperations(100); // > 100ms threshold
    expect(slow).toHaveLength(1);
    expect(slow[0]!.operation).toBe("slow.op");

    vi.useRealTimers();
  });

  it("cleans up old traces", () => {
    vi.useFakeTimers();

    const spanId = tracer.startSpan("old.op", { sessionId: "session-1" });
    tracer.endSpan(spanId);

    // Advance 6 minutes
    vi.advanceTimersByTime(360_000);

    const cleaned = tracer.cleanup();
    expect(cleaned).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});
