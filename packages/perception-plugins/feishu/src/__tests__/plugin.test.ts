import { describe, expect, it } from 'vitest';
import { feishuManifest } from '../plugin';
describe('Feishu perception plugin', () => { it('declares an isolated webhook manifest', () => { expect(feishuManifest).toMatchObject({ id: 'originos.feishu', entry: '@originos/perception-plugin-feishu', source: 'feishu', transport: 'webhook' }); }); });
