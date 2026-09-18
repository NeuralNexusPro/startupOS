#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const qiniu = require('qiniu');
const { execFileSync } = require('node:child_process');
const { buildReleaseNotes } = require('./release-notes');
const { planQiniuRetention } = require('./qiniu-retention');

const repoRoot = path.resolve(__dirname, '../../..');
const desktopRoot = path.resolve(__dirname, '..');
const desktopPackage = require('../package.json');
const version = desktopPackage.version;
const releaseDir = path.join(repoRoot, 'release');
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

function hasReleasePackage(fileName) {
  const filePath = path.join(releaseDir, fileName);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  return fs.statSync(filePath).size >= MIN_RELEASE_PACKAGE_BYTES;
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function sha512Base64Buffer(buffer) {
  const hash = crypto.createHash('sha512');
  hash.update(buffer);
  return hash.digest('base64');
}

function verifyMacSigning() {
  execFileSync(process.execPath, [path.join(__dirname, 'verify-mac-signing.js')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '',
    },
  });
}

function verifyWindowsPackage() {
  execFileSync(process.execPath, [path.join(__dirname, 'verify-windows-package.js')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '',
    },
  });
}

function generateUpdateMetadataFiles() {
  execFileSync(process.execPath, [path.join(__dirname, 'generate-update-metadata.js')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '',
    },
  });
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

function listObjects(bucketManager, bucket, prefix) {
  return new Promise((resolve, reject) => {
    const items = [];
    let marker;

    const nextPage = () => {
      bucketManager.listPrefix(bucket, {
        prefix: prefix ? `${prefix}/` : '',
        marker,
        limit: 1000,
      }, (error, body, info) => {
        if (error) {
          reject(error);
          return;
        }
        if (info.statusCode !== 200) {
          reject(new Error(
            `Qiniu list failed: prefix=${prefix} status=${info.statusCode} body=${JSON.stringify(body)}`,
          ));
          return;
        }

        items.push(...(Array.isArray(body.items) ? body.items : []));
        if (!body.marker) {
          resolve(items);
          return;
        }
        if (body.marker === marker) {
          reject(new Error(`Qiniu list returned a repeated marker for prefix: ${prefix}`));
          return;
        }
        marker = body.marker;
        nextPage();
      });
    };

    nextPage();
  });
}

function deleteObject(bucketManager, bucket, key) {
  return new Promise((resolve, reject) => {
    bucketManager.delete(bucket, key, (error, body, info) => {
      if (error) {
        reject(error);
        return;
      }
      if (info.statusCode === 200 || info.statusCode === 612) {
        resolve();
        return;
      }
      reject(new Error(
        `Qiniu delete failed: key=${key} status=${info.statusCode} body=${JSON.stringify(body)}`,
      ));
    });
  });
}

async function cleanupOldReleases(bucketManager, bucket, prefix) {
  const retainCount = Number.parseInt(process.env.QINIU_RETAIN_VERSIONS || '10', 10);
  const dryRun = process.env.QINIU_RETENTION_DRY_RUN === '1';
  const items = await listObjects(bucketManager, bucket, prefix);
  const plan = planQiniuRetention(items, { prefix, retainCount });

  console.log('[publish-qiniu-updates] retention plan', {
    retainCount,
    dryRun,
    recognizedArtifactCount: plan.recognizedArtifactCount,
    retainedVersions: plan.retainedVersions,
    deletedVersions: plan.deletedVersions,
    deletedObjectCount: plan.deletedKeys.length,
  });

  if (dryRun || plan.deletedKeys.length === 0) {
    return plan;
  }

  const concurrency = 10;
  for (let index = 0; index < plan.deletedKeys.length; index += concurrency) {
    const keys = plan.deletedKeys.slice(index, index + concurrency);
    await Promise.all(keys.map(async (key) => {
      console.log(`[publish-qiniu-updates] deleting old release artifact ${key}`);
      await deleteObject(bucketManager, bucket, key);
    }));
  }

  console.log('[publish-qiniu-updates] retention cleanup completed', {
    deletedVersions: plan.deletedVersions,
    deletedObjectCount: plan.deletedKeys.length,
  });
  return plan;
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

    // 设置 cache-control
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

function refreshCdnUrls(cdnManager, urls) {
  if (!urls.length) return Promise.resolve();

  return new Promise((resolve, reject) => {
    cdnManager.refreshUrls(urls, (error, body, info) => {
      if (error) {
        reject(error);
        return;
      }
      if (info.statusCode >= 200 && info.statusCode < 300) {
        resolve(body);
        return;
      }
      reject(new Error(`Qiniu CDN refresh failed: status=${info.statusCode} body=${JSON.stringify(body)}`));
    });
  });
}

function isMetadataArtifact(fileName) {
  return fileName.endsWith('.yml') || fileName.endsWith('.yaml');
}

function buildArtifacts(metadataFiles, metadataOnly, force) {
  const files = [];
  const pushArtifact = (fileName, overwrite = force) => {
    const filePath = path.join(releaseDir, fileName);
    files.push({
      fileName,
      filePath,
      overwrite,
      size: fs.existsSync(filePath) ? fs.statSync(filePath).size : null,
      sha512: fs.existsSync(filePath) ? sha512Base64(filePath) : null,
    });
  };
  const pushOptionalArtifact = (fileName, overwrite = force) => {
    if (fs.existsSync(path.join(releaseDir, fileName))) {
      pushArtifact(fileName, overwrite);
    }
  };

  if (!metadataOnly) {
    // macOS 版本
    for (const arch of ['arm64', 'x64']) {
      const dmg = `OriginOS CE-${version}-${arch}.dmg`;
      if (hasReleasePackage(dmg)) {
        pushArtifact(dmg);
        pushOptionalArtifact(`${dmg}.blockmap`);

        // ZIP 格式（electron-updater 自动更新需要）。macOS x64 zip 与
        // Windows zip 文件名相同，只有对应 dmg 存在时才归类为 macOS。
        const zip = `OriginOS CE-${version}-${arch}.zip`;
        if (hasReleasePackage(zip)) {
          pushArtifact(zip);
          pushOptionalArtifact(`${zip}.blockmap`);
        }
      }
    }

    // Windows 版本
    const exe = `OriginOS CE-${version}-x64.exe`;
    if (hasReleasePackage(exe)) {
      pushArtifact(exe);
      pushOptionalArtifact(`${exe}.blockmap`);
    }

  }

  // 添加元数据文件
  for (const metadataFile of metadataFiles) {
    const metadataName = path.basename(metadataFile);
    pushArtifact(metadataName, true);

    // 添加 stable 版本
    const stableName = metadataName.replace('latest-', 'stable-');
    if (stableName !== metadataName) {
      pushArtifact(stableName, true);
    }

    if (metadataName === 'latest-win.yml') {
      pushArtifact('latest.yml', true);
      pushArtifact('stable.yml', true);
    }
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

  const retries = Number.parseInt(process.env.QINIU_CDN_VERIFY_RETRIES || '6', 10);
  const retryDelayMs = Number.parseInt(process.env.QINIU_CDN_VERIFY_RETRY_DELAY_MS || '10000', 10);
  let lastError = null;

  for (let attempt = 1; attempt <= Math.max(1, retries); attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`CDN verification failed: ${response.status} ${url}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      console.warn(
        `[publish-qiniu-updates] release URL verification attempt ${attempt}/${retries} failed: ${
          error instanceof Error ? error.message : error
        }; retrying in ${retryDelayMs}ms`,
      );
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchRemoteBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CDN verification failed: ${response.status} ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function verifyCdnArtifact(url, artifact, options = {}) {
  if (!url) return;

  const expectedSize = fs.statSync(artifact.filePath).size;
  const expectedSha512 = sha512Base64(artifact.filePath);
  const retries = Number.parseInt(process.env.QINIU_CDN_VERIFY_RETRIES || '6', 10);
  const retryDelayMs = Number.parseInt(process.env.QINIU_CDN_VERIFY_RETRY_DELAY_MS || '10000', 10);
  const attempts = Math.max(1, options.retries ?? retries);

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const buffer = await fetchRemoteBuffer(url);
      const actualSize = buffer.length;
      const actualSha512 = sha512Base64Buffer(buffer);

      if (actualSize !== expectedSize) {
        throw new Error(
          `CDN size mismatch for ${artifact.fileName}: expected=${expectedSize} actual=${actualSize} url=${url}`,
        );
      }
      if (actualSha512 !== expectedSha512) {
        throw new Error(
          `CDN sha512 mismatch for ${artifact.fileName}: expected=${expectedSha512} actual=${actualSha512} url=${url}`,
        );
      }

      console.log(`[publish-qiniu-updates] verified remote sha512 ${artifact.fileName}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      console.warn(
        `[publish-qiniu-updates] remote verification attempt ${attempt}/${attempts} failed for ${artifact.fileName}: ${
          error instanceof Error ? error.message : error
        }; retrying in ${retryDelayMs}ms`,
      );
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

async function main() {
  const accessKey = requiredEnv('QINIU_ACCESS_KEY', 'QINIU_AK');
  const secretKey = requiredEnv('QINIU_SECRET_KEY', 'QINIU_AS');
  const bucket = requiredEnv('QINIU_BUCKET');
  const prefix = normalizePrefix(process.env.QINIU_PREFIX);
  const region = process.env.QINIU_REGION || 'z0';
  const baseUrl = process.env.ORIGINOS_UPDATE_BASE_URL;
  const skipCdnVerify = process.env.QINIU_SKIP_CDN_VERIFY === '1';
  const metadataOnly = process.env.QINIU_METADATA_ONLY === '1';
  const force = process.env.QINIU_FORCE === '1';
  const resumeExisting = process.env.QINIU_RESUME_EXISTING === '1';
  const skipLocalPackageVerify = process.env.QINIU_SKIP_LOCAL_PACKAGE_VERIFY === '1';
  const retentionOnly = process.argv.includes('--retention-only');

  const config = new qiniu.conf.Config();
  config.regionsProvider = qiniu.httpc.Region.fromRegionId(region);
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const bucketManager = new qiniu.rs.BucketManager(mac, config);
  const cdnManager = new qiniu.cdn.CdnManager(mac);

  if (retentionOnly) {
    await cleanupOldReleases(bucketManager, bucket, prefix);
    return;
  }

  // 检测有哪些平台的构建产物
  const hasMacArm64 = hasReleasePackage(`OriginOS CE-${version}-arm64.dmg`);
  const hasMacX64 = hasReleasePackage(`OriginOS CE-${version}-x64.dmg`);
  const hasMacUpdateMetadata =
    hasMacArm64 &&
    hasMacX64 &&
    hasReleasePackage(`OriginOS CE-${version}-arm64.zip`) &&
    hasReleasePackage(`OriginOS CE-${version}-x64.zip`);
  const hasWinExe = hasReleasePackage(`OriginOS CE-${version}-x64.exe`);

  console.log('[publish-qiniu-updates] generating update metadata');
  generateUpdateMetadataFiles();

  const metadataFiles = [
    hasMacUpdateMetadata ? path.join(releaseDir, 'latest-mac.yml') : null,
    hasWinExe ? path.join(releaseDir, 'latest-win.yml') : null,
  ].filter(Boolean);

  const artifacts = buildArtifacts(metadataFiles, metadataOnly, force);

  for (const artifact of artifacts) {
    assertFile(artifact.filePath);
  }

  if (!metadataOnly && !skipLocalPackageVerify) {
    if (hasMacArm64 || hasMacX64) {
      verifyMacSigning();
    }
    if (hasWinExe) {
      verifyWindowsPackage();
    }
  }

  console.log('[publish-qiniu-updates] release', {
    version,
    bucket,
    prefix,
    region,
    baseUrl: baseUrl || null,
    metadataOnly,
    force,
    resumeExisting,
    skipLocalPackageVerify,
    platforms: {
      mac: hasMacArm64 || hasMacX64,
      windows: hasWinExe,
    },
  });

  // Upload immutable artifacts first. The update metadata is uploaded last so
  // clients never see a new version before its packages are available.
  for (const artifact of artifacts) {
    const key = remoteKey(prefix, artifact.fileName);
    if (!artifact.overwrite) {
      const stat = await statObject(bucketManager, bucket, key);
      if (stat.exists) {
        if (resumeExisting) {
          console.log(`[publish-qiniu-updates] skipping existing ${key}`);
          continue;
        }
        throw new Error(`Refusing to overwrite existing release artifact: ${key}`);
      }
    } else if (force) {
      console.log(`[publish-qiniu-updates] force mode: will overwrite ${key}`);
    }

    console.log(`[publish-qiniu-updates] uploading ${artifact.fileName} -> ${key}`);
    // 为元数据文件设置较短的 cache-control
    const isMetadata = isMetadataArtifact(artifact.fileName);
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
    if (url && !skipCdnVerify && process.env.QINIU_SKIP_CDN_REFRESH !== '1') {
      try {
        console.log(`[publish-qiniu-updates] refreshing CDN ${url}`);
        await refreshCdnUrls(cdnManager, [url]);
      } catch (error) {
        console.warn(
          `[publish-qiniu-updates] CDN refresh failed for ${url}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    if (url && !skipCdnVerify) {
      console.log(`[publish-qiniu-updates] verifying ${url}`);
      await verifyCdnArtifact(url, artifact, isMetadata ? { retries: 12 } : undefined);
    }
  }

  // Notify the official website release service only after package URLs are reachable.
  await notifyReleaseService(version, baseUrl, prefix, { skipCdnVerify });

  if (!metadataOnly && process.env.QINIU_SKIP_RETENTION_CLEANUP !== '1') {
    await cleanupOldReleases(bucketManager, bucket, prefix);
  }

  console.log('[publish-qiniu-updates] published successfully');
}

function appendDownloadUrl(releaseData, fieldName, cdnBase, fileName) {
  if (!hasReleasePackage(fileName)) {
    return false;
  }

  releaseData[fieldName] = new URL(fileName, cdnBase).toString();
  return true;
}

function requireDownloadUrl(releaseData, fieldName, cdnBase, fileNames) {
  const candidates = Array.isArray(fileNames) ? fileNames : [fileNames];

  for (const fileName of candidates) {
    if (appendDownloadUrl(releaseData, fieldName, cdnBase, fileName)) {
      return;
    }
  }

  throw new Error(
    `Missing release package for ${fieldName}. Expected one of: ${candidates
      .map((fileName) => path.join(releaseDir, fileName))
      .join(', ')}`
  );
}

async function notifyReleaseService(version, baseUrl, prefix, options = {}) {
  const releaseApiUrl = process.env.ORIGINOS_RELEASE_API_URL;
  const releaseApiKey = process.env.ORIGINOS_RELEASE_API_KEY;

  if (!releaseApiUrl) {
    console.log('[publish-qiniu-updates] ORIGINOS_RELEASE_API_URL not set, skipping release service notification');
    return;
  }

  if (!releaseApiKey) {
    console.warn('[publish-qiniu-updates] ORIGINOS_RELEASE_API_KEY not set, skipping release service notification');
    return;
  }

  // Build download URLs
  const cdnBase = ensureTrailingSlash(baseUrl || 'https://cdn.artseeu.cn/originos-ce/updates/stable/');
  const releaseNotes = buildReleaseNotes(version);

  const releaseData = {
    version: version,
    release_summary: releaseNotes.summary,
    release_notes: releaseNotes.markdown,
    changelog: releaseNotes,
  };

  requireDownloadUrl(releaseData, 'win_x64_url', cdnBase, [
    `OriginOS CE-${version}-x64.exe`,
    `OriginOS CE-${version}-x64.zip`,
  ]);
  requireDownloadUrl(releaseData, 'mac_arm64_url', cdnBase, `OriginOS CE-${version}-arm64.dmg`);
  requireDownloadUrl(releaseData, 'mac_x64_url', cdnBase, `OriginOS CE-${version}-x64.dmg`);

  const downloadFields = Object.entries(releaseData).filter(([key]) => key.endsWith('_url'));
  if (downloadFields.length === 0) {
    console.warn('[publish-qiniu-updates] no release packages found, skipping release service notification');
    return;
  }

  if (!options.skipCdnVerify) {
    for (const [fieldName, url] of downloadFields) {
      console.log(`[publish-qiniu-updates] verifying release package ${fieldName} ${url}`);
      await verifyCdnUrl(url);
    }
  }

  console.log('[publish-qiniu-updates] notifying release service', {
    url: releaseApiUrl,
    version: releaseData.version,
    downloadFields: downloadFields.map(([key]) => key),
    changelogItems: releaseNotes.items.length,
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
    console.log('[publish-qiniu-updates] release service notified successfully', result);
  } catch (error) {
    // Don't fail the entire publish process if release service notification fails
    console.error('[publish-qiniu-updates] failed to notify release service:', error instanceof Error ? error.message : error);
  }
}

main().catch((error) => {
  console.error('[publish-qiniu-updates] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
