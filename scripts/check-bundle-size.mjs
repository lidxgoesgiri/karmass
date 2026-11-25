// Enforces the Blueprint §1 budget: client bundle < 1.5 MB gzipped (source maps excluded: never loaded at runtime).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIR = 'dist/client';
const BUDGET = 1.5 * 1024 * 1024;
const PRECOMPRESSED = new Set(['.woff2', '.png', '.jpg', '.webp']);

const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

const sizes = files(DIR)
  .filter((p) => !p.endsWith('.map'))
  .map((p) => {
    const buf = readFileSync(p);
    return {
      p,
      gz: PRECOMPRESSED.has(extname(p))
        ? buf.length
        : gzipSync(buf, { level: 9 }).length,
    };
  });
const total = sizes.reduce((a, s) => a + s.gz, 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

sizes
  .sort((a, b) => b.gz - a.gz)
  .slice(0, 8)
  .forEach((s) => console.log(kb(s.gz).padStart(10), s.p));
console.log(`TOTAL gzipped: ${kb(total)} / budget ${kb(BUDGET)}`);
if (total > BUDGET) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}
