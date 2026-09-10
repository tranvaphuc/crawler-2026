# Data Templates — crawler-2026 datastores

> ⚠️ **READ-ONLY.** Never write / update / delete anything on ES5, ES7, Mongo or Redis.
> These are live production stores. Query & aggregate only.

Connections are supplied through `.env` and are never committed:

- **ES5** (`ES5_HOST`) — legacy `elasticsearch` client (`ESMASTER`). Monthly `masterYYYYMM` indices; `_type` varies (`fbPageComment`, …).
- **ES7** (`ES7_HOST`) — OpenSearch client (`ESTOPIC`). Uses `topic<mongoId>` indices and `_type=_doc`.
- **Mongo** (`MONGO_URI`) — Facebook crawl bookkeeping.
- **Redis** (`REDIS_HOST`, `REDIS_PORT`) — BullMQ queues.

---

## ES5 `master<YYYYMM>` — raw crawled buzz (flat)

Sample `_source`:

```json
{
  "siteName": "Nghĩ Giàu - Làm Giàu", "siteId": "325286877638848",
  "insertedDate": "2025-02-03T08:54:52.290Z", "publishedDate": "2025-02-03T07:53:00.000Z",
  "parentId": "325286877638848_954019806828050", "parentDate": "2025-02-01T14:00:02.000Z",
  "url": "https://facebook.com/...", "author": "Thanh Cao", "authorId": "100087752065658",
  "title": "...", "description": "", "content": "...",
  "likes": "0", "shares": "0", "comments": "0", "interactions": "0",
  "delayCrawler": "0", "delayMongo": "0", "delayEs": "0",
  "ds": { "ip": "...", "source": "crawler-v7-fb-page-comment" }
}
```

Mapping fields (type): author/authorId `keyword`; title/name/caption/content/contentRaw/description `text`;
likes/shares/comments/interactions/reactions/love/haha/wow/sad/angry/pride/thankful `integer`;
views/delay* `long`; insertedDate/publishedDate/parentDate `date`; url/link/picture/siteId/siteName/source/objectId/contentType/city/country/commentParentId `keyword`;
`ds.{ip,source,username,keyword}` keyword.

## ES7 `topic<mongoId>` — enriched/analyzed buzz (nested inference)

Sample `_source`:

```json
{
  "type": "fbGroupTopic", "siteId": "...", "siteName": "...", "url": "...", "content": "...",
  "likes": 1, "shares": 0, "comments": 0, "interactions": 0,
  "ds": { "source": "puppeteer-facebook", "username": "..." },
  "profile": { "id": "100003798635437", "name": "..." },
  "locale": { "region": "Asia", "country": "VietNam", "language": "Vi", "timezone": "+7" },
  "publishedDate": 1623694209000, "insertedDate": 1623695101809,
  "sentiment": { "value": 3, "updatedBy": "...", "updatedAt": 1624273859227 },
  "isDeleted": false,
  "labels": [ { "value": "5e6f5ea0...", "createdBy": "...", "createdAt": 1624273859227 } ]
}
```

Note: dates here are **epoch ms** (numbers), unlike ES5 ISO strings.
Key groups: base buzz (siteId/siteName/url/content/title/likes/shares/comments/interactions);
`inference.*` (sentiment/emotion/topic/subtopic/category/industry/intent/purpose/tone/polarity/severity/spam/entity_recognition[]/context[]/...);
tag arrays (nested): `labels[]`, `campaignTags[]`, `crisisTags[]`, `contentTags[]`, `processingTag`, `translateBuzz[]`;
`sentiment{value,...}`, `level{value,...}`, `riskGroup{value,...}`, `displayStatus{value,...}`;
`profile{id,name,gender,followers,friends,geographic,...}`, `locale{region,country,language,timezone,geographic,...}`;
`usage.{prompt_tokens,completion_tokens,total_tokens}`; flags `isDeleted/updatedBuzz/hasTranslateBuzz/mention_mainbrand`.

## Mongo `leuleu` — FB crawl bookkeeping

| collection | sample keys |
|---|---|
| `FacebookCheckCreate` | uid, subscribers, createdTime, name, statusAcc |
| `FacebookCheckLive` | uid, statusAcc |
| `FacebookCmt` | idPost, idCmt, likes, comments, created_time, author, authorId, parent, status |
| `FacebookPost` | idPost, reactions, shares, comments, views, like/love/care/haha/wow/sad/angry, status |
| `FbTypeOfPost` | — |
| `FacebookCheckFriends` | — |
