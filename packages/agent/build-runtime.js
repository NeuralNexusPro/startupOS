'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');

const packageDir = __dirname;
const outdir = path.join(packageDir, 'dist');
const piTuiEntry = require.resolve('@earendil-works/pi-tui', { paths: [packageDir] });
const piTuiDistDir = path.dirname(piTuiEntry);

const external = [
  '@anthropic-ai/sdk',
  '@aws-sdk/client-bedrock-runtime',
  '@google/genai',
  '@mistralai/mistralai',
  '@opentelemetry/api',
  '@smithy/node-http-handler',
  'http-proxy-agent',
  'https-proxy-agent',
  'openai',
];

fs.mkdirSync(outdir, { recursive: true });

async function main() {
  await build({
    entryPoints: {
      index: path.join(packageDir, 'src', 'core-entry.js'),
      ai: path.join(packageDir, 'src', 'ai-entry.js'),
      goal: path.join(packageDir, 'src', 'goal-entry.js'),
      'task-runtime': path.join(packageDir, 'src', 'task-runtime', 'index.js'),
    },
    outdir,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: false,
    legalComments: 'none',
    external,
    plugins: [
      {
        name: 'goal-tui-narrow-import',
        setup(buildContext) {
          buildContext.onResolve({ filter: /^@earendil-works\/pi-tui$/ }, () => ({
            path: 'goal-tui-narrow-import',
            namespace: 'pi-agent-adapter',
          }));
          buildContext.onLoad(
            { filter: /^goal-tui-narrow-import$/, namespace: 'pi-agent-adapter' },
            () => ({
              contents: [
                `export { Text } from ${JSON.stringify(path.join(piTuiDistDir, 'components', 'text.js'))};`,
                `export { truncateToWidth } from ${JSON.stringify(path.join(piTuiDistDir, 'utils.js'))};`,
              ].join('\n'),
              loader: 'js',
              resolveDir: packageDir,
            }),
          );
        },
      },
    ],
    logLevel: 'warning',
  });

  console.log('[pi-agent-adapter] built CJS runtime bundles');
}

main().catch((error) => {
  console.error('[pi-agent-adapter] build failed', error);
  process.exitCode = 1;
});
