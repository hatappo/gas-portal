# 検証記録

## 0.1.0 / 2026-11-04

- Node.js 26.12.1 / npm 12.2.1 で npm ci、lint、ブラウザ／GAS の型チェック、配布物生成、98 テストが成功。
- 既存の一覧・シート読み取り・タグ・関連リンク・テーマ・表示設定・旧設定の移行・タイムアウトを維持。
- init の再実行、既存 package.json・設定・gitignore の保持、不正入力、シンボリックリンクや別用途 .portal の保護を検証。
- 現場ごとに Script ID・認証プロフィール・生成先・プレビューの保存領域を分離。
- clasp show-file-status の実際の判定で、許可した 7 ファイルだけが対象となり、追加 JS・HTML・JSON・ネストした同名ファイルを除外。
- deploy は build・push をせず、公開先ゼロ・複数・不正 ID・HEAD・別プロジェクトの ID で更新しない。指定 ID・保存済み ID と description の受け渡し、更新失敗時の設定保持を検証。
- npm pack の配布内容を検証。CLI・完成済み資産・利用ドキュメント・ライセンスのみを含み、現場設定・認証情報・ソース・テストを含まない。
- tarball を別フォルダにインストールし、ソースや開発依存なしで init / build / preview を実行。ブラウザで検索・社外フィルタ・List、表示名とテーマの保存・再表示を確認。
- lockfile なしの通常の新規インストールも公式 registry から成功。オフラインのみの新規解決ではキャッシュのメタデータが不足して npm の min-release-age 判定に失敗したため、初回はオンライン取得を使用。保護設定は変更していない。
- 利用側の移行前後で、生成された GAS 用 7 ファイルがバイト単位で一致。
- 利用側の npm ci と build が成功。プレビューは localhost のみ。現場設定の HTTP 参照は 404、Vite /@fs/ 経由は 403。
- Google の認証・本番の push / deploy・実 Spreadsheet の読み取りは未実施。npm registry への公開も未実施。

## 公開前

- 公開先の Git remote と npm パッケージ名を確定し、必要に応じて package.json の repository / homepage / bugs を設定する。
- npm run check と npm run pack:local を実行し、別フォルダに tarball をインストールして確認する。
- テスト用 GAS でログイン、push、コンソールから初期化・初回公開、既存 ID への deploy、実シートの読み取りを確認する。
