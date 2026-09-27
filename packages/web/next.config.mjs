import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@originos/core'],
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  webpack: (config, { isServer, dev }) => {
    if (dev) {
      config.cache = false;
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/data/**'],
      };
    }

    config.module.rules.push({
      test: /\.svg$/,
      type: 'asset/resource',
      generator: { filename: 'static/media/[name].[hash][ext]' },
    });

    config.resolve.alias = {
      ...config.resolve.alias,
      '@neural-nexus/neural-channel': path.resolve(__dirname, 'src/modules/neural-channel/src'),
      '@neural-nexus/view-manager': path.resolve(__dirname, 'src/modules/view-manager/src'),
      '@neural-nexus/view-reconciler': path.resolve(__dirname, 'src/modules/view-reconciler/src'),
      '@neural-nexus/mcp-in-browser': path.resolve(__dirname, 'src/modules/mcp-in-browser/src'),
    };

    config.externals = config.externals || [];
    if (!Array.isArray(config.externals)) config.externals = [config.externals];
    if (isServer) {
      // Keep Node-only adapter bundles out of Webpack's dependency parser.
      // Their upstream SDKs use runtime import expressions that Webpack cannot resolve.
      config.externals.unshift(({ request }, callback) => {
        if (request && /^@originos\/pi-agent-adapter(?:\/.*)?$/.test(request)) {
          return callback(null, 'commonjs ' + request);
        }
        callback();
      });
    }
    config.externals.push(({ request }, callback) => {
      if (request === 'onnxruntime-node') return callback(null, 'commonjs ' + request);
      callback();
    });

    // Handle node: protocol imports (e.g. node:crypto from pi-ai)
    config.externals.push(({ request }, callback) => {
      if (request && request.startsWith('node:')) return callback(null, 'commonjs ' + request);
      callback();
    });

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, net: false, tls: false, http2: false, stream: false,
        crypto: false, path: false, url: false, zlib: false,
        querystring: false, dns: false, assert: false, console: false,
        buffer: false, child_process: false,
      };
      const problematicPackages = ['undici', 'proxy-agent', '@smithy/node-http-handler', '@tootallnate/quickjs-emscripten'];
      config.externals.push(({ request }, callback) => {
        if (problematicPackages.some(pkg => request.includes(pkg))) return callback(null, 'commonjs ' + request);
        callback();
      });
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['undici', '@smithy/node-http-handler', 'proxy-agent', '@originos/pi-agent-adapter'],
    instrumentationHook: true,
    outputFileTracingRoot: path.join(__dirname, '..', '..'),
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
