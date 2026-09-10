import dotenv from "dotenv";
import { Client } from "@opensearch-project/opensearch";

dotenv.config();

const index = "topic6a9bf42899a42e7662a7bb4f";
const ids = process.argv.slice(2);
const client = new Client({ node: process.env.ES7_HOST, maxRetries: 2, requestTimeout: 60_000 });
const unwrap = (response) => response?.body ?? response;

const exists = unwrap(await client.indices.exists({ index }));
const mget = unwrap(await client.mget({
  index,
  body: { ids },
  _source: ["profile.id", "profile.name", "id"],
}));

console.log(JSON.stringify({
  indexExists: Boolean(exists),
  docs: mget.docs.map((doc) => ({
    _id: doc._id,
    found: doc.found,
    sourceId: doc._source?.id ?? null,
    profile: doc._source?.profile ?? null,
  })),
}, null, 2));
