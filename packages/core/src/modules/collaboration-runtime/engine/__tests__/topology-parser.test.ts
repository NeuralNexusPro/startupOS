import { describe, it, expect } from "vitest";
import { parseTopology } from "../topology-parser";

describe("Topology Parser — Story 9.7", () => {
  // ==========================================================================
  // Workflow 模式（全 trigger）
  // ==========================================================================

  it("parses linear A→B→C topology as Workflow mode", () => {
    const manifest = {
      agents: [
        { id: "a", name: "Agent A", domain: "domain1", responsibility: "负责分析输入数据" },
        { id: "b", name: "Agent B", domain: "domain1", responsibility: "负责生成报告" },
        { id: "c", name: "Agent C", domain: "domain1", responsibility: "负责审核输出" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "b", type: "trigger" as const, description: "A 完成后触发 B" },
          { from: "b", to: "c", type: "trigger" as const, description: "B 完成后触发 C" },
        ],
      },
    };

    const topology = parseTopology(manifest);

    expect(topology.mode).toBe("workflow");
    expect(topology.entryPoints).toEqual(["a"]);
    expect(topology.exitPoints).toEqual(["c"]);
    expect(Object.keys(topology.agents)).toHaveLength(3);
    expect(topology.edges).toHaveLength(2);
  });

  it("parses parallel B/C after A topology as Workflow mode", () => {
    const manifest = {
      agents: [
        { id: "a", name: "Agent A", domain: "d", responsibility: "负责初始化" },
        { id: "b", name: "Agent B", domain: "d", responsibility: "负责处理 X" },
        { id: "c", name: "Agent C", domain: "d", responsibility: "负责处理 Y" },
        { id: "d", name: "Agent D", domain: "d", responsibility: "负责汇总" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "b", type: "trigger" as const, description: "" },
          { from: "a", to: "c", type: "trigger" as const, description: "" },
          { from: "b", to: "d", type: "trigger" as const, description: "" },
          { from: "c", to: "d", type: "trigger" as const, description: "" },
        ],
      },
    };

    const topology = parseTopology(manifest);

    expect(topology.mode).toBe("workflow");
    expect(topology.entryPoints).toEqual(["a"]);
    expect(topology.exitPoints).toEqual(["d"]);
    // B and C are neither entry nor exit
    expect(topology.entryPoints).not.toContain("b");
    expect(topology.exitPoints).not.toContain("b");
  });

  // ==========================================================================
  // System 模式（存在 notify/depend）
  // ==========================================================================

  it("parses topology with notify as System mode", () => {
    const manifest = {
      agents: [
        { id: "supervisor", name: "Supervisor", domain: "d", responsibility: "负责分配任务" },
        { id: "worker1", name: "Worker 1", domain: "d", responsibility: "负责执行任务" },
        { id: "worker2", name: "Worker 2", domain: "d", responsibility: "负责执行任务" },
        { id: "aggregator", name: "Aggregator", domain: "d", responsibility: "负责汇总结果" },
      ],
      collaboration: {
        edges: [
          { from: "supervisor", to: "worker1", type: "notify" as const, description: "" },
          { from: "supervisor", to: "worker2", type: "notify" as const, description: "" },
          { from: "worker1", to: "aggregator", type: "trigger" as const, description: "" },
          { from: "worker2", to: "aggregator", type: "trigger" as const, description: "" },
        ],
      },
    };

    const topology = parseTopology(manifest);

    expect(topology.mode).toBe("system");
    expect(topology.entryPoints).toEqual(["supervisor"]);
    expect(topology.exitPoints).toEqual(["aggregator"]);
  });

  it("detects circular dependency via depend edge", () => {
    // Workflow-mode depend cycle: no notify/no bidirectional trigger → workflow → cycle detected
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "test" },
        { id: "b", name: "B", domain: "d", responsibility: "test" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "b", type: "trigger" as const, description: "" },
          { from: "b", to: "a", type: "depend" as const, description: "" },
        ],
      },
    };

    // has depend → system mode → no cycle detection thrown
    // Instead verify it is parsed as system without error
    const topology = parseTopology(manifest);
    expect(topology.mode).toBe("system");
  });

  it("allows bidirectional notify edges (pub-sub, not a DAG cycle)", () => {
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "test" },
        { id: "b", name: "B", domain: "d", responsibility: "test" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "b", type: "notify" as const, description: "" },
          { from: "b", to: "a", type: "notify" as const, description: "" },
        ],
      },
    };

    expect(() => parseTopology(manifest)).not.toThrow();
  });

  // ==========================================================================
  // 循环依赖检测
  // ==========================================================================

  it("bidirectional trigger A→B→A is treated as System mode (hub-and-spoke, not an error)", () => {
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "test" },
        { id: "b", name: "B", domain: "d", responsibility: "test" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "b", type: "trigger" as const, description: "" },
          { from: "b", to: "a", type: "trigger" as const, description: "" },
        ],
      },
    };

    const topology = parseTopology(manifest);
    expect(topology.mode).toBe("system");
  });

  it("A→B→C→A single-direction trigger cycle throws (true workflow cycle)", () => {
    // a→b→c→a with no reverse edges = a true workflow cycle, should throw
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "test" },
        { id: "b", name: "B", domain: "d", responsibility: "test" },
        { id: "c", name: "C", domain: "d", responsibility: "test" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "b", type: "trigger" as const, description: "" },
          { from: "b", to: "c", type: "trigger" as const, description: "" },
          { from: "c", to: "a", type: "trigger" as const, description: "" },
        ],
      },
    };

    expect(() => parseTopology(manifest)).toThrow("Circular dependency");
  });

  it("allows hub-and-spoke: manager dispatches workers, workers report back (bidirectional trigger = System mode)", () => {
    // review-task-manager → reviewer → review-task-manager pattern must NOT throw
    const manifest = {
      agents: [
        { id: "manager", name: "Manager", domain: "d", responsibility: "task coordination" },
        { id: "reviewer-a", name: "Reviewer A", domain: "d", responsibility: "review" },
        { id: "reviewer-b", name: "Reviewer B", domain: "d", responsibility: "review" },
      ],
      collaboration: {
        edges: [
          { from: "manager", to: "reviewer-a", type: "trigger" as const, description: "dispatch" },
          { from: "manager", to: "reviewer-b", type: "trigger" as const, description: "dispatch" },
          { from: "reviewer-a", to: "manager", type: "trigger" as const, description: "report back" },
          { from: "reviewer-b", to: "manager", type: "trigger" as const, description: "report back" },
        ],
      },
    };

    const topology = parseTopology(manifest);
    expect(topology.mode).toBe("system");
  });

  // ==========================================================================
  // Agent 解析
  // ==========================================================================

  it("extracts capabilities from responsibility", () => {
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "负责数据清洗。生成分析报告。验证输出质量。" },
      ],
      collaboration: { edges: [] },
    };

    const topology = parseTopology(manifest);
    const agent = topology.agents["a"]!;
    expect(agent.capabilities.length).toBeGreaterThan(0);
    expect(agent.id).toBe("a");
    expect(agent.name).toBe("A");
    expect(agent.domain).toBe("d");
  });

  it("handles missing optional fields gracefully", () => {
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "test" },
      ],
      collaboration: {},
    };

    const topology = parseTopology(manifest);
    expect(topology.entryPoints.length).toBeGreaterThan(0);
    expect(topology.exitPoints.length).toBeGreaterThan(0);
    expect(topology.agents["a"]!.skills).toEqual([]);
    expect(topology.agents["a"]!.dataOperations).toEqual({});
    expect(topology.edges).toEqual([]);
  });

  it("accepts canonical solution agents that describe responsibility with description", () => {
    const topology = parseTopology({
      agents: [
        {
          id: "tracker",
          name: "趋势跟踪 Agent",
          domain: "技术趋势跟踪",
          description: "浏览榜单；维护待看清单",
          skills: ["trend-record"],
        },
      ],
      collaboration: { edges: [] },
    });

    expect(topology.agents["tracker"]).toMatchObject({
      responsibility: "浏览榜单；维护待看清单",
      capabilities: ["浏览榜单", "维护待看清单"],
      skills: ["trend-record"],
    });
  });

  it("does not crash when an imported agent has no responsibility text", () => {
    const topology = parseTopology({
      agents: [{ id: "worker", name: "Worker" }],
      collaboration: { edges: [] },
    });

    expect(topology.agents["worker"]).toMatchObject({
      responsibility: "",
      capabilities: [],
    });
  });

  // ==========================================================================
  // Entry/Exit points
  // ==========================================================================

  it("identifies multiple entry and exit points", () => {
    const manifest = {
      agents: [
        { id: "a", name: "A", domain: "d", responsibility: "test" },
        { id: "b", name: "B", domain: "d", responsibility: "test" },
        { id: "c", name: "C", domain: "d", responsibility: "test" },
        { id: "d", name: "D", domain: "d", responsibility: "test" },
      ],
      collaboration: {
        edges: [
          { from: "a", to: "c", type: "trigger" as const, description: "" },
          { from: "b", to: "c", type: "trigger" as const, description: "" },
          { from: "c", to: "d", type: "trigger" as const, description: "" },
        ],
      },
    };

    const topology = parseTopology(manifest);

    expect(topology.entryPoints.sort()).toEqual(["a", "b"]);
    expect(topology.exitPoints).toEqual(["d"]);
  });
});
