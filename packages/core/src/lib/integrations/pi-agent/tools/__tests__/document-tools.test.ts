import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import os from 'os';
import { getToolContextManager } from '../context';
import { documentTools } from '../../../../features/agent/tools/document-tools';

function tempDir(): string {
	return join(os.tmpdir(), `originos-document-tools-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function getTool(name: string) {
	const tool = documentTools.find((candidate) => candidate.name === name);
	if (!tool) throw new Error(`Tool not found: ${name}`);
	return tool;
}

describe('document tools', () => {
	let dir: string;

	beforeEach(() => {
		dir = tempDir();
		mkdirSync(dir, { recursive: true });
		getToolContextManager().setDefaultContext({ workingDirectory: dir });
	});

	afterEach(() => {
		getToolContextManager().setDefaultContext({});
		if (existsSync(dir)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('reads markdown documents with cursor pagination', async () => {
		writeFileSync(join(dir, 'sample.md'), '# Title\n\nParagraph one\n\n## Section\n\nParagraph two');

		const result = await getTool('read_document').execute('call-1', {
			filePath: 'sample.md',
			limit: 20,
		});

		expect(result.content[0]?.type).toBe('text');
		expect(result.details).toMatchObject({
			extension: '.md',
			returnedChars: 20,
			truncated: true,
			nextCursor: '20',
			tablesCount: 0,
		});
	});

	it('reads csv files as spreadsheets with row pagination', async () => {
		writeFileSync(join(dir, 'table.csv'), 'name,value\na,1\nb,2\nc,3');

		const result = await getTool('read_spreadsheet').execute('call-2', {
			filePath: 'table.csv',
			limit: 2,
		});

		expect(result.content[0]?.type).toBe('text');
		expect((result.content[0] as { text: string }).text).toContain('name\tvalue');
		expect(result.details).toMatchObject({
			extension: '.csv',
			sheetName: 'table',
			rowCount: 4,
			columnCount: 2,
			returnedRows: 2,
			truncated: true,
			nextCursor: '2',
		});
	});

	it('lists csv structure without returning full content', async () => {
		writeFileSync(join(dir, 'table.csv'), 'name,value\na,1\nb,2');

		const result = await getTool('list_document_structure').execute('call-3', {
			filePath: 'table.csv',
		});

		expect((result.content[0] as { text: string }).text).toContain('工作表数量: 1');
		expect(result.details).toMatchObject({
			kind: 'workbook',
			sheets: [{ name: 'table', rowCount: 3, columnCount: 2, mergesCount: 0 }],
		});
	});

	it('extracts csv tables', async () => {
		writeFileSync(join(dir, 'table.csv'), 'name,value\na,1\nb,2');

		const result = await getTool('extract_document_tables').execute('call-4', {
			filePath: 'table.csv',
			limit: 2,
		});

		expect((result.content[0] as { text: string }).text).toContain('## table');
		expect(result.details).toMatchObject({
			tablesCount: 1,
			truncatedTables: ['table'],
		});
	});

	it('rejects paths escaping the working directory boundary', async () => {
		const result = await getTool('read_document').execute('call-5', {
			filePath: '../outside.md',
		});

		expect((result.content[0] as { text: string }).text).toContain('escapes working directory boundary');
		expect(result.details).toMatchObject({ error: true });
	});
});

