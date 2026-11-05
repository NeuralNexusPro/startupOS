#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { buildReleaseNotes } = require('./release-notes');

const repoRoot = path.resolve(__dirname, '../../..');
const desktopRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(repoRoot, 'release');
const desktopPackage = require('../package.json');
const version = desktopPackage.version;
const MIN_RELEASE_PACKAGE_BYTES = 1024 * 1024;

function loadEnvFiles() {
  const envFiles = [
    path.join(desktopRoot, '.env.local'),
    path.join(desktopRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env'),
  ];

  for (const filePath of envFiles) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles();

const baseUrl = process.env.ORIGINOS_UPDATE_BASE_URL || 'https://cdn.wolfgaze.cn/originos-ce/updates/stable/';
const cdnBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
const releaseNotes = buildReleaseNotes(version);

const releaseData = {
  version: version,
  release_summary: releaseNotes.summary,
  release_notes: releaseNotes.markdown,
  changelog: releaseNotes,
};

function appendDownloadUrl(fieldName, fileNames) {
  const candidates = Array.isArray(fileNames) ? fileNames : [fileNames];

  for (const fileName of candidates) {
    const filePath = path.join(releaseDir, fileName);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size >= MIN_RELEASE_PACKAGE_BYTES) {
      releaseData[fieldName] = new URL(fileName, cdnBase).toString();
      return;
    }
  }

  throw new Error(
    `Missing release package for ${fieldName}. Expected one of: ${candidates
      .map((fileName) => path.join(releaseDir, fileName))
      .join(', ')}`
  );
}

async function verifyCdnUrl(fieldName, url) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`CDN verification failed for ${fieldName}: ${response.status} ${url}`);
  }
}

const releaseApiUrl = process.env.ORIGINOS_RELEASE_API_URL;
const releaseApiKey = process.env.ORIGINOS_RELEASE_API_KEY;

if (!releaseApiUrl) {
  console.error('Error: ORIGINOS_RELEASE_API_URL not set');
  process.exit(1);
}

if (!releaseApiKey) {
  console.error('Error: ORIGINOS_RELEASE_API_KEY not set');
  process.exit(1);
}

async function main() {
  appendDownloadUrl('win_x64_url', [
    `OriginOS CE-${version}-x64.exe`,
    `OriginOS CE-${version}-x64.zip`,
  ]);
  appendDownloadUrl('mac_arm64_url', `OriginOS CE-${version}-arm64.dmg`);
  appendDownloadUrl('mac_x64_url', `OriginOS CE-${version}-x64.dmg`);

  const downloadFields = Object.entries(releaseData).filter(([key]) => key.endsWith('_url'));
  for (const [fieldName, url] of downloadFields) {
    console.log(`Verifying ${fieldName}: ${url}`);
    await verifyCdnUrl(fieldName, url);
  }

  console.log('Release data:', JSON.stringify(releaseData, null, 2));
  console.log(`Changelog items: ${releaseNotes.items.length}`);
  console.log(`\nNotifying release service: ${releaseApiUrl}`);

  const response = await fetch(releaseApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': releaseApiKey,
    },
    body: JSON.stringify(releaseData),
  });

    const text = await response.text();
    console.log(`Response status: ${response.status}`);

    if (response.ok) {
      console.log('✅ Release service notified successfully');
      try {
        console.log('Response:', JSON.parse(text));
      } catch {
        console.log('Response:', text);
      }
    } else {
      console.error('❌ Failed to notify release service');
      console.error('Response:', text.substring(0, 500));
      process.exitCode = 1;
    }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exitCode = 1;
});
