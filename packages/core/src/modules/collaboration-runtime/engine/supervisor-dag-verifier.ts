/** Supervisor DAG 任务验收器：LLM 判定 Worker 是否完成任务，含规则回退判定（SUP-09） */

import { streamSimple as _streamSimpleRaw } from '@originos/pi-agent-adapter/ai';

export interface MessageToolCallBlock {
  type: "toolCall";
  name: string;
  arguments?: { filePath?: string; path?: string; [key: string]: unknown };
}

export interface MessageTextBlock {
  type: "text";
  text: string;
}

type MessageContentBlock = MessageToolCallBlock | MessageTextBlock | { type: string };

export interface StreamChunk {
  type: string;
  delta?: string;
}

// Typed wrapper around the @ts-expect-error import above
const streamSimple = _streamSimpleRaw as (model: unknown, messages: unknown) => AsyncIterable<StreamChunk>;

/**
 * LLM-based Verifier — 判断 Agent 是否完成了任务。
 *
 * 接收任务描述 + Agent 本轮对话消息，通过 LLM 分析判断：
 * - 任务是否完成（pass/fail）
 * - 失败原因
 * - 提取产出物（写入的文件路径等）
 */
export interface VerificationResult {
  passed: boolean;
  reasoning: string;
  extractedArtifacts: string[];
  outputText: string;
}

export async function verifyTaskCompletion(
  taskDescription: string,
  agentMessages: Array<{ role: string; content?: unknown }>,
  modelFactory?: { createAutoModel(): unknown },
): Promise<VerificationResult> {
  if (agentMessages.length === 0) {
    return { passed: false, reasoning: "无对话消息", extractedArtifacts: [], outputText: "" };
  }

  // 提取工具调用和文本
  const artifacts: string[] = [];
  const textParts: string[] = [];
  let toolCallCount = 0;

  for (const msg of agentMessages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) { continue; }
    const blocks = msg.content as MessageContentBlock[];
    for (const block of blocks) {
      if (block.type === "toolCall") {
        toolCallCount += 1;
        const args = (block as MessageToolCallBlock).arguments;
        if (args?.filePath !== null && args?.filePath !== undefined) { artifacts.push(args.filePath); }
        if (args?.path !== null && args?.path !== undefined) { artifacts.push(args.path); }
      }
      if (block.type === "text") {
        const text = (block as MessageTextBlock).text;
        if (text.length > 0) { textParts.push(text); }
      }
    }
  }

  // 构建 verifier prompt
  const conversationSummary = agentMessages
    .map((m) => {
      if (m.role === "assistant") {
        const blocks = (Array.isArray(m.content) ? m.content : []) as MessageContentBlock[];
        const toolCalls = blocks
          .filter((b): b is MessageToolCallBlock => b.type === "toolCall")
          .map((b) => `[调用工具: ${b.name}]`)
          .join(" ");
        const texts = blocks
          .filter((b): b is MessageTextBlock => b.type === "text")
          .map((b) => b.text)
          .join(" ");
        return `Assistant: ${toolCalls} ${texts}`;
      }
      if (m.role === "toolResult") {
        const content = typeof m.content === "string" ? m.content.slice(0, 200) : "[工具结果]";
        return `Tool Result: ${content}`;
      }
      return `${m.role}: ${typeof m.content === "string" ? m.content : ""}`;
    })
    .join("\n");

  const systemPrompt = `你是一个任务完成度验证器。你的职责是分析 Agent 的对话历史，判断它是否完成了给定的任务。

判断规则：
1. 如果 Agent 有实质性工具调用（读文件、查询本体等）且最终文本产出了审查结论、分析报告或明确结果，则任务通过——即使没有写文件（read-only 审查角色）。
2. 如果任务明确要求写入文件或创建内容，Agent 必须有相应的工具调用（write/create）。
3. 如果 Agent 最后一条消息是提问（以"？"结尾、包含"请提供"/"请告诉"/"请确认"且无后续工具调用），则判定为未完成——但这应触发 HITL 等待，而非直接 fail。
4. 如果 Agent 完成了任务要求的所有步骤，则任务通过。

请以 JSON 格式回复，格式如下：
{"passed": true/false, "reasoning": "判断原因", "outputText": "Agent 的最终文本输出摘要"}`;

  const userPrompt = `任务描述：${taskDescription}

Agent 对话历史：
${conversationSummary}

工具调用次数：${toolCallCount}
产出的文件路径：${artifacts.length > 0 ? artifacts.join(", ") : "无"}

请判断任务是否完成，以 JSON 格式回复。`;

  try {
    const factory = modelFactory ?? (await import("../../../lib/integrations/pi-agent/server-config"));
    const model = factory.createAutoModel();
    let responseText = "";

    const stream = streamSimple(model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    for await (const chunk of stream) {
      if (chunk.type === "text_delta" && chunk.delta !== null && chunk.delta !== undefined && chunk.delta.length > 0) {
        responseText += chunk.delta;
      }
    }

    // 解析 JSON 回复
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { passed?: boolean; reasoning?: string; outputText?: string };
      return {
        passed: parsed.passed ?? false,
        reasoning: parsed.reasoning ?? responseText,
        extractedArtifacts: artifacts,
        outputText: parsed.outputText ?? textParts.join("\n"),
      };
    }

    // 回退：如果无法解析 JSON
    return {
      passed: responseText.includes("true") || responseText.includes("通过"),
      reasoning: responseText,
      extractedArtifacts: artifacts,
      outputText: textParts.join("\n"),
    };
  } catch (err) {
    console.error("[Verifier] LLM verification failed, falling back to rule-based check:", err);
    return verifierFallbackResult(textParts, artifacts, toolCallCount);
  }
}

/** 可测试的纯函数：Verifier LLM 失败时的回退判定逻辑（SUP-09） */
export function verifierFallbackResult(
  textParts: string[],
  artifacts: string[],
  toolCallCount: number,
): VerificationResult {
  const output = textParts.join("\n");
  const lastAssistantText = textParts.at(-1) ?? "";
  const isQuestioning = /请[您你]?提供|需要[您你]?|请告诉|请您确认|等待您的回复|等待用户|请回复|请确认|请反馈/.test(lastAssistantText)
    && lastAssistantText.trim().endsWith("？");
  const hasWrite = artifacts.some((a) => !a.endsWith("/"));
  const hasToolCalls = toolCallCount > 0;
  const passed = (hasToolCalls && !isQuestioning) || hasWrite;
  return {
    passed,
    reasoning: `Verifier LLM 调用失败，使用回退规则: ${hasWrite ? "有文件写入" : "无文件写入"}, ${hasToolCalls ? `有工具调用(${toolCallCount})` : "无工具调用"}, ${isQuestioning ? "是提问模式" : "非提问模式"}`,
    extractedArtifacts: artifacts,
    outputText: output,
  };
}
