import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, LayoutGrid, Table2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { sortVariantsBySize } from "@/lib/sizes";
import { cn } from "@/lib/utils";

export type SupplierVariant = {
  id: string;
  variant_name: string;
  size: string | null;
  color: string | null;
  stock: number;
};

export type SupplierProduct = {
  id: string;
  name: string;
  photo_url: string | null;
  photo_thumb_url: string | null;
  base_price_mxn: number;
  supplier_id: string | null;
  variants: SupplierVariant[];
};

type Supplier = { id: string; name: string };

const NO_SUPPLIER = "__none__";
// Una talla/color con 1 pieza o menos se considera "por acabarse".
const LOW_STOCK = 1;

function variantLabel(v: SupplierVariant) {
  const parts = [v.size, v.color].filter(Boolean);
  return parts.length ? parts.join(" · ") : v.variant_name || "Unitalla";
}

function stockClass(stock: number) {
  if (stock <= 0) return "border-red-200 bg-red-50 text-red-800";
  if (stock <= LOW_STOCK) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-border bg-background";
}

// Solo para administradores: los proveedores son de lectura solo-admin.
export function InventoryBySupplier({ products, search }: { products: SupplierProduct[]; search: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"cards" | "table">(() => {
    try {
      return localStorage.getItem("inventory-supplier-view") === "table" ? "table" : "cards";
    } catch {
      return "cards";
    }
  });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [saving, setSaving] = useState(false);

  const suppliers = useQuery<Supplier[]>({
    queryKey: ["suppliers-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setViewSaved = (v: "cards" | "table") => {
    setView(v);
    try {
      localStorage.setItem("inventory-supplier-view", v);
    } catch {
      /* sin almacenamiento: solo no se recuerda */
    }
  };

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = products.filter((p) => !term || p.name.toLowerCase().includes(term));
    const known = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
    const byId = new Map<string, SupplierProduct[]>();
    for (const p of list) {
      const key = p.supplier_id && known.has(p.supplier_id) ? p.supplier_id : NO_SUPPLIER;
      byId.set(key, [...(byId.get(key) ?? []), p]);
    }
    const ordered = [...(suppliers.data ?? []).map((s) => ({ id: s.id, name: s.name })), { id: NO_SUPPLIER, name: "Sin proveedor" }];
    return ordered
      .map((s) => {
        const items = (byId.get(s.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "es"));
        const variants = items.flatMap((p) => p.variants);
        return {
          ...s,
          items,
          pieces: variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0),
          low: variants.filter((v) => v.stock <= LOW_STOCK).length,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [products, suppliers.data, search]);

  // Al buscar, abre todo para que se vean los resultados.
  const isOpen = (id: string) => !!search.trim() || open.has(id);
  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assign = async () => {
    if (!assignTo || selected.size === 0) return;
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({ supplier_id: assignTo === NO_SUPPLIER ? null : assignTo })
      .in("id", [...selected]);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${selected.size} ${selected.size === 1 ? "producto asignado" : "productos asignados"}`);
    setSelected(new Set());
    setAssignTo("");
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  if (suppliers.isError) {
    return (
      <Card className="p-6 text-center text-sm text-destructive">
        No se pudieron cargar los proveedores.
      </Card>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Toca un proveedor para ver sus productos.</p>
        <div className="flex rounded-md border p-0.5">
          <Button size="sm" variant={view === "cards" ? "default" : "ghost"} className="h-8" onClick={() => setViewSaved("cards")}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Fichas
          </Button>
          <Button size="sm" variant={view === "table" ? "default" : "ghost"} className="h-8" onClick={() => setViewSaved("table")}>
            <Table2 className="h-4 w-4 mr-1" /> Tabla
          </Button>
        </div>
      </div>

      {groups.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
            onClick={() => toggleOpen(g.id)}
            aria-expanded={isOpen(g.id)}
          >
            <div className="min-w-0">
              <p className={cn("font-semibold truncate", g.id === NO_SUPPLIER && "text-muted-foreground")}>{g.name}</p>
              <p className="text-xs text-muted-foreground">
                {g.items.length} {g.items.length === 1 ? "producto" : "productos"} · {g.pieces} piezas
                {g.low > 0 && <span className="text-amber-700"> · {g.low} por acabarse</span>}
              </p>
            </div>
            <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", isOpen(g.id) && "rotate-180")} />
          </button>

          {isOpen(g.id) &&
            (view === "cards" ? (
              <div className="border-t divide-y">
                {g.items.map((p) => (
                  <div key={p.id} className="flex gap-3 p-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleSelected(p.id)}
                      aria-label={`Seleccionar ${p.name}`}
                    />
                    <Link to="/app/inventory/$productId" params={{ productId: p.id }} className="flex min-w-0 flex-1 gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        {(p.photo_thumb_url || p.photo_url) && (
                          <img src={p.photo_thumb_url ?? p.photo_url ?? ""} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-sm font-numeric text-muted-foreground shrink-0">{formatMoney(p.base_price_mxn)}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sortVariantsBySize(p.variants).map((v) => (
                            <span key={v.id} className={cn("rounded border px-1.5 py-0.5 text-xs font-numeric", stockClass(v.stock))}>
                              {variantLabel(v)}: <span className="font-semibold">{v.stock}</span>
                            </span>
                          ))}
                          {p.variants.length === 0 && <span className="text-xs text-muted-foreground">Sin tallas</span>}
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-t overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2" />
                      <th className="p-2 text-left font-medium">Producto</th>
                      <th className="p-2 text-left font-medium">Talla / color</th>
                      <th className="p-2 text-right font-medium">Hay</th>
                      <th className="p-2 text-right font-medium">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.flatMap((p) => {
                      const variants = p.variants.length ? sortVariantsBySize(p.variants) : [null];
                      return variants.map((v, i) => (
                        <tr key={v?.id ?? p.id} className={cn("border-t", i > 0 && "border-dashed")}>
                          <td className="p-2 align-top">
                            {i === 0 && (
                              <Checkbox
                                checked={selected.has(p.id)}
                                onCheckedChange={() => toggleSelected(p.id)}
                                aria-label={`Seleccionar ${p.name}`}
                              />
                            )}
                          </td>
                          <td className="p-2 align-top">
                            {i === 0 && (
                              <Link to="/app/inventory/$productId" params={{ productId: p.id }} className="font-medium hover:underline">
                                {p.name}
                              </Link>
                            )}
                          </td>
                          <td className="p-2">{v ? variantLabel(v) : "—"}</td>
                          <td className="p-2 text-right">
                            {v && (
                              <span className={cn("rounded border px-1.5 py-0.5 font-numeric font-semibold", stockClass(v.stock))}>
                                {v.stock}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right font-numeric text-muted-foreground">
                            {i === 0 ? formatMoney(p.base_price_mxn) : ""}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            ))}
        </Card>
      ))}

      {groups.length === 0 && !suppliers.isLoading && (
        <Card className="p-8 text-center text-muted-foreground">Sin productos</Card>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[57px] md:bottom-0 md:left-64 z-20 border-t bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {selected.size} {selected.size === 1 ? "seleccionado" : "seleccionados"} · Asignar a:
            </span>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger className="h-10 w-48"><SelectValue placeholder="Proveedor" /></SelectTrigger>
              <SelectContent>
                {(suppliers.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                <SelectItem value={NO_SUPPLIER}>Sin proveedor</SelectItem>
              </SelectContent>
            </Select>
            <Button disabled={!assignTo || saving} onClick={assign}>{saving ? "Guardando..." : "Guardar"}</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
