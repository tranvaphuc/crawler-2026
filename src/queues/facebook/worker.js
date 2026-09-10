import axios from 'axios';
import { Worker } from 'bullmq';

// Polyfill fetch cho Node < 18 (một số dependency có thể gọi fetch)
if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async function fetch(url, opts = {}) {
        const { data, status, headers } = await axios({
            url: typeof url === 'string' ? url : url.url,
            method: (opts.method || 'GET').toLowerCase(),
            data: opts.body,
            headers: opts.headers || {},
            validateStatus: () => true
        });
        return {
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
            headers: { get: (n) => headers[n?.toLowerCase()] }
        };
    };
}

import { bullConnection } from '../../configs/bullRedis.js';
import { FB_SOURCE_QUEUE_NAME, fbShareQueue, fbCmtQueue } from './master.js';
import { fbTokenQueue, pushFromTokenFile } from './tokenMaster.js';
import {
    buildBuzzFromPost,
    buildCommentBuzz,
    buildEsBulkInsert,
    buildEsBulkInsertForComment
} from './buzzBuilder.js';
import { ESMASTER } from '../../configs/elasticsearch.js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_TOKEN_RETRIES = 50;

async function getTokenFromQueue() {
    let waiting = await fbTokenQueue.getWaiting(0, 0);
    if (waiting.length === 0) {
        console.log('[FB-Source] Queue token trống, đọc tokenEAAD.txt và push vào queue...');
        await pushFromTokenFile();
        waiting = await fbTokenQueue.getWaiting(0, 0);
    }
    const tokenJob = waiting[0];
    if (!tokenJob?.data?.token) {
        throw new Error('Không có token trong queue và không đọc được token từ file tokenEAAD.txt.');
    }
    return { data: tokenJob.data, job: tokenJob };
}

const POST_LIMIT = 50;
const COMMENT_LIMIT = 50;

async function fetchPagePosts(pageId, accessToken) {
    const url = `${GRAPH_BASE}/${pageId}/feed`;
    const fields = [
        'id',
        'message',
        'created_time',
        'permalink_url',
        'full_picture',
        'story',
        'from{id,name}',
        'shares',
        'reactions.summary(true)',
        `comments.limit(${COMMENT_LIMIT}).summary(true){id,message,created_time,from}`,
        'attachments{data{title,description,unshimmed_url}}'
    ].join(',');
    const { data } = await axios.get(url, {
        params: {
            access_token: accessToken,
            fields,
            limit: POST_LIMIT
        }
    });
    if (data.error) {
        const e = new Error(data.error.message || 'Graph API error');
        e.code = data.error.code;
        e.error = data.error;
        throw e;
    }
    const posts = data.data || [];
    return posts.map((p) => ({
        ...p,
        comment_count: p.comments?.summary?.total_count ?? p.comment_count ?? 0,
        comments: p.comments?.data ?? []
    }));
}

const worker = new Worker(
    FB_SOURCE_QUEUE_NAME,
    async (job) => {
        const { type, id } = job.data;
        console.log(`[FB-Source] Processing job ${job.id}: type=${type}, id=${id}`);

        if (type === 'page') {
            let lastError;
            for (let attempt = 0; attempt < MAX_TOKEN_RETRIES; attempt++) {
                const { data: tokenData, job: tokenJob } = await getTokenFromQueue();
                try {
                    const posts = await fetchPagePosts(id, tokenData.token);
                    console.log(`[FB-Source] Page ${id}: lấy được ${posts.length} post(s)`);

                    const authorInfo = posts[0]?.from
                        ? { id: posts[0].from.id, name: posts[0].from.name }
                        : { id, name: String(id) };
                    const typePost = 'fbPage';
                    const esBody = [];

                    for (const postInfo of posts) {
                        const buzz = buildBuzzFromPost(postInfo, authorInfo, typePost);
                        if (buzz.shares > 0) {
                            await fbShareQueue.add(buzz, { removeOnComplete: true });
                        }
                        await fbCmtQueue.add(buzz, { removeOnComplete: true });
                        esBody.push(...buildEsBulkInsert(buzz));

                        for (const comment of postInfo.comments || []) {
                            const commentBuzz = buildCommentBuzz(comment, buzz, 'fbPageComment');
                            await fbCmtQueue.add(commentBuzz, { removeOnComplete: true });
                            esBody.push(...buildEsBulkInsertForComment(commentBuzz));
                        }
                    }

                    if (esBody.length) {
                        try {
                            await ESMASTER.bulk({ body: esBody });
                            console.log(`[FB-Source] Index ${esBody.length / 2} buzz lên ES`);
                        } catch (esErr) {
                            console.error('[FB-Source] ES bulk error:', esErr.message);
                        }
                    }

                    return {
                        type,
                        id,
                        postsCount: posts.length,
                        buzzQueued: posts.length * 2,
                        processedAt: new Date().toISOString()
                    };
                } catch (err) {
                    lastError = err;
                    console.warn(`[FB-Source] Job fail (${err.message}), lấy token mới và thử lại...`);
                    await tokenJob.remove();
                    continue;
                }
            }
            throw lastError || new Error('Hết token thử được.');
        }

        return { type, id, processedAt: new Date().toISOString() };
    },
    { connection: bullConnection }
);

// Định kỳ kiểm tra: nếu queue token trống thì đọc lại file và push vào
const REFILL_INTERVAL_MS = 60_000; // 1 phút
setInterval(async () => {
    try {
        const waiting = await fbTokenQueue.getWaitingCount();
        if (waiting === 0) {
            console.log('[FB-Source] Queue token trống, đọc lại tokenEAAD.txt...');
            await pushFromTokenFile();
        }
    } catch (e) {
        console.error('[FB-Source] Token refill error:', e.message);
    }
}, REFILL_INTERVAL_MS);

worker.on('completed', (job, result) => {
    console.log(`[FB-Source] Job ${job.id} completed:`, { ...result, posts: result.posts ? '[...]' : undefined });
});

worker.on('failed', (job, err) => {
    console.error(`[FB-Source] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
    console.error('[FB-Source] Worker error:', err);
});

export default worker;
