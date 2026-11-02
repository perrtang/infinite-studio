// Only share links move automatically. The old home page remains available
// because browser-local documents are isolated by origin.
export function sharedLinkRedirect(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'moodboard.petfashion.tw') return null;
  if (!url.searchParams.get('driveFile') && !url.searchParams.get('lockedShare')) return null;
  url.hostname = 'infinite.petfashion.tw';
  return url.href;
}
