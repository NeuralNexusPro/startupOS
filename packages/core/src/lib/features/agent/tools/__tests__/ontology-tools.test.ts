import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	CANONICAL_ONTOLOGY_SCHEMA_VERSION,
	CanonicalOntologyAuthoringService,
	CanonicalOntologyStore,
	getCanonicalOntologyAuthoringRevision,
	type CanonicalOntology,
} from '../../../ontology';
import { ontologyTools } from '../ontology-tools';

const instant = new Date('2026-10-12T08:00:00.000Z');

function canonicalOntology(): CanonicalOntology {
	return {
		id: 'ontology-proj-tools',
		projectId: 'proj-tools',
		name: 'Orders',
		schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
		version: '1.0.0',
		domains: [
			{
				id: 'domain-seed',
				name: 'Sales',
				description: '',
				createdAt: instant,
				updatedAt: instant,
			},
		],
		concepts: [],
		instances: [],
		properties: [],
		relations: [],
		businessStates: [],
		transitions: [],
		factTypes: [],
		rules: [],
		actions: [],
		events: [],
		projections: [],
		createdAt: instant,
		updatedAt: instant,
	};
}

function getTool(name: string) {
	const tool = ontologyTools.find((candidate) => candidate.name === name);
	if (!tool) throw new Error(`Tool not found: ${name}`);
	return tool;
}

interface ToolPayload {
	success: boolean;
	[key: string]: unknown;
}

async function runTool(name: string, params: Record<string, unknown>): Promise<ToolPayload> {
	const tool = getTool(name);
	const result = await tool.execute(`call-${name}-${Math.random().toString(36).slice(2, 8)}`, params as never);
	const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
	return JSON.parse(text) as ToolPayload;
}

describe('ontology tools: create_domain / create_concept write canonical', () => {
	let root: string;
	let store: CanonicalOntologyStore;
	let canonicalPath: string;
	let legacyPath: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-ontology-tools-'));
		vi.stubEnv('DATA_ROOT', root);
		store = new CanonicalOntologyStore(root);
		await store.writeOntology('proj-tools', canonicalOntology(), { createOnly: true });
		canonicalPath = path.join(root, 'ontology', 'proj-tools-ontology.json');
		legacyPath = path.join(root, 'projects', 'proj-tools', 'ontology', 'ontology.json');
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await fs.rm(root, { recursive: true, force: true });
	});

	it('create_concept writes the canonical snapshot and never touches the legacy file', async () => {
		const before = await fs.readFile(canonicalPath, 'utf8');

		const payload = await runTool('create_concept', {
			ontologyId: 'ontology-proj-tools',
			domainId: 'domain-seed',
			conceptName: '订单',
			conceptType: 'entity',
			description: '客户订单',
		});

		expect(payload.success).toBe(true);
		const concept = payload['concept'] as { id?: string; name?: string } | undefined;
		expect(concept?.name).toBe('订单');

		const loaded = (await store.readOntology('proj-tools'))!.data;
		expect(loaded.concepts).toHaveLength(1);
		expect(loaded.concepts[0]).toMatchObject({
			name: '订单',
			type: 'entity',
			domainId: 'domain-seed',
			description: '客户订单',
		});
		expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(1);

		// legacy 文件保持不存在（零触碰）
		await expect(fs.access(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
		// canonical 快照确实被改写（非 before 字节）
		expect(await fs.readFile(canonicalPath, 'utf8')).not.toBe(before);
	});

	it('create_domain writes the canonical snapshot and never touches the legacy file', async () => {
		const payload = await runTool('create_domain', {
			ontologyId: 'ontology-proj-tools',
			domainName: '用户体系',
			description: '用户与权限',
		});

		expect(payload.success).toBe(true);
		const domain = payload['domain'] as { id?: string; name?: string } | undefined;
		expect(domain?.name).toBe('用户体系');

		const loaded = (await store.readOntology('proj-tools'))!.data;
		expect(loaded.domains.map((item) => item.name)).toContain('用户体系');
		expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(1);

		await expect(fs.access(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('returns MIGRATION_REQUIRED and writes nothing when no canonical snapshot exists', async () => {
		const payload = await runTool('create_concept', {
			ontologyId: 'ontology-legacy-project',
			domainId: 'domain-1',
			conceptName: '遗留概念',
			conceptType: 'entity',
		});

		expect(payload.success).toBe(false);
		const error = payload['error'] as { code?: string; message?: string };
		expect(error?.code).toBe('MIGRATION_REQUIRED');
		expect(error?.message).toContain('迁移');

		// 无 canonical 快照 → 也不得静默创建 legacy 文件
		await expect(
			fs.access(path.join(root, 'projects', 'legacy-project', 'ontology', 'ontology.json'))
		).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(store.readOntology('legacy-project')).resolves.toBeNull();

		const domainPayload = await runTool('create_domain', {
			ontologyId: 'ontology-legacy-project',
			domainName: '遗留领域',
		});
		expect(domainPayload.success).toBe(false);
		expect((domainPayload['error'] as { code?: string })?.code).toBe('MIGRATION_REQUIRED');
	});

	it('passes through authoring rejection for an unknown domainId', async () => {
		const before = await fs.readFile(canonicalPath, 'utf8');
		const receiptsBefore = await store.readAuthoringReceipts('proj-tools');

		const payload = await runTool('create_concept', {
			ontologyId: 'ontology-proj-tools',
			domainId: 'domain-missing',
			conceptName: '孤儿概念',
			conceptType: 'entity',
		});

		expect(payload.success).toBe(false);
		const error = payload['error'] as { code?: string; message?: string; details?: unknown };
		expect(error?.code).toBe('MISSING_REFERENCE');
		expect(error?.message).toContain('canonical authoring');
		expect(Array.isArray(error?.details)).toBe(true);

		// 拒绝后零写入：canonical 字节不变、无 receipt
		expect(await fs.readFile(canonicalPath, 'utf8')).toBe(before);
		expect(await store.readAuthoringReceipts('proj-tools')).toEqual(receiptsBefore);
	});

	it('retries once on REVISION_CONFLICT and succeeds with the fresh revision', async () => {
		const tool = getTool('create_concept');
		let injected = false;

		// 在工具读取 revision 之后、提交之前注入一次并发 authoring 提交（revision +1），
		// 使工具首次提交携带过期 revision → REVISION_CONFLICT → 自动重试一次。
		// 工具内部自建 CanonicalOntologyStore，因此必须 spy 原型方法。
		const originalReadOntology = CanonicalOntologyStore.prototype.readOntology;
		const spy = vi.spyOn(CanonicalOntologyStore.prototype, 'readOntology');
		spy.mockImplementation(async function (this: CanonicalOntologyStore, projectId: string) {
			const stored = await originalReadOntology.call(this, projectId);
			if (stored && !injected) {
				injected = true;
				await new CanonicalOntologyAuthoringService().execute({
					type: 'concept.create',
					projectId,
					ontologyId: stored.data.id,
					ontologyVersion: stored.data.version,
					expectedRevision: getCanonicalOntologyAuthoringRevision(stored.data),
					operationId: 'concurrent-writer',
					permissions: ['ontology:author'],
					value: {
						id: 'concept-concurrent',
						domainId: 'domain-seed',
						name: '并发概念',
						type: 'entity',
						semanticKind: 'unclassified',
						attributes: {},
						createdAt: instant,
						updatedAt: instant,
					},
				});
			}
			return stored;
		});

		const result = await tool.execute('call-cas-retry', {
			ontologyId: 'ontology-proj-tools',
			domainId: 'domain-seed',
			conceptName: '重试概念',
			conceptType: 'entity',
		} as never);

		spy.mockRestore();

		const payload = JSON.parse(
			result.content[0]?.type === 'text' ? result.content[0].text : '{}'
		) as ToolPayload;
		expect(payload.success).toBe(true);

		const loaded = (await store.readOntology('proj-tools'))!.data;
		// 一次并发写入 + 一次工具写入（冲突重试成功）
		expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(2);
		expect(loaded.concepts.map((item) => item.name)).toEqual(
			expect.arrayContaining(['并发概念', '重试概念'])
		);
	});

	it('records audit.source === agent-tool in the authoring JSONL', async () => {
		await runTool('create_domain', {
			ontologyId: 'ontology-proj-tools',
			domainName: '审计领域',
		});

		const receipts = await store.readAuthoringReceipts('proj-tools');
		expect(receipts).toHaveLength(1);
		const receipt = receipts[0]!;
		expect(receipt.commandType).toBe('domain.create');
		expect(receipt.status).toBe('accepted');
		const audit = receipt.audit as { source?: string; toolCallId?: string | null; tool?: string } | undefined;
		expect(audit?.['source']).toBe('agent-tool');
		expect(typeof audit?.['toolCallId']).toBe('string');
		expect(audit?.['tool']).toBe('create_domain');
		// operationId 派生自真实工具调用 toolCallId
		expect(receipt.operationId).toBe(`tool-${audit?.['toolCallId']}`);
	});

	it('same toolCallId replay with mutated command payload maps OPERATION_CONFLICT', async () => {
		const tool = getTool('create_concept');
		const params = {
			ontologyId: 'ontology-proj-tools',
			domainId: 'domain-seed',
			conceptName: '幂等概念',
			conceptType: 'entity',
		} as never;

		const first = await tool.execute('call-idempotent', params);
		const firstPayload = JSON.parse(
			first.content[0]?.type === 'text' ? first.content[0].text : '{}'
		) as ToolPayload;
		expect(firstPayload.success).toBe(true);

		// 重放同一 toolCallId：operationId 相同，但 value 内的时间戳重新生成 →
		// commandHash 变化 → authoring 返回 OPERATION_CONFLICT（工具层结构化透传）。
		const second = await tool.execute('call-idempotent', params);
		const secondPayload = JSON.parse(
			second.content[0]?.type === 'text' ? second.content[0].text : '{}'
		) as ToolPayload;
		expect(secondPayload.success).toBe(false);
		expect((secondPayload['error'] as { code?: string })?.code).toBe('OPERATION_CONFLICT');

		// 重放不产生第二个概念、revision 不再递增
		const loaded = (await store.readOntology('proj-tools'))!.data;
		expect(loaded.concepts.filter((item) => item.name === '幂等概念')).toHaveLength(1);
		expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(1);
		expect(await store.readAuthoringReceipts('proj-tools')).toHaveLength(1);
	});
});
