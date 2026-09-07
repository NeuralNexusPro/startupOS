import { describe, expect, it } from 'vitest';

import { resolveSystemDockAction } from '../index';

describe('sense center Dock action', () => {
  it('maps the pinned application to the shared open action', () => {
    expect(resolveSystemDockAction('app-sense-center')).toEqual({ action: 'open-sense-center' });
  });
});
