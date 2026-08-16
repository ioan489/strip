/**
 * scripts/clean.js
 * Cross-platform equivalent of `rm -rf dist/`
 * Works on Windows, macOS, and Linux without extra dependencies.
 */
import { rmSync, existsSync } from 'node:fs';

const targets = ['dist'];

for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`🗑  Removed ${target}/`);
  } else {
    console.log(`✓  ${target}/ already clean`);
  }
}
