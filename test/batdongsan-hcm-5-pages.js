import fs from "fs/promises";
import path from "path";
import process from "process";
import puppeteer from "puppeteer";
import {
  extractListingDetail,
  extractListingLinks,
  waitForBatdongsanPage,
} from "../src/scrapers/batdongsan.js";

const DEFAULT_URL = "https://batdongsan.com.vn/nha-dat-ban-tp-hcm";

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_URL,
    pages: 5,
    concurrency: 2,
    retries: 3,
    timeout: 120_000,
    output: "./output/batdongsan-hcm-5-pages.json",
    linksOutput: "./output/batdongsan-hcm-5-pages-links.json",
    headless: false,
    fresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--headless") options.headless = true;
    else if (arg === "--fresh") options.fresh = true;
    else if (arg === "--pages") options.pages = Number(argv[++index]);
    else if (arg === "--concurrency") options.concurrency = Number(argv[++index]);
    else if (arg === "--retries") options.retries = Number(argv[++index]);
    else if (arg === "--timeout") options.timeout = Number(argv[++index]);
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--links-output") options.linksOutput = argv[++index];
    else if (!arg.startsWith("--")) options.baseUrl = arg.replace(/\/+$/, "");
    else throw new Error(`Tham số không hợp lệ: ${arg}`);
  }

  for (const key of ["pages", "concurrency", "retries", "timeout"]) {
    if (!Number.isFinite(options[key]) || options[key] < 1) {
      throw new Error(`--${key} phải là số lớn hơn 0`);
    }
  }

  return options;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function collectLinks(browser, options) {
  const page = await browser.newPage();
  const allLinks = [];

  try {
    for (let pageNumber = 1; pageNumber <= options.pages; pageNumber += 1) {
      const listUrl = pageNumber === 1 ? options.baseUrl : `${options.baseUrl}/p${pageNumber}`;
      console.log(`[LIST ${pageNumber}/${options.pages}] ${listUrl}`);
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: options.timeout });
      await waitForBatdongsanPage(page, "a.js__product-link-for-product-id", options.timeout);
      const links = await extractListingLinks(page, pageNumber);
      console.log(`  -> ${links.length} link`);
      allLinks.push(...links);
      await delay(800 + Math.floor(Math.random() * 700));
    }
  } finally {
    await page.close();
  }

  const seen = new Set();
  return allLinks.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function crawlOne(page, link, options) {
  let lastError;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    try {
      await page.goto(link.url, { waitUntil: "domcontentloaded", timeout: options.timeout });
      await waitForBatdongsanPage(
        page,
        ["h1.re__pr-title", "h1.js__pr-title"],
        options.timeout,
      );
      const detail = await extractListingDetail(page, link.url);
      return { ...detail, listPage: link.listPage, scrapedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      console.warn(`  Lỗi lần ${attempt}/${options.retries}: ${error.message}`);
      await delay(attempt * 1_500 + Math.floor(Math.random() * 1_000));
    }
  }
  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(options.output);
  const linksPath = path.resolve(options.linksOutput);
  const profilePath = path.resolve(".cache/batdongsan-chrome-profile");
  const browser = await puppeteer.launch({
    headless: options.headless,
    userDataDir: profilePath,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const links = await collectLinks(browser, options);
    await writeJsonAtomic(linksPath, {
      source: options.baseUrl,
      pageCount: options.pages,
      collectedAt: new Date().toISOString(),
      total: links.length,
      links,
    });
    console.log(`Tổng link duy nhất: ${links.length}`);

    const previous = options.fresh
      ? null
      : await readJson(outputPath, null);
    const listings = previous?.listings || [];
    const failures = previous?.failures || [];
    const completedIds = new Set(listings.map((item) => String(item.id)));
    const queue = links.filter((item) => !completedIds.has(String(item.id)));
    let cursor = 0;
    let saveChain = Promise.resolve();

    const saveProgress = () => {
      const failedIds = new Set(failures.map((item) => String(item.id)));
      const result = {
        source: options.baseUrl,
        pageCount: options.pages,
        collectedAt: new Date().toISOString(),
        totalLinks: links.length,
        successful: listings.length,
        failed: failures.length,
        pending: Math.max(0, links.length - listings.length - failedIds.size),
        links,
        listings: [...listings],
        failures: [...failures],
      };
      saveChain = saveChain.then(() => writeJsonAtomic(outputPath, result));
      return saveChain;
    };

    console.log(`Cần crawl detail: ${queue.length} (đã có ${listings.length})`);
    const workers = Array.from(
      { length: Math.min(options.concurrency, Math.max(queue.length, 1)) },
      async (_, workerIndex) => {
        const page = await browser.newPage();
        try {
          while (cursor < queue.length) {
            const currentIndex = cursor;
            cursor += 1;
            const link = queue[currentIndex];
            console.log(`[DETAIL ${currentIndex + 1}/${queue.length}] worker ${workerIndex + 1}: ${link.id}`);
            try {
              const detail = await crawlOne(page, link, options);
              listings.push(detail);
              const failedIndex = failures.findIndex((item) => item.id === link.id);
              if (failedIndex >= 0) failures.splice(failedIndex, 1);
            } catch (error) {
              const failure = {
                ...link,
                error: error.message,
                failedAt: new Date().toISOString(),
              };
              const failedIndex = failures.findIndex((item) => item.id === link.id);
              if (failedIndex >= 0) failures[failedIndex] = failure;
              else failures.push(failure);
            }
            await saveProgress();
            await delay(500 + Math.floor(Math.random() * 900));
          }
        } finally {
          await page.close();
        }
      },
    );

    await Promise.all(workers);
    listings.sort((a, b) => a.listPage - b.listPage || Number(b.id) - Number(a.id));
    await saveProgress();
    console.log(`Hoàn tất: ${listings.length} thành công, ${failures.length} lỗi`);
    console.log(`JSON links: ${linksPath}`);
    console.log(`JSON detail: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Lỗi: ${error.message}`);
  process.exitCode = 1;
});
