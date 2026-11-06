/** Shared copy for loaded-list counters. The total is the loaded snapshot, not a remote total.
 * @param {number} visible @param {number} total @param {string} language
 */
export function formatListCount(visible, total, language) {
  return PortalI18n.t('{visible} / {total} items', language, { visible, total });
}

/** Keep the visible retrieval label stable; cache/source details belong in its tooltip.
 * @param {HTMLElement} element
 * @param {{fetchedAt?: number, cached?: boolean, oldest?: boolean}} value
 * @param {string} language
 */
export function renderListFreshness(element, value, language) {
  const valid = typeof value.fetchedAt === 'number' && Number.isFinite(value.fetchedAt) && value.fetchedAt > 0;
  element.hidden = !valid;
  if (!valid) { element.textContent = ''; element.removeAttribute('title'); return; }
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value.fetchedAt);
  element.textContent = PortalI18n.t('Retrieved {time}', language, { time });
  element.title = [PortalI18n.t(value.cached ? 'Cached · Retrieved {time}' : 'Retrieved {time}', language, { time }),
    value.oldest && PortalI18n.t('Oldest retrieval time among successful connections', language)].filter(Boolean).join(' · ');
}
