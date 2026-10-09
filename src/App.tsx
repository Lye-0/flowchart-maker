import { useEffect, useRef, useState } from 'react';
import { Diagram } from './components/Diagram';
import { Icon } from './components/Icon';
import { toDrawio } from './engine/drawio';
import type { Conversion, FlowNode, SourceRange, WorkerResponse } from './engine/types';
import s from './App.module.css';

export default function App() {
  const [source, setSource] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<Conversion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(.75);
  const [selected, setSelected] = useState<string>();
  const [showIssues, setShowIssues] = useState(false);
  const worker = useRef<Worker | null>(null), requestId = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editor = useRef<HTMLTextAreaElement>(null), lineNumbers = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), canvas = useRef<HTMLDivElement>(null), help = useRef<HTMLDialogElement>(null);
  const dirty = !!result && source !== result.source;
  const page = result?.pages[pageIndex];
  const canConvert = source.trim().length > 0 && source.length <= 100_000;
  const lineCount = source.split('\n').length;

  function spawnWorker() {
    const next = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
    next.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.id !== requestId.current) return;
      clearTimeout(timer.current); setBusy(false);
      if ('error' in data) { setError(data.error); return; }
      setResult(data.result); setPageIndex(0); setSelected(undefined); setError(''); setNotice('');
      setShowIssues(data.result.diagnostics.length > 0);
      setZoom(Math.min(.8, Math.max(.2, (canvas.current?.clientWidth ?? 600) / data.result.pages[0].width - .05)));
    };
    next.onerror = () => { clearTimeout(timer.current); setBusy(false); setError('解析エンジンを読み込めませんでした。再変換するか、ページを再読み込みしてください。'); next.terminate(); worker.current = null; };
    worker.current = next; return next;
  }
  function convert(code = source) {
    if (!code.trim() || code.length > 100_000) return;
    clearTimeout(timer.current);
    const id = ++requestId.current;
    setBusy(true); setError(''); setNotice('');
    (worker.current ?? spawnWorker()).postMessage({ id, source: code });
    timer.current = setTimeout(() => { worker.current?.terminate(); worker.current = null; ++requestId.current; setBusy(false); setError('解析に時間がかかっています。コードを短くして再試行してください。'); }, 20_000);
  }
  useEffect(() => {
    return () => { clearTimeout(timer.current); worker.current?.terminate(); worker.current = null; };
  }, []);

  function cancel() { ++requestId.current; clearTimeout(timer.current); worker.current?.terminate(); worker.current = null; setBusy(false); setNotice('変換をキャンセルしました。'); }
  function focusSource(range: SourceRange, id?: string) {
    if (dirty || !editor.current) return;
    setSelected(id); editor.current.focus(); editor.current.setSelectionRange(range.start, range.end);
    editor.current.scrollTop = Math.max(0, (range.line - 4) * 26);
    if (lineNumbers.current) lineNumbers.current.scrollTop = editor.current.scrollTop;
  }
  function selectNode(node: FlowNode) { if (node.range) focusSource(node.range, node.id); }
  function download() {
    if (!result || dirty || busy || error) return;
    const blob = new Blob([toDrawio(result)], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (filename || 'flowchart.c').replace(/\.[^.]+$/, '') + '.drawio'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`${result.pages.length}ページの .drawio ファイルを保存しました。`);
  }
  async function loadFile(file?: File) {
    if (!file) return;
    if (!/\.c$/i.test(file.name)) { setError('.c ファイルを選択してください。'); return; }
    if (file.size > 400_000) { setError('ファイルが大きすぎます。100,000文字以内のCコードを読み込んでください。'); return; }
    try {
      const code = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (code.length > 100_000) throw new Error('コードは100,000文字以内にしてください。');
      if (busy) cancel();
      setSource(code); setFilename(file.name); setError(''); setNotice('ファイルを読み込みました。「変換する」で図を更新できます。');
    } catch (e) { setError(e instanceof TypeError ? '文字コードをUTF-8にして保存し直してください。' : (e as Error).message); }
  }
  const status = busy ? '変換中' : error ? '要確認' : dirty ? '再変換が必要' : result ? '変換済み' : source.trim() ? '変換待ち' : '入力待ち';

  return <div className={s.app}>
    <header className={s.header}>
      <a className={s.brand} href={import.meta.env.BASE_URL} aria-label="Flowchart Maker ホーム"><span className={s.brandMark}><Icon name="chart" size={20} /></span><span>Flowchart<span className={s.brandLight}> Maker</span></span></a>
      <div className={s.headerRight}><span className={s.localBadge}><span />ブラウザ内で処理</span><button className={s.helpButton} onClick={() => help.current?.showModal()}><Icon name="help" />使い方</button></div>
    </header>

    <main className={s.main}>
      <section className={s.intro} aria-labelledby="main-title">
        <div><p className={s.eyebrow}>FROM CODE TO CLARITY</p><h1 id="main-title">コードから、<span>流れを描く。</span></h1><p className={s.subtitle}>Cプログラムを、編集できるフローチャートへ。</p></div>
        <div className={s.steps} aria-label="利用の流れ"><span><b>01</b>コードを入力</span><i /> <span><b>02</b>流れを確認</span><i /><span><b>03</b>draw.ioで編集</span></div>
      </section>

      <div className={s.workspace}>
        <section className={s.codePanel} aria-labelledby="code-title" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void loadFile(e.dataTransfer.files[0]); }}>
          <div className={s.panelHeading}><div className={s.panelTitle}><Icon name="code" /><h2 id="code-title">ソースコード</h2></div><span className={s.language}>C</span></div>
          <div className={s.codeToolbar}><span className={s.filename} title={filename}><span className={s.fileDot} />{filename || 'コードを直接入力'}</span><button className={s.uploadButton} onClick={() => fileInput.current?.click()}><Icon name="upload" size={15} />ファイルを選択</button><input ref={fileInput} type="file" accept=".c" className={s.hidden} aria-label="Cファイルを読み込む" onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} /></div>
          <div className={s.editorWrap}>
            <div className={s.lineNumbers} ref={lineNumbers} aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}</div>
            <textarea ref={editor} className={s.editor} aria-label="Cソースコード" placeholder="ここにCコードを入力、または貼り付け" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={source} onChange={e => { setSource(e.target.value); setSelected(undefined); setNotice(''); setError(''); }} onScroll={e => { if (lineNumbers.current) lineNumbers.current.scrollTop = e.currentTarget.scrollTop; }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (!busy) convert(); } }} />
          </div>
          <div className={s.editorMeta}><span>{lineCount} 行 <span className={s.metaDot}>·</span> UTF-8</span><span>Ctrl / ⌘ + Enter で変換</span></div>
          <div className={s.codeFooter}><span className={s.inputHint}>直接入力、または .c ファイルを選択</span>{busy ? <button className={s.convertButton} onClick={cancel}><span className={s.spinner} />キャンセル</button> : <button className={s.convertButton} onClick={() => convert()} disabled={!canConvert}>変換する<Icon name="arrow" /></button>}</div>
        </section>

        <section className={s.previewPanel} aria-labelledby="preview-title">
          <div className={s.panelHeading}><div className={s.panelTitle}><Icon name="chart" /><h2 id="preview-title">フローチャート</h2></div><span className={`${s.status} ${dirty || error ? s.statusWarning : ''}`} role="status">{!busy && !dirty && !error && result && <Icon name="check" size={13} />}{status}</span></div>
          <div className={s.previewToolbar}><div className={s.tabs} aria-label="表示する関数">{result?.pages.map((p, i) => <button key={i} aria-pressed={i === pageIndex} onClick={() => { setPageIndex(i); setSelected(undefined); }} className={i === pageIndex ? s.activeTab : ''}>{p.name}<span>()</span></button>)}</div><span className={s.previewCount}>{page ? `${page.nodes.filter(n => n.kind !== 'junction').length} 図形` : ''}</span></div>
          <div className={s.canvas} ref={canvas} aria-busy={busy}>
            {page ? <div className={dirty ? s.stale : ''}><Diagram page={page} zoom={zoom} selected={selected} onSelect={selectNode} /></div> : <div className={s.emptyState}><Icon name="chart" size={40} /><p>{busy ? 'コードの流れを読み取っています' : 'コードを入力して「変換する」を押してください。'}</p></div>}
          </div>
          <div className={s.previewBottom}><span>{dirty ? 'コードが変更されています。再変換してください。' : page ? '図形を選択すると、元のコードを確認できます。' : '変換したフローチャートがここに表示されます。'}</span><div className={s.zoomControls}><button aria-label="縮小" disabled={!page} onClick={() => setZoom(z => Math.max(.2, z - .1))}>−</button><output aria-label="ズーム倍率">{Math.round(zoom * 100)}%</output><button aria-label="拡大" disabled={!page} onClick={() => setZoom(z => Math.min(1.8, z + .1))}>＋</button><button aria-label="幅に合わせる" disabled={!page} onClick={() => page && setZoom(Math.min(1, Math.max(.2, ((canvas.current?.clientWidth ?? 600) - 48) / page.width)))}><Icon name="expand" size={15} /></button></div></div>
          <div className={s.exportBar}><div><strong>編集のつづきは、draw.ioで。</strong><span>図形・テキスト・接続線を個別に編集できます。</span></div><button className={s.downloadButton} disabled={!result || dirty || busy || !!error} onClick={download}><Icon name="download" size={17} />.drawio を保存</button></div>
        </section>
      </div>

      {(error || source.length > 100_000) && <div className={s.error} role="alert">{source.length > 100_000 ? 'コードは100,000文字以内にしてください。' : error}</div>}
      {notice && <div className={s.notice} role="status"><Icon name="check" size={16} />{notice}</div>}

      <section className={s.diagnostics} aria-labelledby="issues-title">
        <button className={s.diagnosticsToggle} onClick={() => setShowIssues(v => !v)} aria-expanded={showIssues} aria-controls="issue-list"><span className={s.issueIndicator}>{result ? result.diagnostics.length ? '!' : '✓' : '—'}</span><h2 id="issues-title">未解決の箇所</h2><span className={s.issueCount}>{result ? result.diagnostics.length : '—'}</span><span className={s.issueDescription}>{dirty ? '前回の変換結果です' : result?.diagnostics.length ? '空白の図形を確認してください' : '確定できない処理は、空白で残します'}</span><span className={s.disclosure}>{showIssues ? '−' : '＋'}</span></button>
        {showIssues && <div id="issue-list" className={s.issueList}>{result?.diagnostics.length ? <><p>確認が必要な範囲と理由を表示します。元のコードを確認し、必要な箇所をdraw.ioで補ってください。</p>{result.diagnostics.map(d => <button key={d.id} disabled={dirty} onClick={() => { const index = result.pages.findIndex(p => p.name === d.page); if (index >= 0) setPageIndex(index); focusSource(d.range, d.nodeId); }}><span>{d.page} · {d.range.line}–{d.range.endLine} 行</span><span>{d.message}</span><Icon name="arrow" size={16} /></button>)}</> : <p>{result ? '対応範囲内で、未解決として検出された箇所はありません。Cプログラムの正しさを保証するものではありません。' : '変換すると、確認が必要な箇所がここに表示されます。'}</p>}</div>}
      </section>
      <footer className={s.footer}><span><Icon name="shield" size={15} />コードは外部に送信されません。</span><span>C source <span className={s.footerArrow}>→</span> Editable flowchart</span></footer>
    </main>

    <dialog ref={help} className={s.helpDialog} onClick={e => { if (e.target === help.current) help.current.close(); }}><div className={s.dialogHeader}><h2>Flowchart Maker の使い方</h2><button aria-label="使い方を閉じる" onClick={() => help.current?.close()}><Icon name="close" /></button></div><div className={s.dialogContent}>
      <ol><li>Cコードを貼り付けるか、UTF-8の .c ファイルを読み込みます。</li><li>「変換する」を押し、図と未解決箇所を確認します。</li><li>「.drawio を保存」で全関数をダウンロードします。</li><li><a href="https://app.diagrams.net/" target="_blank" rel="noreferrer">diagrams.net</a> の「ファイル → ファイルを開く → デバイス」からファイルを開きます。</li></ol>
      <h3>変換できる範囲</h3><p>関数ごとの処理、代入、if / else、for / while / do while、break / continue / return、定義・宣言を確認できる直接の関数呼び出しに対応します。図の処理順序はCコードに基づきます。</p>
      <h3>空白になる処理</h3><p>マクロの使用、条件付きコンパイル、switch、goto、関数ポインタ、構文エラーなどは空白で残します。未知のヘッダーだけで関数全体を空白にはしません。未解析の条件はラベルを空白にして本体の処理を保持し、実行の継続を確定できない文からは後続への線を描きません。行番号と理由は未解決箇所一覧と、出力図形のデータに残ります。</p>
      <h3>解析の前提</h3><p>プログラムの実行やコンパイルは行いません。図は関数本体を対象とし、グローバル変数の初期化や型の整合性は検証しません。標準ヘッダーの既知の関数を認識し、標準入出力はキーボード・画面として表現します。外部での入出力リダイレクトは解析対象外です。</p>
      <p>図は処理の意味ごとにまとめます。実行を伴わない単純な宣言は省き、乱数の準備・代入や入力案内・読み取りはまとめて表示します。図形を選ぶと対応する元コードを確認できます。未知の目的は推測せず、複雑な式は原式を保持します。終了端子は常に置きますが、終了経路がない箇所からは接続しません。</p>
      <h3>プライバシー</h3><p>入力コードはブラウザ内だけで処理され、自動保存されません。ページを閉じる前に必要なコードと図を保存してください。</p>
    </div></dialog>
  </div>;
}
