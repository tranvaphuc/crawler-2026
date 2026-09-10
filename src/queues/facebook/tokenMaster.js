import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Queue } from 'bullmq';
import { bullConnection } from '../../configs/bullRedis.js';

export const FB_TOKEN_QUEUE_NAME = 'FB-Token';

export const fbTokenQueue = new Queue(FB_TOKEN_QUEUE_NAME, {
    connection: bullConnection
});

/**
 * Đẩy job token vào queue FB-Token
 * @param {Object} data - { id: string, token: string, cookie: string }
 * @param {Object} [options] - Tùy chọn BullMQ
 * @returns {Promise<Job>}
 */
export async function addTokenJob(data, options = {}) {
    const { id, token, cookie } = data;
    if (!id || !token) {
        throw new Error('Job data phải có id và token');
    }
    return fbTokenQueue.add('token', { id, token, cookie: cookie ?? '' }, options);
}

/**
 * Đọc file tokenEAAD.txt (mỗi dòng: id|token|cookie) và push từng dòng lên queue FB-Token
 * @param {string} [filePath] - Đường dẫn file, mặc định tokenEAAD.txt tại thư mục gốc project
 * @returns {Promise<Job[]>}
 */
export async function pushFromTokenFile(filePath) {
    const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const targetPath = filePath ?? join(rootDir, 'tokenEAAD.txt');
    const content = await readFile(targetPath, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const jobs = [];
    for (const line of lines) {
        const parts = line.split('|');
        const id = parts[0]?.trim();
        const token = parts[1]?.trim();
        const cookie = parts.slice(2).join('|').trim();
        if (id && token) {
            const job = await addTokenJob({ id, token, cookie });
            jobs.push(job);
            console.log(`Pushed token: id=${id}, jobId=${job.id}`);
        }
    }
    return jobs;
}

// Chạy khi gọi trực tiếp: node src/queues/facebook/tokenMaster.js
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
    pushFromTokenFile()
        .then((jobs) => {
            console.log(`Done. Pushed ${jobs.length} token job(s).`);
            process.exit(0);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
