// Run these functions in cua_repl with the existing Chrome search tabs and local checkpoint tab.
// The search tabs must already show the signed-in Facebook search interface.
async function facebookPublicView(tab) {
  return tab.playwright.evaluate(() => {
    const main = document.querySelector('[role="main"][aria-label="Search results"]');
    const audiences = new Set([
      "shared with public", "shared with public group", "public",
      "chia sẻ với công chúng", "công khai", "đã chia sẻ với công chúng",
    ]);
    const visible = (element) => element.getBoundingClientRect().width > 0;
    const messages = main
      ? [...main.querySelectorAll('[data-ad-preview="message"]')].filter(visible).slice(0, 10)
      : [];
    const cards = [];
    for (const message of messages) {
      let card = message.parentElement;
      for (let depth = 0; depth < 11 && card && card !== main; depth++, card = card.parentElement) {
        if (card.querySelectorAll('[data-ad-preview="message"]').length !== 1) break;
        const heading = card.querySelector("h3");
        if (!heading) continue;
        const publicAudience = [...card.querySelectorAll("[aria-label],svg title")].some(
          (node) => audiences.has((node.getAttribute("aria-label") || node.textContent || "").trim().toLowerCase()),
        );
        if (!publicAudience) continue;
        const actor = (heading.querySelector("a")?.innerText || heading.innerText || "").split("\n")[0].trim();
        const body = (message.innerText || "").trim().slice(0, 640);
        const link = [...card.querySelectorAll("a[href]")].find(
          (anchor) => /\/(posts|videos|reel)\//.test(anchor.pathname) || /^\/(?:permalink|story)\.php$/.test(anchor.pathname),
        )?.href || "";
        cards.push({ actor, body, link, audience: "public" });
        break;
      }
    }
    const headings = [...document.querySelectorAll('h1,h2,[role="heading"],[role="alert"],[role="dialog"]')]
      .filter(visible).map((element) => element.innerText || "").join("\n").slice(0, 3200);
    return { href: location.href, cards, displayed: messages.length, headings };
  });
}

async function facebookQuerySample(tab, item) {
  const word = new URL(item.url).searchParams.get("q");
  const expected = (view) => {
    const landed = new URL(view.href);
    return /^(www\.)?facebook\.com$/.test(landed.hostname) &&
      /^\/search\/(top|posts)\/?$/.test(landed.pathname) && landed.searchParams.get("q") === word;
  };
  const requiresAttention = (view) =>
    /temporarily blocked|too many requests|verify that you are human|tạm thời bị chặn|hãy thử lại sau/i.test(view.headings) ||
    /^\/(login|checkpoint|recover)(\/|\.php)/.test(new URL(view.href).pathname);
  let view = await facebookPublicView(tab);
  if (requiresAttention(view)) return { stop: "Facebook yêu cầu chờ hoặc xác minh", keyword: word };
  if (!expected(view)) {
    const input = tab.playwright.getByRole("combobox", { name: /Search Facebook|Tìm kiếm trên Facebook/ });
    await input.fill(word, { timeout: 4000 });
    await input.press("Enter", { timeout: 4000 });
  }
  const deadline = Date.now() + 5100;
  let empty;
  let unavailable;
  let otherResultKind;
  do {
    view = await facebookPublicView(tab);
    if (requiresAttention(view)) return { stop: "Facebook yêu cầu chờ hoặc xác minh", keyword: word };
    empty = /no results found|we (?:couldn.t|didn.t) find any results|không tìm thấy kết quả/i.test(view.headings);
    unavailable = /content isn.t available|nội dung này không khả dụng|child sexual abuse is illegal/i.test(view.headings);
    otherResultKind = /^(?:Pages|Groups|People|Trang|Nhóm|Mọi người)$/im.test(view.headings);
    if (expected(view) && (view.displayed || empty || unavailable)) break;
    await tab.playwright.locator('[role="main"][aria-label="Search results"]')
      .first().getAttribute("aria-label", { timeout: 600 }).catch(() => null);
  } while (Date.now() < deadline);
  if (!expected(view)) return { key: item.key, url: item.url, status: "LOAD_UNCLEAR", cards: [], displayed: 0 };
  let status = "LOAD_UNCLEAR";
  if (view.cards.length) status = "OK";
  else if (view.displayed || otherResultKind) status = "NO_PUBLIC_SAMPLE";
  else if (empty) status = "EMPTY";
  else if (unavailable) status = "UNAVAILABLE";
  return { key: item.key, url: view.href, status, cards: view.cards, displayed: view.displayed };
}

async function reviewFacebookBatch(queueTab, searchTabs, limit = 30) {
  if (!searchTabs.length) throw new Error("Cần ít nhất một tab tìm kiếm Facebook.");
  const localQueue = "http://127.0.0.1:8874/";
  if ((await queueTab.url()) === localQueue) await queueTab.reload();
  else await queueTab.goto(localQueue);
  const queue = await queueTab.playwright.evaluate(() =>
    [...document.querySelectorAll("#queue li[data-key]")].map((entry) => {
      const link = entry.querySelector("a");
      return { key: entry.dataset.key, keyword: link.innerText, url: link.href };
    }));
  const selected = queue.slice(0, Math.min(48, limit));
  const samples = [];
  let stop = null;
  let next = 0;
  await Promise.all(searchTabs.map(async (tab) => {
    while (!stop && next < selected.length) {
      const item = selected[next++];
      try {
        const observation = await facebookQuerySample(tab, item);
        if (observation.stop) stop = observation;
        else samples.push(observation);
      } catch {
        stop ||= { stop: "Tab Facebook không tải được ô tìm kiếm" };
      }
    }
  }));
  if (samples.length) {
    await queueTab.playwright.getByRole("textbox", { name: "Mẫu kết quả" }).fill(JSON.stringify(samples));
    await queueTab.playwright.getByRole("button", { name: "Lưu mẫu" }).click();
    await queueTab.playwright.locator("#receipt").getByText(/Đã lưu/).waitFor({ state: "visible", timeout: 10000 });
  }
  const receipt = await queueTab.playwright.locator("#receipt").innerText();
  const persisted = Number(receipt.match(/Đã lưu (\d+) mẫu/)?.[1] || 0);
  const states = {};
  for (const sample of samples) states[sample.status] = (states[sample.status] || 0) + 1;
  return { saved: persisted, observed: samples.length, states, stop };
}
