import type { Node } from 'web-tree-sitter';
import type { Shape } from './types';

export const named = (n: Node): Node[] => n.namedChildren.filter((c): c is Node => !!c && c.type !== 'comment');
const f = (n: Node, key: string) => n.childForFieldName(key);
const t = (n: Node | null) => n?.text.trim() ?? '';
export function unparen(n: Node): Node { return n.type === 'parenthesized_expression' && named(n).length === 1 ? unparen(named(n)[0]) : n; }
export function containsCall(n: Node): boolean { return n.type === 'call_expression' || named(n).some(containsCall); }
export function simpleDeclaration(n: Node): boolean {
  // VLA dimensions, initializers, storage-class semantics and user-defined types stay visible.
  if (n.type !== 'declaration' || f(n, 'type')?.type !== 'primitive_type') return false;
  return named(n).every(c => c.type === 'primitive_type' || c.type === 'identifier' || (c.type === 'pointer_declarator' && f(c, 'declarator')?.type === 'identifier'));
}
function expr(n: Node): Node { return n.type === 'expression_statement' ? named(n)[0] ?? n : n; }
export function call(n: Node): { name: string; args: Node[] } | null {
  n = unparen(expr(n));
  if (n.type !== 'call_expression' || f(n, 'function')?.type !== 'identifier') return null;
  return { name: t(f(n, 'function')), args: f(n, 'arguments') ? named(f(n, 'arguments')!) : [] };
}
export interface Meaning { kind: Shape; label: string; merge?: boolean; prompt?: string; input?: boolean; seed?: 'rand' | 'random'; random?: 'rand' | 'random' }
type Builtin = (name: string) => boolean;

function stringValue(n?: Node): string | null {
  if (!n || n.type !== 'string_literal' || !/^"(?:[^"\\]|\\[nrt\\"])*"$/.test(n.text)) return null;
  return n.text.slice(1, -1).replace(/\\([nrt\\"])/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"' })[c]!);
}
function output(c: NonNullable<ReturnType<typeof call>>): Meaning | null {
  if (c.name === 'putchar' && c.args.length === 1) return { kind: 'display', label: `${t(c.args[0])}を1文字表示` };
  const format = stringValue(c.args[0]);
  if (format === null) return null;
  if (c.name === 'puts' && c.args.length === 1) return { kind: 'display', label: `「${format}」を表示` };
  if (c.name !== 'printf') return null;
  if (!format.includes('%') && c.args.length === 1) {
    const label = format.replace(/[\r\n]+$/, '');
    return { kind: 'display', label: label ? `「${label}」を表示` : '改行を表示', prompt: /[:：?？]\s*$/.test(format) ? format : undefined };
  }
  if (/^%[diuoxXfFeEgGaAcsp]\s*$/.test(format) && c.args.length === 2 && !containsCall(c.args[1])) return { kind: 'display', label: `${t(c.args[1])}を表示` };
  return null;
}
function input(c: NonNullable<ReturnType<typeof call>>): Meaning | null {
  if (c.name !== 'scanf') return null;
  const format = stringValue(c.args[0]);
  if (format === null || !/^(?:\s*%[diufFeEgGcs]\s*)+$/.test(format)) return null;
  const formats = format.match(/%[diufFeEgGcs]/g)!;
  if (formats.length !== c.args.length - 1) return null;
  const targets = c.args.slice(1).map(n => n.type === 'pointer_expression' && n.text.startsWith('&') ? t(f(n, 'argument')) : '');
  if (targets.some(n => !/^[A-Za-z_]\w*$/.test(n))) return null;
  return { kind: 'input', label: `${targets.join('、')}に入力`, input: true };
}
function assignment(n: Node): { target: Node; value: Node } | null {
  n = expr(n);
  if (n.type === 'declaration') {
    const initializers = named(n).filter(c => c.type === 'init_declarator');
    const declarators = Array.from({ length: n.childCount }, (_, i) => n.fieldNameForChild(i)).filter(name => name === 'declarator');
    if (initializers.length !== 1 || declarators.length > 1 || named(n).some(c => c.type === 'storage_class_specifier' || c.type === 'type_qualifier')) return null;
    n = initializers[0];
    const target = f(n, 'declarator'), value = f(n, 'value');
    return target?.type === 'identifier' && value ? { target, value } : null;
  }
  if (n.type === 'assignment_expression' && t(f(n, 'operator')) === '=') {
    const target = f(n, 'left'), value = f(n, 'right');
    return target && value ? { target, value } : null;
  }
  return null;
}
function randomRange(n: Node, builtin: Builtin): { lower: number; upper: number; family: 'rand' | 'random' } | null {
  n = unparen(n);
  let lower = 0;
  if (n.type === 'binary_expression' && t(f(n, 'operator')) === '+') {
    const right = f(n, 'right');
    if (!right || !/^\d+$/.test(right.text)) return null;
    lower = Number(right.text); n = unparen(f(n, 'left')!);
  }
  if (n.type !== 'binary_expression' || t(f(n, 'operator')) !== '%') return null;
  const right = f(n, 'right'), left = f(n, 'left');
  if (!right || !left || !/^[1-9]\d*$/.test(right.text)) return null;
  const c = call(left), modulus = Number(right.text);
  if (!c || !['rand', 'random'].includes(c.name) || c.args.length || !builtin(c.name)) return null;
  // Only summarize ranges guaranteed by each library's minimum specified range.
  const max = c.name === 'random' ? 2147483647 : 32767;
  if (!Number.isSafeInteger(lower) || modulus - 1 > max || lower + modulus - 1 > 2147483647) return null;
  return { lower, upper: lower + modulus - 1, family: c.name as 'rand' | 'random' };
}
export function condition(n: Node): string {
  n = unparen(n);
  if (n.type === 'binary_expression') {
    const left = t(f(n, 'left')), right = t(f(n, 'right')), op = t(f(n, 'operator'));
    const suffix: Record<string, string> = { '<=': '以下', '>=': '以上', '<': '未満', '>': 'より大きい', '==': 'と等しい', '!=': 'と等しくない' };
    if (suffix[op]) return `${left}が${right}${suffix[op]}`;
  }
  return n.text;
}
export function summarize(node: Node, builtin: Builtin): Meaning {
  const n = expr(node), c = call(n);
  if (c) {
    if (builtin(c.name)) {
      if (['printf', 'puts', 'putchar'].includes(c.name)) return output(c) ?? { kind: 'display', label: `${n.text}\nを表示` };
      if (c.name === 'scanf') return input(c) ?? { kind: 'input', label: `${n.text}\nで入力` };
      if (c.name === 'getchar') return { kind: 'input', label: '1文字を入力' };
      if (['srand', 'srandom'].includes(c.name) && c.args.length === 1) return { kind: 'process', label: '乱数の生成を初期化', seed: c.name === 'srand' ? 'rand' : 'random' };
      if (['fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf', 'fgets', 'fputs', 'fgetc', 'fputc', 'fflush'].includes(c.name)) return { kind: 'file', label: n.text };
    }
    return { kind: 'subroutine', label: `${n.text}を呼び出す` };
  }
  const a = assignment(node);
  if (a) {
    const r = randomRange(a.value, builtin);
    if (r) return { kind: 'process', label: `${r.lower}〜${r.upper}の乱数を\n${a.target.text}に代入`, random: r.family };
    return { kind: 'process', label: `${a.target.text}を${a.value.text}とする`, merge: !containsCall(a.value) && a.target.type === 'identifier' };
  }
  if (n.type === 'update_expression') {
    const arg = f(n, 'argument'), op = t(f(n, 'operator'));
    if (arg && ['++', '--'].includes(op)) return { kind: 'process', label: `${arg.text}を1${op === '++' ? '増やす' : '減らす'}`, merge: false };
  }
  return { kind: 'process', label: node.text.trim().replace(/;$/, '') };
}
