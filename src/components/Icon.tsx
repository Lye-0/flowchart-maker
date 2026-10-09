export function Icon({ name, size = 18 }: { name: 'upload' | 'download' | 'arrow' | 'code' | 'chart' | 'check' | 'close' | 'help' | 'shield' | 'expand'; size?: number }) {
  const paths = {
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
    download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20',
    chart: 'M8 2h8v5H8zM3 17h7v5H3zm11 0h7v5h-7zM12 7v5m-5 5v-5h10v5',
    check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    shield: 'm12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5zm-4 9 3 3 5-6',
    expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
