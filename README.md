# Flowchart Maker

Cプログラムを、diagrams.netで編集できるフローチャートに変換するブラウザアプリ。


## DEPLOYMENT

https://lye-0.github.io/flowchart-maker/

---

<details>
<summary>以下開発用</summary>


### 構成

- React / TypeScript / Vite、CSS Modules。
- Web Worker内のTree-sitter C（WASM）で構文解析。
- `src/engine/semantic.ts`：構文木に基づく日本語の説明・意味単位の分類。
- `src/engine/convert.ts`：同じブロック内の意味単位の統合、制御フロー、元コード範囲・診断の保持と配置。
- `src/engine/shapes.ts`：プレビューと出力で共通の図形定義。
- `src/engine/drawio.ts`：非圧縮mxfile XML。図形は自己完結したカスタムステンシル、矢印はsource/targetで接続。
- 要約した図形には、対応する文のコードと行範囲をデータとして保持します。未解析のヘッダーなどの注意事項もXMLに保存します。出力ファイルには対応するコードが含まれるため、共有する際は内容を確認してください。

### 対応範囲と前提

関数単位の処理、宣言・代入、if/else、for/while/do-while、break/continue/return、確認できる直接呼び出しに対応します。複雑な式は原式のまま保持し、目的を推測しません。単純な未初期化宣言は図にせず、初期化や副作用のある宣言（VLAなど）は保持します。隣接する単純代入をまとめ、乱数の初期化と同系列の生成・代入、入力案内と読み取りをそれぞれ1図形にします。分岐・ループ・入出力・未解決文を越えて処理を統合しません。main末尾の通常のreturn 0は終了端子に統合し、早期returnや値を計算するreturnは残します。

標準ヘッダー `stdio.h`, `stdlib.h`, `math.h`, `string.h`, `stddef.h`, `stdint.h`, `limits.h`, `float.h`, `time.h` の利用を前提とします。既知の標準入出力はキーボード・画面として表現します。リダイレクトや実行環境は解析しません。`time` と、POSIXの `random` / `srandom` も対応ヘッダーの存在を確認して認識します。これらの式をそのまま保持し、実行環境でのコンパイル可否は保証しません。通常の関数呼び出しは戻る可能性を持つ呼び出しとして扱い、関数間の非復帰性は解析しません。

switch/goto、未知の呼び出し、マクロ使用、関数ポインタ、構文エラーなどは空白図形と診断にします。未解決図形からの順次接続は作らず、後続コードは独立した領域として残します。未知のヘッダーはファイル単位の注意事項として記録し、関数全体は空白にしません。図は入力上の構文を表し、外部ヘッダーによるマクロ変更は未検証です。未解析の条件式は空白の判断／ループ記号にし、読める本体は保持します。構文エラーは構文解析器が切り出せる最小の文単位で空白にします。壊れた文と次の文が構文回復で一体化した場合、その範囲全体が空白になります。条件付きコンパイルの未確定領域は未解決とし、別の関数や後続の処理まで巻き込みません。関数内のローカル名と呼び出し名の衝突はスコープを保守的に判定するため、実際には解決可能な場合でも未解決になることがあります。

これはCコンパイラー・意味解析器ではありません。型、リンク、未定義動作、グローバル初期化、プログラムの正しさは検証しません。初期版は学習用の単一Cファイル向けです。開始・終了端子を設けますが、既知の無限ループから終了への経路を捏造しません。

入力上限100,000文字、1関数あたり最大1,200図形、解析タイムアウト20秒。キャンセル時はWorkerを終了します。


### 仕様資料

- https://github.com/jgraph/drawio/wiki/File-Format
- https://www.drawio.com/docs/reference/embed-mode/
- https://github.com/tree-sitter/tree-sitter-c
- https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web

</details>
