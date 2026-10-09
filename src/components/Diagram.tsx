import { edgePoints, svgPath } from '../engine/shapes';
import { wrapLabel } from '../engine/convert';
import type { FlowNode, FlowPage } from '../engine/types';
import s from '../App.module.css';

export function Diagram({ page, zoom, selected, onSelect }: { page: FlowPage; zoom: number; selected?: string; onSelect: (node: FlowNode) => void }) {
  return <svg className={s.diagram} width={page.width * zoom} height={page.height * zoom} viewBox={`0 0 ${page.width} ${page.height}`} aria-label={`${page.name} のフローチャート`} role="group">
    <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#778794" /></marker></defs>
    {page.edges.map(edge => {
      const points = edgePoints(page, edge), a = points[0], b = points[1];
      const target = page.nodes.find(n => n.id === edge.target)!;
      const horizontal = Math.abs(a.x - b.x) > 1;
      return <g key={edge.id}>
        <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#778794" strokeWidth="1.5" markerEnd={target.kind === 'junction' ? undefined : 'url(#arrowhead)'} />
        {edge.label && <text x={horizontal ? a.x + 18 : a.x + 12} y={horizontal ? a.y - 10 : a.y + 25} className={s.edgeLabel}>{edge.label}</text>}
      </g>;
    })}
    {page.nodes.filter(n => n.kind !== 'junction').map(node => {
      const lines = wrapLabel(node.label, node.kind === 'decision' ? 22 : 26);
      return <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={`${s.shape} ${selected === node.id ? s.selectedShape : ''}`} role={node.range ? 'button' : undefined} tabIndex={node.range ? 0 : undefined} aria-label={node.kind === 'unknown' ? `未解決の処理、${node.range?.line}行目` : `${node.label}${node.range ? `、${node.range.line}行目` : ''}`} onClick={() => onSelect(node)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node); } }}>
        <title>{node.range ? `${node.range.line}〜${node.range.endLine}行目を確認` : node.label}</title>
        <path d={svgPath(node.kind, node.w, node.h)} fill={node.kind === 'unknown' ? '#fffcf3' : '#fff'} stroke={node.kind === 'unknown' ? '#ad8550' : '#465c6a'} strokeWidth="1.5" strokeDasharray={node.kind === 'unknown' ? '6 4' : undefined} />
        {node.kind === 'subroutine' && <path d={`M${node.w * .09},0 V${node.h} M${node.w * .91},0 V${node.h}`} stroke="#465c6a" fill="none" strokeWidth="1.5" />}
        <text x={node.w / 2} y={node.h / 2 - (lines.length - 1) * 10 + 5} textAnchor="middle" className={s.nodeLabel}>{lines.map((line, i) => <tspan key={i} x={node.w / 2} dy={i ? 20 : 0}>{line}</tspan>)}</text>
      </g>;
    })}
  </svg>;
}
