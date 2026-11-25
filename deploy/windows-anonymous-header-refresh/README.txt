Anonymous Facebook Group header refresh — Windows agent

Installed task: Crawler Anonymous Group Headers Hourly
The agent runs every hour under the Windows user's S4U token at limited privilege.
It uses a new temporary Chrome profile and an incognito context, then removes the
profile. It does not open an existing browser profile or use a logged-in session.

Distribution layout:
  package.json, package-lock.json, config.json, Run.ps1, Install.ps1
  scripts/anonymous_group_header_capture.mjs
  src/services/anonymousHeaderUpload.js

Dependencies are pinned in package.json. Install with:
  npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund
Provision config.json and a dedicated restricted upload key before Install.ps1.
The host key is pinned in config.json. Never replace it using an untrusted scan.
No password or private key is included in the source/distribution archive.

The server-side receiver is installed outside application releases under:
  /var/lib/crawler-v8/anonymous-header-refresh/app
Its SSH key is restricted to that receiver, with no forwarding or terminal.
The receiver is serialized with flock and bounded to 150 seconds. It rejects
expired captures, non-anonymous actors, authentication headers/cookies, wrong
sources and malformed requests. It validates a candidate using the actual Group
proxy route, fresh server-side anonymous context, the deployed parser, and one
existing saved cursor for the same Group when available. Probe requests are
bounded; no queue, checkpoint, cutoff, retry budget or worker is reset.

Only successful native validation promotes a candidate. Promotion preserves
other HAR queries and established batch tuning, retains an old private backup,
and atomically swaps the Group template with its existing ownership/mode.
A concurrent operator change prevents promotion. Browser cookies and ephemeral
CSRF/nonces are not installed as shared runtime credentials; the server creates
fresh anonymous context for each proxy session as before.

A normal server decision of kept_current is a successful scheduled execution.
Capture/transport failures return exit code 2. Both outcomes preserve the old
server template unless native validation has actually succeeded.

The Windows private directory contains last-run.json and task-definition.xml.
The server private state directory contains last-run.json and history/ backups.
Keep these diagnostic files private; do not render them in product interfaces.
The PC must be powered on and have network access. StartWhenAvailable is enabled.

Windows controls:
  Get-ScheduledTask -TaskName 'Crawler Anonymous Group Headers Hourly'
  Get-ScheduledTaskInfo -TaskName 'Crawler Anonymous Group Headers Hourly'
  Start-ScheduledTask -TaskName 'Crawler Anonymous Group Headers Hourly'
  Disable-ScheduledTask -TaskName 'Crawler Anonymous Group Headers Hourly'
  Enable-ScheduledTask -TaskName 'Crawler Anonymous Group Headers Hourly'
