// Shared by the GAS server and browser bundle. English messages are stable keys.
globalThis.PortalI18n = (() => {
  /** @type {Record<string, string>} */
  const messages = {
  "Skip to main content": "メインコンテンツへ",
  "Portal sections": "ポータルのセクション",
  "Settings": "設定",
  "Search tools by name, description, or tags": "ツール名・説明・タグを検索",
  "Search by name, description, or tags": "ツール名・説明・タグで検索",
  "Tool scope": "ツールの区分",
  "All": "すべて",
  "Internal": "社内",
  "External": "社外",
  "View mode": "表示形式",
  "Filter by tags": "タグで絞り込む",
  "Data issues": "データの確認事項",
  "Tools": "ツール一覧",
  "Tools table (scroll horizontally on narrow screens)": "ツール一覧の表（狭い画面では横スクロール）",
  "Tool": "ツール",
  "Description": "説明",
  "Scope": "区分",
  "Related links": "関連リンク",
  "Loading…": "読み込み中です",
  "Fetching the tool list.": "ツールの一覧を取得しています。",
  "Clear filters": "絞り込みを解除",
  "Enable JavaScript to display the tool list.": "ツール一覧を表示するには JavaScript を有効にしてください。",
  "Display settings": "表示設定",
  "Customize the portal name and text for your work.": "自分の仕事に合わせて、ポータルの名前や文言を変更できます。",
  "Portal display settings": "ポータルの表示設定",
  "Portal name": "ポータル名",
  "Icon": "アイコン",
  "1 character": "1文字",
  "Headline": "見出し",
  "Description text": "説明文",
  "Save changes": "変更を保存",
  "Restore defaults": "既定値に戻す",
  "Automatic theme": "自動",
  "Follow your device: Tsuyukusa in light mode, Tetsukon in dark mode.": "端末の設定に合わせて、ライトは露草色、ダークは鉄紺に切り替えます。",
  "Color theme": "カラーテーマ",
  "Choose a color theme. Your selection is saved automatically.": "使いやすい色合いを選んでください。設定は自動的に保存されます。",
  "Tsuyukusa · 露草色": "露草色",
  "Sakura · 桜色": "桜色",
  "Wakatake · 若竹色": "若竹色",
  "Yamabuki · 山吹色": "山吹色",
  "Tetsukon · 鉄紺": "鉄紺",
  "Sumi · 墨色": "墨色",
  "Kuri · 栗色": "栗色",
  "Fukamidori · 深緑": "深緑",
  "Tsuyukusa (Light)": "露草色（Light）",
  "Sakura (Light)": "桜色（Light）",
  "Wakatake (Light)": "若竹色（Light）",
  "Yamabuki (Light)": "山吹色（Light）",
  "Tetsukon (Dark)": "鉄紺（Dark）",
  "Sumi (Dark)": "墨色（Dark）",
  "Kuri (Dark)": "栗色（Dark）",
  "Fukamidori (Dark)": "深緑（Dark）",
  "Clear blue · Default": "澄んだ青 · デフォルト",
  "Soft pink": "やわらかな紅",
  "Fresh green": "みずみずしい緑",
  "Warm gold": "あたたかな黄金",
  "Quiet deep blue": "深い青の静けさ",
  "Calm neutrals": "落ち着いた無彩色",
  "Muted reddish brown": "渋みのある赤茶",
  "Peaceful forest green": "穏やかな森の緑",
  "Management links": "管理リンク",
  "(opens in a new tab)": "（新しいタブで開きます）",
  "Mock data": "架空データ",
  "Saving…": "保存中…",
  "Could not confirm the save. Reload the page to check.": "保存を確認できませんでした。ページを再読み込みして確認してください。",
  "Could not save. Your input has been kept. Please try again.": "保存できませんでした。入力内容は保持しています。もう一度お試しください。",
  "Saved": "保存しました",
  "The fields have been reset. Select “Save changes” to apply them.": "入力欄を既定値に戻しました。反映するには「変更を保存」を押してください。",
  "Could not save. Please select a theme again.": "保存できませんでした。もう一度選択してください。",
  "Related links for {name}": "{name}の関連リンク",
  "Entries not displayed: {count}. Check the spreadsheet.": "{count} 件の登録データを表示できませんでした。スプレッドシートを確認してください。",
  "Row {row}: {message}": "{row} 行目：{message}",
  "No tools can be displayed": "表示できるツールがありません",
  "No tools have been added yet": "ツールがまだ登録されていません",
  "Fix the spreadsheet using the issues listed above.": "上の確認事項に沿ってスプレッドシートを修正してください。",
  "Add tools to the spreadsheet to display them here.": "スプレッドシートに登録すると、ここにツールが表示されます。",
  "No matching tools": "ツールが見つかりません",
  "Try a different keyword, scope, or tag.": "キーワード・区分・タグを変えてお試しください。",
  "Could not load the tool list": "一覧を取得できませんでした",
  "Reload the page in your browser. If the problem persists, check the GAS settings.": "ブラウザでページを再読み込みしてください。解決しない場合は GAS の設定を確認してください。",
  "One place to start your workday.": "毎日の仕事に、ひとつの入口を。",
  "Keep your work tools, service links, and daily to-dos in one place.": "業務で使うツールやサービスへのリンクと、日々のToDoをひとつにまとめます。",
  "Invalid display settings.": "表示設定の形式が不正です。",
  "Only the four display settings can be changed.": "変更できるのは表示設定の 4 項目だけです。",
  "Enter display settings as text.": "表示設定はテキストで入力してください。",
  "{key} must contain at most {limit} characters.": "{key} は {limit} 文字以内で入力してください。",
  "Check your input.": "入力内容を確認してください。",
  "Could not save. Please try again.": "保存できませんでした。もう一度お試しください。",
  "Set the spreadsheet ID in the SPREADSHEET_ID Script Property.": "スクリプトプロパティ SPREADSHEET_ID にスプレッドシートの ID を設定してください。",
  "Set the sheet name in the SHEET_NAME Script Property.": "スクリプトプロパティ SHEET_NAME に読み込むシート名を設定してください。",
  "Enable the Google Sheets API in GAS Services.": "GAS のサービスで Google Sheets API を有効にしてください。",
  "The specified sheet does not exist. Check that SHEET_NAME matches its name.": "指定されたシートがありません。SHEET_NAME とシート名が一致しているか確認してください。",
  "The first row must contain id, name, and url columns. Also check for duplicate column names.": "指定シートの 1 行目に id・name・url の列が必要です。列名の重複も確認してください。",
  "Combine related links in the relatedLinks column, with one URL, a space, and a label per line.": "関連リンクを relatedLinks 列にまとめてください。1 セル内に「URL 半角スペース ラベル」を 1 行ずつ入力します。",
  "Could not load the list. Check spreadsheet sharing, authorization, and Sheets API settings, then reload the page.": "一覧を取得できませんでした。スプレッドシートの共有設定・認可・Sheets API の設定を確認し、ページを再読み込みしてください。",
  "Each relatedLinks line must contain an HTTPS URL, a space, and a label.": "relatedLinks は 1 行に「HTTPS URL 半角スペース ラベル」の形式で入力してください。",
  "Each entry must be an object.": "登録データはオブジェクトで指定してください。",
  "id, name, and url must be non-empty strings.": "id・name・url は空でない文字列で指定してください。",
  "Duplicate id.": "id が重複しています。",
  "Enter a valid HTTPS URL in url.": "url に有効な HTTPS の URL を入力してください。",
  "scope must be internal or external.": "scope は internal（社内）または external（社外）にしてください。",
  "description must be a string.": "description は文字列で指定してください。",
  "tags must be an array of strings.": "tags は文字列の配列で指定してください。",
  "relatedLinks must be an array of objects with a non-empty label and a valid HTTPS url.": "relatedLinks は、空でない label と有効な HTTPS の url を持つオブジェクトの配列にしてください。",
  "Ginnezu · 銀鼠": "銀鼠",
  "Daidai · 橙色": "橙色",
  "Ginnezu (Light)": "銀鼠（Light）",
  "Daidai (Dark)": "橙色（Dark）",
  "Quiet silver and white": "白と銀のモノトーン",
  "Warm orange after dark": "暗がりに灯るオレンジ",
  "Automatic (browser)": "自動（ブラウザの言語）",
  "Automatic uses your browser language, with English as the fallback. Custom text and spreadsheet data keep their original language.": "自動ではブラウザの言語を使用し、判定できない場合は英語で表示します。独自の文言やシートのデータは翻訳されません。",
  "Language": "表示言語",
  "Your selection is saved automatically. Custom text and spreadsheet data keep their original language.": "選択した言語は自動保存されます。独自の文言やシートのデータは翻訳されません。",
  "Could not save the language. Please try again.": "言語を保存できませんでした。もう一度お試しください。"
};
  /** @param {unknown} language @returns {'ja' | 'en'} */
  const normalize = (language) => language === 'ja' ? 'ja' : 'en';
  /** @param {string} key @param {string} [language] @param {Record<string, string | number>} [values] */
  function t(key, language = 'ja', values = {}) {
    const text = normalize(language) === 'ja' ? messages[key] ?? key : key;
    return text.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
  }
  /** Translate known messages only; leave arbitrary server text unchanged.
   * @param {string} text @param {string} language */
  function translate(text, language) {
    for (const [key, japanese] of Object.entries(messages)) {
      for (const source of [key, japanese]) {
        const names = [...source.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
        if (!names.length) {
          if (text === source) return t(key, language);
          continue;
        }
        const pattern = source.split(/\{\w+\}/g).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)');
        const match = new RegExp('^' + pattern + '$').exec(text);
        if (match) return t(key, language, Object.fromEntries(names.map((name, i) => [name, match[i + 1]])));
      }
    }
    return text;
  }
  /** @param {unknown} value @returns {'auto' | 'ja' | 'en'} */
  const preference = (value) => value === 'ja' || value === 'en' ? value : 'auto';
  /** Respect saved choices, then the browser's ordered language preferences.
   * @param {unknown} value @param {readonly string[]} [languages] @returns {'ja' | 'en'} */
  function resolve(value, languages = []) {
    const selected = preference(value);
    if (selected !== 'auto') return selected;
    for (const language of languages) {
      if (/^ja(?:-|$)/i.test(language)) return 'ja';
      if (/^en(?:-|$)/i.test(language)) return 'en';
    }
    return 'en';
  }
  return { normalize, preference, resolve, t, translate };
})();
