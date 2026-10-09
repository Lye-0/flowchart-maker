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

`dist/` が静的配信の成果物です。配信先では `/flowchart-maker/` に配置してください。ルート配信に変更する場合は `vite.config.ts` の `base` を変更して再ビルドします。サーバー側処理・DB・環境変数は不要です。

## 操作

1. UTF-8の `.c` ファイルを読み込む、ドラッグ＆ドロップする、またはコードを貼り付けます。
2. 「変換する」（Ctrl / Cmd + Enter）で図を生成します。
3. 関数タブでページを切り替え、図形を選択すると元コードを確認できます。
4. 未解決箇所を確認し、「.drawio を保存」で全ページを保存します。
5. https://app.diagrams.net/ でファイルを開き、編集を続けます。

コードを変更した後は再変換まで保存を無効にします。コードは外部送信・自動保存されません。初期表示は同梱のサンプルです。

## 構成

- React / TypeScript / Vite、CSS Modules。
- Web Worker内のTree-sitter C（WASM）で構文解析。
- `src/engine/convert.ts`：構文木から図形・接続・元コード範囲・診断への変換と配置。
- `src/engine/shapes.ts`：プレビューと出力で共通の図形定義。
- `src/engine/drawio.ts`：非圧縮mxfile XML。図形は自己完結したカスタムステンシル、矢印はsource/targetで接続。
- 元のコード全文は出力メタデータに埋め込まず、行番号・未解決の理由のみ保存します。ただし図形のラベルには元の式が含まれます。

## 対応範囲と前提

関数単位の処理、宣言・代入、if/else、for/while/do-while、break/continue/return、確認できる直接呼び出しに対応します。複雑な式は原式のまま保持し、目的を推測しません。宣言に初期化式がある場合はその処理もラベルに保持します。

標準ヘッダー `stdio.h`, `stdlib.h`, `math.h`, `string.h`, `stddef.h`, `stdint.h`, `limits.h`, `float.h`, `time.h` の利用を前提とします。既知の標準入出力はキーボード・画面として表現します。リダイレクトや実行環境は解析しません。`time` と、POSIXの `random` / `srandom` も対応ヘッダーの存在を確認して認識します。これらの式をそのまま保持し、実行環境でのコンパイル可否は保証しません。通常の関数呼び出しは戻る可能性を持つ呼び出しとして扱い、関数間の非復帰性は解析しません。

switch/goto、未知の呼び出し、マクロ使用、関数ポインタ、構文エラーなどは空白図形と診断にします。未解決図形からの順次接続は作らず、後続コードは独立した領域として残します。未知のヘッダーや条件付きコンパイルがある場合、影響を確定できない関数本体は空白にします。関数内のローカル名と呼び出し名の衝突はスコープを保守的に判定するため、実際には解決可能な場合でも未解決になることがあります。

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

検証ログと画像はGit対象外の `test-results/` に生成します。公開・デプロイは行っていません。

## 非公開の参考資料

ユーザー提供の画像は `.private-reference/` にまとめています。フォルダ全体を `.gitignore` に指定し、ソースから参照せず、ビルド成果物にも含めません。`public/` には配置しないでください。

## 仕様資料

- https://github.com/jgraph/drawio/wiki/File-Format
- https://www.drawio.com/docs/reference/embed-mode/
- https://github.com/tree-sitter/tree-sitter-c
- https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web
