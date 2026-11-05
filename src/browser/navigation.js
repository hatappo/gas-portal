// Portal and settings tabs, kept in sync with the URL hash.
(() => {
  'use strict';
  /** @param {string} id @returns {HTMLElement} */
  function element(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error('Missing UI element: ' + id);
    return node;
  }
  /** @type {Animation | undefined} */
  let panelAnimation;
  PortalMotion.onReduce(() => panelAnimation?.cancel());

  const portalTabs = [
    { hash: 'tools', button: element('tab-tools'), panel: element('directory') },
    { hash: 'actions', button: element('tab-actions'), panel: element('actions-panel') },
    { hash: 'settings', button: element('tab-settings'), panel: element('settings-panel') },
  ];
  const settingsTabs = ['appearance', 'tools', 'actions'].map((hash) => ({
    hash, button: element('settings-tab-' + hash), panel: element('settings-' + hash + '-panel'),
  }));
  let activeSettingsTab = 0;
  /** @param {number} index */
  function selectSettingsTab(index) {
    activeSettingsTab = index;
    settingsTabs.forEach(({ button, panel }, current) => {
      button.setAttribute('aria-selected', String(current === index));
      button.tabIndex = current === index ? 0 : -1;
      panel.hidden = current !== index;
    });
  }
  let activeTab = 0;
  /** @param {number} index */
  function selectPortalTab(index) {
    if (activeTab === index) return;
    activeTab = index;
    panelAnimation?.cancel();
    portalTabs.forEach(({ button, panel }, current) => {
      button.setAttribute('aria-selected', String(current === index));
      button.tabIndex = current === index ? 0 : -1;
      panel.hidden = current !== index;
    });
    panelAnimation = PortalMotion.appear(portalTabs[index].panel);
    document.dispatchEvent(new CustomEvent('portal:tabchange', { detail: portalTabs[index].hash }));
  }
  // GAS renders this code in a sandbox iframe. Its bridge controls the public URL;
  // the local preview uses the browser history API instead.
  const gasHistory = typeof google !== 'undefined' ? google.script?.history : undefined;
  const gasUrl = typeof google !== 'undefined' ? google.script?.url : undefined;
  const useGasHistory = typeof gasHistory?.push === 'function' && typeof gasHistory?.setChangeHandler === 'function' && typeof gasUrl?.getLocation === 'function';
  let routeHash = '';
  let navigationRevision = 0;

  /** @param {string | undefined} hash */
  function applyRoute(hash) {
    routeHash = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
    // Preserve the skip-to-content link without treating it as a tab route.
    if (routeHash === 'main') return;
    const [main, section] = routeHash.split('/');
    if (main === 'settings') {
      const sectionIndex = settingsTabs.findIndex((tab) => tab.hash === section);
      selectSettingsTab(sectionIndex < 0 ? 0 : sectionIndex);
    }
    const index = portalTabs.findIndex((tab) => tab.hash === (main === 'settings' ? main : routeHash));
    selectPortalTab(index < 0 ? 0 : index);
  }

  /** @param {number} index @param {string} [hash] */
  function navigatePortalTab(index, hash = index === 2 && activeSettingsTab !== 0 ? 'settings/' + settingsTabs[activeSettingsTab].hash : portalTabs[index].hash) {
    navigationRevision++;
    selectPortalTab(index);
    if (routeHash === hash) return;
    try {
      if (useGasHistory) gasHistory?.push(null, null, hash);
      else window.history.pushState(window.history.state, '', '#' + hash);
      routeHash = hash;
    } catch {
      // A bridge failure must not prevent switching tabs or discard form drafts.
      console.warn('PORTAL_NAVIGATION_UPDATE_FAILED');
    }
  }

  if (useGasHistory) {
    try {
      gasHistory?.setChangeHandler((event) => {
        navigationRevision++;
        applyRoute(event.location?.hash);
      });
      const initialRevision = navigationRevision;
      gasUrl?.getLocation((location) => {
        if (navigationRevision === initialRevision) applyRoute(location.hash);
      });
    } catch { console.warn('PORTAL_NAVIGATION_INIT_FAILED'); }
  } else {
    const syncRoute = () => { navigationRevision++; applyRoute(window.location.hash); };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    applyRoute(window.location.hash);
  }

  settingsTabs.forEach(({ button }, index) => {
    const navigate = (/** @type {number} */ next) => {
      selectSettingsTab(next);
      navigatePortalTab(2, 'settings/' + settingsTabs[next].hash);
    };
    button.addEventListener('click', () => navigate(index));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % settingsTabs.length;
      else if (event.key === 'ArrowLeft') next = (index + settingsTabs.length - 1) % settingsTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = settingsTabs.length - 1;
      else return;
      event.preventDefault();
      navigate(next);
      settingsTabs[next].button.focus();
    });
  });

  portalTabs.forEach(({ button }, index) => {
    button.addEventListener('click', () => navigatePortalTab(index));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % portalTabs.length;
      else if (event.key === 'ArrowLeft') next = (index + portalTabs.length - 1) % portalTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = portalTabs.length - 1;
      else return;
      event.preventDefault();
      navigatePortalTab(next);
      portalTabs[next].button.focus();
    });
  });
})();
