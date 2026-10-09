import type { Conversion, Port } from './types';
import { stencil, edgePoints } from './shapes';
import { wrapLabel } from './convert';

export const xmlEscape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const port: Record<Port, [number, number]> = { top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5] };
export function toDrawio(conversion: Conversion): string {
  const pages = conversion.pages.map((page, index) => {
    const nodes = page.nodes.map(n => {
      const hidden = n.kind === 'junction';
      const style = `shape=${stencil(n.kind)};whiteSpace=wrap;html=0;fillColor=${hidden ? 'none' : '#FFFFFF'};strokeColor=${hidden ? 'none' : '#334155'};strokeWidth=1.5;fontColor=#18212B;fontFamily=Arial;fontSize=14;spacing=12;${n.kind === 'unknown' ? 'dashed=1;' : ''}`;
      const warning = conversion.diagnostics.find(d => d.page === page.name && d.nodeId === n.id);
      const label = wrapLabel(n.label, n.kind === 'decision' ? 22 : 26).join('\n');
      const cell = `<mxCell style="${xmlEscape(style)}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;
      // Explicit newlines are numeric entities: XML attributes otherwise normalize them to spaces.
      return `<object id="${n.id}" label="${xmlEscape(label).replace(/\n/g, '&#10;')}" sourceCode="${xmlEscape(n.sourceText ?? '').replace(/\n/g, '&#10;')}" sourceLine="${n.range?.line ?? ''}" sourceEndLine="${n.range?.endLine ?? ''}" status="${warning ? 'unresolved' : 'converted'}" tooltip="${xmlEscape(warning?.message ?? (n.range ? `元コード ${n.range.line}〜${n.range.endLine}行` : ''))}">${cell}</object>`;
    }).join('\n');
    const edges = page.edges.map(e => {
      const [exitX, exitY] = port[e.from], [entryX, entryY] = port[e.to];
      const target = page.nodes.find(n => n.id === e.target)!;
      const points = edgePoints(page, e).slice(1, -1).map(p => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('');
      return `<mxCell id="${e.id}" value="${xmlEscape(e.label ?? '')}" edge="1" parent="1" source="${e.source}" target="${e.target}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;strokeColor=#64748B;strokeWidth=1.5;endArrow=${target.kind === 'junction' ? 'none' : 'block'};endFill=1;fontSize=12;fontColor=#334155;labelBackgroundColor=#FFFFFF;exitX=${exitX};exitY=${exitY};exitPerimeter=0;entryX=${entryX};entryY=${entryY};entryPerimeter=0;"><mxGeometry relative="1" as="geometry">${points ? `<Array as="points">${points}</Array>` : ''}</mxGeometry></mxCell>`;
    }).join('\n');
    return `<diagram id="page-${index + 1}" name="${xmlEscape(page.name)}"><mxGraphModel grid="1" gridSize="10" page="1" pageScale="1" pageWidth="${Math.max(827, page.width)}" pageHeight="${Math.max(1169, page.height)}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${nodes}${edges}</root></mxGraphModel></diagram>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" compressed="false" analysisWarnings="${xmlEscape(JSON.stringify(conversion.diagnostics.map(d => ({ message: d.message, line: d.range.line, endLine: d.range.endLine, page: d.page }))))}">${pages}</mxfile>`;
}
