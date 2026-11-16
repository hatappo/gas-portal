import './styles.css';
import '../shared/i18n.js';
import '../shared/url-schemes.js';
import '../shared/side-panel.js';
import '../shared/themes.js';
import '../shared/catalog-rules.js';
import '../shared/cache-durations.js';
import '../shared/slack-settings.js';
import '../shared/calendar.js';
import '../shared/gmail-settings.js';
import { initializePortal } from './bootstrap.js';

import { allowSidePanel, notifySidePanelReady } from './side-panel-bridge';

if (allowSidePanel()) {
  initializePortal();
  notifySidePanelReady();
}
