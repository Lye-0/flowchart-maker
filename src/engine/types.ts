export type Shape = 'terminal' | 'process' | 'input' | 'display' | 'decision' | 'file' | 'subroutine' | 'loopStart' | 'loopEnd' | 'unknown' | 'junction';
export interface SourceRange { start: number; end: number; line: number; endLine: number }
export interface Diagnostic { id: string; message: string; range: SourceRange; nodeId?: string; page?: string }
export interface FlowNode { id: string; kind: Shape; label: string; sourceText?: string; unresolved?: boolean; range?: SourceRange; x: number; y: number; w: number; h: number }
export type Port = 'top' | 'bottom' | 'left' | 'right';
export interface Point { x: number; y: number }
export interface FlowEdge { id: string; source: string; target: string; label?: string; from: Port; to: Port; via?: Point[] }
export interface FlowPage { name: string; nodes: FlowNode[]; edges: FlowEdge[]; width: number; height: number }
export interface Conversion { pages: FlowPage[]; diagnostics: Diagnostic[]; source: string }
export interface WorkerRequest { id: number; source: string }
export type WorkerResponse = { id: number; result: Conversion } | { id: number; error: string };
