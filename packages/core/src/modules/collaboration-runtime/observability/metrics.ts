/**
 * Metrics — 协作运行时指标收集，兼容 Prometheus 格式。
 *
 * Story 9.18: 生产加固 — 完整可观测性
 *
 * 指标列表：
 * | agent.turns_total | agentId, sessionId | Agent 执行轮次 |
 * | agent.tool_calls_total | agentId, toolName | 工具调用次数 |
 * | agent.tokens_used | agentId, sessionId | Token 消耗 |
 * | collaboration.messages_total | from, to, type | 消息数量 |
 * | collaboration.conflicts_total | type, resolution | 冲突统计 |
 * | collaboration.task_success_total | agentId, taskId | 任务成功率 |
 * | collaboration.duration_seconds | sessionId | 会话耗时 |
 */

// ============================================================================
// Types
// ============================================================================

export interface MetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export type MetricType = "counter" | "gauge" | "histogram";

// ============================================================================
// Simple counter metric
// ============================================================================

class Counter {
  private samples = new Map<string, number>();

  increment(labels: Record<string, string> = {}, by = 1): void {
    const key = this.key(labels);
    this.samples.set(key, (this.samples.get(key) ?? 0) + by);
  }

  get(labels: Record<string, string> = {}): number {
    return this.samples.get(this.key(labels)) ?? 0;
  }

  getAll(): Map<string, number> {
    return new Map(this.samples);
  }

  reset(): void {
    this.samples.clear();
  }

  private key(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }
}

// ============================================================================
// Gauge metric
// ============================================================================

class Gauge {
  private samples = new Map<string, number>();

  set(labels: Record<string, string>, value: number): void {
    this.samples.set(this.key(labels), value);
  }

  get(labels: Record<string, string> = {}): number {
    return this.samples.get(this.key(labels)) ?? 0;
  }

  getAll(): Map<string, number> {
    return new Map(this.samples);
  }

  reset(): void {
    this.samples.clear();
  }

  private key(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }
}

// ============================================================================
// MetricsRegistry
// ============================================================================

export class MetricsRegistry {
  // Counters
  private agentTurns = new Counter();
  private agentToolCalls = new Counter();
  private agentTokensUsed = new Counter();
  private agentInputTokens = new Counter();
  private agentOutputTokens = new Counter();
  private agentCacheReadTokens = new Counter();
  private agentCacheWriteTokens = new Counter();
  private collaborationMessages = new Counter();
  private collaborationConflicts = new Counter();
  private collaborationTaskSuccess = new Counter();

  // Gauges
  private collaborationDuration = new Gauge();

  /**
   * Record agent turn.
   */
  recordAgentTurn(agentId: string, sessionId: string): void {
    this.agentTurns.increment({ agentId, sessionId });
  }

  /**
   * Record tool call.
   */
  recordToolCall(agentId: string, toolName: string): void {
    this.agentToolCalls.increment({ agentId, toolName });
  }

  /**
   * Record token usage.
   */
  recordTokens(agentId: string, sessionId: string, count: number): void {
    this.agentTokensUsed.increment({ agentId, sessionId }, count);
  }

  /** Record provider token classes from one completed assistant message. */
  recordTokenUsage(
    agentId: string,
    sessionId: string,
    usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number },
  ): void {
    const labels = { agentId, sessionId };
    this.agentTokensUsed.increment(labels, usage.totalTokens);
    this.agentInputTokens.increment(labels, usage.input);
    this.agentOutputTokens.increment(labels, usage.output);
    this.agentCacheReadTokens.increment(labels, usage.cacheRead);
    this.agentCacheWriteTokens.increment(labels, usage.cacheWrite);
  }

  /**
   * Record collaboration message.
   */
  recordMessage(from: string, to: string, type: string): void {
    this.collaborationMessages.increment({ from, to, type });
  }

  /**
   * Record conflict detection.
   */
  recordConflict(conflictType: string, resolution: string): void {
    this.collaborationConflicts.increment({ type: conflictType, resolution });
  }

  /**
   * Record task outcome.
   */
  recordTaskOutcome(agentId: string, taskId: string, success: boolean): void {
    this.collaborationTaskSuccess.increment({
      agentId,
      taskId,
      outcome: success ? "success" : "failure",
    });
  }

  /**
   * Set session duration.
   */
  setDuration(sessionId: string, seconds: number): void {
    this.collaborationDuration.set({ sessionId }, seconds);
  }

  /**
   * Collect all metrics as samples.
   */
  collect(): MetricSample[] {
    const samples: MetricSample[] = [];
    const now = Date.now();

    const collectCounter = (counter: Counter, name: string) => {
      for (const [key, value] of counter.getAll()) {
        const labels = this.parseKey(key);
        samples.push({ name, value, labels, timestamp: now });
      }
    };

    collectCounter(this.agentTurns, "agent_turns_total");
    collectCounter(this.agentToolCalls, "agent_tool_calls_total");
    collectCounter(this.agentTokensUsed, "agent_tokens_used_total");
    collectCounter(this.agentInputTokens, "agent_input_tokens_total");
    collectCounter(this.agentOutputTokens, "agent_output_tokens_total");
    collectCounter(this.agentCacheReadTokens, "agent_cache_read_tokens_total");
    collectCounter(this.agentCacheWriteTokens, "agent_cache_write_tokens_total");
    collectCounter(this.collaborationMessages, "collaboration_messages_total");
    collectCounter(this.collaborationConflicts, "collaboration_conflicts_total");
    collectCounter(this.collaborationTaskSuccess, "collaboration_task_success_total");

    for (const [key, value] of this.collaborationDuration.getAll()) {
      const labels = this.parseKey(key);
      samples.push({ name: "collaboration_duration_seconds", value, labels, timestamp: now });
    }

    return samples;
  }

  /**
   * Export in Prometheus text format.
   */
  toPrometheusText(): string {
    const samples = this.collect();
    const lines: string[] = [];

    // Group by metric name
    const grouped = new Map<string, MetricSample[]>();
    for (const sample of samples) {
      if (!grouped.has(sample.name)) grouped.set(sample.name, []);
      grouped.get(sample.name)!.push(sample);
    }

    for (const [name, samps] of grouped) {
      lines.push(`# TYPE ${name} counter`);
      for (const sample of samps) {
        const labelStr = Object.entries(sample.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");
        lines.push(labelStr ? `${name}{${labelStr}} ${sample.value}` : `${name} ${sample.value}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.agentTurns.reset();
    this.agentToolCalls.reset();
    this.agentTokensUsed.reset();
    this.agentInputTokens.reset();
    this.agentOutputTokens.reset();
    this.agentCacheReadTokens.reset();
    this.agentCacheWriteTokens.reset();
    this.collaborationMessages.reset();
    this.collaborationConflicts.reset();
    this.collaborationTaskSuccess.reset();
    this.collaborationDuration.reset();
  }

  private parseKey(key: string): Record<string, string> {
    if (!key) return {};
    const labels: Record<string, string> = {};
    for (const pair of key.split(",")) {
      const [k, v] = pair.split("=");
      if (k && v !== undefined) labels[k] = v;
    }
    return labels;
  }
}
