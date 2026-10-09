# Flowchart Maker

Cプログラムを、diagrams.netで編集できるフローチャートに変換するブラウザアプリです。URLパスは `/flowchart-maker/`。

## 開発

Node.jsは `mise.toml` の24.21.0、パッケージ管理はnpmを使用します。

```sh
mise install
npm ci
npm run dev
```

表示されるローカルURL（通常 `http://127.0.0.1:5173/flowchart-maker/`）を開きます。

```sh
npm test
npm run build
npm run preview
```

`dist/` が静的配信の成果物です。配信先では `/flowchart-maker/` に配置してください。配信パスはビルド時の `PAGES_BASE_PATH` で変更でき、未指定時は `/flowchart-maker/` です。サーバー側処理やDBは不要です。

## GitHub Pagesへのデプロイ

リポジトリ: https://github.com/Lye-0/flowchart-maker

通常の公開先: https://lye-0.github.io/flowchart-maker/

1. GitHubのリポジトリで **Settings → Pages → Build and deployment → Source → GitHub Actions** を選択します。
2. この設定を含む変更を `main` にpushします。
3. **Actions → Deploy to GitHub Pages** の完了を確認します。手動で開始する場合は **Run workflow** を使います。

`.github/workflows/pages.yml` が、mise.tomlと同じNode.jsで `npm ci` → テスト → ビルド → 配信ファイル検査 → ChromiumでWorker/WASMを含む動作確認 → Pages公開を実行します。途中で失敗した場合はデプロイしません。デプロイにはGitHub標準のGITHUB_TOKENを使い、追加のシークレットは不要です。

Pagesの設定からbase_pathを取得するため、リポジトリのサブパスと独自ドメインのルート配信に対応します。独自ドメインはGitHubのPages設定で別途設定してください。デプロイ対象は **dist/だけ**です。`.private-reference/`、`.verification-report/`、テスト結果、Cソースの検証資料は公開しません。

### ローカルで公開構成を確認する

```sh
npm run build
npm run check:dist
npm run test:pages
```

Windowsではインストール済みEdgeを使用し、LinuxのCIではPlaywrightのChromiumを使用します。Linux/macOSで実行する場合は先に `npx playwright install chromium` を実行してください。必要に応じて `BROWSER_CHANNEL` でブラウザを指定できます。

ルート配信をPowerShellで検証する場合:

```powershell
$env:PAGES_BASE_PATH = '/'
npm run build
npm run test:pages
Remove-Item Env:PAGES_BASE_PATH
# 通常のローカル構成に戻す
npm run build
```

公式手順: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 操作

1. UTF-8の `.c` ファイルを読み込む、ドラッグ＆ドロップする、またはコードを貼り付けます。
2. 「変換する」（Ctrl / Cmd + Enter）で図を生成します。
3. 関数タブでページを切り替え、図形を選択すると元コードを確認できます。
4. 未解決箇所を確認し、「.drawio を保存」で全ページを保存します。
5. https://app.diagrams.net/ でファイルを開き、編集を続けます。

コードを変更した後は再変換まで保存を無効にします。コードは外部送信・自動保存されません。初期表示は空欄です。直接入力、または「ファイルを選択」から入力を開始します。

## 構成

- React / TypeScript / Vite、CSS Modules。
- Web Worker内のTree-sitter C（WASM）で構文解析。
- `src/engine/semantic.ts`：構文木に基づく日本語の説明・意味単位の分類。
- `src/engine/convert.ts`：同じブロック内の意味単位の統合、制御フロー、元コード範囲・診断の保持と配置。
- `src/engine/shapes.ts`：プレビューと出力で共通の図形定義。
- `src/engine/drawio.ts`：非圧縮mxfile XML。図形は自己完結したカスタムステンシル、矢印はsource/targetで接続。
- 要約した図形には、対応する文のコードと行範囲をデータとして保持します。未解析のヘッダーなどの注意事項もXMLに保存します。出力ファイルには対応するコードが含まれるため、共有する際は内容を確認してください。

## 対応範囲と前提

関数単位の処理、宣言・代入、if/else、for/while/do-while、break/continue/return、確認できる直接呼び出しに対応します。複雑な式は原式のまま保持し、目的を推測しません。単純な未初期化宣言は図にせず、初期化や副作用のある宣言（VLAなど）は保持します。隣接する単純代入をまとめ、乱数の初期化と同系列の生成・代入、入力案内と読み取りをそれぞれ1図形にします。分岐・ループ・入出力・未解決文を越えて処理を統合しません。main末尾の通常のreturn 0は終了端子に統合し、早期returnや値を計算するreturnは残します。

標準ヘッダー `stdio.h`, `stdlib.h`, `math.h`, `string.h`, `stddef.h`, `stdint.h`, `limits.h`, `float.h`, `time.h` の利用を前提とします。既知の標準入出力はキーボード・画面として表現します。リダイレクトや実行環境は解析しません。`time` と、POSIXの `random` / `srandom` も対応ヘッダーの存在を確認して認識します。これらの式をそのまま保持し、実行環境でのコンパイル可否は保証しません。通常の関数呼び出しは戻る可能性を持つ呼び出しとして扱い、関数間の非復帰性は解析しません。

switch/goto、未知の呼び出し、マクロ使用、関数ポインタ、構文エラーなどは空白図形と診断にします。未解決図形からの順次接続は作らず、後続コードは独立した領域として残します。未知のヘッダーはファイル単位の注意事項として記録し、関数全体は空白にしません。図は入力上の構文を表し、外部ヘッダーによるマクロ変更は未検証です。未解析の条件式は空白の判断／ループ記号にし、読める本体は保持します。構文エラーは構文解析器が切り出せる最小の文単位で空白にします。壊れた文と次の文が構文回復で一体化した場合、その範囲全体が空白になります。条件付きコンパイルの未確定領域は未解決とし、別の関数や後続の処理まで巻き込みません。関数内のローカル名と呼び出し名の衝突はスコープを保守的に判定するため、実際には解決可能な場合でも未解決になることがあります。

これはCコンパイラー・意味解析器ではありません。型、リンク、未定義動作、グローバル初期化、プログラムの正しさは検証しません。初期版は学習用の単一Cファイル向けです。開始・終了端子を設けますが、既知の無限ループから終了への経路を捏造しません。

入力上限100,000文字、1関数あたり最大1,200図形、解析タイムアウト20秒。キャンセル時はWorkerを終了します。

## 検証

`npm test` は実際のC文法WASMを使い、分岐、入れ子ループ、continueの更新式、早期return、空白、接続、XMLエスケープを検証します。

ローカルサーバーを起動した状態で、インストール済みMicrosoft Edgeを使ったヘッドレステストを実行できます。

```sh
npm run test:browser
npm run test:drawio
```

`test:browser` は入力→Worker→プレビュー→ファイル保存と、外部通信がないこと、モバイル幅を検証します。URLは環境変数 `APP_URL` で変更できます。

`test:drawio` は先に `npm test` と `test:browser` で保存したサンプル図を使用します。ネットワークが必要です。生成サンプルを公式埋め込みエディタに渡し、読み込み・9種類の記号の描画・ラベル編集・移動・再保存を確認します。通常のアプリ動作にはこの通信はありません。

検証ログと画像はGit対象外の `test-results/` に生成します。GitHub Pagesにはこれらの検証ファイルを含めません。

## 非公開の参考資料

ユーザー提供の画像は `.private-reference/` にまとめています。フォルダ全体を `.gitignore` に指定し、ソースから参照せず、ビルド成果物にも含めません。`public/` には配置しないでください。

## 仕様資料

- https://github.com/jgraph/drawio/wiki/File-Format
- https://www.drawio.com/docs/reference/embed-mode/
- https://github.com/tree-sitter/tree-sitter-c
- https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web
