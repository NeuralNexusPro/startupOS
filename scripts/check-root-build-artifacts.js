#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const forbiddenFilePatterns = [
  /\.js$/,
  /\.cjs$/,
  /\.mjs$/,
  /\.d\.ts$/,
  /\.d\.ts\.map$/,
  /\.js\.map$/,
  /\.tsbuildinfo$/,
];

const allowedRootFiles = new Set(["postcss.config.mjs", ".eslintrc.cjs"]);

const offenders = fs
  .readdirSync(repoRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => forbiddenFilePatterns.some((pattern) => pattern.test(name)))
  .filter((name) => !allowedRootFiles.has(name))
  .sort();

if (offenders.length > 0) {
  console.error("[check-root-build-artifacts] unexpected generated files in repo root:");
  for (const offender of offenders) {
    console.error(`  - ${offender}`);
  }
  console.error(
    "Build outputs must stay in dist/, dist-electron/, release/, .next/, or package-scoped output directories.",
  );
  process.exit(1);
}

console.log("[check-root-build-artifacts] repo root clean");
