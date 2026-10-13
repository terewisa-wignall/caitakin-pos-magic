import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type ParsedEmployerPdf = {
  kind: "imss" | "nomina_4pct";
  period: string; // YYYY-MM-01
  bimester: string | null;
  due_date: string | null; // YYYY-MM-DD
  patronal: number;
  obrera: number;
  total: number;
  reference: string | null;
};

const money = (s: string) => Number(s.replace(/,/g, "")) || 0;

/** Reconstruye las líneas del PDF (por posición) para leerlo en el mismo orden visual que ves en pantalla. */
async function pdfText(file: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it: any) => "str" in it && it.str.trim())
      .map((it: any) => ({ s: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let row: typeof items = [];
    const flush = () => {
      if (row.length) lines.push(row.sort((a, b) => a.x - b.x).map((r) => r.s.trim()).join(" "));
      row = [];
    };
    for (const it of items) {
      if (row.length && Math.abs(row[0].y - it.y) > 3) flush();
      row.push(it);
    }
    flush();
  }
  return lines.join("\n").replace(/[ \t]+/g, " ");
}

/** Lee el SIPARE (IMSS/Infonavit) o la declaración del 4% sobre nómina. Devuelve null si no los reconoce. */
export async function parseEmployerPdf(file: File): Promise<ParsedEmployerPdf | null> {
  const t = await pdfText(file);

  if (/IMPUESTO SOBRE N[ÓO]MINAS/i.test(t)) {
    const total = t.match(/IMPORTE:\s*\$\s*([\d,]+(?:\.\d+)?)/i);
    const range = t.match(/\b(\d{2})-(\d{2})-(20\d{2})\b/);
    const due = t.match(/Fecha limite referencia:\s*(\d{4}-\d{2}-\d{2})/i);
    const ref = t.match(/REFERENCIA:\s*(\d{10,})/i);
    if (!total || !range) return null;
    const amount = money(total[1]);
    return {
      kind: "nomina_4pct",
      period: `${range[3]}-${range[2]}-01`,
      bimester: null,
      due_date: due?.[1] ?? null,
      patronal: amount,
      obrera: 0,
      total: amount,
      reference: ref?.[1] ?? null,
    };
  }

  if (/SIPARE|CUOTAS OBRERO PATRONALES/i.test(t)) {
    const tot = t.match(/TOTAL A PAGAR\s*\$\s*([\d,]+\.\d{2})\s*\$\s*([\d,]+\.\d{2})\s*\$\s*([\d,]+\.\d{2})/i);
    const periods = [...t.matchAll(/\b(0[1-9]|1[0-2])-(20\d{2})\b/g)];
    const due = t.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
    const line = t.match(/\b(Y[0-9A-Z]{3}[0-9A-Z-]{25,})\b/);
    if (!tot || !periods.length) return null;
    return {
      kind: "imss",
      period: `${periods[0][2]}-${periods[0][1]}-01`,
      bimester: periods[1] ? `${periods[1][1]}-${periods[1][2]}` : null,
      due_date: due ? `${due[3]}-${due[2]}-${due[1]}` : null,
      patronal: money(tot[1]),
      obrera: money(tot[2]),
      total: money(tot[3]),
      reference: line?.[1] ?? null,
    };
  }
  return null;
}
