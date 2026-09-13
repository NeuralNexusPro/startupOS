import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('TC12: published SDK stops CONNECTING safely and isolates old-connection ACK', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./sdk-lifecycle.cjs', import.meta.url))], { encoding: 'utf8', timeout: 5_000 });
  expect(output).toContain('PASS all lifecycle checks; mock transports only, no network');
});
