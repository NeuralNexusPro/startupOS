import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { parseArtifactRef } from '../composition/contract-artifact-runtime';

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

afterEach(() => {
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
});

it('maps a colon-bearing WorkItem ID to a Windows-safe artifact directory', () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

  const filePath = parseArtifactRef(
    'C:\\OriginOS\\data',
    'artifact://collaboration/smoke-project/run-1/run-1%3Aprepare/attempt-1',
  );

  expect(filePath).toContain(`run-1%3Aprepare${path.win32.sep}`);
  expect(path.win32.basename(filePath)).toBe('attempt-1.json');
  expect(filePath).toMatch(/^\\\\\?\\C:\\OriginOS\\data\\/);
  expect(filePath).not.toContain('run-1:prepare');
});
