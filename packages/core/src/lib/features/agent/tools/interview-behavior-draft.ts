import { Type, type Static } from '@sinclair/typebox';
import type { AgentToolResult } from '@originos/pi-agent-adapter';

import type { ToolRegistration } from '../../../integrations/pi-agent/types';
import {
  InterviewBehaviorDraftService,
  type InterviewBehaviorCandidates,
  type InterviewBehaviorClarification,
  type InterviewBehaviorMessageRef,
} from '../../project';

const CandidateSchema = Type.Unsafe<InterviewBehaviorCandidates>({
  type: 'object',
  description: '行为候选：Action、FactType、BusinessState、Transition 和 Rule 的 canonical 定义。只能保存草稿，不能直接发布。',
});
const ClarificationSchema = Type.Unsafe<InterviewBehaviorClarification>({ type: 'object' });
const MessageRefSchema = Type.Object({ messageId: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const SaveParams = Type.Object({
  projectId: Type.String({ minLength: 1 }),
  sourceId: Type.String({ minLength: 1, description: '当前访谈会话 ID。' }),
  draftId: Type.Optional(Type.String({ minLength: 1 })),
  expectedDraftRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  ontologyId: Type.String({ minLength: 1 }),
  ontologyVersion: Type.String({ minLength: 1 }),
  baseRevision: Type.Integer({ minimum: 0 }),
  sourceMessageRefs: Type.Array(MessageRefSchema),
  candidates: CandidateSchema,
  clarifications: Type.Optional(Type.Array(ClarificationSchema)),
  knownPermissionIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});
const ReviewParams = Type.Object({
  projectId: Type.String({ minLength: 1 }),
  sourceId: Type.String({ minLength: 1 }),
  draftId: Type.String({ minLength: 1 }),
});

const service = new InterviewBehaviorDraftService();
const content = (value: unknown): AgentToolResult<unknown> => ({ content: [{ type: 'text', text: JSON.stringify(value) }], details: undefined });

/** Model tools may collect/review drafts. Trusted UI is the only publisher. */
export const interviewBehaviorDraftTools: ToolRegistration[] = [
  {
    name: 'save_project_interview_behavior_draft',
    label: '保存访谈行为草稿',
    description: '保存本轮访谈提炼出的行动、状态、事实和规则草稿。只保存供用户审阅，绝不会写入 canonical ontology 或执行行动。消息来源只能传 messageId，不能传正文。',
    parameters: SaveParams,
    category: 'ontology', enabled: true, scopes: ['project', 'persistent'],
    async execute(_toolCallId, params: Static<typeof SaveParams>): Promise<AgentToolResult<unknown>> {
      const result = await service.save({
        ...params,
        sourceMessageRefs: params.sourceMessageRefs as InterviewBehaviorMessageRef[],
        candidates: params.candidates,
        clarifications: params.clarifications,
      });
      return content(result);
    },
  },
  {
    name: 'review_project_interview_behavior_draft',
    label: '查看访谈行为草稿',
    description: '查看当前访谈会话中的行为草稿和待确认问题。只能用业务语言向用户说明需要确认的内容。',
    parameters: ReviewParams,
    category: 'ontology', enabled: true, scopes: ['project', 'persistent'],
    async execute(_toolCallId, params: Static<typeof ReviewParams>): Promise<AgentToolResult<unknown>> {
      return content(await service.review(params.projectId, params.sourceId, params.draftId));
    },
  },
];
