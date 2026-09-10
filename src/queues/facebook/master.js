import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Queue } from 'bullmq';
import { bullConnection } from '../../configs/bullRedis.js';

export const FB_SOURCE_QUEUE_NAME = 'FB-Source';
export const FB_SHARE_QUEUE_NAME = 'FB-Share';
export const FB_CMT_QUEUE_NAME = 'FB-Cmt';

export const fbSourceQueue = new Queue(FB_SOURCE_QUEUE_NAME, {
    connection: bullConnection
});

export const fbShareQueue = new Queue(FB_SHARE_QUEUE_NAME, {
    connection: bullConnection
});

export const fbCmtQueue = new Queue(FB_CMT_QUEUE_NAME, {
    connection: bullConnection
});

/**
 * Đẩy job vào queue FB-Source
 * @param {Object} data - { type: string, id: string }
 * @param {Object} [options] - Tùy chọn BullMQ (delay, priority, jobId...)
 * @returns {Promise<Job>}
 */
export async function addFbSourceJob(data, options = {}) {
    const { type, id } = data;
    if (!type || id == null) {
        throw new Error('Job data phải có type và id');
    }
    return fbSourceQueue.add('fb-source', { type, id }, options);
}

/**
 * Đọc file pageFB.txt (mỗi dòng: id|type) và push từng dòng lên queue FB-Source
 * @param {string} [filePath] - Đường dẫn file, mặc định pageFB.txt tại thư mục gốc project
 * @returns {Promise<Job[]>}
 */
export async function pushFromPageFBFile(filePath) {
    const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const targetPath = filePath ?? join(rootDir, 'pageFB.txt');
    const content = await readFile(targetPath, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const jobs = [];
    for (const line of lines) {
        const [id, type] = line.split('|').map((s) => s.trim());
        if (id && type) {
            const job = await addFbSourceJob({ type, id });
            jobs.push(job);
            console.log(`Pushed: id=${id}, type=${type}, jobId=${job.id}`);
        }
    }
    return jobs;
}

// Chạy khi gọi trực tiếp: node src/queues/facebook/master.js
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
    pushFromPageFBFile()
        .then((jobs) => {
            console.log(`Done. Pushed ${jobs.length} job(s).`);
            process.exit(0);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
