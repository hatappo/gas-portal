import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    console.warn('SIDE_PANEL_UNAVAILABLE');
  });
});
