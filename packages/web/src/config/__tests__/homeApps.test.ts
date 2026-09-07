import { describe, expect, it } from 'vitest';

import { HOME_APPS } from '../homeApps';

describe('HOME_APPS launcher entries', () => {
  it('places 创建技能 with the other creation entries', () => {
    const createRoleIndex = HOME_APPS.findIndex((app) => app.id === 'app-create-role');
    expect(HOME_APPS[createRoleIndex + 1]).toMatchObject({
      id: 'skill-creator',
      name: '创建技能',
      type: 'skill',
      skillName: 'skill-creator-app',
    });
  });

  it('places 感知与连接 immediately after 工作区 as an action', () => {
    const workspaceIndex = HOME_APPS.findIndex((app) => app.id === 'app-workspace');
    expect(HOME_APPS[workspaceIndex + 1]).toMatchObject({
      id: 'app-sense-center',
      name: '感知与连接',
      type: 'action',
      action: 'open-sense-center',
    });
  });
});
