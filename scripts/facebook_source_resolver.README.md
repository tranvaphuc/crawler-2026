# Resolve Facebook source identity

Node.js 20+, ESM. Reads public source metadata anonymously; does not reuse account cookies or `fb_dtsg`.

```sh
node scripts/resolve_project_facebook_sources.mjs \
  --input sources.json \
  --out outputs/source-identities \
  --har /absolute/path/anonymous-facebook.har \
  --concurrency 10
```

`sources.json` is an array of Facebook URL strings or objects with `url`. Output is resumable `facebook-resolved.jsonl`, final `facebook-resolved.json`, and progress `resolve-state.json`.

The anonymous HAR must contain `POST /ajax/bulk-route-definitions/` and `ProfileCometTimelineFeedRefetchQuery` captured from an anonymous Page visit and feed scroll. Operation IDs/tokens can expire. Do not distribute the original HAR if it contains credentials; the resolver strips cookies, authorization, access tokens and `fb_dtsg` before sending requests.

Import the function when needed:

```js
import { createFacebookSourceResolver, normalizeFacebookSource }
  from './scripts/facebook_source_resolver.mjs';

const resolver = await createFacebookSourceResolver({ harPath, proxy: null });
const [source] = await resolver.resolveRoutes([normalizeFacebookSource(url)]);
const result = source.status === 'PROFILE_ID_ONLY'
  ? await resolver.resolveProfile(source)
  : source;
// result: name, id, type ('page'/'group'/'user'), url, profileId, status.
```

For a Page represented by a profile, `id` is `delegate_page.id`; `profileId` is the timeline/profile ID. The resolver accepts redirects and legacy `/people/name/id`, `/pages/name/id`, `profile.php?id=...`, group and vanity URLs. A `User` typename alone does not identify a personal user. Source IDs are never extracted from post/photo IDs or unrelated actors.

Statuses preserve uncertainty: `RESOLVED`, `PROFILE_ID_ONLY`, `ROUTE_UNAVAILABLE`, `SOURCE_UNAVAILABLE`, `PROFILE_QUERY_ERROR`, network/HTTP errors. A missing result is not proof the source was deleted. Requests stop on an explicit HTTP access/rate limit; rerun after the restriction/cooldown is resolved. `RETRY_ROUTES=1` refreshes unresolved routes. No background collector or recurring job is installed.

Project exports may apply a documented `LOGIN_REQUIRED` access override when the user confirms a source is visible only after login. Such an override records `USER_REPORTED` evidence and does not verify or fill an unknown source ID. An anonymous error route alone does not establish that login is required or that a source has been deleted.

Project collection scripts retain `project`, `channel`, original notes, plan URL, worksheet and cell. Monthly report data/post links are kept as references, separate from configured sources.
