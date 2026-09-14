import { describe, expect, it } from 'vitest';
import { dingtalkManifest } from '../plugin';
describe('DingTalk perception plugin', () => { it('declares an isolated stream manifest', () => { expect(dingtalkManifest).toMatchObject({ id: 'originos.dingtalk', entry: '@originos/perception-plugin-dingtalk', source: 'dingtalk', transport: 'stream' }); }); });
