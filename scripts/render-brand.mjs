// Renders the brand sources in assets/brand/ to PNG with a local headless Chrome/Edge.
// Usage: node scripts/render-brand.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
if (!browser) throw new Error('Chrome or Edge not found');

const dir = new URL('../assets/', import.meta.url);
const jobs = [
  // Chrome enforces a ~500px minimum window width, so narrow sizes render larger and scale down.
  ['brand/icon.html', 'subreddit-icon.png', 256, 256],
  ['brand/banner.html', 'subreddit-banner.png', 1920, 384],
  ['brand/icon.html', 'app-icon.png', 1024, 1024],
];

for (const [src, out, w, h] of jobs) {
  const file = fileURLToPath(new URL(out, dir));
  const scale = Math.max(1, Math.ceil(600 / w));
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${1 / scale}`,
      '--allow-file-access-from-files',
      `--window-size=${w * scale},${h * scale}`,
      '--virtual-time-budget=4000',
      `--screenshot=${file}`,
      pathToFileURL(fileURLToPath(new URL(src, dir))).href,
    ],
    { stdio: 'ignore' }
  );
  console.log(`${out} ${w}x${h} ${(statSync(file).size / 1024).toFixed(0)} KB`);
}
