import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	CANONICAL_ONTOLOGY_SCHEMA_VERSION,
	CanonicalOntologyStore,
	getCanonicalOntologyAuthoringRevision,
	type CanonicalOntology,
} from '../../../ontology';
import { ontologyDataTools } from '../ontology-data-tools';

const instant = new Date('2026-10-12T08:00:00.000Z');

function canonicalOntology(): CanonicalOntology {
	return {
		id: 'ontology-proj-data',
		projectId: 'proj-data',
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
		concepts: [
			{
				id: 'concept-seed',
				domainId: 'domain-seed',
				name: '订单',
				type: 'entity',
				attributes: {},
				createdAt: instant,
				updatedAt: instant,
			},
			{
				id: 'concept-people',
				domainId: 'domain-seed',
				name: '人员',
				type: 'entity',
				attributes: {},
				createdAt: instant,
				updatedAt: instant,
			},
		],
		instances: [
			{
				id: 'inst-seed-1',
				conceptId: 'concept-seed',
				data: { status: 'active', title: '种子订单', priority: 2 },
				createdAt: instant,
				updatedAt: instant,
			},
		],
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
	const tool = ontologyDataTools.find((candidate) => candidate.name === name);
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

describe('ontology data tools: instance writes go through canonical authoring', () => {
	let root: string;
	let store: CanonicalOntologyStore;
	let canonicalPath: string;
	let legacyOntologyPath: string;
	let legacyDataDir: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-ontology-data-tools-'));
		vi.stubEnv('DATA_ROOT', root);
		store = new CanonicalOntologyStore(root);
		await store.writeOntology('proj-data', canonicalOntology(), { createOnly: true });
		canonicalPath = path.join(root, 'ontology', 'proj-data-ontology.json');
		legacyOntologyPath = path.join(root, 'projects', 'proj-data', 'ontology', 'ontology.json');
		legacyDataDir = path.join(root, 'projects', 'proj-data', 'ontology', 'data');
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await fs.rm(root, { recursive: true, force: true });
	});

	it('create_instance writes a canonical instance and never touches legacy files', async () => {
		const before = await fs.readFile(canonicalPath, 'utf8');

		const payload = await runTool('create_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			fields: { title: '新订单', status: 'draft' },
		});

		expect(payload.success).toBe(true);
		const instance = payload['instance'] as { id?: string; conceptId?: string; fields?: Record<string, unknown> };
		expect(instance.conceptId).toBe('concept-seed');
		expect(instance.fields).toMatchObject({ title: '新订单', status: 'draft' });

		const loaded = (await store.readOntology('proj-data'))!.data;
		expect(loaded.instances).toHaveLength(2);
		const createdInstance = loaded.instances.find((item) => item.id === instance.id);
		expect(createdInstance).toBeDefined();
		expect(createdInstance?.data).toMatchObject({ title: '新订单', status: 'draft' });
		expect(getCanonicalOntologyAuthoringRevision(loaded)).toBe(1);

		// legacy 零触碰：ontology.json 与 data/ 目录均不存在
		await expect(fs.access(legacyOntologyPath)).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(fs.access(legacyDataDir)).rejects.toMatchObject({ code: 'ENOENT' });
		// canonical 快照确实被改写
		expect(await fs.readFile(canonicalPath, 'utf8')).not.toBe(before);

		// 审计来源标注 agent-tool
		const receipts = await store.readAuthoringReceipts('proj-data');
		expect(receipts).toHaveLength(1);
		expect(receipts[0]!.commandType).toBe('instance.create');
		expect((receipts[0]!.audit as { source?: string } | undefined)?.['source']).toBe('agent-tool');
	});

	it('create_instance passes through authoring rejection for an unknown conceptId', async () => {
		const before = await fs.readFile(canonicalPath, 'utf8');

		const payload = await runTool('create_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-missing',
			fields: { title: '孤儿实例' },
		});

		expect(payload.success).toBe(false);
		const error = payload['error'] as { code?: string; message?: string };
		expect(error?.code).toBe('MISSING_REFERENCE');
		expect(error?.message).toContain('canonical authoring');
		expect(await fs.readFile(canonicalPath, 'utf8')).toBe(before);
	});

	it('update_instance replaces data wholesale per D2 (fields merged by tool, data swapped)', async () => {
		await runTool('update_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			instanceId: 'inst-seed-1',
			fields: { status: 'archived' },
		});

		const loaded = (await store.readOntology('proj-data'))!.data;
		const updated = loaded.instances.find((item) => item.id === 'inst-seed-1');
		// 既有 data 全量保留 + 传入字段合并（工具层维持 partial update 语义，patch.data 整体替换）
		expect(updated?.data).toMatchObject({ status: 'archived', title: '种子订单', priority: 2 });
		expect(updated?.conceptId).toBe('concept-seed');
		expect(updated?.updatedAt.getTime()).toBeGreaterThan(instant.getTime());
		await expect(fs.access(legacyOntologyPath)).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('update_instance rejects moving an instance to another concept (IMMUTABLE_FIELD)', async () => {
		// 直接经 authoring 层断言不可变约束（工具不暴露 conceptId patch 入参）
		const payload = await runTool('update_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-people',
			instanceId: 'inst-seed-1',
			fields: { nickname: '迁移' },
		});

		// conceptId 不匹配 → 工具层 target not found（概念归属不可移动）
		expect(payload.success).toBe(false);
		const error = payload['error'] as { code?: string };
		expect(error?.code).toBe('AUTHORING_TARGET_NOT_FOUND');
	});

	it('delete_instance removes the canonical instance and leaves legacy untouched', async () => {
		const payload = await runTool('delete_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			instanceId: 'inst-seed-1',
		});

		expect(payload.success).toBe(true);
		const loaded = (await store.readOntology('proj-data'))!.data;
		expect(loaded.instances).toHaveLength(0);
		await expect(fs.access(legacyOntologyPath)).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(fs.access(legacyDataDir)).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('returns MIGRATION_REQUIRED for write tools when no canonical snapshot exists', async () => {
		const payload = await runTool('create_instance', {
			ontologyId: 'ontology-legacy-project',
			conceptId: 'concept-1',
			fields: { name: '遗留实例' },
		});

		expect(payload.success).toBe(false);
		expect((payload['error'] as { code?: string })?.code).toBe('MIGRATION_REQUIRED');
		// 无 canonical 快照 → 也不得静默创建 legacy 文件
		await expect(
			fs.access(path.join(root, 'projects', 'legacy-project', 'ontology', 'ontology.json'))
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('query_instances reads canonical data with filter/sort/pagination semantics', async () => {
		// 追加两个实例用于过滤/排序/分页断言
		await runTool('create_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			fields: { title: '订单A', status: 'active', priority: 1 },
		});
		await runTool('create_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			fields: { title: '订单B', status: 'archived', priority: 3 },
		});

		const payload = await runTool('query_instances', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			filters: { status: 'active' },
			sortBy: 'priority',
			sortOrder: 'asc',
			page: 1,
			limit: 10,
		});

		expect(payload.success).toBe(true);
		const result = payload['result'] as {
			items: Array<{ id: string; fields: Record<string, unknown>; conceptId: string }>;
			total: number;
			page: number;
			limit: number;
			totalPages: number;
		};
		// 种子实例(active, priority 2) + 订单A(active, priority 1)；订单B archived 被过滤
		expect(result.total).toBe(2);
		expect(result.items.map((item) => item.fields.priority)).toEqual([1, 2]);
		expect(result.items.every((item) => item.conceptId === 'concept-seed')).toBe(true);
	});

	it('get_instance reads from canonical and preserves the legacy response shape', async () => {
		const payload = await runTool('get_instance', {
			ontologyId: 'ontology-proj-data',
			conceptId: 'concept-seed',
			instanceId: 'inst-seed-1',
		});

		expect(payload.success).toBe(true);
		const instance = payload['instance'] as {
			id: string;
			conceptId: string;
			domainId: string;
			ontologyId: string;
			fields: Record<string, unknown>;
			meta: { createdAt: number; updatedAt: number };
		};
		expect(instance.id).toBe('inst-seed-1');
		expect(instance.conceptId).toBe('concept-seed');
		expect(instance.fields).toMatchObject({ title: '种子订单' });
		expect(typeof instance.meta.createdAt).toBe('number');
		expect(instance.ontologyId).toBe('ontology-proj-data');
	});
});
