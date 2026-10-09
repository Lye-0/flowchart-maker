import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { Conversion, Diagnostic, FlowEdge, FlowNode, FlowPage, Shape, SourceRange } from './types';

const WIDTH = 240;
const GAP = 64;
const field = (node: SyntaxNode, name: string) => node.childForFieldName(name);
const range = (node: SyntaxNode): SourceRange => ({ start: node.startIndex, end: node.endIndex, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
const text = (node: SyntaxNode | null) => node?.text.trim() ?? '';
const children = (node: SyntaxNode): SyntaxNode[] => node.namedChildren.filter((n): n is SyntaxNode => n !== null && n.type !== 'comment');
function walk(node: SyntaxNode, fn: (n: SyntaxNode) => void) { fn(node); for (const child of children(node)) walk(child, fn); }
function functionName(node: SyntaxNode): string {
  let n = field(node, 'declarator');
  while (n && n.type !== 'identifier') n = field(n, 'declarator') ?? n.namedChildren[0] ?? null;
  return n?.text ?? 'function';
}
function constantTrue(node: SyntaxNode | null): boolean {
  if (!node) return true;
  let n = node;
  while (n.type === 'parenthesized_expression' && children(n).length === 1) n = children(n)[0];
  return n.type === 'number_literal' && /^(?:[1-9][0-9]*|0[xX][0-9a-fA-F]+)[uUlL]*$/.test(n.text) && Number.parseInt(n.text) !== 0;
}
function span(node: SyntaxNode | null): number {
  if (!node) return WIDTH;
  if (node.type === 'if_statement') return span(field(node, 'consequence')) + span(field(node, 'alternative')) + 100;
  if (['for_statement', 'while_statement', 'do_statement'].includes(node.type)) return span(field(node, 'body')) + 150;
  return Math.max(WIDTH, ...children(node).filter(n => ['compound_statement', 'if_statement', 'else_clause', 'for_statement', 'while_statement', 'do_statement'].includes(n.type)).map(span));
}
export function wrapLabel(label: string, max = 26): string[] {
  const lines: string[] = [];
  for (const paragraph of label.split('\n')) {
    let line = '', count = 0;
    for (const c of paragraph) {
      const size = c.charCodeAt(0) > 255 ? 2 : 1;
      if (count + size > max) { lines.push(line); line = ''; count = 0; }
      line += c; count += size;
    }
    lines.push(line);
  }
  return lines;
}
type Tail = { id: string; label?: string };
interface LoopContext { breakId: string; continueId: string; lane: number }

class Builder {
  nodes: FlowNode[] = [];
  edges: FlowEdge[] = [];
  count = 0;
  end: FlowNode;
  returns: FlowNode[] = [];
  shadowed = new Set<string>();
  constructor(public name: string, public diagnostics: Diagnostic[], private functions: Set<string>, private macros: Set<string>, private headers: Set<string>, width: number) {
    this.end = this.add('terminal', '終了', 120, 0);
    this.outerLane = width + 280;
  }
  outerLane: number;
  add(kind: Shape, label: string, x: number, y: number, source?: SyntaxNode) {
    if (this.count >= 1200) throw new Error('図形が多すぎます。関数やコードを分割して変換してください。');
    const lines = wrapLabel(label, kind === 'decision' ? 22 : 26);
    const h = kind === 'junction' ? 2 : Math.max(kind === 'decision' ? 112 : 64, lines.length * 20 + (kind === 'decision' ? 58 : 28));
    const node: FlowNode = { id: `n${++this.count}`, kind, label, x, y, w: kind === 'junction' ? 2 : WIDTH, h, range: source ? range(source) : undefined };
    this.nodes.push(node); return node;
  }
  edge(source: string, target: string, extra: Partial<FlowEdge> = {}) {
    this.edges.push({ id: `e${this.edges.length + 1}`, source, target, from: 'bottom', to: 'top', ...extra });
  }
  connect(tails: Tail[], node: FlowNode) { for (const tail of tails) this.edge(tail.id, node.id, { label: tail.label }); }
  unknown(source: SyntaxNode, x: number, y: number, tails: Tail[], message: string) {
    const node = this.add('unknown', '', x, y, source); this.connect(tails, node);
    this.diagnostics.push({ id: `d${this.diagnostics.length + 1}`, message, range: range(source), nodeId: node.id, page: this.name });
    // Control effects are unknown. Never invent a fall-through connection.
    return { tails: [] as Tail[], y: y + node.h + GAP };
  }
  unsafe(node: SyntaxNode): string | null {
    let reason: string | null = null;
    walk(node, n => {
      if (n.type === 'identifier' && this.macros.has(n.text)) reason = `マクロ「${n.text}」の展開結果を確定できません。後続への接続を保留しました。`;
      if (n.type === 'call_expression') {
        const name = text(field(n, 'function'));
        if (this.shadowed.has(name)) reason = `「${name}」はローカル変数・引数と同名のため、呼び出し先を確定できません。`;
        else if (['exit', '_Exit', 'abort', 'longjmp', 'setjmp'].includes(name)) reason = `「${name}」による制御の移動には未対応です。`;
        else if (!this.functions.has(name) && !this.knownLibrary(name)) reason = `呼び出し先「${name}」を確定できません。マクロ・関数ポインタなどの可能性があるため空白にしました。`;
      }
      if (n !== node && ['compound_statement', 'asm_expression', 'gnu_asm_expression'].includes(n.type)) reason = '式内の文ブロック・アセンブリには未対応です。';
    });
    return reason;
  }
  knownLibrary(name: string) {
    const groups: Record<string, string[]> = {
      'stdio.h': ['printf', 'puts', 'putchar', 'scanf', 'getchar', 'fgets', 'fputs', 'fprintf', 'fscanf', 'fread', 'fwrite', 'fopen', 'fclose', 'sprintf', 'snprintf', 'sscanf', 'fgetc', 'fputc', 'feof', 'fflush'],
      'stdlib.h': ['rand', 'srand', 'random', 'srandom', 'malloc', 'calloc', 'realloc', 'free', 'atoi', 'atof', 'abs'],
      'time.h': ['time'],
      'math.h': ['sqrt', 'pow', 'sin', 'cos', 'tan', 'floor', 'ceil', 'fabs'],
      'string.h': ['strlen', 'strcmp', 'strcpy', 'strncpy', 'memcpy', 'memset', 'strcat'],
    };
    return Object.entries(groups).some(([header, functions]) => this.headers.has(header) && functions.includes(name));
  }
  statement(node: SyntaxNode, x: number, y: number, tails: Tail[], loop?: LoopContext): { tails: Tail[]; y: number } {
    if (node.type === 'comment') return { tails, y };
    if (node.type === 'compound_statement' || node.type === 'else_clause') {
      for (const child of children(node)) {
        // A detached region is intentionally visible after an unresolved control boundary.
        const next = this.statement(child, x, y, tails, loop); tails = next.tails; y = next.y;
      }
      return { tails, y };
    }
    if (node.hasError || node.isMissing) return this.unknown(node, x, y, tails, '構文を確定できません。元のコードを修正して再変換してください。');
    if (['preproc_def', 'preproc_function_def'].includes(node.type)) return this.unknown(node, x, y, tails, '関数内のマクロ定義には未対応です。');
    if (node.type === 'if_statement') {
      const condition = field(node, 'condition')!;
      const unsafe = this.unsafe(condition); if (unsafe) return this.unknown(node, x, y, tails, unsafe);
      const decision = this.add('decision', text(condition), x, y, condition); this.connect(tails, decision);
      const yes = field(node, 'consequence')!, alternative = field(node, 'alternative');
      const nextY = y + decision.h + GAP;
      const left = this.statement(yes, x, nextY, [{ id: decision.id, label: 'Yes' }], loop);
      const rightX = x + span(yes) + 100;
      const edgeStart = this.edges.length;
      const right = alternative ? this.statement(alternative, rightX, nextY, [{ id: decision.id, label: 'No' }], loop) : { tails: [{ id: decision.id, label: 'No' }], y: nextY };
      if (alternative && this.edges[edgeStart]?.source === decision.id) { this.edges[edgeStart].from = 'right'; }
      const bottom = Math.max(left.y, right.y);
      if (!left.tails.length && !right.tails.length) return { tails: [], y: bottom };
      const join = this.add('junction', '', x + WIDTH / 2 - 1, bottom);
      this.connect(left.tails, join);
      for (const tail of right.tails) {
        const source = this.nodes.find(n => n.id === tail.id)!;
        this.edge(source.id, join.id, { label: tail.label, from: source === decision ? 'right' : 'bottom', to: 'right', via: source === decision ? [{ x: rightX + WIDTH / 2, y: decision.y + decision.h / 2 }, { x: rightX + WIDTH / 2, y: bottom + 1 }] : [{ x: source.x + source.w / 2, y: bottom + 1 }] });
      }
      return { tails: [{ id: join.id }], y: bottom + GAP / 2 };
    }
    if (['for_statement', 'while_statement', 'do_statement'].includes(node.type)) {
      const body = field(node, 'body')!, condition = field(node, 'condition'), initializer = field(node, 'initializer'), update = field(node, 'update');
      for (const part of [condition, initializer, update]) { if (part) { const unsafe = this.unsafe(part); if (unsafe) return this.unknown(node, x, y, tails, unsafe); } }
      if (initializer) { const init = this.add('process', text(initializer).replace(/;$/, ''), x, y, initializer); this.connect(tails, init); tails = [{ id: init.id }]; y += init.h + GAP; }
      const isDo = node.type === 'do_statement';
      const start = this.add('loopStart', isDo ? '繰り返し開始' : condition ? `${text(condition)}\nの間、繰り返す` : '常に繰り返す', x, y, condition ?? node); this.connect(tails, start);
      const finish = this.add('loopEnd', isDo ? `${text(condition)}\nなら繰り返す` : '繰り返し終了', x, 0, isDo ? condition ?? node : undefined);
      const after = this.add('junction', '', x + WIDTH / 2 - 1, 0);
      const increment = update ? this.add('process', text(update), x, 0, update) : null;
      const continueTarget = increment ?? finish;
      const result = this.statement(body, x, y + start.h + GAP, [{ id: start.id, label: !isDo && condition ? 'Yes' : undefined }], { breakId: after.id, continueId: continueTarget.id, lane: x + span(body) + 65 });
      let bottom = result.y;
      if (increment) { increment.y = bottom; this.connect(result.tails, increment); bottom += increment.h + GAP; }
      finish.y = bottom; this.connect(increment ? [{ id: increment.id }] : result.tails, finish);
      this.edge(finish.id, start.id, { label: isDo ? 'Yes' : undefined, from: 'left', to: 'left', via: [{ x: x - 48, y: finish.y + finish.h / 2 }, { x: x - 48, y: start.y + start.h / 2 }] });
      after.y = bottom + finish.h + GAP;
      if (isDo && !constantTrue(condition)) this.edge(finish.id, after.id, { label: 'No' });
      else if (!isDo && condition && !constantTrue(condition)) this.edge(start.id, after.id, { label: 'No', from: 'right', to: 'right', via: [{ x: x + span(body) + 105, y: start.y + start.h / 2 }, { x: x + span(body) + 105, y: after.y + 1 }] });
      // Infinite loops have a continuation only when a break can reach it.
      const exits = this.edges.some(e => e.target === after.id);
      return { tails: exits ? [{ id: after.id }] : [], y: after.y + GAP / 2 };
    }
    if (node.type === 'break_statement' || node.type === 'continue_statement') {
      if (!loop) return this.unknown(node, x, y, tails, '対応するループを特定できません。');
      const n = this.add('process', node.type === 'break_statement' ? 'ループを抜ける' : '次の繰り返しへ', x, y, node); this.connect(tails, n);
      this.edge(n.id, node.type === 'break_statement' ? loop.breakId : loop.continueId, { from: 'right', to: 'right', via: [{ x: loop.lane, y: n.y + n.h / 2 }] });
      return { tails: [], y: y + n.h + GAP };
    }
    if (node.type === 'return_statement') {
      const unsafe = this.unsafe(node); if (unsafe) return this.unknown(node, x, y, tails, unsafe);
      const value = children(node)[0];
      const n = this.add('process', value ? `${text(value)} を返す` : '関数から戻る', x, y, node); this.connect(tails, n); this.returns.push(n);
      return { tails: [], y: y + n.h + GAP };
    }
    if (node.type === 'declaration' || node.type === 'expression_statement') {
      if (!children(node).length) return { tails, y };
      const unsafe = this.unsafe(node); if (unsafe) return this.unknown(node, x, y, tails, unsafe);
      let kind: Shape = 'process', label = node.text.trim().replace(/;$/, '');
      const expr = children(node)[0];
      if (expr?.type === 'call_expression') {
        const name = text(field(expr, 'function')), args = field(expr, 'arguments')?.namedChildren ?? [];
        if (this.functions.has(name)) kind = 'subroutine';
        else if (['printf', 'puts', 'putchar'].includes(name)) { kind = 'display'; label = `${label}\nを標準出力に表示`; }
        else if (['scanf', 'getchar'].includes(name) || (name === 'fgets' && text(args[2] ?? null) === 'stdin')) { kind = 'input'; label = `${label}\n標準入力から読み込む`; }
        else if (['fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf', 'fgets', 'fputs', 'fgetc', 'fputc', 'fflush'].includes(name)) kind = 'file';
        else kind = 'subroutine';
      } else if (/^[A-Za-z_]\w*\s*=\s*-?\d+$/.test(label)) {
        const [name, value] = label.split('='); label = `${name.trim()} に ${value.trim()} を代入`;
      } else if (/^[A-Za-z_]\w*\+\+$/.test(label)) label = `${label.slice(0, -2)} を1増やす`;
      const n = this.add(kind, label, x, y, node); this.connect(tails, n);
      return { tails: [{ id: n.id }], y: y + n.h + GAP };
    }
    return this.unknown(node, x, y, tails, `「${node.type}」には未対応です。この範囲を空白にし、後続への接続を保留しました。`);
  }
  build(body: SyntaxNode, blocked?: string): FlowPage {
    const start = this.add('terminal', '開始', 120, 40);
    // A local name can shadow a known function. Conservatively reject calls to it.
    walk(body.parent ?? body, n => {
      if (n.type === 'parameter_declaration' || n.type === 'init_declarator' || n.type === 'declaration') {
        for (let i = 0; i < n.childCount; i++) {
          if (n.fieldNameForChild(i) !== 'declarator') continue;
          let d = n.child(i);
          if (n.type !== 'parameter_declaration' && d?.type === 'function_declarator' && field(d, 'declarator')?.type === 'identifier') continue;
          while (d && d.type !== 'identifier') d = field(d, 'declarator') ?? children(d)[0] ?? null;
          if (d) this.shadowed.add(d.text);
        }
      }
    });
    const result = blocked ? this.unknown(body, 120, start.y + start.h + GAP, [{ id: start.id }], blocked) : this.statement(body, 120, start.y + start.h + GAP, [{ id: start.id }]);
    this.end.y = result.y + 16; this.connect(result.tails, this.end);
    for (const n of this.returns) {
      const last = n.x === this.end.x && !this.nodes.some(other => other !== this.end && other.y > n.y && other.kind !== 'junction');
      this.edge(n.id, this.end.id, last ? {} : { from: 'right', to: 'right', via: [{ x: this.outerLane, y: n.y + n.h / 2 }, { x: this.outerLane, y: this.end.y + this.end.h / 2 }] });
    }
    for (const e of this.edges) {
      if (e.via?.length === 1 && e.to === 'right') { const target = this.nodes.find(n => n.id === e.target)!; e.via.push({ x: e.via[0].x, y: target.y + target.h / 2 }); }
    }
    return { name: this.name, nodes: this.nodes, edges: this.edges, width: Math.max(...this.nodes.map(n => n.x + n.w), ...this.edges.flatMap(e => e.via?.map(p => p.x) ?? [])) + 64, height: this.end.y + this.end.h + 48 };
  }
}

export function convertTree(root: SyntaxNode, source: string): Conversion {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source)) throw new Error('コードに使用できない制御文字が含まれています。文字コードを確認してください。');
  const diagnostics: Diagnostic[] = [], pages: FlowPage[] = [];
  const functions = new Set<string>(), macros = new Set<string>(), headers = new Set<string>();
  let blocked: string | undefined;
  walk(root, n => { if (['preproc_def', 'preproc_function_def'].includes(n.type)) { const name = field(n, 'name'); if (name) macros.add(name.text); } });
  for (const n of children(root)) {
    if (n.type === 'function_definition') functions.add(functionName(n));
    if (n.type === 'preproc_include') {
      const match = n.text.match(/<([^>]+)>/);
      if (match && ['stdio.h', 'stdlib.h', 'math.h', 'string.h', 'stddef.h', 'stdint.h', 'limits.h', 'float.h', 'time.h'].includes(match[1])) headers.add(match[1]);
      else blocked = '内容を確認できないヘッダーが含まれています。マクロによる構文変更を否定できないため、関数本体を空白にしました。展開済みのCコードを入力してください。';
    }
    if (n.type.startsWith('preproc_') && !['preproc_include', 'preproc_def', 'preproc_function_def'].includes(n.type)) blocked = '条件付きコンパイル・プリプロセッサ命令の影響を確定できません。展開済みのCコードを入力してください。';
    if (n.type === 'declaration') for (const d of children(n)) if (d.type === 'function_declarator') { const id = field(d, 'declarator'); if (id?.type === 'identifier') functions.add(id.text); }
  }
  for (const n of children(root)) {
    if (n.type === 'function_definition') {
      const name = functionName(n), body = field(n, 'body');
      if (body) pages.push(new Builder(name, diagnostics, functions, macros, headers, span(body)).build(body, blocked));
    } else if (!['comment', 'preproc_include', 'preproc_def', 'preproc_function_def', 'declaration', 'type_definition', 'struct_specifier', 'enum_specifier'].includes(n.type)) {
      const builder = new Builder('未解決の領域', diagnostics, functions, macros, headers, WIDTH);
      const start = builder.add('terminal', '開始', 120, 40);
      builder.unknown(n, 120, 168, [{ id: start.id }], '関数またはコンパイル条件を確定できない領域です。展開済みのCコードにして再変換してください。');
      builder.end.y = 320;
      pages.push({ name: builder.name, nodes: builder.nodes, edges: builder.edges, width: 440, height: 440 });
    }
  }
  if (!pages.length) throw new Error('関数が見つかりません。mainなど、関数本体を含むCコードを入力してください。');
  return { pages, diagnostics, source };
}
