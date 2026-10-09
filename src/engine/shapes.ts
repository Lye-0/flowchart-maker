import type { FlowNode, FlowPage, FlowEdge, Point, Port, Shape } from './types';
import { deflateRaw } from 'pako';

type Command = ['M' | 'L', number, number] | ['Q', number, number, number, number] | ['Z'];
const shapes: Record<Shape, Command[]> = {
  terminal: [['M',12,0],['L',88,0],['Q',100,0,100,50],['Q',100,100,88,100],['L',12,100],['Q',0,100,0,50],['Q',0,0,12,0],['Z']],
  process: [['M',0,0],['L',100,0],['L',100,100],['L',0,100],['Z']],
  input: [['M',0,20],['L',100,0],['L',100,100],['L',0,100],['Z']],
  display: [['M',12,0],['L',86,0],['Q',100,0,100,50],['Q',100,100,86,100],['L',12,100],['L',0,50],['Z']],
  decision: [['M',50,0],['L',100,50],['L',50,100],['L',0,50],['Z']],
  file: [['M',12,0],['L',100,0],['L',88,100],['L',0,100],['Z']],
  subroutine: [['M',0,0],['L',100,0],['L',100,100],['L',0,100],['Z']],
  loopStart: [['M',12,0],['L',88,0],['L',100,24],['L',100,100],['L',0,100],['L',0,24],['Z']],
  loopEnd: [['M',0,0],['L',100,0],['L',100,76],['L',88,100],['L',12,100],['L',0,76],['Z']],
  unknown: [['M',0,0],['L',100,0],['L',100,100],['L',0,100],['Z']],
  junction: [['M',0,0],['L',100,0],['L',100,100],['L',0,100],['Z']],
};
export function svgPath(kind: Shape, w: number, h: number) {
  return shapes[kind].map(c => c[0] + c.slice(1).map((v, i) => Number(v) * (i % 2 === 0 ? w : h) / 100).join(' ')).join(' ');
}
const cache = new Map<Shape, string>();
export function stencil(kind: Shape) {
  if (cache.has(kind)) return cache.get(kind)!;
  const path = shapes[kind].map(c => c[0] === 'Z' ? '<close/>' : c[0] === 'Q' ? `<quad x1="${c[1]}" y1="${c[2]}" x2="${c[3]}" y2="${c[4]}"/>` : `<${c[0] === 'M' ? 'move' : 'line'} x="${c[1]}" y="${c[2]}"/>`).join('');
  const bars = kind === 'subroutine' ? '<path><move x="9" y="0"/><line x="9" y="100"/><move x="91" y="0"/><line x="91" y="100"/></path><stroke/>' : '';
  const xml = `<shape name="${kind}" w="100" h="100" aspect="variable" strokewidth="inherit"><connections><constraint x="0.5" y="0" perimeter="0"/><constraint x="1" y="0.5" perimeter="0"/><constraint x="0.5" y="1" perimeter="0"/><constraint x="0" y="0.5" perimeter="0"/></connections><background><path>${path}</path></background><foreground><fillstroke/>${bars}</foreground></shape>`;
  const compressed = deflateRaw(encodeURIComponent(xml));
  const encoded = btoa(Array.from(compressed, b => String.fromCharCode(b)).join(''));
  const result = `stencil(${encoded})`; cache.set(kind, result); return result;
}
export function anchor(n: FlowNode, port: Port): Point {
  return { x: n.x + (port === 'left' ? 0 : port === 'right' ? n.w : n.w / 2), y: n.y + (port === 'top' ? 0 : port === 'bottom' ? n.h : n.h / 2) };
}
export function edgePoints(page: FlowPage, edge: FlowEdge): Point[] {
  const source = page.nodes.find(n => n.id === edge.source)!, target = page.nodes.find(n => n.id === edge.target)!;
  const a = anchor(source, edge.from), b = anchor(target, edge.to);
  if (edge.via?.length) return [a, ...edge.via, b];
  if (edge.from === 'right') return [a, { x: b.x, y: a.y }, b];
  if (Math.abs(a.x - b.x) < 1) return [a, b];
  const mid = (a.y + b.y) / 2;
  return [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b];
}

// Place a branch label outside its source shape, including leftward loop returns.
export function edgeLabelPosition(page: FlowPage, edge: FlowEdge): Point & { anchor: 'start' | 'end' } {
  const [a, b] = edgePoints(page, edge);
  if (Math.abs(a.x - b.x) > 1) {
    const left = b.x < a.x;
    return { x: a.x + (left ? -12 : 18), y: a.y - 10, anchor: left ? 'end' : 'start' };
  }
  return { x: a.x + 12, y: a.y + (b.y < a.y ? -15 : 25), anchor: 'start' };
}
