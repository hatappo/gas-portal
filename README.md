# gas-portal

Google Apps Script で動く個人用ポータルと、現場ごとの構築・プレビュー・デプロイを行う CLI です。

Spreadsheet のリンク一覧をカード／リストで表示します。検索、社内外の絞り込み、複数タグ、関連リンク、8 種の配色と表示文言の編集に対応しています。Action Items は将来の連携用の空タブです。

**現場側でアプリのソースをコピーする必要はありません。** 設定とパッケージのバージョンだけを管理し、GAS 用コードは `.portal/` に生成します。現場ごとに別の Google アカウント・GAS・Spreadsheet を使えます。

## 現在の配布状態

このソースツリーは npm パッケージを作成できる状態ですが、npm registry への公開はまだ行っていません。パッケージ名の取得・公開先リポジトリの設定は公開時に行ってください。以下の tarball を使う方法は registry 公開なしで利用できます。

前提: Node.js 26.x / npm 12.2.1 以上。GAS への操作には対象アカウントで Apps Script API の利用を有効にし、clasp でログインする必要があります。

```sh
# 本体のリポジトリで実行
npm ci
npm run check
npm run pack:local

# 現場用の新しいフォルダで実行
npm init -y
npm install --save-dev --save-exact /absolute/path/to/gas-portal/releases/gas-portal-0.1.0.tgz
npx portal init --script-id YOUR_SCRIPT_ID --auth-profile work-a
npm run login
npm run build
npm run preview
```

`pack:local` は `releases/` にローカル配布物を生成します。同じバージョンで異なる内容の配布物を上書きしないため、更新時は version を上げてください。

上のローカル tarball は検証・手動配布用です。現場の package.json / lockfile にはそのパスが記録されるので、別マシンでは同じ tarball を用意してください。公開後は `npm install --save-dev --save-exact gas-portal@VERSION` でバージョン固定する運用に切り替えられます。公開されるまでは同名の第三者パッケージを誤ってインストールしないでください。

`portal init` は既存の設定値・依存指定・同名 npm scripts を保持し、`.gitignore` に生成物と認証情報の除外を追加します。Script ID が未定でも実行でき、その場合は後から `portal.config.json` を編集します。Git リポジトリの作成は利用者が行います。

```text
my-work-portal/
├── portal.config.json
├── package.json
├── package-lock.json
├── .gitignore
└── .portal/               # Git 管理しない
    ├── generated.json
    ├── .clasp.json         # 自動生成
    ├── .claspignore        # 7 ファイルだけを許可
    ├── dist/
    └── preview/
```

## 現場の設定

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "authProfile": "work-a",
  "deploymentId": "YOUR_WEB_APP_DEPLOYMENT_ID"
}
```

- `scriptId`: コードを送る Apps Script の ID。Google Cloud のプロジェクト ID とは異なります。
- `authProfile`: clasp に保存する認証情報の別名。メールアドレスではありません。`portal login` 時に、その現場の Google アカウントを選んでください。
- `deploymentId`: 更新する既存デプロイの ID。初回公開前は省略できます。未設定で公開済みデプロイが 1 件だけなら、それを更新し、成功後に ID を設定へ保存します。複数なら指定が必要です。
- `repositoryUrl`: 任意の GitHub URL。未指定なら現場フォルダの Git origin を使い、空文字ならフッタに表示しません。認証情報を含む URL や GitHub 以外のホストは使用しません。

認証トークンはこの設定に保存しません。clasp の標準の認証ストアで管理します。CLI はリモート操作で必ず `--user` を指定し、現在のデフォルトアカウントへ暗黙に切り替えません。名前と実際のアカウントの対応は `portal status` で確認できます。プロフィールの変更は、ウェブアプリの実行者設定を変更する操作ではありません。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `portal init` | 現場の設定・npm scripts・gitignore を準備 |
| `portal login` | 指定プロフィールで Google にログイン |
| `portal status` | 対象とログイン状態を表示 |
| `portal build` | 同梱済み資産から GAS 用 7 ファイルを生成。通信なし |
| `portal preview [--port 4174]` | Vite で架空データを表示。GAS・Spreadsheet には接続しない |
| `portal push` | build 後に GAS へアップロード。公開版は更新しない |
| `portal deployments` | 対象 GAS のデプロイ一覧を表示 |
| `portal deploy [-d TEXT] [--deployment-id ID]` | GAS 側に保存済みの最新コードからバージョンを作り、既存デプロイを更新 |

**deploy は build・push・check を実行しません。** 初回のウェブアプリ公開は GAS コンソールで行います。公開用がゼロなら案内して停止します。指定した ID が対象プロジェクトに存在しない場合や HEAD の場合も更新しません。API 実行用など複数のバージョン付きデプロイがあるときは、ウェブアプリの ID を指定してください。

初期化用 CLI はありません。GAS エディタから `initializeProperties` を実行します。Execution API・独自 OAuth クライアント・API 実行可能デプロイの追加設定は不要です。

初回の設定、Spreadsheet の列、表示設定、プレビューについては [利用手順](docs/usage.md) を参照してください。

## 本体を開発する

```sh
npm ci
npm run dev               # Vite: CSS HMR、JS/HTML はリロード
npm run check             # lint、型チェック、配布物生成、テスト
npm run pack:local
```

本体のソースは `src/`、CLI は `bin/` と `lib/` にあります。`npm run build` は GAS 用の `dist/` と配布用の `assets/` を生成します。配布パッケージは CLI・生成済み資産・利用ドキュメントだけを含み、ソースやテスト、現場設定、認証情報を含みません。

開発プレビューで GAS リンクを確認するときだけ、Git 管理対象外の `.clasp.json` に `scriptId` を設定できます。シートのリンクだけを確認する環境変数 `SPREADSHEET_ID` も使えます。どちらもパッケージの生成物には埋め込みません。

`npm run dev` は本体開発用の HMR を提供します。利用者側の `portal preview` はインストール済みバージョンの完成形を確認するものです。設定やパッケージを更新したらプレビューを再起動してください。ブラウザの表示設定は現場フォルダごとに分離して localStorage に保存します。

テストは Google サービスをモックし、実際の GAS や Spreadsheet は変更しません。公開前には別途テスト用 GAS で認証・push・デプロイ・実シートの読み込みを確認してください。

## License

MIT。アイコンのライセンスについては [NOTICE](NOTICE) を参照してください。
