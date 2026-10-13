/** Abre una ventana con el documento y lanza la impresión (el navegador permite guardar como PDF). */
export function printHtml(title: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.45;font-size:14px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin:8px 0} th,td{border:1px solid #999;padding:5px 8px;text-align:left}
  td.n,th.n{text-align:right} .muted{color:#555;font-size:12px}
  .sign{display:flex;gap:48px;margin-top:64px} .sign div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center;font-size:12px}
  @media print{body{margin:0}}
</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
