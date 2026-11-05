// Builds the cards, table rows, and related links for catalog tools.
window.PortalToolView = (() => {
  'use strict';
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  /** @param {CatalogTool} tool */
  function tagLabels(tool) {
    const labels = document.createElement('div');
    labels.className = 'tool-tags';
    labels.hidden = tool.tags.length === 0;
    tool.tags.forEach((tag) => {
      const label = document.createElement('span');
      label.className = 'tool-tag badge badge-sm';
      label.textContent = tag;
      labels.append(label);
    });
    return labels;
  }

  /** Read the saved setting on each render so a change applies without refetching. */
  function unblockedSchemes() {
    return PortalUrlSchemes.normalizeUnblocked(document.getElementById('url-scheme-settings')?.dataset.savedValue);
  }

  /** @param {string} url */
  function isBlockedUrl(url) {
    return PortalUrlSchemes.isBlocked(url, unblockedSchemes());
  }

  /** Show a blocked URL as plain text so it can be read and copied, never opened. @param {string} url */
  function blockedUrl(url) {
    const notice = document.createElement('span');
    notice.className = 'blocked-url';
    const label = document.createElement('span');
    label.className = 'blocked-url-label badge badge-xs badge-outline';
    label.textContent = t("Blocked scheme");
    const text = document.createElement('span');
    text.className = 'blocked-url-text';
    text.textContent = url;
    notice.append(label, text);
    return notice;
  }

  /** A blocked URL gets a non-interactive element with no href. @param {{url: string}} tool */
  function toolLink(tool) {
    if (isBlockedUrl(tool.url)) {
      const blocked = document.createElement('span');
      blocked.classList.add('is-blocked');
      blocked.setAttribute('aria-disabled', 'true');
      blocked.title = t('Blocked link: {url}', { url: tool.url });
      return blocked;
    }
    const link = document.createElement('a');
    link.href = tool.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const newTab = document.createElement('span');
    newTab.className = 'visually-hidden';
    newTab.textContent = t("(opens in a new tab)");
    link.append(newTab);
    return link;
  }

  /** Candidate icon URLs, tried in order. Only the origin or hostname is sent, never the path or query.
   * 1. The site's own /favicon.ico. The browser can reach intranet and signed-in sites that Google cannot,
   *    and the request goes only to the site the link already points at.
   * 2. Google's favicon service, for public hostnames only. With fallback_opts it answers 404 instead of a
   *    generic globe when it has no icon, so the emoji fallback appears and small real icons are kept.
   * @param {string} value @returns {string[]}
   */
  function faviconSources(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
      const hostname = url.hostname.replace(/\.$/, '');
      /** @type {string[]} */
      const sources = [];
      // An http image would be mixed content on the https portal page.
      if (url.protocol === 'https:') sources.push(url.origin + '/favicon.ico');
      // Keep local addresses and reserved private DNS suffixes off the external service.
      const isPrivate = !hostname.includes('.') || hostname.includes(':') || /^[\d.]+$/.test(hostname) ||
        /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(hostname) || hostname.endsWith('.home.arpa');
      if (!isPrivate) {
        sources.push('https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=' +
          encodeURIComponent(url.protocol + '//' + hostname));
      }
      return sources;
    } catch {
      return [];
    }
  }

  /** @param {CatalogTool} tool */
  function toolFavicon(tool) {
    return favicon(tool.url, 'tool-favicon', 20, tool.icon);
  }

  /** @param {string} icon */
  const isIconUrl = (icon) => PortalCatalogRules.isIconUrl(icon);

  /** A decorative icon with an emoji fallback that stays visible until an icon loads.
   * A spreadsheet icon overrides detection: text replaces the fallback, and an image URL is tried first.
   * @param {string} url @param {string} className @param {number} size @param {string} [icon]
   */
  function favicon(url, className, size, icon = '') {
    const frame = document.createElement('span');
    frame.className = className;
    frame.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('span');
    fallback.className = className + '-fallback';
    fallback.textContent = icon && !isIconUrl(icon) ? icon : '🌐';
    frame.append(fallback);
    if (icon && !isIconUrl(icon)) {
      frame.classList.add('is-text');
      return frame;
    }
    const sources = icon ? [icon, ...faviconSources(url)] : faviconSources(url);
    if (sources.length) {
      const image = document.createElement('img');
      image.width = size;
      image.height = size;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      let index = 0;
      const next = () => {
        index++;
        if (index < sources.length) image.src = sources[index];
        else image.remove();
      };
      image.addEventListener('load', () => {
        // Placeholder pixels are not icons; try the next source.
        if (image.naturalWidth > 0 && (image.naturalWidth < 8 || image.naturalHeight < 8)) { next(); return; }
        frame.classList.add('is-loaded');
      });
      image.addEventListener('error', next);
      image.src = sources[0];
      frame.append(image);
    }
    return frame;
  }

  /** @param {CatalogTool} tool @param {boolean} [tooltipLeft] */
  function relatedLinks(tool, tooltipLeft = false) {
    const list = document.createElement('ul');
    list.className = 'related-links';
    list.setAttribute('aria-label', t('Related links for {name}', { name: tool.name }));
    (tool.children || []).forEach((child) => {
      const item = document.createElement('li');
      const link = toolLink(child);
      const label = document.createElement('span');
      label.className = 'related-label';
      label.textContent = child.name;
      if (link.classList.contains('is-blocked')) {
        link.prepend(label);
        link.append(blockedUrl(child.url));
      } else {
        link.prepend(favicon(child.url, 'related-favicon', 14, child.icon), label);
      }
      if (child.description) {
        // DaisyUI draws the tooltip with CSS, which screen readers skip; describe the link as well.
        item.classList.add('tooltip');
        // In the list view, links sit in the last column; open leftward to stay inside the scrolling table.
        if (tooltipLeft) item.classList.add('tooltip-left');
        item.dataset.tip = child.description;
        link.setAttribute('aria-description', child.description);
      }
      item.append(link);
      list.append(item);
    });
    return list;
  }

  /** @param {CatalogTool} tool */
  function card(tool) {
    const item = document.createElement('li');
    const container = document.createElement('article');
    container.className = 'tool-card card card-border bg-base-100';
    const link = toolLink(tool);
    link.classList.add('tool-main');
    const blocked = link.classList.contains('is-blocked');
    container.classList.toggle('is-blocked', blocked);
    const title = document.createElement('h3');
    const titleText = document.createElement('span');
    titleText.textContent = tool.name;
    title.append(toolFavicon(tool), titleText);
    const description = document.createElement('p');
    description.className = 'tool-description';
    description.textContent = tool.description;
    link.prepend(title, description, tagLabels(tool));
    if (blocked) description.after(blockedUrl(tool.url));
    container.append(link);
    if (tool.children?.length) container.append(relatedLinks(tool));
    item.append(container);
    return item;
  }

  /** @param {CatalogTool} tool */
  function tableRow(tool) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    const link = toolLink(tool);
    link.classList.add('tool-name-link');
    const titleText = document.createElement('span');
    titleText.textContent = tool.name;
    link.prepend(toolFavicon(tool), titleText);
    name.append(link);
    if (link.classList.contains('is-blocked')) name.append(blockedUrl(tool.url));
    const description = document.createElement('td');
    description.textContent = tool.description || '—';
    const tags = document.createElement('td');
    tags.append(tagLabels(tool));
    const related = document.createElement('td');
    if (tool.children?.length) related.append(relatedLinks(tool, true));
    else related.textContent = '—';
    row.append(name, description, tags, related);
    return row;
  }

  return { card, tableRow };
})();
