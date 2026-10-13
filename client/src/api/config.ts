export function validateApiBaseUrl(value: string | undefined, hosted: boolean): void {
  if (!value) {
    if (hosted) throw new Error('Set VITE_API_BASE_URL before building the hosted frontend.');
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_BASE_URL must be an HTTP/HTTPS URL ending in /api.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || !/^\/api\/?$/.test(url.pathname)
    || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must be an HTTP/HTTPS URL ending in /api, without credentials or query options.');
  }
  if ((!local && url.protocol !== 'https:') || (hosted && (local || url.hostname.endsWith('.invalid')))) {
    throw new Error('The hosted frontend requires a real HTTPS API URL; loopback URLs are for local verification.');
  }
}
