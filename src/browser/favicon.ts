// Only origins are sent to the icon service. Private hosts stay on the local network.
export function faviconSources(value: string): string[] {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
    const hostname = url.hostname.replace(/\.$/, '');
    const sources = url.protocol === 'https:' ? [url.origin + '/favicon.ico'] : [];
    const isPrivate =
      !hostname.includes('.') ||
      hostname.includes(':') ||
      /^[\d.]+$/.test(hostname) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(hostname) ||
      hostname.endsWith('.home.arpa');
    if (!isPrivate)
      sources.push(
        'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=' +
          encodeURIComponent(url.protocol + '//' + hostname),
      );
    return sources;
  } catch {
    return [];
  }
}
