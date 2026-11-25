import {userConfirmedOriginalDayProof} from '../src/web/newsUserConfirmedDayPrecision.mjs';
import {hasNativePublicationTimezone} from '../src/web/newsTimezoneEvidence.mjs';
import {toEs5News} from '../src/newsFlow/identity.mjs';

// Match the production write gates as well as extraction, without writing to ES.
export function currentAuditGate(audit, config, registry, sourceDomain = config.siteName) {
  if (!audit.parsed || audit.error) return audit;
  const quality = [...(audit.quality || []), ...(audit.fields?.issues || [])];
  if (audit.policyConflict) quality.push({code: 'NEWS_DOCUMENT_POLICY_CONFLICT'});
  if (config.requiresTimezoneReviewBeforeWrite && !userConfirmedOriginalDayProof(audit.parsed.extracted.publicationProof)&& !hasNativePublicationTimezone(audit.parsed,config)) quality.push({code: 'NEWS_TIMEZONE_UNCONFIRMED'});
  const shared = registry.sources.get(sourceDomain)?.quality.sharedDescriptions || [];
  const description = String(audit.parsed._source.description || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (shared.includes(description)) quality.push({code: 'NEWS_GENERIC_DESCRIPTION'});
  if (registry.sources.get(sourceDomain)?.quality.sharedContentHashes?.includes(audit.parsed.extracted.contentSha256)) quality.push({code: 'NEWS_REPEATED_PUBLISHER_CONTENT'});
  try {
    const canonical = new URL(audit.parsed.extracted.canonicalUrl, audit.parsed._source.url);
    if (registry.byHost(canonical.hostname)?.config.registrableDomain !== config.registrableDomain) quality.push({code: 'NEWS_CANONICAL_PUBLISHER_CONFLICT'});
    toEs5News(audit.parsed, config);
  } catch (error) {
    return {...audit, quality, error: error.code || error.message};
  }
  return {...audit, quality};
}
