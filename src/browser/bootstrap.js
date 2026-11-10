// One composition root: imports do not mount controls, touch the DOM, or start RPCs.
// Initialize language before rendering views, routing before lazy service connections,
// and tooltip adapters after their underlying controls are mounted.
import { initializeGmail } from './gmail';
import { initializeCalendar } from './calendar';
import { createMotion } from './motion.js';
import { initializeLanguage } from './language.js';
import { initializeNavigation } from './navigation.js';
import { initializeCatalog } from './client.js';
import { initializeTheme } from './theme.js';
import { initializeSettings } from './settings.js';
import { initializeCacheSettings } from './cache-settings.js';
import { initializeUrlSchemeSettings } from './url-scheme-settings.js';
import { initializeFaviconFinder } from './favicon-finder.js';
import { initializeSpreadsheetSettings } from './spreadsheet-settings.js';
import { initializeActions } from './action-items.js';
import { initializeGitHub } from './github.js';
import { initializeSlack } from './slack.js';
import { mountDisclosures } from './disclosure';
import { mountRefreshHints } from './ui';

/** @param {{connectGitHub?: typeof initializeGitHub, connectSlack?: typeof initializeSlack, connectCalendar?: typeof initializeCalendar, connectGmail?: typeof initializeGmail}} [options] */
export function initializePortal({ connectGitHub = initializeGitHub, connectSlack = initializeSlack, connectCalendar = initializeCalendar, connectGmail = initializeGmail } = {}) {
  const motion = createMotion();
  initializeLanguage();
  initializeNavigation(motion);
  mountDisclosures();
  const catalog = initializeCatalog(motion);
  initializeTheme();
  initializeSettings();
  initializeCacheSettings();
  initializeUrlSchemeSettings();
  initializeFaviconFinder();
  initializeSpreadsheetSettings();
  const actions = initializeActions();
  connectGmail(actions);
  connectSlack(actions, catalog);
  connectGitHub(actions);
  const calendar = connectCalendar();
  mountRefreshHints();
  return { actions, calendar };
}
