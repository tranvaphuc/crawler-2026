/**
 * Script test: lấy toàn bộ post của 1 page trong năm 2026.
 *
 * Lưu ý: Facebook Graph API bắt buộc access token để gọi feed.
 * Chạy với token từ env:
 *   GRAPH_ACCESS_TOKEN=eaad... node test/get-page-posts-2026.js
 * Hoặc copy 1 dòng từ tokenEAAD.txt (phần token), rồi:
 *   export GRAPH_ACCESS_TOKEN="EAAD..."
 *   node test/get-page-posts-2026.js
 */

import axios from 'axios';

const PAGE_ID = '542674398935650';
const GRAPH_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// 2026: 01/01 00:00:00 UTC -> 31/12 23:59:59 UTC
const SINCE_2026 = 1735689600;
const UNTIL_2026 = 1767225599;

const FIELDS = [
    'id',
    'message',
    'created_time',
    'permalink_url',
    'full_picture',
    'story',
    'from{id,name}',
    'shares',
    'reactions.summary(true)',
    'comments.summary(true){id,message,created_time,from}',
    'attachments{data{title,description,unshimmed_url}}'
].join(',');

async function fetchPagePostsIn2026(accessToken) {
    const allPosts = [];
    let url = `${BASE}/${PAGE_ID}/feed`;
    let params = {
        access_token: accessToken,
        fields: FIELDS,
        limit: 100,
        since: SINCE_2026,
        until: UNTIL_2026
    };

    while (url) {
        const res = params ? await axios.get(url, { params }) : await axios.get(url);
        const data = res.data;

        if (data.error) {
            throw new Error(data.error.message || 'Graph API error');
        }

        const posts = data.data || [];
        allPosts.push(...posts);
        console.log(`  Fetched ${posts.length} posts (total: ${allPosts.length})`);

        const nextUrl = data.paging?.next;
        if (!nextUrl) break;
        url = nextUrl;
        params = null;
    }

    return allPosts;
}

async function main() {
    const token = process.env.GRAPH_ACCESS_TOKEN;
    if (!token) {
        console.error('Cần set GRAPH_ACCESS_TOKEN (token từ tokenEAAD.txt hoặc app token).');
        console.error('VD: GRAPH_ACCESS_TOKEN=EAAD... node test/get-page-posts-2026.js');
        process.exit(1);
    }

    console.log(`Page ${PAGE_ID}, năm 2026 (since=${SINCE_2026}, until=${UNTIL_2026})...`);
    const posts = await fetchPagePostsIn2026(token);
    console.log(`Tổng: ${posts.length} post(s).`);

    // Ghi ra file để xem
    const fs = await import('fs');
    const outPath = 'test/page-posts-2026.json';
    fs.writeFileSync(outPath, JSON.stringify(posts, null, 2), 'utf-8');
    console.log(`Đã ghi: ${outPath}`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
