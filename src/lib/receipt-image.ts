import { toPng } from "html-to-image";

const safe = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    width: node.offsetWidth,
    height: node.offsetHeight,
    cacheBust: true,
  });
  const res = await fetch(dataUrl);
  return await res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function receiptFilename(name: string, start: string, end: string) {
  return `recibo-${safe(name || "nomina")}-${start}_${end}.png`;
}

/** Descarga la imagen del recibo. */
export async function downloadReceiptImage(node: HTMLElement, filename: string) {
  const blob = await nodeToPngBlob(node);
  downloadBlob(blob, filename);
}

/**
 * Comparte la imagen (WhatsApp y demás apps). Si el equipo no permite compartir
 * archivos, descarga la imagen y abre WhatsApp con el resumen escrito.
 */
export async function shareReceiptImage(node: HTMLElement, filename: string, message: string) {
  const blob = await nodeToPngBlob(node);
  const file = new File([blob], filename, { type: "image/png" });
  const nav: any = navigator;
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], text: message });
      return "shared" as const;
    } catch (e: any) {
      if (e?.name === "AbortError") return "cancelled" as const;
    }
  }
  downloadBlob(blob, filename);
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  return "fallback" as const;
}
