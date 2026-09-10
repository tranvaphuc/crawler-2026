import fs from "fs/promises";
import path from "path";
import process from "process";
import puppeteer from "puppeteer";

const DEFAULT_URL =
  "https://batdongsan.com.vn/ban-nha-biet-thu-lien-ke-duong-nguyen-dinh-tu-phuong-xuan-dinh-jade-square/can-ban-gap-suat-ngoai-giao-116m2-du-an-pham-van-dong-gia-29-ty-pr42567904";

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    output: "./output/batdongsan-detail.json",
    headless: false,
    timeout: 120_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--headless") options.headless = true;
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--timeout") options.timeout = Number(argv[++index]);
    else if (!argument.startsWith("--")) options.url = argument;
    else throw new Error(`Tham số không hợp lệ: ${argument}`);
  }

  if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
    throw new Error("--timeout phải là số mili giây lớn hơn 0");
  }

  return options;
}

async function waitForListing(page, timeout) {
  const startedAt = Date.now();
  let challengeNotified = false;

  while (Date.now() - startedAt < timeout) {
    const state = await page.evaluate(() => ({
      hasListing: Boolean(document.querySelector("h1.re__pr-title, h1.js__pr-title")),
      title: document.title,
      body: document.body?.innerText?.slice(0, 500) || "",
    }));

    if (state.hasListing) return;

    const isChallenge =
      state.title.includes("Just a moment") ||
      /Cloudflare|xác minh|verify you are human/i.test(state.body);

    if (isChallenge && !challengeNotified) {
      challengeNotified = true;
      console.log("Cloudflare đang kiểm tra trình duyệt. Hãy hoàn tất xác minh trong cửa sổ Chrome nếu được hỏi...");
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Không tìm thấy nội dung tin đăng sau ${timeout}ms`);
}

async function extractListing(page, requestedUrl) {
  return page.evaluate((sourceUrl) => {
    const normalize = (value) =>
      (value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const normalizeMultiline = (value) =>
      (value || "")
        .split("\n")
        .map((line) => normalize(line))
        .filter(Boolean)
        .join("\n");

    const text = (selector, root = document) =>
      normalize(root.querySelector(selector)?.textContent);

    const unique = (values) => [...new Set(values.filter(Boolean))];

    const shortInfo = {};
    document.querySelectorAll(".re__pr-short-info-item").forEach((item) => {
      const label = text(".title", item);
      if (!label) return;
      shortInfo[label] = {
        value: text(".value", item),
        extra: text(".ext", item) || null,
      };
    });

    const specifications = {};
    document.querySelectorAll(".re__pr-specs-content-item").forEach((item) => {
      const label = text(".re__pr-specs-content-item-title", item);
      const value = text(".re__pr-specs-content-item-value", item);
      if (label && value) specifications[label] = value;
    });

    const metadataLabels = ["Ngày đăng", "Ngày hết hạn", "Loại tin", "Mã tin"];
    const metadata = {};
    const ownText = (element) =>
      normalize(
        [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(" "),
      );

    for (const label of metadataLabels) {
      const labelElement = [...document.querySelectorAll("span, div, p")].find(
        (element) => ownText(element) === label,
      );
      if (!labelElement) continue;

      const siblingValue = normalize(labelElement.nextElementSibling?.textContent);
      const parentText = normalize(labelElement.parentElement?.textContent);
      metadata[label] = siblingValue || normalize(parentText.slice(label.length));
    }

    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => {
        try {
          return JSON.parse(script.textContent);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const realEstateSchema = jsonLd.find((item) => item["@type"] === "RealEstateListing");

    const title = text("h1.re__pr-title, h1.js__pr-title");
    const descriptionElement = document.querySelector(
      ".re__pr-description .re__section-body, .re__detail-content.js__pr-description",
    );
    const description = normalizeMultiline(descriptionElement?.innerText);

    const imageUrls = unique(
      [...document.querySelectorAll(".re__pr-media-slide img.pr-img, meta[property='og:image']")]
        .map((element) =>
          element.tagName === "META"
            ? element.content
            : element.currentSrc || element.src || element.dataset.src,
        )
        .map((url) => url?.replace(/\/crop\/600x315\//, "/resize/1275x717/")),
    );

    const visiblePhone = normalize(
      [...document.querySelectorAll(
        '[kyc-tracking-id="lead-phone-ldp"], [tracking-id*="phone"], .js__btn-tracking',
      )]
        .map((element) => normalize(element.textContent))
        .find((value) => /\d{3,4}[ .]\d{3}/.test(value)),
    );

    const kycElement = document.querySelector("[data-kyc-name]");
    const container = document.querySelector(".re__pr-container[prid]");
    const currentUrl = location.href;
    const idFromUrl = currentUrl.match(/-pr(\d+)(?:[/?#]|$)/)?.[1];

    return {
      sourceUrl,
      finalUrl: currentUrl,
      scrapedAt: new Date().toISOString(),
      id: container?.getAttribute("prid") || idFromUrl || metadata["Mã tin"] || null,
      title,
      address: text(".re__ldp-address .re__address, .re__address"),
      price: shortInfo["Khoảng giá"]?.value || null,
      pricePerSquareMeter:
        shortInfo["Khoảng giá"]?.extra || specifications["Khoảng giá"] || null,
      area: shortInfo["Diện tích"]?.value || specifications["Diện tích"] || null,
      bedrooms: shortInfo["Phòng ngủ"]?.value || specifications["Số phòng ngủ"] || null,
      description,
      specifications,
      metadata: {
        postedAt: metadata["Ngày đăng"] || realEstateSchema?.["@datePublished"] || null,
        expiresAt: metadata["Ngày hết hạn"] || null,
        listingType: metadata["Loại tin"] || null,
        listingId: metadata["Mã tin"] || container?.getAttribute("prid") || idFromUrl || null,
        modifiedAt: realEstateSchema?.["@dateModified"] || null,
      },
      contact: {
        name: kycElement?.dataset.kycName || null,
        phone: visiblePhone || null,
      },
      project: text(".re__project-title, .re__project-card-title") || null,
      images: imageUrls,
      breadcrumbs: [...document.querySelectorAll(".re__breadcrumb a, [class*='breadcrumb'] a")]
        .map((anchor) => ({
          label: normalize(anchor.textContent),
          url: anchor.href,
        }))
        .filter((item) => item.label),
      metaDescription:
        document.querySelector('meta[name="description"]')?.content || null,
    };
  }, requestedUrl);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const profileDirectory = path.resolve(".cache/batdongsan-chrome-profile");
  const browser = await puppeteer.launch({
    headless: options.headless,
    userDataDir: profileDirectory,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    page.setDefaultNavigationTimeout(options.timeout);

    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await waitForListing(page, options.timeout);

    const listing = await extractListing(page, options.url);
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(listing, null, 2)}\n`, "utf8");

    console.log(JSON.stringify(listing, null, 2));
    console.log(`\nĐã lưu: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Lỗi: ${error.message}`);
  process.exitCode = 1;
});
