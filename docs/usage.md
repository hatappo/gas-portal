# 利用手順

## 初回セットアップ

1. 現場の Google アカウントで、自分が管理するスタンドアロン GAS プロジェクトと Spreadsheet を用意します。
2. 現場用フォルダに gas-portal をインストールし、`portal init --script-id ID --auth-profile work-a` を実行します。
3. アカウントの Apps Script 設定で Apps Script API の利用を有効にし、`npm run login` でその現場のアカウントを選択します。`npx portal status` でログイン先を確認します。
4. `npm run push` でコードをアップロードします。
5. 同じアカウントで GAS エディタを開き、上部の関数選択から `initializeProperties` を選んで実行します。認可を求められたら内容を確認します。
6. GAS の「プロジェクトの設定」→「スクリプトプロパティ」で `SPREADSHEET_ID` と `SHEET_NAME` を実際の値に変更します。
7. GAS の「デプロイ」→「新しいデプロイ」→「ウェブアプリ」で、実行者とアクセスを自分にして初回公開します。
8. 公開 URL を開いて実データを確認します。以降は `npm run push` と `npm run deploy` で更新できます。deploy が初めて成功すると、未設定だった deploymentId が保存されます。

GAS と Spreadsheet は現場ごとに独立させ、本人用に共有範囲を設定します。初期化はデプロイ者のアカウントで実行してください。User Properties は実行ユーザーに属するためです。初期化は存在しないキーだけを追加し、既存値・空値を保持します。旧 `initializeScriptProperties` も互換用に残しています。

コードを更新するときは先にパッケージのバージョンを更新し、build / preview で確認してから push / deploy します。コードを変更せずシートの内容や表示設定だけを変更する場合は再デプロイ不要です。

## Spreadsheet

先頭行の列名で読み取るため、列の位置は自由です。列名の大文字小文字は区別します。

| 列名 | 内容 |
| --- | --- |
| id | 必須。文字列として一意の ID。昇順で表示 |
| name | 必須。表示名 |
| url | 必須。HTTPS のメインリンク |
| description | 説明文。HTML / Markdown は解釈しない |
| scope | internal / external、または社内 / 社外。省略時は社内 |
| tags | カンマ・読点・改行で区切る複数タグ |
| relatedLinks | セル内に「HTTPS URL 半角スペース ラベル」を 1 行につき 1 件 |

任意列は省略できます。URL は表示名付きのスマートチップではなく URL 文字列を入力します。未知の列は公開データに含めません。登録不備は行番号とともに画面に表示します。Apps Script のオリジンを持つメイン URL には GAS タグが自動付与されます。

Spreadsheet に対するスコープは読み取り専用です。ただし OAuth の認可範囲は指定した 1 ファイルだけには限定されません。本人用のプロジェクトとし、コードを編集できる人を管理してください。

## 表示設定

歯車タブからポータル名・アイコン・見出し・説明文を変更できます。User Properties に保存されます。「既定値に戻す」は入力欄だけを変更し、「変更を保存」で反映します。テーマは選択すると自動保存されます。

| キー | 既定値 |
| --- | --- |
| PORTAL_NAME | My Portal |
| PORTAL_ICON | P |
| PORTAL_HEADLINE | 毎日の仕事に、ひとつの入口を。 |
| PORTAL_DESCRIPTION | 業務で使うツールやサービスへのリンクと、日々のToDoをひとつにまとめます。 |
| PORTAL_THEME | tsuyukusa |

テーマは露草色・桜色・若竹色・山吹色・鉄紺・墨色・栗色・深緑です。旧紫紺の保存値は栗色として扱います。旧バージョンで Script Properties に保存していた表示設定は、User Properties の未作成キーだけに引き継ぎます。シートの接続先は引き続き Script Properties です。

## ローカルプレビュー

`npm run preview -- --port 4174` で起動します。アドレスは localhost に限定し、使用済みポートでは自動変更せずエラーで停止します。認証は不要で、Google にアクセスしません。

- `/`: 架空のリンク一覧
- `/mobile.html`: 390px 幅
- `/?state=empty`: 空一覧
- `/?state=invalid`: 登録不備
- `/?state=config`: シート設定エラー
- `/?state=error`: 通信失敗

プレビューの設定はそのブラウザの localStorage に保存し、本番や別フォルダの現場へ反映しません。

## よくある問題

- `invalid_grant` / `invalid_rapt`: 現場用フォルダから `npm run login` で再認証してください。対象の Google アカウントを選びます。
- 公開用デプロイが 0 件: 初回はコンソールでウェブアプリを公開します。
- 公開用デプロイが複数: `npx portal deployments` で確認し、`npx portal deploy --deployment-id ID` で対象を指定します。
- 設定した deploymentId が見つからない: 別プロジェクトの ID ではないか、削除済みではないかを確認します。CLI は別の ID へ自動で切り替えません。
- clasp を直接操作したい: `.portal/.clasp.json` を使って `npx clasp --project .portal/.clasp.json --user PROFILE COMMAND` を実行できます。認証と接続先を明示してください。
