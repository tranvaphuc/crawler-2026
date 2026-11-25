Queue-scoped proxy admission
============================

Production opts the group queue into eight existing waiting keys:

```json
{
  "backgroundQueueStandbyKeys": {"crawler-flow-facebook-group-source": 8},
  "backgroundQueueColdProbe": {"crawler-flow-facebook-group-source": true},
  "backgroundQueueVerifyEgress": {"crawler-flow-facebook-group-source": true}
}
```

The main 34-key ring and four API-reserved keys remain unchanged. Each standby belongs to one exact queue, permits at most four leases (32 across eight private keys), and never rotates while leased. At least two unleased spares remain available for ordinary ring replacement. Normal main-ring provider parameters do not change; only an idle private refresh may request another documented ISP.

A new cold lease skips endpoints with an owned CONNECT probe, trying other admitted endpoints and then private spares before returning a scheduling wait. Ownership stays pinned while a spare is rotating, including when the HTTP caller has already timed out. Concurrent acquisition cannot drop that ownership and start excess rotations or discard the finished assignment. Origin and transport restrictions remain specific to the reporting queue.

Cold transport and established TLS
----------------------------------

The opted-in queue permits one new CONNECT probe per endpoint. Owner reports, release or a 15-second watchdog release it. Already-authenticated live TLS tunnels remain usable under transport-only quarantine; conditional permits cannot create a replacement CONNECT if the socket disappears. Origin blocks always take precedence, including for warm tunnels.

Failed recovery rounds increase connect quarantine from 30 seconds and TLS quarantine from 120 seconds up to five minutes. Reports during the same quarantine do not multiply recovery rounds. Other queues retain their existing policy. Clean EOF before a CONNECT response is classified as `PROXY_CONNECT_EOF`.

Verified egress identity
-----------------------

A gateway address is not necessarily the public exit address. Private rotation may observe the exit through `https://api.ipify.org?format=json`, with normal certificate validation and two independent matching observations. A new group identity is based on that verified address. Generation, credentials and ISP labels alone never clear a block. The verifier has a bounded budget and refuses redirects, invalid JSON/IPs, excessive bodies and inconsistent observations.

An unknown historical exit conservatively inherits legacy restrictions at the first successful observation. An intervening unverified rotation invalidates the assumption that an older observed address is still current. A later observation only opens a fresh identity when the change is actually established; previously blocked exits remain blocked if returned through another key. All historical queue blocks remain present until their normal expiry.

If verification fails, the assignment uses its legacy identity and restrictions, without claiming a new exit. Known origin/transport restrictions are also recorded on that legacy alias so failure of the external checker cannot reopen a blocked assignment. Legacy exclusions remain attached to observed baseline addresses. The warm pool checks aliases as well as the current identity, so a job cannot borrow an endpoint it has already excluded under an earlier name.

Only hashes enter durable job retry state; no proxy credentials, cookies or leases enter checkpoints. Slot verification metadata is bounded and private to manager state. Status exposes queue, hashes and verification readiness, not exit addresses or credentials.

Job budgets and operations
--------------------------

Group still fails only after ten failed distinct endpoint identities. Permission/proxy waits do not consume another attempt. Source records and worker concurrency do not change. Native cursors, pending items and verified source progress survive scheduling waits and manual retry. Manual retry starts a new ten-endpoint budget and clears obsolete scheduling waits, preserving currently effective exclusions.

Removing a standby setting stops new borrowing and lets active leases finish. Ownership and verification metadata survive manager restarts. Keys admitted into the main ring stop being private. Normal main/API rotation skips the group checker and invalidates older group verification; group uses its guarded legacy identity until a later private rotation can revalidate. API reservation and cross-queue lease checks are repeated before assignment.
