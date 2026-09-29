/**
 * 必须在所有其他模块之前导入。
 * 将 Electron 路径注入 @originos/core，
 * 确保 core 代码（getDataRoot / getAgentsDataDir / getMonorepoRoot 等）在打包后也能正确解析。
 */

import { app } from 'electron';
import path from 'path';
import { setElectronDataRoot, setMonorepoRoot } from '@originos/core/lib/paths';

if (app.isPackaged) {
  // 打包模式：数据目录指向用户数据目录（可写）
  const dataRoot = path.join(app.getPath('userData'), 'data');
  setElectronDataRoot(dataRoot);
  setMonorepoRoot(process.resourcesPath);
  console.log('[setup-data-root] Packaged mode → DATA_ROOT:', dataRoot, 'MONOREPO_ROOT:', process.resourcesPath);
} else {
  // 开发模式：不设置 _electronDataRoot，getDataRoot() 回退到 getMonorepoRoot()/data
  // 这样 getDataRoot() 返回项目目录的 data/，而不是 Application Support
  console.log('[setup-data-root] Dev mode → using monorepo defaults');
}
