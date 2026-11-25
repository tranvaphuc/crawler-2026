# Facebook comment traversal and signed-in session support

Target: https://www.facebook.com/groups/740563628115685/posts/1592137936291579/

Observed baseline: anonymous collection returns 6 roots + 14 replies = 20. The user's signed-in Chrome UI in All comments mode, after expanding every reply, shows 7 roots + 15 replies = 22. Facebook's displayed counter is 24. The two additional signed-in records are comment 1592342306271142 and its reply 1592725062899533. Do not mark 24/24 complete or merge historical stored records into a fresh crawl.

Changes:

- Bind the initial GraphQL read to the exact native feedback ID in the current bootstrap. Carry native feedback IDs alongside expansion context in root/reply cursors, keeping the numeric post/comment binding for validation.
- Use GROUP_PERMALINK for group comment reads, including URLs whose caller omits sourceType.
- Traverse nested replies and count all descendants when checking root reply totals. Preserve immediate parent IDs and checkpoint compatibility.
- Add an opt-in authenticated comment request adapter. Default remains anonymous until the server operator sets FACEBOOK_COMMENT_SESSION_FILE. Only comment requests use that file; source and other-platform readers retain their existing request path.
- Require an exact configured account match and current-session CSRF. No anonymous fallback on a wrong/expired account or checkpoint. Session cookies remain in the HTTP binding and out of checkpoints, logs and API payloads. Transport/coverage distinguish authenticated reads.

Session file is server-side JSON with accountId and cookie fields. The cookie needs a matching c_user and a valid xs; do not put secrets in chat, source control, URLs or client request bodies. A regular file with mode 0600, or 0640 for the service's private group, is accepted; symlinks, world access and group writes are rejected. Runtime users are crawler-api (API) and crawler-v8 with group crawler-api (worker). No actual credential was provisioned by this change.

API and worker versions differ, so deployment bundles are generated against each live baseline. Only eight files per installation change; unrelated local/session/proxy fixes are not copied. Relevant staging tests pass separately against both installed dependency graphs. Tests cover private-file validation, account/CSRF matching, cookie isolation, native opaque feedback cursors, checkpointed nested traversal and source-type inference. Local related suite: 141 passing tests. Final relevant staging suite: 31 passing tests for API and 31 for worker.

Full production verification of 22 fresh records requires an operator-authorized Facebook session. Until that is supplied and tested, signed-in production coverage remains unverified. The earlier 24-versus-22 UI discrepancy must continue to be reported as a count mismatch.

Deployment backups: /var/lib/crawler-api/comment-repair-1794291848 and /var/lib/crawler-api/native-feedback-repair-1794292121. No login session was installed or enabled. Only the API and facebook-comments/facebook-replies worker services were restarted.

Fresh production verification after deployment: the actual worker reader, without seeded/historical records, encountered one FACEBOOK_RATE_LIMITED result, switched proxy and collected 6 roots + 14 replies = 20 unique records. All reply descendant counts matched and all public continuations exhausted. Coverage correctly reports PUBLIC_COMMENT_COUNT_MISMATCH against 24. Evidence: outputs/group-740563628115685-live/production-patched-reader-verification.json. API, facebook-comments and facebook-replies services are active with NRestarts=0 after restart. Signed-in 22-record verification remains pending an authorized session.
