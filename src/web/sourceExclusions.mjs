export function isExcludedSource(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value.trim());
    const host = url.hostname.replace(/\.$/, '');
    return host === 'fireant.vn' || host.endsWith('.fireant.vn');
  } catch {
    return false;
  }
}
