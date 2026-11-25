// Learning selectors must never replace publisher identity or access policies.
export function newsParserRepairFields(learned) {
  const result={};
  for(const field of ['title','publishedDate','body','description'])if(learned[field])result[field]=structuredClone(learned[field]);
  return result;
}

export function newsParserCurrentFields(config,parsed) {
  const index=parsed?.extracted?.variant;
  const active=Number.isInteger(index)&&index>0?{...config,...config.variants?.[index-1]}:config;
  const fields=newsParserRepairFields(active);
  if(parsed?.extracted?.titleEvidenceSource==='native_self_jsonld')fields.title={strategy:'native_self_jsonld'};
  return fields;
}
