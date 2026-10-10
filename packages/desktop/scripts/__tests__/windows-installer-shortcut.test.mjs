import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Windows installer shortcut policy', () => {
  it('creates or repairs the desktop shortcut after fresh installs and upgrades', () => {
    const config = YAML.parse(fs.readFileSync(path.join(packageDir, 'electron-builder.yml'), 'utf8'));
    expect(config.nsis.createDesktopShortcut).toBe('always');
    expect(config.nsis.createStartMenuShortcut).toBe(true);
  });

  it('preserves shortcuts when the exit-code-2 uninstall fallback runs', () => {
    const include = fs.readFileSync(path.join(packageDir, 'scripts', 'windows-installer.nsh'), 'utf8');
    expect(include).toContain('/S /KEEP_APP_DATA --keep-shortcuts _?=$INSTDIR');
  });
});
