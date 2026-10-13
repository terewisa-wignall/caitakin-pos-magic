import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { sortVariantsBySize } from "@/lib/sizes";

// Columnas/funciones nuevas que aún no están en los tipos generados.
const db = (table: string) => (supabase as any).from(table);

type Variant = { id: string; variant_name: string; size: string | null; color: string | null; stock: number };
type InvProduct = { id: string; name: string; photo_thumb_url: string | null; photo_url: string | null; variants: Variant[] };
type SupplierPrice = { id: string; name: string; unit_cost: number; inventory_product_id: string | null };
type NewItem = { key: string; name: string; price: string; cost: string; qty: string };

function variantLabel(v: Variant) {
  const parts = [v.size, v.color].filter(Boolean);
  return parts.length ? parts.join(" · ") : v.variant_name || "Unitalla";
}
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toInt = (s: string | undefined) => Math.max(0, Math.floor(Number(s) || 0));

export function ReceiveDialog({
  open,
  supplier,
  onClose,
}: {
  open: boolean;
  supplier: { id: string; name: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [saving, setSaving] = useState(false);

  const products = useQuery<InvProduct[]>({
    queryKey: ["receive-products", supplier.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db("products")
        .select("id,name,photo_thumb_url,photo_url, variants:product_variants(id,variant_name,size,color,stock)")
        .eq("supplier_id", supplier.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const prices = useQuery<SupplierPrice[]>({
    queryKey: ["receive-prices", supplier.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_products")
        .select("id,name,unit_cost,inventory_product_id")
        .eq("supplier_id", supplier.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const priceFor = (productId: string) => (prices.data ?? []).find((p) => p.inventory_product_id === productId) ?? null;

  // Al abrir, el costo de cada producto empieza con el de la lista de precios.
  useEffect(() => {
    if (!open || !products.data || !prices.data) return;
    const initial: Record<string, string> = {};
    for (const p of products.data) {
      const sp = priceFor(p.id);
      if (sp) initial[p.id] = String(sp.unit_cost);
    }
    setCost(initial);
    setQty({});
    setNewItems([]);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, products.data, prices.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term));
  }, [products.data, search]);

  const productQty = (p: InvProduct) => p.variants.reduce((s, v) => s + toInt(qty[v.id]), 0);
  const totalPieces =
    (products.data ?? []).reduce((s, p) => s + productQty(p), 0) + newItems.reduce((s, n) => s + toInt(n.qty), 0);
  const totalCost =
    (products.data ?? []).reduce((s, p) => s + productQty(p) * (Number(cost[p.id]) || 0), 0) +
    newItems.reduce((s, n) => s + toInt(n.qty) * (Number(n.cost) || 0), 0);

  const save = async () => {
    if (totalPieces === 0) return toast.error("Escribe cuántas piezas llegaron");
    for (const n of newItems) {
      if (toInt(n.qty) > 0 && (!n.name.trim() || !(Number(n.price) > 0))) {
        return toast.error("Al producto nuevo le falta nombre o precio de venta");
      }
    }
    setSaving(true);
    try {
      const items: { variant_id: string; quantity: number; unit_cost: number; supplier_product_id: string | null; description: string }[] = [];

      // Productos que ya existen.
      for (const p of products.data ?? []) {
        const pieces = productQty(p);
        if (pieces === 0) continue;
        const unitCost = Number(cost[p.id]) || 0;
        let sp = priceFor(p.id);
        if (sp && unitCost > 0 && unitCost !== Number(sp.unit_cost)) {
          // El historial de precios se guarda solo (trigger).
          const { error } = await supabase.from("supplier_products").update({ unit_cost: unitCost, last_quoted_at: todayIso() }).eq("id", sp.id);
          if (error) throw error;
        } else if (!sp && unitCost > 0) {
          const { data, error } = await supabase
            .from("supplier_products")
            .insert({ supplier_id: supplier.id, name: p.name.trim(), unit_cost: unitCost, currency: "MXN", inventory_product_id: p.id, last_quoted_at: todayIso(), is_available: true })
            .select("id,name,unit_cost,inventory_product_id")
            .single();
          if (error) throw error;
          sp = data;
        }
        for (const v of p.variants) {
          const q = toInt(qty[v.id]);
          if (q > 0) items.push({ variant_id: v.id, quantity: q, unit_cost: unitCost, supplier_product_id: sp?.id ?? null, description: `${p.name.trim()} · ${variantLabel(v)}` });
        }
      }

      // Productos nuevos: se dan de alta (unitalla) y se reciben.
      for (const n of newItems) {
        const q = toInt(n.qty);
        if (q === 0) continue;
        const { data: prod, error: pErr } = await db("products")
          .insert({ name: n.name.trim(), base_price_mxn: Number(n.price), supplier_id: supplier.id, is_active: true })
          .select("id")
          .single();
        if (pErr) throw pErr;
        const { data: variant, error: vErr } = await supabase
          .from("product_variants")
          .insert({ product_id: prod.id, variant_name: "Unitalla", size: "Unitalla", stock: 0 })
          .select("id")
          .single();
        if (vErr) throw vErr;
        const unitCost = Number(n.cost) || 0;
        let spId: string | null = null;
        if (unitCost > 0) {
          const { data: sp, error } = await supabase
            .from("supplier_products")
            .insert({ supplier_id: supplier.id, name: n.name.trim(), unit_cost: unitCost, currency: "MXN", inventory_product_id: prod.id, last_quoted_at: todayIso(), is_available: true })
            .select("id")
            .single();
          if (error) throw error;
          spId = sp.id;
        }
        items.push({ variant_id: variant.id, quantity: q, unit_cost: unitCost, supplier_product_id: spId, description: n.name.trim() });
      }

      const { error } = await (supabase as any).rpc("receive_merchandise", { p_supplier_id: supplier.id, p_items: items, p_note: null });
      if (error) throw error;

      toast.success(`Listo: se sumaron ${totalPieces} piezas al inventario`);
      for (const key of ["inventory", "sell-products", "supplier-products", "receive-products", "receive-prices", "supplier-price-history"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "No se pudo recibir la mercancía");
    } finally {
      setSaving(false);
    }
  };

  const updateNew = (key: string, patch: Partial<NewItem>) =>
    setNewItems((list) => list.map((n) => (n.key === key ? { ...n, ...patch } : n)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="flex h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg">
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle>Recibir mercancía · {supplier.name}</DialogTitle>
          <DialogDescription>Escribe cuántas piezas llegaron. Se suman al inventario al guardar.</DialogDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {(products.data ?? []).length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}

          {products.isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}

          {filtered.map((p) => (
            <div key={p.id} className={`rounded-lg border p-3 ${productQty(p) > 0 ? "border-primary/50 bg-primary/5" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {(p.photo_thumb_url || p.photo_url) && (
                    <img src={p.photo_thumb_url ?? p.photo_url ?? ""} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <p className="min-w-0 flex-1 font-medium">{p.name}</p>
                <div className="w-28 shrink-0">
                  <Label className="text-[11px] text-muted-foreground">Costo c/u</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-9 font-numeric"
                    placeholder="$"
                    value={cost[p.id] ?? ""}
                    onChange={(e) => setCost((c) => ({ ...c, [p.id]: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sortVariantsBySize(p.variants).map((v) => (
                  <label key={v.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
                    <span className="min-w-0 flex-1 text-xs">
                      <span className="block truncate font-medium">{variantLabel(v)}</span>
                      <span className="text-muted-foreground">hay {v.stock}</span>
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="h-9 w-16 text-center font-numeric"
                      placeholder="0"
                      value={qty[v.id] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [v.id]: e.target.value }))}
                      aria-label={`Llegaron de ${p.name} ${variantLabel(v)}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {!products.isLoading && (products.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este proveedor aún no tiene productos en el inventario. Agrega uno nuevo abajo, o asígnale el proveedor en Inventario → Por proveedor.
            </p>
          )}

          {newItems.map((n) => (
            <div key={n.key} className="space-y-2 rounded-lg border border-dashed p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Producto nuevo (unitalla)</p>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNewItems((l) => l.filter((x) => x.key !== n.key))} aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input placeholder="Nombre (ej. Catrina 30 cm)" value={n.name} onChange={(e) => updateNew(n.key, { name: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Llegaron</Label>
                  <Input type="number" inputMode="numeric" className="font-numeric" value={n.qty} onChange={(e) => updateNew(n.key, { qty: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Costo c/u</Label>
                  <Input type="number" inputMode="decimal" className="font-numeric" value={n.cost} onChange={(e) => updateNew(n.key, { cost: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Precio de venta</Label>
                  <Input type="number" inputMode="decimal" className="font-numeric" value={n.price} onChange={(e) => updateNew(n.key, { price: e.target.value })} />
                </div>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNewItems((l) => [...l, { key: crypto.randomUUID(), name: "", price: "", cost: "", qty: "" }])}
          >
            <Plus className="mr-2 h-4 w-4" /> Llegó algo nuevo que no está en el inventario
          </Button>
        </div>

        <div className="space-y-2 border-t p-4">
          <div className="flex justify-between text-sm">
            <span>{totalPieces} piezas</span>
            <span className="font-numeric">Costo total {formatMoney(totalCost)}</span>
          </div>
          <Button className="h-12 w-full text-base" disabled={saving || totalPieces === 0} onClick={save}>
            <PackagePlus className="mr-2 h-5 w-5" />
            {saving ? "Guardando..." : "Sumar al inventario"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
