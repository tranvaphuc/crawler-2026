/**
 * Gọi script Python facebook-scraper từ Node (child_process).
 *
 * Yêu cầu: pip install facebook-scraper
 *
 * Chạy:
 *   node test/run-fb-scraper.js
 *   node test/run-fb-scraper.js --page-id 542674398935650 --year 2026
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PY_SCRIPT = path.join(__dirname, 'get-page-posts-2026-no-api.py');

const defaultOptions = {
  pageId: '542674398935650',
  year: 2026,
  pages: 20,
  output: path.join(__dirname, 'page-posts-2026-no-api.json'),
  noYearFilter: false,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...defaultOptions };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page-id' && args[i + 1]) {
      opts.pageId = args[i + 1];
      i++;
    } else if (args[i] === '--year' && args[i + 1]) {
      opts.year = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--pages' && args[i + 1]) {
      opts.pages = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      opts.output = args[i + 1];
      i++;
    } else if (args[i] === '--no-year-filter') {
      opts.noYearFilter = true;
    }
  }
  return opts;
}

/**
 * Chạy Python script, trả về Promise<{ success, code, stdout, stderr, posts? }>
 */
export function runFbScraper(options = {}) {
  const opts = { ...defaultOptions, ...options };
  const pyArgs = [
    PY_SCRIPT,
    '--page-id', opts.pageId,
    '--year', String(opts.year),
    '--pages', String(opts.pages),
    '--output', opts.output,
  ];
  if (opts.noYearFilter) {
    pyArgs.push('--no-year-filter');
  }

  const pyCmd = process.env.PYTHON_CMD || 'python3';
  return new Promise((resolve) => {
    const python = spawn(pyCmd, pyArgs, {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    python.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    python.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    python.on('error', (err) => {
      resolve({
        success: false,
        code: null,
        stdout,
        stderr,
        error: err.message,
      });
    });

    python.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

/**
 * Chạy scraper và đọc file JSON kết quả, trả về mảng posts.
 */
export async function runFbScraperAndGetPosts(options = {}) {
  const result = await runFbScraper(options);
  if (!result.success) {
    throw new Error(result.error || result.stderr || `Python exit code ${result.code}`);
  }
  const opts = { ...defaultOptions, ...options };
  const raw = await readFile(opts.output, 'utf-8');
  return JSON.parse(raw);
}

const MISSING_MODULE_HINT = `
Chưa cài package Python "facebook-scraper". Chạy:

  pip3 install facebook-scraper

Sau đó chạy lại: node test/run-fb-scraper.js
`;

const LXML_CLEAN_HINT = `
Thiếu dependency "lxml_html_clean" (lxml đã tách module clean). Chạy:

  pip3 install lxml_html_clean

Hoặc: pip3 install "lxml[html_clean]"

Sau đó chạy lại: node test/run-fb-scraper.js
`;

async function main() {
  const opts = parseArgs();
  console.log('Chạy Python scraper:', opts);
  const result = await runFbScraper(opts);
  if (!result.success) {
    const errText = (result.error || result.stderr || '').toString();
    if (/lxml\.html\.clean|Install lxml_html_clean|lxml\[html_clean\]/.test(errText)) {
      console.error(LXML_CLEAN_HINT);
    } else if (/ModuleNotFoundError|No module named ['"]facebook_scraper['"]/.test(errText)) {
      console.error(MISSING_MODULE_HINT);
    } else {
      console.error('Lỗi:', result.error || result.stderr || result.code);
    }
    process.exit(1);
  }
  const posts = await readFile(opts.output, 'utf-8').then(JSON.parse).catch(() => []);
  console.log('Số post đọc được:', posts.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
