/** @returns {GoogleAppsScript.HTML.HtmlOutput} */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const scriptProperties = PropertiesService.getScriptProperties().getProperties();
  const portal = getPortalContent_(getPortalUserProperties_(scriptProperties), scriptProperties);
  template.portal = portal;
  template.theme = getPortalTheme_();
  template.projectUrl = 'https://script.google.com/home/projects/' + encodeURIComponent(ScriptApp.getScriptId()) + '/edit';
  return template.evaluate()
    .setTitle(portal.name)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** @param {unknown} theme */
function isPortalTheme_(theme) {
  return typeof theme === 'string' && ['tsuyukusa', 'sakura', 'wakatake', 'yamabuki', 'tetsukon', 'sumi', 'kuri', 'fukamidori'].includes(theme);
}

/** 現在の実行ユーザーの設定。個人用・デプロイ者実行の Web アプリを前提とする。 */
function getPortalTheme_() {
  const theme = PropertiesService.getUserProperties().getProperty('PORTAL_THEME');
  // 旧テーマの保存値は読み取り時に引き継ぐ。
  if (theme === 'shikon') return 'kuri';
  return isPortalTheme_(theme) ? theme : 'tsuyukusa';
}

/** @param {unknown} theme @returns {{ok: true, theme: string} | {ok: false}} */
function saveTheme(theme) {
  if (!isPortalTheme_(theme)) return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('PORTAL_THEME', /** @type {string} */ (theme)));
    return { ok: true, theme: /** @type {string} */ (theme) };
  } catch {
    console.error('THEME_SAVE_FAILED');
    return { ok: false };
  }
}

/** 未設定・空白は既定値を使う。HTML としては解釈しない。
 * @param {Record<string, string>} properties
 * @param {Record<string, string>} scriptProperties
 */
function getPortalContent_(properties, scriptProperties = {}) {
  const defaults = getPortalPropertyDefaults_();
  const name = properties.PORTAL_NAME?.trim() || defaults.PORTAL_NAME;
  const split = name.search(/\s/);
  const spreadsheetId = scriptProperties.SPREADSHEET_ID?.trim() || '';
  return {
    name,
    defaultsJson: JSON.stringify(defaults),
    icon: Array.from(properties.PORTAL_ICON?.trim() || defaults.PORTAL_ICON)[0],
    brandLead: split < 0 ? name : name.slice(0, split),
    brandRest: split < 0 ? '' : name.slice(split),
    headline: properties.PORTAL_HEADLINE?.trim() || defaults.PORTAL_HEADLINE,
    description: properties.PORTAL_DESCRIPTION?.trim() || defaults.PORTAL_DESCRIPTION,
    spreadsheetUrl: /^[\w-]+$/.test(spreadsheetId) ? 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' : '',
  };
}

/** 対応プロパティの一覧と初期値。表示の既定値もここで管理する。 */
function getPortalPropertyDefaults_() {
  return {
    PORTAL_NAME: 'My Portal',
    PORTAL_HEADLINE: '毎日の仕事に、ひとつの入口を。',
    PORTAL_DESCRIPTION: '業務で使うツールやサービスへのリンクと、日々のToDoをひとつにまとめます。',
    PORTAL_ICON: 'P',
  };
}

/** 設定更新・移行・初期化の競合を防ぐ。 @template T @param {() => T} action @returns {T} */
function withPortalPropertiesLock_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return action(); } finally { lock.releaseLock(); }
}

/** @param {GoogleAppsScript.Properties.Properties} store
 * @param {Record<string, string>} defaults
 * @param {Record<string, string>} legacy
 */
function initializePropertyStore_(store, defaults, legacy = {}) {
  const current = store.getProperties();
  /** @type {Record<string, string>} */
  const missing = {};
  const existing = [];
  const migrated = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      existing.push(key);
    } else if (Object.prototype.hasOwnProperty.call(legacy, key)) {
      missing[key] = legacy[key];
      migrated.push(key);
    } else {
      missing[key] = value;
    }
  }
  if (Object.keys(missing).length) store.setProperties(missing, false);
  return { created: Object.keys(missing), existing, migrated };
}

/** @param {Record<string, string>} scriptProperties */
function initializeUserProperties_(scriptProperties) {
  const defaults = getPortalPropertyDefaults_();
  // 移行するのは表示設定 4 項目のみ。接続先と任意キーはユーザー領域にコピーしない。
  const legacy = Object.fromEntries(Object.entries(scriptProperties).filter(([key]) => Object.prototype.hasOwnProperty.call(defaults, key)));
  return initializePropertyStore_(PropertiesService.getUserProperties(), { ...defaults, PORTAL_THEME: 'tsuyukusa' }, legacy);
}

/** @param {Record<string, string>} scriptProperties */
function getPortalUserProperties_(scriptProperties) {
  return withPortalPropertiesLock_(() => {
    initializeUserProperties_(scriptProperties);
    return PropertiesService.getUserProperties().getProperties();
  });
}

/** GAS エディタから実行。存在するキーは空値も含めて保持し、設定値は返さない。 */
function initializeProperties() {
  return withPortalPropertiesLock_(() => {
    const scriptStore = PropertiesService.getScriptProperties();
    const script = initializePropertyStore_(scriptStore, {
      SPREADSHEET_ID: 'EXAMPLE_SPREADSHEET_ID', SHEET_NAME: 'ツール一覧',
    });
    const user = initializeUserProperties_(scriptStore.getProperties());
    return { script, user };
  });
}

/** 旧コマンド・エディタ操作との互換用。新しい初期化処理へ委譲する。 */
function initializeScriptProperties() {
  const result = initializeProperties();
  return {
    created: [...result.script.created, ...result.user.created],
    existing: [...result.script.existing, ...result.user.existing],
  };
}

/** @param {unknown} input @returns {Record<string, string>} */
function validatePortalSettings_(input) {
  const defaults = getPortalPropertyDefaults_();
  /** @type {Record<string, number>} */
  const limits = { PORTAL_NAME: 80, PORTAL_ICON: 1, PORTAL_HEADLINE: 160, PORTAL_DESCRIPTION: 500 };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('表示設定の形式が不正です。');
  const values = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(values).length !== Object.keys(defaults).length || Object.keys(values).some((key) => !Object.prototype.hasOwnProperty.call(defaults, key))) {
    throw new Error('変更できるのは表示設定の 4 項目だけです。');
  }
  /** @type {Record<string, string>} */
  const settings = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = values[key];
    if (typeof value !== 'string') throw new Error('表示設定はテキストで入力してください。');
    const trimmed = value.trim();
    if (Array.from(trimmed).length > limits[key]) throw new Error(key + ' は ' + limits[key] + ' 文字以内で入力してください。');
    settings[key] = trimmed || fallback;
  }
  return settings;
}

/** @param {unknown} input */
function savePortalSettings(input) {
  let settings;
  try { settings = validatePortalSettings_(input); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '入力内容を確認してください。' }; }
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperties(settings, false));
    return { ok: true, settings };
  } catch {
    console.error('PORTAL_SETTINGS_SAVE_FAILED');
    return { ok: false, error: '保存できませんでした。もう一度お試しください。' };
  }
}

/** テーマ・接続先は保持。既定値を明示的に保存し、旧 Script Properties の再移行を防ぐ。 */
function resetPortalSettings() {
  return savePortalSettings(getPortalPropertyDefaults_());
}

/** 静的な自作ファイルだけをテンプレートへ埋め込む。 @param {string} filename */
function include_(filename) {
  if (!['Styles', 'Client'].includes(filename)) throw new Error('INVALID_INCLUDE');
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 公開 RPC。アクセス制限は Web アプリの MYSELF 設定が担う。
 * デプロイ者の読み取り専用認可で、設定したスプレッドシートを読む。
 * @returns {({ok: true} & Catalog) | {ok: false, error: string}}
 */
function getCatalog() {
  try {
    return { ok: true, ...readSheetCatalog_() };
  } catch (error) {
    /** @type {Record<string, string>} */
    const messages = {
      SPREADSHEET_NOT_CONFIGURED: 'スクリプトプロパティ SPREADSHEET_ID にスプレッドシートの ID を設定してください。',
      SHEET_NAME_NOT_CONFIGURED: 'スクリプトプロパティ SHEET_NAME に読み込むシート名を設定してください。',
      SHEETS_SERVICE_DISABLED: 'GAS のサービスで Google Sheets API を有効にしてください。',
      SHEET_NOT_FOUND: '指定されたシートがありません。SHEET_NAME とシート名が一致しているか確認してください。',
      INVALID_SHEET_HEADERS: '指定シートの 1 行目に id・name・url の列が必要です。列名の重複も確認してください。',
      LEGACY_RELATED_HEADERS: '関連リンクを relatedLinks 列にまとめてください。1 セル内に「URL 半角スペース ラベル」を 1 行ずつ入力します。',
    };
    const code = error instanceof Error && Object.prototype.hasOwnProperty.call(messages, error.message) ? error.message : 'READ_FAILED';
    console.error('CATALOG_FAILED', code);
    return { ok: false, error: messages[code] || '一覧を取得できませんでした。スプレッドシートの共有設定・認可・Sheets API の設定を確認し、ページを再読み込みしてください。' };
  }
}
