import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import dotenv from "dotenv";
import { Client } from "@opensearch-project/opensearch";

dotenv.config({ quiet: true });

const index = "topic6a9bf42899a42e7662a7bb4f";
const inputPath = "outputs/kompa_profile_work/ids.txt";
const outputPath = "outputs/kompa_profile_work/profiles.ndjson";
const batchSize = 1000;
const concurrency = 4;
const ids = (await fs.readFile(inputPath, "utf8")).split(/\r?\n/).filter(Boolean);
const batches = [];
for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));

const client = new Client({ node: process.env.ES7_HOST, maxRetries: 2, requestTimeout: 120_000 });
const output = createWriteStream(outputPath, { encoding: "utf8" });
const unwrap = (response) => response?.body ?? response;
let nextBatch = 0;
let completedBatches = 0;
let foundDocs = 0;
let missingDocs = 0;
let missingProfiles = 0;

async function fetchBatch(batch, attempt = 1) {
  try {
    const response = unwrap(await client.mget({
      index,
      body: { ids: batch },
      _source: ["profile.id", "profile.name"],
    }));
    return response.docs;
  } catch (error) {
    if (attempt >= 5) throw error;
    await new Promise((resolve) => setTimeout(resolve, 800 * (2 ** (attempt - 1))));
    return fetchBatch(batch, attempt + 1);
  }
}

async function worker() {
  while (true) {
    const batchIndex = nextBatch++;
    if (batchIndex >= batches.length) return;
    const docs = await fetchBatch(batches[batchIndex]);
    const lines = [];
    for (const doc of docs) {
      const profile = doc._source?.profile ?? {};
      if (!doc.found) missingDocs += 1;
      else foundDocs += 1;
      if (doc.found && !profile.id && !profile.name) missingProfiles += 1;
      lines.push(JSON.stringify({
        id: doc._id,
        authorId: profile.id ?? "",
        author: profile.name ?? "",
        found: Boolean(doc.found),
      }));
    }
    if (!output.write(lines.join("\n") + "\n")) await once(output, "drain");
    completedBatches += 1;
    if (completedBatches % 50 === 0 || completedBatches === batches.length) {
      console.log(JSON.stringify({ completedBatches, totalBatches: batches.length, foundDocs, missingDocs, missingProfiles }));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
output.end();
await once(output, "finish");
await client.close();
console.log(JSON.stringify({ ids: ids.length, foundDocs, missingDocs, missingProfiles, outputPath }));
