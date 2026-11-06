import { createSignal } from 'solid-js';
import { mountTabs } from './tabs';

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
  const [activeSettingsTab, setActiveSettingsTab] = createSignal(0);
  /** @param {number} index */
  function selectSettingsTab(index) {
    setActiveSettingsTab(index);
  }
  const [activeTab, setActiveTab] = createSignal(0);
  /** @param {number} index */
  function selectPortalTab(index) {
    if (activeTab() === index) return;
    setActiveTab(index);
    panelAnimation?.cancel();
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
  function navigatePortalTab(index, hash = index === 2 && activeSettingsTab() !== 0 ? 'settings/' + settingsTabs[activeSettingsTab()].hash : portalTabs[index].hash) {
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

  mountTabs(settingsTabs, activeSettingsTab, (index) => {
    selectSettingsTab(index);
    navigatePortalTab(2, 'settings/' + settingsTabs[index].hash);
  });
  mountTabs(portalTabs, activeTab, navigatePortalTab);

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

})();
