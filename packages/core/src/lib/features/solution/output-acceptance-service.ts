import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getDataRoot } from '../../paths';

import type {
  HitlPolicy,
  SaveSolutionOutputAcceptanceInput,
  SolutionDesignStatus,
  SolutionNodeOutputAcceptance,
  SolutionOutputAcceptanceNode,
  SolutionOutputAcceptanceRole,
  SolutionOutputAcceptanceSnapshot,
  SolutionVersionRef,
} from './types';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const MANIFEST_STATUSES = new Set<SolutionDesignStatus>([
  'draft',
  'reviewing',
  'confirmed',
]);

type JsonRecord = Record<string, unknown>;

interface MutableTopologyNode {
  id: string;
  type: 'agent' | 'skill';
  contractRef: string;
  hitlPolicyId?: string;
  [key: string]: unknown;
}

interface PersistedHitlPolicy extends JsonRecord {
  id: string;
  nodeId: string;
  trigger: string;
  approverRole: string;
}

interface MutableManifest extends JsonRecord {
  status: SolutionDesignStatus;
  solutionVersion: string;
  modeling: { dimension: 'task' | 'role' | 'workflow' | 'team' };
  topologyViews: Record<
    string,
    { nodes: MutableTopologyNode[]; [key: string]: unknown }
  >;
  executionContract: JsonRecord & { hitl: PersistedHitlPolicy[] };
}

export type SolutionOutputAcceptanceErrorCode =
  | 'INVALID_REFERENCE'
  | 'DESIGN_NOT_FOUND'
  | 'INVALID_DESIGN'
  | 'NODE_NOT_FOUND'
  | 'INVALID_ROLE'
  | 'POLICY_CONFLICT'
  | 'SOLUTION_LOCKED';

export class SolutionOutputAcceptanceError extends Error {
  constructor(
    readonly code: SolutionOutputAcceptanceErrorCode,
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SolutionOutputAcceptanceError';
  }
}

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new SolutionOutputAcceptanceError(
      'INVALID_REFERENCE',
      `${field} 无效：${value}`
    );
  }
}

function assertRef(input: SolutionVersionRef): void {
  identifier(input.projectId, 'projectId');
  identifier(input.solutionId, 'solutionId');
  identifier(input.solutionVersion, 'solutionVersion');
}

function assertManifestIdentity(
  manifest: MutableManifest,
  input: SolutionVersionRef
): void {
  const storedSolutionId = manifest['solutionId'];
  if (
    typeof storedSolutionId === 'string' &&
    storedSolutionId !== input.solutionId
  ) {
    throw new SolutionOutputAcceptanceError(
      'INVALID_DESIGN',
      `方案 ID ${storedSolutionId} 与请求的 ${input.solutionId} 不一致。`
    );
  }
}

function selectedTopologyKey(
  dimension: MutableManifest['modeling']['dimension']
): 'workflow' | 'team' {
  return dimension === 'task' || dimension === 'workflow' ? 'workflow' : 'team';
}

function parseManifest(
  value: unknown,
  requestedVersion: string
): MutableManifest {
  const manifest = record(value);
  const modeling = record(manifest?.['modeling']);
  const topologyViews = record(manifest?.['topologyViews']);
  const executionContract = record(manifest?.['executionContract']);
  const status = manifest?.['status'];
  const solutionVersion = manifest?.['solutionVersion'];
  const dimension = modeling?.['dimension'];
  if (
    !manifest ||
    !MANIFEST_STATUSES.has(status as SolutionDesignStatus) ||
    typeof solutionVersion !== 'string' ||
    solutionVersion !== requestedVersion ||
    !['task', 'role', 'workflow', 'team'].includes(String(dimension)) ||
    !topologyViews ||
    !executionContract ||
    !Array.isArray(executionContract['hitl']) ||
    !executionContract['hitl'].every(isPersistedHitlPolicy)
  ) {
    throw new SolutionOutputAcceptanceError(
      'INVALID_DESIGN',
      '方案 manifest 无效或与请求版本不一致。'
    );
  }
  const topologyKey = selectedTopologyKey(
    dimension as MutableManifest['modeling']['dimension']
  );
  const topology = record(topologyViews[topologyKey]);
  if (!topology || !Array.isArray(topology['nodes'])) {
    throw new SolutionOutputAcceptanceError(
      'INVALID_DESIGN',
      `方案缺少 ${topologyKey} 拓扑。`
    );
  }
  const nodes = topology['nodes'].map((value, index) => {
    const node = record(value);
    if (
      !node ||
      typeof node['id'] !== 'string' ||
      !['agent', 'skill'].includes(String(node['type'])) ||
      typeof node['contractRef'] !== 'string'
    ) {
      throw new SolutionOutputAcceptanceError(
        'INVALID_DESIGN',
        `方案节点 topologyViews.${topologyKey}.nodes[${index}] 无效。`
      );
    }
    return node as MutableTopologyNode;
  });
  return {
    ...manifest,
    status: status as SolutionDesignStatus,
    solutionVersion,
    modeling: {
      ...modeling,
      dimension: dimension as MutableManifest['modeling']['dimension'],
    },
    topologyViews: {
      ...topologyViews,
      [topologyKey]: { ...topology, nodes },
    } as MutableManifest['topologyViews'],
    executionContract: {
      ...executionContract,
      hitl: executionContract['hitl'] as PersistedHitlPolicy[],
    },
  };
}

function parseRoles(value: unknown): SolutionOutputAcceptanceRole[] {
  const agents = record(value)?.['agents'];
  if (!Array.isArray(agents)) return [];
  return agents.flatMap((value) => {
    const agent = record(value);
    const id = agent?.['id'];
    if (typeof id !== 'string' || !id.trim()) return [];
    const name = agent?.['name'];
    return [{ id, name: typeof name === 'string' && name.trim() ? name : id }];
  });
}

function isPersistedHitlPolicy(value: unknown): value is PersistedHitlPolicy {
  const policy = record(value);
  return Boolean(
    policy &&
    typeof policy['id'] === 'string' &&
    typeof policy['nodeId'] === 'string' &&
    typeof policy['trigger'] === 'string' &&
    Boolean(policy['trigger']) &&
    typeof policy['approverRole'] === 'string'
  );
}

function isOutputAcceptancePolicy(
  policy: PersistedHitlPolicy
): policy is PersistedHitlPolicy & HitlPolicy {
  return policy.trigger === 'after_verification';
}

function policyForNode(
  manifest: MutableManifest,
  node: MutableTopologyNode
): HitlPolicy | undefined {
  if (node.hitlPolicyId) {
    const referenced = manifest.executionContract.hitl.find(
      (policy) => policy.id === node.hitlPolicyId
    );
    if (!referenced || referenced.nodeId !== node.id) {
      throw new SolutionOutputAcceptanceError(
        'POLICY_CONFLICT',
        `节点「${node.id}」引用的 HITL 策略不存在或属于其他节点。`
      );
    }
  }
  const matching = manifest.executionContract.hitl.filter(
    (policy): policy is PersistedHitlPolicy & HitlPolicy =>
      policy.nodeId === node.id && isOutputAcceptancePolicy(policy)
  );
  if (matching.length > 1) {
    throw new SolutionOutputAcceptanceError(
      'POLICY_CONFLICT',
      `节点「${node.id}」存在多个产出验收策略，请先修复方案契约。`
    );
  }
  const policy = matching[0];
  if (node.hitlPolicyId && policy && node.hitlPolicyId !== policy.id) {
    throw new SolutionOutputAcceptanceError(
      'POLICY_CONFLICT',
      `节点「${node.id}」引用的验收策略与 after_verification 策略不一致。`
    );
  }
  return policy;
}

function acceptanceFor(
  manifest: MutableManifest,
  node: MutableTopologyNode
): Pick<SolutionNodeOutputAcceptance, 'mode' | 'approverRole'> {
  const policy = policyForNode(manifest, node);
  if (!policy) return { mode: 'automatic' };
  return policy.approverRole === 'user'
    ? { mode: 'user' }
    : { mode: 'role', approverRole: policy.approverRole };
}

function topologyNodes(manifest: MutableManifest): MutableTopologyNode[] {
  const key = selectedTopologyKey(manifest.modeling.dimension);
  return manifest.topologyViews[key]!.nodes;
}

export class SolutionOutputAcceptanceService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dataRoot = getDataRoot()) {}

  async load(
    input: SolutionVersionRef
  ): Promise<SolutionOutputAcceptanceSnapshot | null> {
    assertRef(input);
    const manifestPath = this.manifestPath(input);
    const manifestValue = await this.readJson(manifestPath);
    if (!manifestValue) return null;
    const manifest = parseManifest(manifestValue, input.solutionVersion);
    assertManifestIdentity(manifest, input);
    const roles = parseRoles(
      await this.readJson(path.join(path.dirname(manifestPath), 'agents.json'))
    );
    const published = await this.isPublished(input);
    const roleNames = new Map(roles.map((role) => [role.id, role.name]));
    const nodes: SolutionOutputAcceptanceNode[] = topologyNodes(manifest).map(
      (node) => ({
        nodeId: node.id,
        kind: node.type,
        contractRef: node.contractRef,
        name: roleNames.get(node.contractRef) ?? node.contractRef,
        ...acceptanceFor(manifest, node),
      })
    );
    return {
      ...input,
      status: manifest.status,
      locked: manifest.status === 'confirmed' || published,
      published,
      nodes,
      roles,
    };
  }

  async save(
    input: SaveSolutionOutputAcceptanceInput
  ): Promise<SolutionOutputAcceptanceSnapshot> {
    assertRef(input);
    const manifestPath = this.manifestPath(input);
    return this.enqueue(manifestPath, async () => {
      const manifestValue = await this.readJson(manifestPath);
      if (!manifestValue) {
        throw new SolutionOutputAcceptanceError(
          'DESIGN_NOT_FOUND',
          `未找到方案版本 ${input.solutionVersion}。`
        );
      }
      const manifest = parseManifest(manifestValue, input.solutionVersion);
      assertManifestIdentity(manifest, input);
      const published = await this.isPublished(input);
      if (manifest.status === 'confirmed' || published) {
        throw new SolutionOutputAcceptanceError(
          'SOLUTION_LOCKED',
          '已确认或已发布的方案不能修改产出验收策略，请创建新的方案版本。'
        );
      }
      const roles = parseRoles(
        await this.readJson(
          path.join(path.dirname(manifestPath), 'agents.json')
        )
      );
      this.apply(manifest, input.nodes, new Set(roles.map(({ id }) => id)));
      await this.writeJsonAtomic(manifestPath, manifest);
      const snapshot = await this.load(input);
      if (!snapshot) {
        throw new SolutionOutputAcceptanceError(
          'DESIGN_NOT_FOUND',
          `保存后无法读取方案版本 ${input.solutionVersion}。`
        );
      }
      return snapshot;
    });
  }

  private apply(
    manifest: MutableManifest,
    requested: readonly SolutionNodeOutputAcceptance[],
    validRoles: ReadonlySet<string>
  ): void {
    const nodes = topologyNodes(manifest);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const requestById = new Map<string, SolutionNodeOutputAcceptance>();
    for (const item of requested) {
      if (requestById.has(item.nodeId)) {
        throw new SolutionOutputAcceptanceError(
          'INVALID_DESIGN',
          `节点「${item.nodeId}」重复配置。`
        );
      }
      if (!nodeById.has(item.nodeId)) {
        throw new SolutionOutputAcceptanceError(
          'NODE_NOT_FOUND',
          `未找到待配置节点「${item.nodeId}」。`
        );
      }
      if (!['automatic', 'user', 'role'].includes(item.mode)) {
        throw new SolutionOutputAcceptanceError(
          'INVALID_DESIGN',
          `节点「${item.nodeId}」的产出验收方式无效。`
        );
      }
      if (
        item.mode === 'role' &&
        (!item.approverRole ||
          item.approverRole === 'user' ||
          !validRoles.has(item.approverRole))
      ) {
        throw new SolutionOutputAcceptanceError(
          'INVALID_ROLE',
          `节点「${item.nodeId}」必须选择方案中有效的验收角色。`
        );
      }
      requestById.set(item.nodeId, item);
    }
    if (requestById.size !== nodes.length) {
      const missing = nodes.find((node) => !requestById.has(node.id));
      throw new SolutionOutputAcceptanceError(
        'INVALID_DESIGN',
        `节点「${missing?.id ?? '未知'}」缺少产出验收配置。`
      );
    }

    const managedPolicyIds = new Set<string>();
    const managedPolicyIdByNode = new Map<string, string>();
    for (const node of nodes) {
      const existing = policyForNode(manifest, node);
      if (existing) {
        managedPolicyIds.add(existing.id);
        managedPolicyIdByNode.set(node.id, existing.id);
      }
    }
    manifest.executionContract.hitl = manifest.executionContract.hitl.filter(
      (policy) => !managedPolicyIds.has(policy.id)
    );

    for (const node of nodes) {
      const item = requestById.get(node.id)!;
      if (item.mode === 'automatic') {
        if (node.hitlPolicyId && managedPolicyIds.has(node.hitlPolicyId)) {
          delete node.hitlPolicyId;
        }
        continue;
      }
      const policyId =
        managedPolicyIdByNode.get(node.id) ?? `output-acceptance-${node.id}`;
      if (
        manifest.executionContract.hitl.some((policy) => policy.id === policyId)
      ) {
        throw new SolutionOutputAcceptanceError(
          'POLICY_CONFLICT',
          `节点「${node.id}」生成的验收策略 ID 与其他节点冲突。`
        );
      }
      node.hitlPolicyId = policyId;
      manifest.executionContract.hitl.push({
        id: policyId,
        nodeId: node.id,
        trigger: 'after_verification',
        approverRole: item.mode === 'user' ? 'user' : item.approverRole!,
      });
    }
  }

  private async readJson(filePath: string): Promise<unknown | null> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async writeJsonAtomic(
    filePath: string,
    value: unknown
  ): Promise<void> {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    const previous = await fs.stat(filePath);
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: previous.mode,
    });
    try {
      await fs.rename(temporary, filePath);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }

  private async isPublished(input: SolutionVersionRef): Promise<boolean> {
    try {
      await fs.access(this.contractPath(input));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private manifestPath(input: SolutionVersionRef): string {
    return path.join(
      this.dataRoot,
      'projects',
      input.projectId,
      'solutions',
      input.solutionVersion,
      'manifest.json'
    );
  }

  private contractPath(input: SolutionVersionRef): string {
    return path.join(
      this.dataRoot,
      'projects',
      input.projectId,
      'solutions',
      'contracts',
      `${input.solutionId}-${input.solutionVersion}-contract.json`
    );
  }

  private async enqueue<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const queued =
      this.queues.get(key)?.then(operation, operation) ?? operation();
    this.queues.set(key, queued);
    try {
      return await queued;
    } finally {
      if (this.queues.get(key) === queued) this.queues.delete(key);
    }
  }
}
