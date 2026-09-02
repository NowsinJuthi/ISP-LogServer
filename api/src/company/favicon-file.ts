import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { webConfigDir } from './web-config.store';

const ALLOWED = new Map([
  ['image/png', '.png'],
  ['image/x-icon', '.ico'],
  ['image/vnd.microsoft.icon', '.ico'],
  ['image/svg+xml', '.svg'],
  ['image/webp', '.webp'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
]);

export function faviconFileName(stored?: string | null) {
  const name = String(stored || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (name.startsWith('browser-favicon.') && existsSync(join(webConfigDir(), name))) {
    return name;
  }
  const dir = webConfigDir();
  if (!existsSync(dir)) return '';
  return readdirSync(dir).find((f) => f.startsWith('browser-favicon.')) || '';
}

export function faviconDiskPath(stored?: string | null) {
  const name = faviconFileName(stored);
  return name ? join(webConfigDir(), name) : '';
}

export function faviconPublicUrl(stored?: string | null) {
  const name = faviconFileName(stored);
  return name ? `/api/branding/favicon?v=${encodeURIComponent(name)}` : '';
}

export function faviconMime(name: string) {
  if (name.endsWith('.ico')) return 'image/x-icon';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

export function writeFavicon(buf: Buffer, mime: string) {
  const ext = ALLOWED.get(String(mime || '').toLowerCase());
  if (!ext) {
    throw new Error('Use a PNG, ICO, SVG, WEBP or JPG image.');
  }
  if (buf.length > 200 * 1024) {
    throw new Error('Favicon must be under 200 KB.');
  }
  const dir = webConfigDir();
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) {
    if (f.startsWith('browser-favicon.')) unlinkSync(join(dir, f));
  }
  const name = `browser-favicon${ext}`;
  writeFileSync(join(dir, name), buf);
  return name;
}

export function removeFaviconFiles() {
  const dir = webConfigDir();
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.startsWith('browser-favicon.')) unlinkSync(join(dir, f));
  }
}
