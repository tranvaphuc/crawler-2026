const sources=new Set(['url_bound_publication_feed','url_bound_original_jsonld','corroborated_original_metadata','scoped_original_article_clock','scoped_original_article_day']);
// A version flag alone cannot authorize a newly introduced timezone shortcut.
export function approvedPublicationProofSource(proof){return !!proof&&(sources.has(proof.source)||proof.source==='scoped_native_updated_fallback'&&proof.publicationDatePolicy==='native_updated_when_original_missing'&&proof.publicationDateKind==='updated_fallback');}
