#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const qiniu = require('qiniu');

const repoRoot = path.resolve(__dirname, '../../..');
const desktopRoot = path.resolve(__dirname, '..');
const desktopPackage = require('../package.json');
const version = desktopPackage.version;
const releaseDir = path.join(repoRoot, 'release');

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

function env(name, fallbackName) {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
}

function requiredEnv(name, fallbackName) {
  const value = env(name, fallbackName);
  if (!value) {
    const suffix = fallbackName ? ` or ${fallbackName}` : '';
    throw new Error(`Missing required env: ${name}${suffix}`);
  }
  return value;
}

function normalizePrefix(prefix) {
  return String(prefix || 'originos-ce/updates/stable')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function remoteKey(prefix, fileName) {
  return prefix ? `${prefix}/${fileName}` : fileName;
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing release artifact: ${filePath}`);
  }
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function generateMacUpdateMetadata() {
  const releaseDate = new Date().toISOString();
  const archOrder = ['x64', 'arm64'];
  const entries = archOrder.map((arch) => {
    const zipFileName = `OriginOS CE-${version}-${arch}.zip`;
    const zipFilePath = path.join(releaseDir, zipFileName);
    assertFile(zipFilePath);
    return {
      fileName: zipFileName,
      filePath: zipFilePath,
      size: fs.statSync(zipFilePath).size,
      sha512: sha512Base64(zipFilePath),
    };
  });
  const primary = entries[0];
  const lines = [
    `version: ${version}`,
    'files:',
    ...entries.flatMap((entry) => [
      `  - url: ${entry.fileName}`,
      `    sha512: ${entry.sha512}`,
      `    size: ${entry.size}`,
    ]),
    `path: ${primary.fileName}`,
    `sha512: ${primary.sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ];
  const metadataPath = path.join(releaseDir, 'latest-mac.yml');
  fs.writeFileSync(metadataPath, lines.join('\n'), 'utf8');
  fs.copyFileSync(metadataPath, path.join(releaseDir, 'stable-mac.yml'));
  return metadataPath;
}

function statObject(bucketManager, bucket, key) {
  return new Promise((resolve, reject) => {
    bucketManager.stat(bucket, key, (error, body, info) => {
      if (error) {
        reject(error);
        return;
      }
      if (info.statusCode === 200) {
        resolve({ exists: true, body });
        return;
      }
      if (info.statusCode === 612) {
        resolve({ exists: false });
        return;
      }
      reject(new Error(`Qiniu stat failed: ${key} status=${info.statusCode} body=${JSON.stringify(body)}`));
    });
  });
}

function uploadFile({ mac, config, bucket, key, filePath, overwrite, cacheControl }) {
  return new Promise((resolve, reject) => {
    const putPolicy = new qiniu.rs.PutPolicy({
      scope: `${bucket}:${key}`,
      insertOnly: overwrite ? 0 : 1,
    });
    const uploadToken = putPolicy.uploadToken(mac);
    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();

    if (cacheControl) {
      putExtra.customVars = { 'x-qn-meta-cache-control': cacheControl };
    }

    formUploader.putFile(uploadToken, key, filePath, putExtra, (error, body, info) => {
      if (error) {
        reject(error);
        return;
      }
      if (info.statusCode === 200) {
        resolve(body);
        return;
      }
      reject(new Error(`Qiniu upload failed: ${key} status=${info.statusCode} body=${JSON.stringify(body)}`));
    });
  });
}

function buildArtifacts(metadataFile) {
  const files = [];

  // macOS versions
  for (const arch of ['arm64', 'x64']) {
    const dmg = `OriginOS CE-${version}-${arch}.dmg`;
    files.push({
      fileName: dmg,
      filePath: path.join(releaseDir, dmg),
      overwrite: false,
    });
    files.push({
      fileName: `${dmg}.blockmap`,
      filePath: path.join(releaseDir, `${dmg}.blockmap`),
      overwrite: false,
    });

    const zip = `OriginOS CE-${version}-${arch}.zip`;
    files.push({
      fileName: zip,
      filePath: path.join(releaseDir, zip),
      overwrite: false,
    });
    files.push({
      fileName: `${zip}.blockmap`,
      filePath: path.join(releaseDir, `${zip}.blockmap`),
      overwrite: false,
    });
  }

  // Windows versions
  const exe = `OriginOS CE-${version}-x64.exe`;
  const exePath = path.join(releaseDir, exe);
  if (fs.existsSync(exePath)) {
    files.push({
      fileName: exe,
      filePath: exePath,
      overwrite: false,
    });
    files.push({
      fileName: `${exe}.blockmap`,
      filePath: path.join(releaseDir, `${exe}.blockmap`),
      overwrite: false,
    });
  }

  const zipWin = `OriginOS CE-${version}-x64.zip`;
  const zipWinPath = path.join(releaseDir, zipWin);
  if (fs.existsSync(zipWinPath)) {
    files.push({
      fileName: zipWin,
      filePath: zipWinPath,
      overwrite: false,
    });
    files.push({
      fileName: `${zipWin}.blockmap`,
      filePath: path.join(releaseDir, `${zipWin}.blockmap`),
      overwrite: false,
    });
  }

  // Metadata files
  const metadataName = path.basename(metadataFile);
  files.push({
    fileName: metadataName,
    filePath: metadataFile,
    overwrite: true,
  });

  if (metadataName !== 'latest-mac.yml') {
    files.push({
      fileName: 'latest-mac.yml',
      filePath: metadataFile,
      overwrite: true,
    });
  } else {
    files.push({
      fileName: 'stable-mac.yml',
      filePath: metadataFile,
      overwrite: true,
    });
  }

  return files;
}

function cdnUrl(baseUrl, key, prefix) {
  if (!baseUrl) return null;
  const base = ensureTrailingSlash(baseUrl);
  const relative = prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
  return new URL(relative.split('/').map(encodeURIComponent).join('/'), base).toString();
}

async function verifyCdnUrl(url) {
  if (!url) return;
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`CDN verification failed: ${response.status} ${url}`);
  }
}

async function notifyReleaseService(version, baseUrl, prefix) {
  const releaseApiUrl = process.env.ORIGINOS_RELEASE_API_URL;
  const releaseApiKey = process.env.ORIGINOS_RELEASE_API_KEY;

  if (!releaseApiUrl) {
    console.log('[publish-all-platforms] ORIGINOS_RELEASE_API_URL not set, skipping release service notification');
    return;
  }

  if (!releaseApiKey) {
    console.warn('[publish-all-platforms] ORIGINOS_RELEASE_API_KEY not set, skipping release service notification');
    return;
  }

  const cdnBase = ensureTrailingSlash(baseUrl || 'https://cdn.wolfgaze.cn/originos-ce/updates/stable/');

  const releaseData = {
    version: version,
    win_x64_url: new URL(`OriginOS CE-${version}-x64.exe`, cdnBase).toString(),
    mac_arm64_url: new URL(`OriginOS CE-${version}-arm64.dmg`, cdnBase).toString(),
    mac_x64_url: new URL(`OriginOS CE-${version}-x64.dmg`, cdnBase).toString(),
  };

  console.log('[publish-all-platforms] notifying release service', {
    url: releaseApiUrl,
    version: releaseData.version,
  });

  try {
    const response = await fetch(releaseApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': releaseApiKey,
      },
      body: JSON.stringify(releaseData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Release service returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('[publish-all-platforms] release service notified successfully', result);
  } catch (error) {
    console.error('[publish-all-platforms] failed to notify release service:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  const accessKey = requiredEnv('QINIU_ACCESS_KEY', 'QINIU_AK');
  const secretKey = requiredEnv('QINIU_SECRET_KEY', 'QINIU_AS');
  const bucket = requiredEnv('QINIU_BUCKET');
  const prefix = normalizePrefix(process.env.QINIU_PREFIX);
  const region = process.env.QINIU_REGION || 'z0';
  const baseUrl = process.env.ORIGINOS_UPDATE_BASE_URL;
  const skipCdnVerify = process.env.QINIU_SKIP_CDN_VERIFY === '1';

  const config = new qiniu.conf.Config();
  config.regionsProvider = qiniu.httpc.Region.fromRegionId(region);
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const bucketManager = new qiniu.rs.BucketManager(mac, config);

  const metadataFile = generateMacUpdateMetadata();
  const artifacts = buildArtifacts(metadataFile);

  for (const artifact of artifacts) {
    assertFile(artifact.filePath);
  }

  console.log('[publish-all-platforms] release', {
    version,
    bucket,
    prefix,
    region,
    baseUrl: baseUrl || null,
  });

  // Upload all artifacts
  for (const artifact of artifacts) {
    const key = remoteKey(prefix, artifact.fileName);
    if (!artifact.overwrite) {
      const stat = await statObject(bucketManager, bucket, key);
      if (stat.exists) {
        console.log(`[publish-all-platforms] skipping existing ${artifact.fileName}`);
        continue;
      }
    }

    console.log(`[publish-all-platforms] uploading ${artifact.fileName} -> ${key}`);
    const isMetadata = artifact.fileName.endsWith('.yml') || artifact.fileName.endsWith('.yaml');
    const cacheControl = isMetadata ? 'public, max-age=300' : undefined;
    await uploadFile({
      mac,
      config,
      bucket,
      key,
      filePath: artifact.filePath,
      overwrite: artifact.overwrite,
      cacheControl,
    });

    const url = cdnUrl(baseUrl, key, prefix);
    if (url && !skipCdnVerify) {
      console.log(`[publish-all-platforms] verifying ${url}`);
      await verifyCdnUrl(url);
    }
  }

  // Notify release service
  await notifyReleaseService(version, baseUrl, prefix);

  console.log('[publish-all-platforms] published successfully');
}

main().catch((error) => {
  console.error('[publish-all-platforms] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
