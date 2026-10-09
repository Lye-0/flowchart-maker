import { beforeAll, describe, expect, it } from 'vitest';
import { Parser, Language } from 'web-tree-sitter';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { convertTree } from '../src/engine/convert';
import { toDrawio } from '../src/engine/drawio';
import { stencil } from '../src/engine/shapes';
import { inflateRaw } from 'pako';
import { samples } from './fixtures/samples';

let parser: Parser;
beforeAll(async () => {
  await Parser.init();
  const lang = await Language.load(resolve('node_modules/tree-sitter-wasms/out/tree-sitter-c.wasm'));
  parser = new Parser(); parser.setLanguage(lang);
});
function convert(code: string) {
  const tree = parser.parse(code)!;
  try { return convertTree(tree.rootNode, code); } finally { tree.delete(); }
}
describe('Cからの制御フロー', () => {
  it('報告された乱数と標準入出力のコードを空白なしで接続する', () => {
    const source = readFileSync('tests/fixtures/random-input.c', 'utf8');
    const r = convert(source), p = r.pages[0];
    expect(r.diagnostics).toEqual([]);
    expect(p.nodes.some(n => n.kind === 'unknown')).toBe(false);
    expect(p.nodes.filter(n => n.kind === 'display')).toHaveLength(2);
    expect(p.nodes.filter(n => n.kind === 'input')).toHaveLength(1);
    expect(p.nodes).toHaveLength(6);
    expect(p.nodes.filter(n => n.kind === 'process').map(n => n.label)).toEqual(['乱数を初期化し、\n1〜128の乱数を\nnumに代入']);
    expect(p.nodes.find(n => n.kind === 'input')?.label).toBe('「入力: 」と表示し\nuser_inputに入力');
    expect(p.nodes.find(n => n.kind === 'process')?.range).toMatchObject({ line: 9, endLine: 12 });
    expect(p.nodes.find(n => n.kind === 'input')?.range).toMatchObject({ line: 15, endLine: 16 });
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/random-input-summary.drawio', toDrawio(r));
    let current = p.nodes.find(n => n.label === '開始')!;
    const visited = new Set([current.id]);
    while (current.label !== '終了') {
      const next = p.edges.filter(e => e.source === current.id);
      expect(next).toHaveLength(1);
      current = p.nodes.find(n => n.id === next[0].target)!;
      expect(visited.has(current.id)).toBe(false); visited.add(current.id);
    }
    expect(visited.size).toBe(p.nodes.length);
    expect(toDrawio(r)).not.toContain('status="unresolved"');
  });
  it('time.hを認識し、timeの直接呼び出しを変換する', () => {
    expect(convert('#include <time.h>\nint main(){time(0);return 0;}').diagnostics).toEqual([]);
  });
  it('random/srandomはstdlib.hがある場合に認識する', () => {
    expect(convert('#include <stdlib.h>\nint main(){srandom(1);int n=random();return n;}').diagnostics).toEqual([]);
    expect(convert('int main(){srandom(1);return random();}').diagnostics).toHaveLength(2);
  });
  it('新しい既知関数もマクロ・シャドーイング・未知の引数を推測しない', () => {
    expect(convert('#include <time.h>\n#define time(x) custom(x)\nint main(){time(0);}').diagnostics).toHaveLength(1);
    expect(convert('#include <stdlib.h>\nint f(int (*random)(void)){return random();}').diagnostics).toHaveLength(1);
    expect(convert('#include <stdlib.h>\nint main(){srandom(mystery());}').diagnostics).toHaveLength(1);
    expect(convert('int main(){return time(0);}').diagnostics).toHaveLength(1);
  });
  it('サンプルは実際のC文法で解析できる', () => {
    for (const sample of samples) { const result = convert(sample.code); expect(result.pages.length).toBeGreaterThan(0); if (sample.file !== 'unresolved.c') expect(result.diagnostics).toEqual([]); }
  });
  it('開始・終了とYes/Noの分岐を保持する', () => {
    const p = convert(samples[0].code).pages[0];
    expect(p.nodes.filter(n => n.kind === 'terminal').map(n => n.label).sort()).toEqual(['終了', '開始']);
    const decision = p.nodes.find(n => n.kind === 'decision')!;
    expect(p.edges.filter(e => e.source === decision.id).map(e => e.label).sort()).toEqual(['No', 'Yes']);
    expect(p.nodes.filter(n => n.kind === 'display')).toHaveLength(2);
  });
  it('forのcontinueは更新式へ進む', () => {
    const p = convert(samples[1].code).pages[0];
    const next = p.nodes.find(n => n.label === '次の繰り返しへ')!;
    const update = p.nodes.find(n => n.sourceText === 'k++')!;
    expect(p.edges.some(e => e.source === next.id && e.target === update.id)).toBe(true);
  });
  it('do whileは本体の後で条件を評価する', () => {
    const p = convert('int main(){int n=0; do { n++; } while(n<3); return n;}').pages[0];
    const start = p.nodes.find(n => n.kind === 'loopStart')!, end = p.nodes.find(n => n.kind === 'loopEnd')!, body = p.nodes.find(n => n.label.includes('1増やす'))!;
    expect(body.y).toBeLessThan(end.y); expect(start.label).not.toContain('n<3'); expect(end.sourceText).toContain('n<3');
    expect(p.edges.find(e => e.source === end.id && e.target === start.id)?.label).toBe('Yes');
  });
  it('入れ子のbreakは内側ループだけを抜ける', () => {
    const p = convert('int main(){for(int i=0;i<3;i++){while(i<2){break;} i++;}return 0;}').pages[0];
    const br = p.nodes.find(n => n.label === 'ループを抜ける')!;
    const target = p.nodes.find(n => n.id === p.edges.find(e => e.source === br.id)?.target)!;
    const update = p.nodes.find(n => n.sourceText === 'i++;')!;
    expect(target.y).toBeLessThan(update.y);
    expect(p.edges.some(e => e.source === target.id && e.target === update.id)).toBe(true);
  });
  it('早期returnは直後の処理を通らず終了へ進む', () => {
    const p = convert('int f(int n){if(n<0){return -1;} n++; return n;}').pages[0];
    const early = p.nodes.find(n => n.label === '-1 を返す')!, end = p.nodes.find(n => n.label === '終了')!;
    expect(p.edges.filter(e => e.source === early.id).map(e => e.target)).toEqual([end.id]);
  });
  it('for(;;)に架空の出口を作らない', () => {
    const p = convert('int main(){for(;;){int a=1;}}').pages[0];
    const end = p.nodes.find(n => n.label === '終了')!;
    expect(p.edges.filter(e => e.target === end.id)).toHaveLength(0);
  });
  it('マクロは空白にし、後続への接続を捏造しない', () => {
    const r = convert(samples[3].code), p = r.pages[0], unknown = p.nodes.find(n => n.kind === 'unknown')!;
    expect(unknown.label).toBe(''); expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(p.edges.some(e => e.source === unknown.id)).toBe(false);
    expect(r.diagnostics[0].range.line).toBe(6);
  });
  it('関数ポインタや未知の呼び出しは空白にする', () => {
    const r = convert('int main(){ mysterious(42); return 0; }');
    expect(r.diagnostics).toHaveLength(1); expect(r.pages[0].nodes.some(n => n.kind === 'unknown')).toBe(true);
  });
  it('switchを無視しない', () => {
    const r = convert('int f(int n){switch(n){case 1: return 2; default: return 0;}}');
    expect(r.diagnostics[0].message).toContain('switch_statement');
  });
  it('構文エラーを変換済み扱いにしない', () => {
    const r = convert('int main(){int x = ; return 0;}'); expect(r.diagnostics.length).toBeGreaterThan(0);
  });
  it('コメント・日本語・文字列中の括弧を誤って解析しない', () => {
    const r = convert('#include <stdio.h>\nint main(){ /* 日本語 */ printf("if(x){日本語}"); return 0;}');
    expect(r.diagnostics).toEqual([]); expect(r.pages[0].nodes.filter(n => n.kind === 'decision')).toHaveLength(0);
    const n = r.pages[0].nodes.find(n => n.kind === 'display')!;
    expect(r.source.slice(n.range!.start, n.range!.end)).toBe('printf("if(x){日本語}");');
  });
  it('関数ごとのページと直接呼び出しを保持する', () => {
    const r = convert(samples[2].code); expect(r.pages.map(p => p.name)).toEqual(['show', 'main']);
    expect(r.pages[1].nodes.some(n => n.kind === 'subroutine')).toBe(true);
  });
  it('drawioの矢印には有効なsourceとtargetが必ずある', () => {
    for (const sample of samples) for (const p of convert(sample.code).pages) {
      const ids = new Set(p.nodes.map(n => n.id));
      for (const e of p.edges) { expect(ids.has(e.source)).toBe(true); expect(ids.has(e.target)).toBe(true); }
    }
  });
  it('空入力には明確なエラーを返す', () => { expect(() => convert('')).toThrow('関数が見つかりません'); });
  it('定数が真のwhileに架空の出口を追加しない', () => {
    const p = convert('int main(){while(1){int x=0;}}').pages[0];
    const end = p.nodes.find(n => n.label === '終了')!;
    expect(p.edges.some(e => e.target === end.id)).toBe(false);
  });
  it('標準関数と同名の関数ポインタ引数を誤分類しない', () => {
    const r = convert('#include <stdio.h>\nint f(int (*printf)(int)){printf(2);return 0;}');
    expect(r.diagnostics.length).toBeGreaterThan(0); expect(r.pages[0].nodes.some(n => n.kind === 'display')).toBe(false);
  });
  it('外部ヘッダーの影響を推測しない', () => {
    const r = convert('#include "custom.h"\nint main(){return VALUE;}');
    expect(r.diagnostics[0].message).toContain('ヘッダー');
  });
  it('条件付きマクロが後続の関数に及ぼす影響を推測しない', () => {
    const r = convert('#ifdef FOO\n#define STEP return\n#endif\nint main(){STEP 0;}');
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });
  it('XMLに出力できない制御文字を受け付けない', () => {
    expect(() => convert('int main(){/*\u0001*/return 0;}')).toThrow('制御文字');
  });
});
describe('編集可能なdrawio出力', () => {
  it('指定の9種類の記号を生成できる', () => {
    const r = convert('#include <stdio.h>\nvoid show(){puts("hello");}\nint main(){int n; scanf("%d",&n); for(int k=0;k<n;k++){if(k%2==0){show();}else{puts("odd");}} FILE *f=fopen("out.txt","w");fputs("done",f);fclose(f);return 0;}');
    expect(r.diagnostics).toEqual([]);
    const kinds = new Set<string>(r.pages.flatMap(p => p.nodes.map(n => n.kind)));
    for (const kind of ['terminal', 'process', 'input', 'display', 'decision', 'file', 'subroutine', 'loopStart', 'loopEnd']) expect(kinds.has(kind)).toBe(true);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/all-symbols.drawio', toDrawio(r));
  });
  it('XMLの特殊文字をエスケープし、全ページを出力する', () => {
    const xml = toDrawio(convert(samples[2].code));
    expect(xml).toContain('compressed="false"'); expect(xml.match(/<diagram /g)).toHaveLength(2);
    expect(xml).toContain('&lt;='); expect(xml).toContain('sourceLine='); expect(toDrawio(convert(readFileSync('tests/fixtures/random-input.c', 'utf8')))).toContain('&#10;');
  });
  it('未知の図形ラベルは空で、理由をメタデータに保持する', () => {
    const xml = toDrawio(convert(samples[3].code));
    expect(xml).toMatch(/label=""[^>]+status="unresolved"/);
  });
  it('ループの形状を自己完結した編集可能なステンシルにする', () => {
    const value = stencil('loopStart').slice(8, -1);
    const xml = decodeURIComponent(inflateRaw(Uint8Array.from(atob(value), c => c.charCodeAt(0)), { to: 'string' }));
    expect(xml).toContain('<shape name="loopStart"'); expect(xml).toContain('<connections>');
  });
});

describe('意味単位の要約と局所的な未解決', () => {
  it('未知のヘッダーがあってもprintfとscanfを残す', () => {
    const r=convert('#include <stdio.h>\n#include "unavailable.h"\nint main(){int n;printf("hello");scanf("%d",&n);printf("%d",n);return 0;}');
    expect(r.diagnostics).toHaveLength(1); expect(r.diagnostics[0].nodeId).toBeUndefined();
    expect(r.pages[0].nodes.filter(n=>n.kind==='display')).toHaveLength(2);
    expect(r.pages[0].nodes.filter(n=>n.kind==='input')).toHaveLength(1);
    expect(r.pages[0].nodes.some(n=>n.kind==='unknown')).toBe(false);
  });
  it('未知の文を局所的な空白にし前後の表示を維持する', () => {
    const r=convert('#include <stdio.h>\nint main(){puts("before");mystery();puts("after");return 0;}');
    const p=r.pages[0], blank=p.nodes.find(n=>n.kind==='unknown')!;
    expect(r.diagnostics).toHaveLength(1); expect(blank.label).toBe('');
    expect(p.nodes.filter(n=>n.kind==='display').map(n=>n.label)).toEqual(['「before」を表示','「after」を表示']);
    expect(p.edges.some(e=>e.source===blank.id)).toBe(false);
  });
  it('未知の条件でも分岐の形と両方の表示を保持する', () => {
    const r=convert('#include <stdio.h>\nint main(){if(check()){puts("yes");}else{puts("no");}return 0;}');
    const p=r.pages[0], decision=p.nodes.find(n=>n.kind==='decision')!;
    expect(decision.label).toBe(''); expect(decision.unresolved).toBe(true);
    expect(p.nodes.filter(n=>n.kind==='display')).toHaveLength(2);
    expect(p.edges.filter(e=>e.source===decision.id).map(e=>e.label).sort()).toEqual(['No','Yes']);
  });
  it('ループ条件が未解決でも本体の表示を保持する', () => {
    const r=convert('#include <stdio.h>\nint main(){while(check()){puts("body");}puts("after");}');
    expect(r.pages[0].nodes.find(n=>n.kind==='loopStart')?.label).toBe('');
    expect(r.pages[0].nodes.filter(n=>n.kind==='display')).toHaveLength(2);
  });
  it('構文回復で一体化した範囲だけ空白にし他の枝と後続を保持する', () => {
    const r=convert('#include <stdio.h>\nint main(){if(1){int x=;puts("inside");}else{puts("other");}puts("after");}');
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.pages[0].nodes.filter(n=>n.kind==='display').map(n=>n.label)).toEqual(['「other」を表示','「after」を表示']);
    expect(r.pages[0].nodes.find(n=>n.kind==='unknown')?.sourceText).toContain('puts("inside")');
    expect(r.pages[0].nodes.filter(n=>n.kind==='decision')).toHaveLength(1);
  });
  it('単純宣言だけ省きVLAと副作用を残す', () => {
    const r=convert('int f(int n){int x;int a[n++];return n;}');
    expect(r.pages[0].nodes.some(n=>n.label==='int x')).toBe(false);
    expect(r.pages[0].nodes.some(n=>n.sourceText==='int a[n++];')).toBe(true);
  });
  it('main末尾のreturn 0は終了へ統合し早期returnは保持する', () => {
    const p=convert('int main(){if(1){return 0;}return 0;}').pages[0];
    expect(p.nodes.filter(n=>n.label==='0 を返す')).toHaveLength(1);
    expect(p.nodes.find(n=>n.label==='終了')?.sourceText).toBe('return 0;');
  });
  it('乱数準備と生成の間に出力があれば統合しない', () => {
    const p=convert('#include <stdio.h>\n#include <stdlib.h>\nint main(){srandom(1);puts("wait");int n=random()%10+1;return 0;}').pages[0];
    expect(p.nodes.filter(n=>n.kind==='process')).toHaveLength(2);
  });
  it('異なる乱数系列やユーザー定義randomの意味を推測しない', () => {
    const r=convert('#include <stdlib.h>\nint main(){srand(1);int n=random()%10+1;return 0;}');
    expect(r.pages[0].nodes.filter(n=>n.kind==='process')).toHaveLength(2);
    const custom=convert('#include <stdlib.h>\nint random(){return -1;}int main(){int n=random()%10+1;}');
    expect(custom.pages[1].nodes.some(n=>n.label.includes('乱数'))).toBe(false);
  });
  it('任意の文字出力を入力案内と決めつけない', () => {
    const p=convert('#include <stdio.h>\nint main(){int n;printf("done");scanf("%d",&n);}').pages[0];
    expect(p.nodes.filter(n=>n.kind==='display')).toHaveLength(1);
    expect(p.nodes.filter(n=>n.kind==='input')).toHaveLength(1);
  });
  it('まとめた図形から元コードと行範囲を復元できる', () => {
    const r=convert(readFileSync('tests/fixtures/random-input.c','utf8'));
    const p=r.pages[0].nodes.find(n=>n.kind==='input')!;
    const raw=r.source.slice(p.range!.start,p.range!.end);
    expect(raw).toContain('printf'); expect(raw).toContain('scanf');
    expect(toDrawio(r)).toContain('sourceCode=');
  });
});
