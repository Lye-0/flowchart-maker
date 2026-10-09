import { Parser, Language } from 'web-tree-sitter';
import runtimeUrl from 'web-tree-sitter/tree-sitter.wasm?url';
import grammarUrl from 'tree-sitter-wasms/out/tree-sitter-c.wasm?url';
import { convertTree } from './convert';

let ready: Promise<Language> | undefined;
export async function parseC(source: string) {
  ready ??= (async () => {
    await Parser.init({ locateFile: () => runtimeUrl });
    return Language.load(grammarUrl);
  })();
  const language = await ready;
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    const tree = parser.parse(source);
    if (!tree) throw new Error('解析を完了できませんでした。コードを短くして再試行してください。');
    try { return convertTree(tree.rootNode, source); }
    finally { tree.delete(); }
  } finally { parser.delete(); }
}
