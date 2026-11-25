# VnExpress VIB miss — 23/11/2026

Customer URL: https://vnexpress.net/vib-chu-dong-von-qua-hoan-doi-ngoai-te-cua-ngan-hang-nha-nuoc-5147108.html

## Confirmed cause

Before the repair, the URL was absent from article_links, tasks, events, import_receipts, and its expected Elasticsearch document/index. The original article returned HTTP 200 and passed the complete production processor in isolated memory state. Its original publication time is 20/11/2026 16:00 +07:00, independently bound to this URL by the publisher JSON-LD. Body length: 5,166 characters.

The configured 23 seeds covered the homepage, top-level sections and two RSS feeds. None of those current responses contained article 5147108. The publisher's breadcrumb identifies Kinh doanh → Ebank → Ngân hàng sáng tạo. The unconfigured `/kinh-doanh/ebank/ngan-hang-sang-tao` page returned 200 and exposed the exact article URL. The processor admits article links from seeds but does not persist newly observed category links into seed_sources. A healthy top-level seed therefore did not establish coverage of its child sections.

This proves the current discovery gap; historical seed HTML is not retained, so it does not establish whether the article was ever briefly exposed on the homepage or RSS on its publication day.

## Applied repair

- Added 14 individually fetched and verified Kinh doanh/Ebank section URLs to the local and VPS VnExpress config and the existing seed_sources table. The new seeds stay eligible for subsequent normal master cycles.
- Reviewed 361 unique article URLs on those pages. Added 203 previously absent local article records without resetting existing done/fail state. Absence from the local ledger alone was not treated as proof of absence from Elasticsearch.
- Offered 20 documents that passed the unchanged full processor through the existing outbox and create-only importer.
- Investigated all 14 failures in that 361-URL cohort. Scoped the headline selector to `h1.title-detail`: generic `h1` could select a section heading before the actual article heading, leading to strict publication rejection. Added `.section-content > .wrapper-content` to the body selectors for the verified eMagazine template; the existing URL-bound JSON-LD title fallback supplies its image-based headline.
- Qualified all 14 failed articles, the customer target, six fresh positive controls, and two independently successful eMagazine layouts. Applied the verified config as a runtime overlay, reopening only the 15 exact verified failures with snapshot guards. Two unrelated video layouts probed as extra holdouts still failed and were left unchanged.

No services were restarted. No ES update/index/delete, mapping change, global fail reset, or direct AI call was used. Existing AI usage stayed at 141 calls / USD 1.96048075 for 23/11 UTC before and after both repair transactions. The USD 2 shared limit and existing call limit were preserved.

## Verification

At 09:42:52 +07:00 on 23/11:

- Customer document exists in `master202647/newsTopic/c65acc43c0aadfd45a358347f3e132f4`, with a `created` receipt. Its title, description, body and original publication timestamp exactly match the verified source extraction.
- All 361 audited URLs have parse_status=done; none are absent, pending or failed.
- All 35 specifically offered/recovered documents were read back from ES with matching URL, title and original time: 27 created and 8 existing. All newly created bodies/descriptions match exactly. Existing documents were preserved; some differ from the current extraction.
- All three production services are active. The normal seed service had already processed one newly added section at that snapshot; the remaining new seeds were scheduled in the current normal queue.
- 60 parser/strict-publication regression tests passed: `node --test test/configurable-news-parser.test.mjs test/news-strict-publication.test.mjs`.

Evidence: `outputs/vnexpress-miss-20261123/evidence.tar.gz`, including original HTTP HTML, seed discovery, isolated processor outputs, qualification, before/after config, transaction results and ES readback. Remote source: `/var/lib/news-flow/vnexpress-miss-20261123/`.

Scope: the reported VIB article and the 14 audited business/banking sections. This is not a claim that every VnExpress section, historical page or video layout has been verified.
