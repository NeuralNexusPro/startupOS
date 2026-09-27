import { ontologyReferenceSchema, conceptReferenceSchema, factTypeReferenceSchema, agentContractSchema, skillContractSchema } from '../../shared/canonical-contract-schema';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z, type ZodIssue } from 'zod';

import { getDataRoot } from '../../paths';
import {
  CanonicalOntologyStore,
  validateCanonicalOntology,
  type CanonicalOntology,
} from '../ontology';
import {
  SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION,
  type DesignGap,
  type SolutionDesignLoadOptions,
  type SolutionDesignSource,
  type SolutionDesignSourceResult,
  type SolutionExecutionContractBody,
  type SolutionVersionRef,
} from '../solution';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const SOURCE_TYPES = ['interview', 'manual', 'import', 'runtime'] as const;

const agentsFileSchema = z.object({
  version: z.literal('1.0.0'),
  status: z.enum(['draft', 'reviewing', 'confirmed']),
  solutionVersion: z.string().min(1),
  agents: z.array(
    z
      .object({
        id: z.string().min(1),
        contract: agentContractSchema,
      })
      .passthrough()
  ),
});

const skillsFileSchema = z.object({
  version: z.literal('1.0.0'),
  status: z.enum(['draft', 'reviewing', 'confirmed']),
  solutionVersion: z.string().min(1),
  skills: z.array(
    z
      .object({
        id: z.string().min(1),
        contract: skillContractSchema,
      })
      .passthrough()
  ),
});

const sourceReferenceSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1).optional(),
  locator: z.string().min(1).optional(),
});

const conceptResolutionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('confirmed'),
    evidenceSourceRefIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    status: z.literal('ambiguous'),
    candidateConceptIds: z.array(z.string().min(1)).min(2),
    reason: z.string().min(1),
  }),
]);

const objectSlotSchema = z.object({
  id: z.string().min(1),
  concept: conceptReferenceSchema,
  required: z.boolean(),
  resolution: conceptResolutionSchema,
});

const factPolicySchema = z.object({
  factType: factTypeReferenceSchema,
  state: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('any') }),
    z.object({
      mode: z.literal('required'),
      stateIds: z.array(z.string().min(1)).min(1),
    }),
  ]),
  freshness: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('any') }),
    z.object({
      mode: z.literal('max_age'),
      maxAgeMs: z.number().int().positive(),
    }),
  ]),
});

const taskTemplateSchema = z.object({
  id: z.string().min(1),
  designNodeId: z.string().min(1),
  objective: z.string().min(1),
  candidateAgentIds: z.array(z.string().min(1)),
  candidateSkillIds: z.array(z.string().min(1)),
});

const semanticContextSchema = z.object({
  ontology: ontologyReferenceSchema,
  sourceRefs: z.array(sourceReferenceSchema).min(1),
  objectSlots: z.array(objectSlotSchema),
  factPolicies: z.array(factPolicySchema),
  allowedActionIds: z.array(z.string().min(1)),
  taskTemplates: z.array(taskTemplateSchema),
});

const verificationPolicySchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  verifierRef: z.string().min(1),
  evidenceSchemaRef: z.string().min(1),
});

const hitlPolicySchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  trigger: z.enum(['before_execution', 'after_verification', 'on_failure']),
  approverRole: z.string().min(1),
});

const executionMetadataSchema = z.object({
  semanticContext: semanticContextSchema,
  externalInputs: z.array(factTypeReferenceSchema),
  verification: z.array(verificationPolicySchema),
  hitl: z.array(hitlPolicySchema),
  permissions: z.object({ allowed: z.array(z.string().min(1)) }),
  budget: z.object({
    maxAttempts: z.number().int().positive(),
    maxDurationMs: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
  }),
});

const topologyNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['agent', 'skill']),
  contractRef: z.string().min(1),
  requiresVerification: z.boolean(),
  hitlPolicyId: z.string().min(1).optional(),
});

const topologyEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  factType: factTypeReferenceSchema,
});

const topologyViewSchema = z.object({
  nodes: z.array(topologyNodeSchema),
  edges: z.array(topologyEdgeSchema),
});

const manifestSchema = z
  .object({
    version: z.literal('1.0.0'),
    status: z.enum(['draft', 'reviewing', 'confirmed']),
    solutionVersion: z.string().min(1),
    modeling: z.object({
      dimension: z.enum(['task', 'role', 'workflow', 'team']),
    }),
    topologyViews: z.record(topologyViewSchema),
    executionContract: executionMetadataSchema,
    createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  })
  .passthrough();

interface ParsedTopologyView {
  readonly nodes: Array<{
    readonly id: string;
    readonly type: 'agent' | 'skill';
    readonly contractRef: string;
    readonly requiresVerification: boolean;
    readonly hitlPolicyId?: string;
  }>;
  readonly edges: Array<{
    readonly source: string;
    readonly target: string;
    readonly factType: SolutionExecutionContractBody['topology']['edges'][number]['factType'];
  }>;
}

interface ParsedManifest {
  readonly version: string;
  readonly status: 'draft' | 'reviewing' | 'confirmed';
  readonly solutionVersion: string;
  readonly modeling: {
    readonly dimension: 'task' | 'role' | 'workflow' | 'team';
  };
  readonly topologyViews: Record<string, ParsedTopologyView>;
  readonly executionContract: Pick<
    SolutionExecutionContractBody,
    'semanticContext' | 'verification' | 'hitl' | 'permissions' | 'budget'
  > & {
    readonly externalInputs: SolutionExecutionContractBody['topology']['externalInputs'];
  };
  readonly createdAt: string;
}

interface ParsedAgentsFile {
  readonly version: string;
  readonly status: 'draft' | 'reviewing' | 'confirmed';
  readonly solutionVersion: string;
  readonly agents: Array<{
    readonly id: string;
    readonly contract: SolutionExecutionContractBody['agents'][number];
  }>;
}

interface ParsedSkillsFile {
  readonly version: string;
  readonly status: 'draft' | 'reviewing' | 'confirmed';
  readonly solutionVersion: string;
  readonly skills: Array<{
    readonly id: string;
    readonly contract: SolutionExecutionContractBody['skills'][number];
  }>;
}

interface RawBundle {
  readonly manifest: unknown;
  readonly agents: unknown;
  readonly skills: unknown;
}

type ReadBundleResult =
  | { readonly kind: 'bundle'; readonly bundle: RawBundle }
  | { readonly kind: 'legacy_selection_required' }
  | null;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function designGap(
  code: string,
  pathValue: string,
  message: string,
  remediation: string,
  scope: DesignGap['scope'] = 'contract',
  refId?: string
): DesignGap {
  return {
    code,
    severity: 'error',
    scope,
    path: pathValue,
    message,
    remediation,
    ...(refId ? { refId } : {}),
  };
}

function issuePath(issue: ZodIssue, root: string): string {
  const child = issue.path.map(String).join('.');
  return child ? `${root}.${child}` : root;
}

const ISSUE_CODE_RULES: ReadonlyArray<{
  readonly code: string;
  readonly fragments: readonly string[];
}> = [
  { code: 'MISSING_VERIFIER', fragments: ['verification', 'verifierRef'] },
  { code: 'MISSING_PERMISSIONS', fragments: ['permissions'] },
  {
    code: 'MISSING_ACTION_BINDING',
    fragments: ['actions', 'allowedActionIds'],
  },
  { code: 'MISSING_SEMANTIC_INPUTS', fragments: ['externalInputs'] },
  { code: 'MISSING_FACT_TYPE', fragments: ['factType'] },
  {
    code: 'CONCEPT_CONFIRMATION_REQUIRED',
    fragments: ['resolution'],
  },
  { code: 'MISSING_FACT_POLICY', fragments: ['factPolicies'] },
  { code: 'MISSING_ONTOLOGY_VERSION', fragments: ['ontology'] },
  {
    code: 'MISSING_SEMANTIC_CONTEXT',
    fragments: [
      'semanticContext',
      'sourceRefs',
      'objectSlots',
      'factPolicies',
      'taskTemplates',
    ],
  },
  { code: 'MISSING_BUDGET', fragments: ['budget'] },
  { code: 'INVALID_TOPOLOGY', fragments: ['topology'] },
  { code: 'MISSING_NODE_CONTRACT', fragments: ['contract'] },
];

function issueCode(pathValue: string): string {
  return (
    ISSUE_CODE_RULES.find(({ fragments }) =>
      fragments.some((fragment) => pathValue.includes(fragment))
    )?.code ?? 'INVALID_SOLUTION_BUNDLE'
  );
}

function issueScope(pathValue: string, code: string): DesignGap['scope'] {
  if (pathValue.includes('nodes')) {
    return 'node';
  }
  if (pathValue.includes('edges')) {
    return 'edge';
  }
  if (
    code.includes('VERIFIER') ||
    code.includes('PERMISSION') ||
    code.includes('BUDGET')
  ) {
    return 'policy';
  }
  return 'contract';
}

function zodGaps(issues: readonly ZodIssue[], root: string): DesignGap[] {
  return issues.map((issue) => {
    const pathValue = issuePath(issue, root);
    const code = issueCode(pathValue);
    return designGap(
      code,
      pathValue,
      `方案字段 ${pathValue} 缺失或格式无效。`,
      '请在方案设计中明确填写该字段，系统不会推断或补默认值。',
      issueScope(pathValue, code)
    );
  });
}

function missingExecutionMetadataGaps(manifest: unknown): DesignGap[] {
  const manifestRecord = record(manifest);
  if (record(manifestRecord?.['executionContract'])) {
    return [];
  }
  return [
    designGap(
      'MISSING_ONTOLOGY_VERSION',
      'manifest.executionContract.semanticContext.ontology',
      '方案没有绑定 canonical ontology 的精确 ID 和版本。',
      '在方案语义上下文中选择并冻结 canonical ontology 版本。'
    ),
    designGap(
      'MISSING_SEMANTIC_INPUTS',
      'manifest.executionContract.externalInputs',
      '方案没有声明运行所需的语义输入 FactType。',
      '为执行契约声明精确的外部输入 FactType。'
    ),
    designGap(
      'MISSING_VERIFIER',
      'manifest.executionContract.verification',
      '方案没有声明可执行的 verifier 与 evidence schema。',
      '为需要验收的节点配置 verifier 和 evidence schema。',
      'policy'
    ),
    designGap(
      'MISSING_PERMISSIONS',
      'manifest.executionContract.permissions',
      '方案没有声明经审阅的精确权限集合。',
      '明确列出执行契约允许使用的权限。',
      'policy'
    ),
    designGap(
      'MISSING_SEMANTIC_CONTEXT',
      'manifest.executionContract.semanticContext',
      '方案没有完整的来源证据、对象槽位和任务模板。',
      '补齐访谈来源、对象绑定和任务模板。'
    ),
  ];
}

function missingSelectedTopologyGaps(manifest: unknown): DesignGap[] {
  const manifestRecord = record(manifest);
  const dimension = record(manifestRecord?.['modeling'])?.['dimension'];
  let selected: 'workflow' | 'team' | null = null;
  if (dimension === 'task' || dimension === 'workflow') {
    selected = 'workflow';
  } else if (dimension === 'role' || dimension === 'team') {
    selected = 'team';
  }
  if (!selected) {
    return [];
  }
  const views = record(manifestRecord?.['topologyViews']);
  if (record(views?.[selected])) {
    return [];
  }
  return [
    designGap(
      'MISSING_TOPOLOGY_VIEW',
      `manifest.topologyViews.${selected}`,
      `方案缺少 ${selected} 建模视图。`,
      '保存与当前建模维度一致的节点和边。',
      'solution'
    ),
  ];
}

function uniqueGaps(gaps: readonly DesignGap[]): DesignGap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.code}:${gap.path ?? ''}:${gap.refId ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function missingNodeContractGaps(
  rawFile: unknown,
  collection: 'agents' | 'skills'
): DesignGap[] {
  const items = record(rawFile)?.[collection];
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item, index) => {
    if (record(record(item)?.['contract'])) {
      return [];
    }
    const root = `${collection}[${index}].contract`;
    return [
      designGap(
        'MISSING_NODE_CONTRACT',
        root,
        '方案节点缺少 canonical I/O 契约。',
        '为节点声明精确的输入、输出、Action 和权限。',
        'node',
        typeof record(item)?.['id'] === 'string'
          ? (record(item)?.['id'] as string)
          : undefined
      ),
      designGap(
        'MISSING_FACT_TYPE',
        `${root}.inputs`,
        '节点输入输出没有绑定 canonical FactType。',
        '使用 ontology ID、版本、Concept ID 和 FactType ID 完整绑定。',
        'node'
      ),
      designGap(
        'MISSING_ACTION_BINDING',
        `${root}.actions`,
        '节点没有明确声明 Action 绑定。',
        '明确列出允许该节点执行的 canonical Action；无 Action 时显式填写空数组。',
        'node'
      ),
      designGap(
        'MISSING_PERMISSIONS',
        `${root}.permissions`,
        '节点没有明确声明权限。',
        '明确列出节点权限；不需要权限时显式填写空数组。',
        'policy'
      ),
    ];
  });
}

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function assertReference(input: SolutionVersionRef): void {
  for (const [field, value] of Object.entries(input)) {
    if (
      !IDENTIFIER.test(value) ||
      value.includes('..') ||
      path.isAbsolute(value)
    ) {
      throw new TypeError(`Invalid ${field}: ${value}`);
    }
  }
}

export class ProjectSolutionDesignSource implements SolutionDesignSource {
  private readonly ontologyStore: CanonicalOntologyStore;

  constructor(
    private readonly dataRoot = getDataRoot(),
    ontologyStore?: CanonicalOntologyStore
  ) {
    this.ontologyStore = ontologyStore ?? new CanonicalOntologyStore(dataRoot);
  }

  async load(
    input: SolutionVersionRef,
    options: SolutionDesignLoadOptions = { sourceFormat: 'versioned_bundle' }
  ): Promise<SolutionDesignSourceResult | null> {
    assertReference(input);
    let readResult: ReadBundleResult;
    try {
      readResult = await this.readBundle(input, options);
    } catch {
      return {
        ok: false,
        gaps: [
          designGap(
            'MALFORMED_SOLUTION_BUNDLE',
            'solutionBundle',
            '方案文件不是有效 JSON，无法执行发布检查。',
            '修复方案文件后重新检查；系统不会跳过损坏内容。'
          ),
        ],
      };
    }
    if (!readResult) {
      return null;
    }
    if (readResult.kind === 'legacy_selection_required') {
      return {
        ok: false,
        gaps: [
          designGap(
            'LEGACY_COMPATIBILITY_SELECTION_REQUIRED',
            'solutionBundle.sourceFormat',
            '检测到 legacy 方案文件，但本次请求未明确选择兼容读取。',
            '先执行迁移检查，或在本次检查中显式选择 legacy_compatibility；系统不会自动回退。',
            'solution'
          ),
        ],
      };
    }
    const rawBundle = readResult.bundle;

    const gaps: DesignGap[] = [
      ...missingExecutionMetadataGaps(rawBundle.manifest),
      ...missingSelectedTopologyGaps(rawBundle.manifest),
      ...missingNodeContractGaps(rawBundle.agents, 'agents'),
      ...missingNodeContractGaps(rawBundle.skills, 'skills'),
    ];
    const parsedManifest = manifestSchema.safeParse(rawBundle.manifest);
    const parsedAgents = agentsFileSchema.safeParse(rawBundle.agents);
    const parsedSkills = skillsFileSchema.safeParse(rawBundle.skills);
    if (!parsedManifest.success) {
      gaps.push(...zodGaps(parsedManifest.error.issues, 'manifest'));
    }
    if (!parsedAgents.success) {
      gaps.push(...zodGaps(parsedAgents.error.issues, 'agentsFile'));
    }
    if (!parsedSkills.success) {
      gaps.push(...zodGaps(parsedSkills.error.issues, 'skillsFile'));
    }

    let ontology: CanonicalOntology | null = null;
    try {
      ontology =
        (await this.ontologyStore.readOntology(input.projectId))?.data ?? null;
    } catch {
      gaps.push(
        designGap(
          'INVALID_CANONICAL_ONTOLOGY',
          'ontology',
          '项目 canonical ontology 无法读取或格式无效。',
          '修复 canonical ontology 后重新检查。'
        )
      );
    }
    if (!ontology) {
      gaps.push(
        designGap(
          'CANONICAL_ONTOLOGY_NOT_FOUND',
          'ontology',
          '项目尚未生成 canonical ontology。',
          '先完成 ontology 构建与确认，再发布执行契约。'
        )
      );
    } else {
      gaps.push(...this.ontologyGaps(ontology));
    }

    if (
      !parsedManifest.success ||
      !parsedAgents.success ||
      !parsedSkills.success ||
      !ontology
    ) {
      return { ok: false, gaps: uniqueGaps(gaps) };
    }

    const manifest = parsedManifest.data as unknown as ParsedManifest;
    const agents = parsedAgents.data as unknown as ParsedAgentsFile;
    const skills = parsedSkills.data as unknown as ParsedSkillsFile;
    gaps.push(...this.crossFileGaps(input, manifest, agents, skills, ontology));
    if (gaps.length) {
      return { ok: false, gaps: uniqueGaps(gaps) };
    }

    return {
      ok: true,
      design: {
        ontology,
        status: manifest.status,
        body: this.toContractBody(input, manifest, agents, skills),
      },
    };
  }

  private async readBundle(
    input: SolutionVersionRef,
    options: SolutionDesignLoadOptions
  ): Promise<ReadBundleResult> {
    const solutions = path.join(
      this.dataRoot,
      'projects',
      input.projectId,
      'solutions'
    );
    if (options.sourceFormat === 'versioned_bundle') {
      const versionDirectory = path.join(solutions, input.solutionVersion);
      const manifest = await readJson(
        path.join(versionDirectory, 'manifest.json')
      );
      if (manifest) {
        return {
          kind: 'bundle',
          bundle: {
            manifest,
            agents: await readJson(path.join(versionDirectory, 'agents.json')),
            skills: await readJson(path.join(versionDirectory, 'skills.json')),
          },
        };
      }
      return (await this.readLegacyFile(solutions, input.solutionVersion))
        ? { kind: 'legacy_selection_required' }
        : null;
    }

    const legacy = await this.readLegacyFile(solutions, input.solutionVersion);
    if (!legacy) {
      return null;
    }
    const envelope = record(legacy)?.['data'] ?? legacy;
    const legacyRecord = record(envelope);
    return {
      kind: 'bundle',
      bundle: {
        manifest: legacyRecord?.['manifest'] ?? envelope,
        agents: legacyRecord?.['agentsFile'] ?? {
          version: legacyRecord?.['version'],
          status: legacyRecord?.['status'],
          solutionVersion: legacyRecord?.['solutionVersion'],
          agents: legacyRecord?.['agents'],
        },
        skills: legacyRecord?.['skillsFile'] ?? {
          version: legacyRecord?.['version'],
          status: legacyRecord?.['status'],
          solutionVersion: legacyRecord?.['solutionVersion'],
          skills: legacyRecord?.['skills'],
        },
      },
    };
  }

  private async readLegacyFile(
    solutions: string,
    solutionVersion: string
  ): Promise<unknown | null> {
    return (
      (await readJson(
        path.join(solutions, `solution-${solutionVersion}.json`)
      )) ??
      (await readJson(
        path.join(solutions, `solution-${solutionVersion}-manifest.json`)
      ))
    );
  }

  private ontologyGaps(ontology: CanonicalOntology): DesignGap[] {
    return validateCanonicalOntology(ontology).issues.map((issue) =>
      designGap(
        `CANONICAL_${issue.code}`,
        issue.path ? `ontology.${issue.path}` : 'ontology',
        `Canonical ontology 存在无效定义（${issue.code}）。`,
        '在 ontology 编辑与确认流程中修复该定义。'
      )
    );
  }

  private crossFileGaps(
    input: SolutionVersionRef,
    manifest: ParsedManifest,
    agents: ParsedAgentsFile,
    skills: ParsedSkillsFile,
    ontology: CanonicalOntology
  ): DesignGap[] {
    const gaps: DesignGap[] = [];
    const versions = [
      ['manifest.solutionVersion', manifest.solutionVersion],
      ['agentsFile.solutionVersion', agents.solutionVersion],
      ['skillsFile.solutionVersion', skills.solutionVersion],
    ] as const;
    versions.forEach(([pathValue, version]) => {
      if (version !== input.solutionVersion) {
        gaps.push(
          designGap(
            'SOLUTION_VERSION_MISMATCH',
            pathValue,
            `方案文件版本 ${version} 与请求版本 ${input.solutionVersion} 不一致。`,
            '选择同一精确版本的 manifest、agents 和 skills 文件。'
          )
        );
      }
    });
    if (
      agents.status !== manifest.status ||
      skills.status !== manifest.status
    ) {
      gaps.push(
        designGap(
          'SOLUTION_STATUS_MISMATCH',
          'solutionBundle.status',
          'manifest、agents 与 skills 的方案状态不一致。',
          '重新保存同一确认状态的完整方案版本。'
        )
      );
    }

    if (ontology.projectId !== input.projectId) {
      gaps.push(
        designGap(
          'ONTOLOGY_PROJECT_MISMATCH',
          'ontology.projectId',
          'Canonical ontology 不属于当前项目。',
          '使用当前项目的 canonical ontology，禁止跨项目复用。'
        )
      );
    }

    const bound = manifest.executionContract.semanticContext.ontology;
    if (bound.ontologyId !== ontology.id) {
      gaps.push(
        designGap(
          'ONTOLOGY_ID_MISMATCH',
          'manifest.executionContract.semanticContext.ontology.ontologyId',
          '方案绑定的 ontology ID 不是当前项目 canonical ontology。',
          '重新选择当前项目的 canonical ontology。'
        )
      );
    }
    if (bound.ontologyVersion !== ontology.version) {
      gaps.push(
        designGap(
          'ONTOLOGY_VERSION_MISMATCH',
          'manifest.executionContract.semanticContext.ontology.ontologyVersion',
          '方案绑定了旧的或不存在的 ontology 版本。',
          '基于当前 canonical ontology 版本创建新的方案版本。'
        )
      );
    }

    agents.agents.forEach((agent, index) => {
      if (agent.id !== agent.contract.agentId) {
        gaps.push(
          designGap(
            'NODE_CONTRACT_ID_MISMATCH',
            `agentsFile.agents[${index}].contract.agentId`,
            'Agent 节点 ID 与 canonical contract ID 不一致。',
            '绑定与节点 ID 完全一致的 Agent contract。',
            'node',
            agent.id
          )
        );
      }
    });
    skills.skills.forEach((skill, index) => {
      if (skill.id !== skill.contract.skillId) {
        gaps.push(
          designGap(
            'NODE_CONTRACT_ID_MISMATCH',
            `skillsFile.skills[${index}].contract.skillId`,
            'Skill 节点 ID 与 canonical contract ID 不一致。',
            '绑定与节点 ID 完全一致的 Skill contract。',
            'node',
            skill.id
          )
        );
      }
    });
    return gaps;
  }

  private toContractBody(
    input: SolutionVersionRef,
    manifest: ParsedManifest,
    agents: ParsedAgentsFile,
    skills: ParsedSkillsFile
  ): SolutionExecutionContractBody {
    const modelingDimension =
      manifest.modeling.dimension === 'task' ||
      manifest.modeling.dimension === 'workflow'
        ? 'workflow'
        : 'team';
    const topology = manifest.topologyViews[modelingDimension];
    if (!topology) {
      throw new TypeError(
        `Missing ${modelingDimension} topology after bundle validation`
      );
    }
    return {
      schemaVersion: SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION,
      contractId: `${input.solutionId}@${input.solutionVersion}`,
      projectId: input.projectId,
      solutionId: input.solutionId,
      solutionVersion: input.solutionVersion,
      status: 'approved',
      modelingDimension,
      topology: {
        nodes: topology.nodes.map((node) => ({
          id: node.id,
          kind: node.type,
          contractRef: node.contractRef,
          requiresVerification: node.requiresVerification,
          ...(node.hitlPolicyId ? { hitlPolicyId: node.hitlPolicyId } : {}),
        })),
        edges: topology.edges.map((edge) => ({
          fromNodeId: edge.source,
          toNodeId: edge.target,
          factType: edge.factType,
        })),
        externalInputs: manifest.executionContract.externalInputs,
      },
      agents: agents.agents.map(({ contract }) => contract),
      skills: skills.skills.map(({ contract }) => contract),
      semanticContext: manifest.executionContract.semanticContext,
      verification: manifest.executionContract.verification,
      hitl: manifest.executionContract.hitl,
      permissions: manifest.executionContract.permissions,
      budget: manifest.executionContract.budget,
      createdAt: manifest.createdAt,
    };
  }
}
