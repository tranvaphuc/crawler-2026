# Group post proxy and parser repair — 2026-11-10

Target: https://www.facebook.com/groups/740563628115685/posts/1592137936291579/

The production API initially returned UPSTREAM_NETWORK_ERROR / ECONNRESET before receiving a proxy CONNECT response. Independent server-side probes found two API-reserved keys failing twice against each of ipify and Cloudflare, while two others completed both checks. Server IPv4 54.39.111.29 matched PROXYVN_WHITELIST_IPV4. This isolates the observed failures to the two proxy assignments; it does not establish the provider's internal cause.

Quarantined key IDs a796cf2a8260f06383880a5f and f021227b7b7e3929066bf48d using enabled:false in the existing keys configuration, then called the admin reload endpoint. Remaining enabled key count: 48. Backup: /var/lib/crawler-proxy-manager/keys.json.before-group-post-repair-1794284079218. Manager stayed running. Re-enable these keys only after independently verifying connectivity.

Four subsequent API reads completed Facebook HTTP 200 with no reset but reported PRIMARY_POST_NOT_FOUND. The live primary response used GroupsCometLoggedOutPermalinkQuery with data.group and data.node_v2. Added support for that exact response family, binding both requested group and post and refusing deferred recommendation projections. Group remains source/owner; actor profile remains separate.

Validation: all 47 tests in facebook-group-permalink-info, facebook-share, facebook-media-identity and facebook-es5 passed. Production source matched the expected pre-edit SHA-256 before deployment. Deployed only src/services/facebookShare.js, with backup /var/lib/crawler-api/facebookShare.js.before-group-permalink-repair; restarted only crawler-api. API and proxy manager both active afterward.

Fresh production API read at 2026-11-10T04:17:29.987Z (11:17:29 ICT) returned ok:true, identityVerified:true, reason POST_DETAILS_LOADED, post ID 740563628115685_1592137936291579, text, publication time, video metadata, 7 reactions, 6 Likes, 24 reported comments and 0 shares. This is post metadata, not an export of the 24 comments. Evidence: outputs/group-740563628115685-live/live-after-repair-1.json.
