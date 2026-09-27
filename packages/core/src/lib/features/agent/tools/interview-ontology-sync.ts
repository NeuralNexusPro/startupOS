import { Type, type Static } from '@sinclair/typebox';
import type { AgentToolResult } from '@originos/pi-agent-adapter';

import type { ToolRegistration } from '../../../integrations/pi-agent/types';
import { InterviewOntologySyncService } from '../../project';

const ConceptSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  type: Type.Optional(Type.Union([Type.Literal('entity'), Type.Literal('class')])),
});
const RelationSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  sourceConceptName: Type.String({ minLength: 1 }),
  targetConceptName: Type.String({ minLength: 1 }),
  cardinality: Type.Optional(Type.Union([
    Type.Literal('one-to-one'), Type.Literal('one-to-many'),
    Type.Literal('many-to-one'), Type.Literal('many-to-many'),
  ])),
  description: Type.Optional(Type.String()),
});
const Params = Type.Object({
  projectId: Type.String({ minLength: 1, description: '从项目上下文取得的项目 ID。' }),
  sourceId: Type.String({ minLength: 1, description: '当前访谈会话 ID。' }),
  projectName: Type.Optional(Type.String()),
  domain: Type.Object({ name: Type.String({ minLength: 1 }), description: Type.Optional(Type.String()) }),
  concepts: Type.Array(ConceptSchema, { minItems: 1 }),
  relations: Type.Optional(Type.Array(RelationSchema)),
});

const service = new InterviewOntologySyncService();

export const interviewOntologySyncTool: ToolRegistration = {
  name: 'record_project_interview_observation',
  label: '记录访谈业务概念',
  description: '将本轮已确认的业务领域、关键对象和联系直接合并到当前项目的 canonical ontology。首次调用会自动建立并绑定项目本体；后续调用只增量合并，不读取或写入 business-model.json。每确认新的业务事实后立即调用。',
  parameters: Params,
  category: 'ontology',
  enabled: true,
  scopes: ['project', 'persistent'],
  async execute(_toolCallId, params: Static<typeof Params>): Promise<AgentToolResult<unknown>> {
    try {
      const ontology = await service.record(params);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: true, ontologyId: ontology.id, ontologyVersion: ontology.version,
          domains: ontology.domains.length, concepts: ontology.concepts.length, relations: ontology.relations.length,
        }) }],
        details: undefined,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }) }],
        details: undefined,
      };
    }
  },
};
