#!/usr/bin/env node
/**
 * merge-legacy-residue.mjs — Story ONT.9 / Proposal govern-ontology-write-entrypoints (ONT9-T1-E)
 *
 * 将已 canonical 化项目的 legacy 本体残留经 CanonicalOntologyAuthoringService 并入 canonical：
 * - 概念去重键：name + type（同 domain 下）
 * - 实例去重键：conceptId + data（JSON 规范化对比）
 * - dry-run：只输出补录/跳过清单，不写入
 * - 执行：每条一个 authoring 命令（operationId 唯一、audit.source=legacy-residue、sourceRefs 指向 legacy 文件）
 * - 幂等：重跑时全部判定为已存在，零新增
 *
 * 用法：
 *   DATA_ROOT=<root> node scripts/ontology/merge-legacy-residue.mjs <projectId> [--dry-run] [--yes]
 *   --dry-run  只预览（默认在未显式 --yes 时强制 dry-run）
 *   --yes      确认执行写入（跳过交互确认）
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// 脚本在 monorepo 根运行，直接以相对路径加载 core 源码（与其他根目录脚本一致，
// 运行数据只读/经 authoring API 写入，不触碰包边界 lint 范围）。
const monorepoRootGuess = path.resolve(new URL('../..', import.meta.url).pathname);
const coreOntologyUrl = path.join(monorepoRootGuess, 'packages/core/src/lib/features/ontology/index.ts');
const require = createRequire(import.meta.url);
const { pathToFileURL } = await import('node:url');

let CanonicalOntologyAuthoringService, CanonicalOntologyStore, CANONICAL_ONTOLOGY_AUTHOR_PERMISSION, getCanonicalOntologyAuthoringRevision, projectIdFromOntologyId, getMonorepoRoot;
try {
  // 以 tsx 加载 TS 源码（仓库 dev 依赖已有 tsx；node --import tsx/esm 运行本脚本）
  const mod = await import(pathToFileURL(coreOntologyUrl).href);
  CanonicalOntologyAuthoringService = mod.CanonicalOntologyAuthoringService;
  CanonicalOntologyStore = mod.CanonicalOntologyStore;
  CANONICAL_ONTOLOGY_AUTHOR_PERMISSION = mod.CANONICAL_ONTOLOGY_AUTHOR_PERMISSION;
  getCanonicalOntologyAuthoringRevision = mod.getCanonicalOntologyAuthoringRevision;
  const configMod = await import(pathToFileURL(path.join(monorepoRootGuess, 'packages/core/src/lib/features/ontology-data-store/config.ts')).href);
  projectIdFromOntologyId = configMod.projectIdFromOntologyId;
  const pathsMod = await import(pathToFileURL(path.join(monorepoRootGuess, 'packages/core/src/lib/paths.ts')).href);
  getMonorepoRoot = pathsMod.getMonorepoRoot;
} catch (error) {
  console.error('无法加载 core 模块（需要 tsx）:', error.message);
  process.exit(2);
}

const args = process.argv.slice(2);
const projectId = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run') || !args.includes('--yes');
const confirmed = args.includes('--yes');

if (!projectId) {
  console.error('用法: node scripts/ontology/merge-legacy-residue.mjs <projectId> [--dry-run|--yes]');
  process.exit(2);
}

const monorepoRoot = getMonorepoRoot();
const dataRoot = process.env.DATA_ROOT ?? path.join(monorepoRoot, 'data');
const legacyOntologyPath = path.join(dataRoot, 'projects', projectId, 'ontology', 'ontology.json');
const legacyDataDir = path.join(dataRoot, 'projects', projectId, 'ontology', 'data');

if (!fs.existsSync(legacyOntologyPath)) {
  console.error(`legacy 本体不存在: ${legacyOntologyPath}`);
  process.exit(2);
}

const store = new CanonicalOntologyStore(dataRoot);
const stored = await store.readOntology(projectId);
if (!stored) {
  console.error(`项目 ${projectId} 尚无 canonical 快照；本脚本只处理「已 canonical + legacy 残留」场景。`);
  process.exit(2);
}
const ontology = stored.data;
const revision = getCanonicalOntologyAuthoringRevision(ontology);

// ---------- 读取 legacy ----------
const legacy = JSON.parse(fs.readFileSync(legacyOntologyPath, 'utf8'));
const legacyConcepts = legacy.concepts ?? [];
const legacyDomainName = legacy.domains?.[0]?.name ?? '';

const canonicalDomain = ontology.domains.find((d) => legacyDomainName && d.name === legacyDomainName) ?? ontology.domains[0];
if (!canonicalDomain) {
  console.error('canonical 无任何领域，无法归属残留概念。');
  process.exit(2);
}

const conceptDedupKey = (name, type) => `${name}__${type ?? ''}`;
// legacy type=entity 与 canonical type=class 语义对齐（legacy 只有 entity 概念）；
// 去重时把 legacy entity 与 canonical class 视为同类型。
const canonicalConceptKeys = new Set(
  ontology.concepts.flatMap((c) => {
    const keys = [conceptDedupKey(c.name, c.type)];
    if (c.type === 'class') keys.push(conceptDedupKey(c.name, 'entity'));
    return keys;
  })
);
function findCanonicalConcept(name, type) {
  return ontology.concepts.find(
    (c) => c.name === name && (c.type === type || (type === 'entity' && c.type === 'class'))
  );
}

// legacy 实例文件读取（data/{conceptId}/*.json，跳过 _index.json）
function readLegacyInstances() {
  const out = [];
  if (!fs.existsSync(legacyDataDir)) return out;
  for (const conceptId of fs.readdirSync(legacyDataDir)) {
    const dir = path.join(legacyDataDir, conceptId);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json') || file === '_index.json') continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        out.push({ file: path.join(dir, file), relPath: path.relative(legacyDataDir, path.join(dir, file)), instance: raw });
      } catch {
        // 不可解析文件跳过并提示
        console.warn(`  ! 无法解析（跳过）: ${file}`);
      }
    }
  }
  return out;
}

const legacyInstances = readLegacyInstances();

// legacy conceptId → canonical conceptId（按 name+type 匹配，entity↔class 语义对齐）
const conceptIdMap = new Map(); // legacyConceptId -> canonical concept
for (const lc of legacy.concepts) {
  const hit = findCanonicalConcept(lc.name, lc.type);
  if (hit) conceptIdMap.set(lc.id, hit);
}

const instanceDedupKey = (conceptId, data) => `${conceptId}__${JSON.stringify(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)))}`;
const canonicalInstanceKeys = new Set(ontology.instances.map((i) => instanceDedupKey(i.conceptId, i.data)));

// ---------- dry-run 清单 ----------
const plan = { concepts: [], instances: [], skipped: [] };

for (const lc of legacy.concepts ?? []) {
  const key = conceptDedupKey(lc.name, lc.type);
  if (canonicalConceptKeys.has(key)) {
    plan.skipped.push({ kind: 'concept', key: `${lc.name}(${lc.type})`, reason: 'canonical 已存在同名同类型概念' });
    continue;
  }
  plan.concepts.push({
    id: `concept-${crypto.randomUUID()}`,
    domainId: canonicalDomain.id,
    name: lc.name,
    type: lc.type,
    attributes: lc.attributes ?? {},
    ...(lc.description ? { description: lc.description } : {}),
    sourceRef: { path: path.relative(dataRoot, legacyOntologyPath), locator: `concepts[${lc.id}]` },
  });
}

for (const li of legacyInstances) {
  const inst = li.instance;
  const target = conceptIdMap.get(inst.conceptId);
  if (!target) {
    plan.skipped.push({ kind: 'instance', key: inst.id, reason: `legacy conceptId ${inst.conceptId} 无 canonical 对应概念` });
    continue;
  }
  const fields = inst.fields ?? {};
  const data = { ...fields };
  delete data.relations; // 关系不并入实例 data（canonical 无 instance-relation 存储）
  const key = instanceDedupKey(target.id, data);
  if (canonicalInstanceKeys.has(key)) {
    plan.skipped.push({ kind: 'instance', key: `${target.name}/${inst.id}`, reason: 'canonical 已存在同概念同 data 实例' });
    continue;
  }
  plan.instances.push({
    id: `inst-${crypto.randomUUID()}`,
    conceptId: target.id,
    data,
    sourceRefs: [{ sourceType: 'import', sourceId: 'legacy-ontology-residue', locator: path.relative(dataRoot, li.abs ?? li.file) }],
  });
}

console.log('=== 残留并入 dry-run ===');
console.log(`项目: ${projectId}`);
console.log(`canonical 领域（并入目标）: ${canonicalDomain.id} | ${canonicalDomain.name}`);
console.log(`补录概念: ${plan.concepts.length}`);
for (const c of plan.concepts) console.log(`  + concept ${c.name}(${c.type})`);
console.log(`补录实例: ${plan.instances.length}`);
for (const i of plan.instances) console.log(`  + instance ${i.conceptId} <- ${i.sourceRefs[0].locator} | ${JSON.stringify(i.data).slice(0, 80)}`);
console.log(`跳过: ${plan.skipped.length}`);
for (const s of plan.skipped) console.log(`  - [${s.kind}] ${s.key}: ${s.reason}`);

if (dryRun) {
  console.log('dry-run 结束（未写入）。执行写入请追加 --yes。');
  process.exit(0);
}

// ---------- 执行（authoring 命令） ----------
const service = new CanonicalOntologyAuthoringService();
let accepted = 0;
let failed = 0;

async function executeCommand(command) {
  const result = await service.execute(command);
  if (result.ok === true) {
    accepted += 1;
    return result.receipt;
  }
  failed += 1;
  const issues = result.issues.map((i) => `${i.code}(${i.path ?? ''}): ${i.message}`).join('; ');
  console.error(`  ✗ 命令被拒绝 [${command.type}]: ${issues}`);
  return null;
}

console.log('=== 开始并入（authoring 命令） ===');
for (const c of plan.concepts) {
  const now = new Date();
  const receipt = await executeCommand({
    type: 'concept.create',
    projectId,
    ontologyId: ontology.id,
    ontologyVersion: ontology.version,
    expectedRevision: getCanonicalOntologyAuthoringRevision((await store.readOntology(projectId)).data),
    operationId: `residue-${projectId}-concept-${c.name}-${accepted}`,
    permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION],
    audit: { source: 'legacy-residue', legacyPath: c.sourceRef.path },
    value: { id: c.id, domainId: c.domainId, name: c.name, type: c.type, attributes: c.attributes, ...(c.sourceRef ? { sourceRefs: [{ sourceType: 'import', sourceId: 'legacy-ontology-residue', locator: c.sourceRef.locator }] } : {}), createdAt: now, updatedAt: now },
  });
  console.log(`  ✓ concept ${c.name} → revision ${receipt?.summary?.revision ?? '?'}`);
}

for (const inst of plan.instances) {
  const now = new Date();
  const receipt = await executeCommand({
    type: 'instance.create',
    projectId,
    ontologyId: ontology.id,
    ontologyVersion: ontology.version,
    expectedRevision: getCanonicalOntologyAuthoringRevision((await store.readOntology(projectId)).data),
    operationId: `residue-${projectId}-instance-${inst.id}`,
    permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION],
    audit: { source: 'legacy-residue', legacyPath: inst.sourceRefs[0].locator },
    value: { id: inst.id, conceptId: inst.conceptId, data: inst.data, sourceRefs: inst.sourceRefs, createdAt: now, updatedAt: now },
  });
  console.log(`  ✓ instance ${inst.id} → revision ${receipt?.summary?.revision ?? '?'}`);
}

console.log(`=== 并入完成: accepted=${accepted} failed=${failed} ===`);
console.log('幂等验证：请再次以 --yes 运行，预期零新增（全部 skipped）。');
process.exit(failed > 0 ? 1 : 0);
