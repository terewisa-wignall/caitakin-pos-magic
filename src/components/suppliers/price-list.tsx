import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Edit2, History, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney, type Currency } from "@/lib/format";
import { uploadProductPhoto } from "@/lib/upload-photo";

// Tablas/columnas nuevas que aún no están en los tipos generados.
const db = (table: string) => (supabase as any).from(table);

export type PriceItem = {
  id: string;
  name: string;
  unit_cost: number;
  currency: string;
  last_quoted_at: string | null;
  is_available: boolean;
  notes: string | null;
  dimensions?: string | null;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  products: { name: string; base_price_mxn: number } | null;
};

type PriceHistory = { supplier_product_id: string; unit_cost: number; quoted_at: string; created_at: string };

function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}

export function PriceList({
  items,
  onEdit,
  onDelete,
  onChanged,
}: {
  items: PriceItem[];
  onEdit: (item: PriceItem) => void;
  onDelete: (item: PriceItem) => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<PriceItem | null>(null);

  const ids = items.map((i) => i.id);
  const history = useQuery<PriceHistory[]>({
    queryKey: ["supplier-price-history", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await db("supplier_product_prices")
        .select("supplier_product_id,unit_cost,quoted_at,created_at")
        .in("supplier_product_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const historyFor = (id: string) => (history.data ?? []).filter((h) => h.supplier_product_id === id);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => !term || `${i.name} ${i.dimensions ?? ""}`.toLowerCase().includes(term));
  }, [items, search]);

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b p-4">
        <div>
          <h3 className="font-semibold">Lista de precios</h3>
          <p className="text-sm text-muted-foreground">Lo que te cobra este proveedor. Solo tú lo ves.</p>
        </div>
        {items.length > 6 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar en la lista..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      <div className="divide-y">
        {filtered.map((item) => {
          const sale = item.products?.base_price_mxn ?? null;
          const profit = sale != null && item.currency === "MXN" ? sale - Number(item.unit_cost) : null;
          const pct = profit != null && sale ? Math.round((profit / sale) * 100) : null;
          const past = historyFor(item.id);
          const changes = past.length > 1;
          return (
            <div key={item.id} className="p-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted"
                  onClick={() => setPhotoFor(item)}
                  aria-label={item.photo_url ? `Ver foto de ${item.name}` : `Agregar foto a ${item.name}`}
                >
                  {item.photo_thumb_url || item.photo_url ? (
                    <img src={item.photo_thumb_url ?? item.photo_url ?? ""} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full w-full flex-col items-center justify-center text-[10px] text-muted-foreground">
                      <Camera className="h-4 w-4" />
                      Foto
                    </span>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{item.name}</p>
                      {item.dimensions && <p className="text-xs text-muted-foreground">Medidas: {item.dimensions}</p>}
                    </div>
                    <p className="shrink-0 font-numeric text-lg font-semibold">
                      {formatMoney(Number(item.unit_cost), item.currency as Currency)}
                    </p>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {item.last_quoted_at && <span>Precio del {shortDate(item.last_quoted_at)}</span>}
                    {sale != null && (
                      <span>
                        Vendes a {formatMoney(sale)}
                        {profit != null && (
                          <span className={profit > 0 ? "text-green-700" : "text-destructive"}>
                            {" "}· ganas {formatMoney(profit)}{pct != null ? ` (${pct}%)` : ""}
                          </span>
                        )}
                      </span>
                    )}
                    {!item.is_available && <span className="text-amber-700">No disponible</span>}
                  </div>
                  {item.notes && <p className="mt-1 text-xs">{item.notes}</p>}

                  <div className="mt-2 flex items-center gap-1">
                    {changes && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setOpenHistory(openHistory === item.id ? null : item.id)}
                      >
                        <History className="mr-1 h-3.5 w-3.5" /> Historial ({past.length})
                      </Button>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDelete(item)} aria-label={`Borrar ${item.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {openHistory === item.id && (
                    <ul className="mt-1 space-y-0.5 rounded-md bg-muted/50 p-2 text-xs">
                      {past.map((h, i) => (
                        <li key={h.created_at + i} className="flex justify-between gap-2">
                          <span>{shortDate(h.quoted_at)}{i === 0 ? " · actual" : ""}</span>
                          <span className="font-numeric">{formatMoney(Number(h.unit_cost))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {items.length === 0 ? "Aún no hay precios de este proveedor." : "Nada coincide con la búsqueda."}
          </div>
        )}
      </div>

      {photoFor && (
        <PhotoDialog
          item={photoFor}
          onClose={() => setPhotoFor(null)}
          onSaved={() => {
            setPhotoFor(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function PhotoDialog({ item, onClose, onSaved }: { item: PriceItem; onClose: () => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setSaving(true);
    try {
      const { photo_url, photo_thumb_url } = await uploadProductPhoto(file);
      const { error } = await db("supplier_products").update({ photo_url, photo_thumb_url }).eq("id", item.id);
      if (error) throw error;
      toast.success("Foto guardada");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "No se pudo subir la foto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{item.name}</DialogTitle></DialogHeader>
        {item.photo_url ? (
          <img src={item.photo_url} alt={item.name} className="max-h-[60vh] w-full rounded-md object-contain bg-muted" />
        ) : (
          <p className="text-sm text-muted-foreground">Este producto todavía no tiene foto.</p>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <Button disabled={saving} onClick={() => fileRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" />
          {saving ? "Subiendo..." : item.photo_url ? "Cambiar foto" : "Subir foto"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
