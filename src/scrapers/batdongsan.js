export async function waitForBatdongsanPage(page, selectors, timeout = 120_000) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const startedAt = Date.now();
  let challengeNotified = false;

  while (Date.now() - startedAt < timeout) {
    const state = await page.evaluate((expectedSelectors) => ({
      ready: expectedSelectors.some((selector) => document.querySelector(selector)),
      title: document.title,
      body: document.body?.innerText?.slice(0, 500) || "",
    }), selectorList);

    if (state.ready) return;

    const isChallenge =
      state.title.includes("Just a moment") ||
      /Cloudflare|xác minh|verify you are human/i.test(state.body);

    if (isChallenge && !challengeNotified) {
      challengeNotified = true;
      console.log("Cloudflare đang kiểm tra. Hãy hoàn tất xác minh trong Chrome nếu được hỏi...");
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Không tìm thấy nội dung trang sau ${timeout}ms`);
}

export async function extractListingLinks(page, listPage) {
  return page.evaluate((pageNumber) => {
    const seen = new Set();
    return [...document.querySelectorAll("a.js__product-link-for-product-id")]
      .map((anchor) => {
        const url = new URL(anchor.href, location.origin);
        url.search = "";
        url.hash = "";
        const id = url.pathname.match(/-pr(\d+)(?:\/|$)/)?.[1];
        return id ? { id, url: url.href, listPage: pageNumber } : null;
      })
      .filter((item) => {
        if (!item || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  }, listPage);
}

export async function extractListingDetail(page, requestedUrl) {
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

    const realEstateSchema = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => {
        try {
          return JSON.parse(script.textContent);
        } catch {
          return null;
        }
      })
      .find((item) => item?.["@type"] === "RealEstateListing");

    const descriptionElement = document.querySelector(
      ".re__pr-description .re__section-body, .re__detail-content.js__pr-description",
    );
    const imageUrls = unique(
      [...document.querySelectorAll(".re__pr-media-slide img.pr-img, meta[property='og:image']")]
        .map((element) =>
          element.tagName === "META"
            ? element.content
            : element.currentSrc || element.src || element.dataset.src,
        )
        .map((url) => url?.replace(/\/crop\/600x315\//, "/resize/1275x717/")),
    );
    const phone = normalize(
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
      id: container?.getAttribute("prid") || idFromUrl || metadata["Mã tin"] || null,
      title: text("h1.re__pr-title, h1.js__pr-title"),
      address: text(".re__ldp-address .re__address, .re__address"),
      price: shortInfo["Khoảng giá"]?.value || null,
      pricePerSquareMeter:
        shortInfo["Khoảng giá"]?.extra || specifications["Khoảng giá"] || null,
      area: shortInfo["Diện tích"]?.value || specifications["Diện tích"] || null,
      bedrooms: shortInfo["Phòng ngủ"]?.value || specifications["Số phòng ngủ"] || null,
      description: normalizeMultiline(descriptionElement?.innerText),
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
        phone: phone || null,
      },
      project: text(".re__project-title, .re__project-card-title") || null,
      images: imageUrls,
      metaDescription: document.querySelector('meta[name="description"]')?.content || null,
    };
  }, requestedUrl);
}
