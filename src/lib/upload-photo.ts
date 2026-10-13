import { supabase } from "@/integrations/supabase/client";
import { compressForUpload } from "./image-compress";

const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

export type UploadedPhoto = {
  photo_url: string;
  photo_thumb_url: string;
};

// Para productos viejos sin miniatura: descarga la foto original y sube solo la miniatura.
// La foto grande no se toca.
export async function createThumbFromUrl(photoUrl: string): Promise<string> {
  const res = await fetch(photoUrl);
  if (!res.ok) throw new Error(`No se pudo descargar la foto (${res.status})`);
  const blob = await res.blob();
  const { thumb, ext } = await compressForUpload(new File([blob], "foto", { type: blob.type }));
  const thumbPath = `${crypto.randomUUID()}_thumb.${ext}`;
  const contentType = ext === "webp" ? "image/webp" : "image/jpeg";
  const { error } = await supabase.storage
    .from("product-photos")
    .upload(thumbPath, thumb, { contentType, upsert: false });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("product-photos")
    .createSignedUrl(thumbPath, FIVE_YEARS);
  if (!data?.signedUrl) throw new Error("No se pudo firmar la URL de la miniatura");
  return data.signedUrl;
}

// Uploads a product photo to `product-photos` as two WebP files (full + thumb)
// and returns long-lived signed URLs. Falls back to a single upload on error.
export async function uploadProductPhoto(file: File): Promise<UploadedPhoto> {
  const { full, thumb, ext } = await compressForUpload(file);
  const id = crypto.randomUUID();
  const fullPath = `${id}.${ext}`;
  const thumbPath = `${id}_thumb.${ext}`;
  const contentType = ext === "webp" ? "image/webp" : "image/jpeg";

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.storage.from("product-photos").upload(fullPath, full, { contentType, upsert: false }),
    supabase.storage
      .from("product-photos")
      .upload(thumbPath, thumb, { contentType, upsert: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const [{ data: sFull }, { data: sThumb }] = await Promise.all([
    supabase.storage.from("product-photos").createSignedUrl(fullPath, FIVE_YEARS),
    supabase.storage.from("product-photos").createSignedUrl(thumbPath, FIVE_YEARS),
  ]);
  const photo_url = sFull?.signedUrl ?? "";
  const photo_thumb_url = sThumb?.signedUrl ?? photo_url;
  if (!photo_url) throw new Error("No se pudo firmar la URL de la foto");
  return { photo_url, photo_thumb_url };
}
