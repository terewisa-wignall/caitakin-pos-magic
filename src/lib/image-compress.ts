// Client-side image compression: shrinks + converts to WebP before upload.
// Produces a main image (max 800px) and a thumbnail (max 200px).

export type CompressedImages = {
  full: Blob;
  thumb: Blob;
  ext: string; // "webp" or "jpg"
};

const supportsWebp = (() => {
  if (typeof document === "undefined") return false;
  try {
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
})();

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    // Revoke after decode; caller doesn't need the URL anymore.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawToBlob(
  img: HTMLImageElement,
  maxSide: number,
  quality: number,
  mime: string,
): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas no disponible"));
  // White background — handy for transparent PNGs and to keep JPG output clean.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen"))),
      mime,
      quality,
    );
  });
}

export async function compressForUpload(file: File): Promise<CompressedImages> {
  const img = await loadImage(file);
  const mime = supportsWebp ? "image/webp" : "image/jpeg";
  const ext = supportsWebp ? "webp" : "jpg";
  const [full, thumb] = await Promise.all([
    drawToBlob(img, 800, 0.82, mime),
    drawToBlob(img, 200, 0.75, mime),
  ]);
  return { full, thumb, ext };
}
