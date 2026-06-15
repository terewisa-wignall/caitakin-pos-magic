// Browser-only helper: removes the background from an image and flattens
// the result onto a white canvas, returning a new JPG File ready to upload.

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB

export async function flattenOnWhite(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("La imagen pesa más de 10 MB. Usa una más ligera.");
  }
  if (!file.type.startsWith("image/")) return file;

  const { removeBackground } = await import("@imgly/background-removal");
  const cutout: Blob = await removeBackground(file);

  const bitmap = await createImageBitmap(cutout);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo exportar la imagen"))),
      "image/jpeg",
      0.9,
    ),
  );

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
