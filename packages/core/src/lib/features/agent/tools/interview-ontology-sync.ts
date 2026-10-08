import { Type, type Static } from '@sinclair/typebox';
import type { AgentToolResult } from '@originos/pi-agent-adapter';

import type { ToolRegistration } from '../../../integrations/pi-agent/types';
import { getToolContext } from '../../../integrations/pi-agent/tools/context';
import { InterviewOntologySyncService } from '../../project';

const ConceptSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  type: Type.Optional(Type.Union([Type.Literal('entity'), Type.Literal('class')])),
  semanticKind: Type.Optional(Type.Union([
    Type.Literal('role'), Type.Literal('organization'), Type.Literal('object'), Type.Literal('activity'),
    Type.Literal('document'), Type.Literal('standard'), Type.Literal('unclassified'),
  ])),
  properties: Type.Optional(Type.Array(Type.Object({
    name: Type.String({ minLength: 1 }),
    valueType: Type.Optional(Type.Union([
      Type.Literal('string'), Type.Literal('number'), Type.Literal('boolean'), Type.Literal('date'),
      Type.Literal('object'), Type.Literal('array'), Type.Literal('reference'),
    ])),
    required: Type.Optional(Type.Boolean()),
    description: Type.Optional(Type.String()),
  }))),
});
const ClassificationCorrectionSchema = Type.Object({
  conceptId: Type.String({ minLength: 1 }),
  semanticKind: Type.Union([Type.Literal('role'), Type.Literal('organization'), Type.Literal('object'), Type.Literal('activity'), Type.Literal('document'), Type.Literal('standard'), Type.Literal('unclassified')]),
});
const RelationSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  sourceConceptId: Type.Optional(Type.String({ minLength: 1 })),
  targetConceptId: Type.Optional(Type.String({ minLength: 1 })),
  sourceConceptName: Type.Optional(Type.String({ minLength: 1 })),
  targetConceptName: Type.Optional(Type.String({ minLength: 1 })),
  cardinality: Type.Optional(Type.Union([
    Type.Literal('one-to-one'), Type.Literal('one-to-many'),
    Type.Literal('many-to-one'), Type.Literal('many-to-many'),
  ])),
  description: Type.Optional(Type.String()),
});
const Params = Type.Object({
  projectId: Type.String({ minLength: 1, description: '从项目上下文取得的项目 ID。' }),
  sourceId: Type.String({ minLength: 1, description: '当前访谈会话 ID。' }),
  operationId: Type.String({ minLength: 1, description: '本次确认操作的稳定 ID；重试必须复用。' }),
  projectName: Type.Optional(Type.String()),
  domain: Type.Object({ name: Type.String({ minLength: 1 }), description: Type.Optional(Type.String()) }),
  concepts: Type.Array(ConceptSchema),
  classificationCorrections: Type.Optional(Type.Array(ClassificationCorrectionSchema)),
  relations: Type.Optional(Type.Array(RelationSchema)),
});

const service = new InterviewOntologySyncService();

/** sourceId 由工具上下文（会话启动时注入）决定，模型传参仅作无上下文时回退。 */
function trustedSourceId(paramSourceId: string): string {
  const sessionId = getToolContext().sessionId?.trim();
  return sessionId ?? paramSourceId;
}

export const interviewOntologySyncTool: ToolRegistration = {
  name: 'record_project_interview_observation',
  label: '记录访谈业务概念',
  description: '记录已确认的业务概念、属性、中文业务分类或联系。关系优先传稳定 concept ID；旧名称只能精确唯一匹配。分类来源由可信服务根据访谈会话构造，用户纠正使用 classificationCorrections。返回每项结果；不读取或写入 business-model.json。',
  parameters: Params,
  category: 'ontology',
  enabled: true,
  scopes: ['project', 'persistent'],
  async execute(_toolCallId, params: Static<typeof Params>): Promise<AgentToolResult<unknown>> {
    try {
      const result = await service.record({
        ...params,
        sourceId: trustedSourceId(params.sourceId),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: result.results.every((item) => item.status !== 'rejected'), ontologyId: result.ontology.id, ontologyVersion: result.ontology.version,
          revision: result.revision, results: result.results, memoryUpdated: result.memoryUpdated,
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
