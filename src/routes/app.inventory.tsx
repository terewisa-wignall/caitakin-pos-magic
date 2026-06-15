import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, AlertTriangle, Upload, X } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney } from "@/lib/format";

const QUICK_SIZE_SETS = [
  { id: "unitalla", label: "Unitalla", sizes: ["Unitalla"] },
  { id: "ninas", label: "Niñas / Niños", sizes: ["2", "4", "6", "8", "10", "12", "14"] },
  { id: "bebes", label: "Bebés", sizes: ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m"] },
  { id: "damas", label: "Damas", sizes: ["CH", "M", "G", "EG"] },
  { id: "caballeros", label: "Caballeros", sizes: ["CH", "M", "G", "EG", "XG"] },
  { id: "calzado", label: "Calzado", sizes: ["22", "23", "24", "25", "26", "27", "28"] },
];

const TEXT_SIZE_ORDER = ["XXS", "XS", "S", "CH", "M", "G", "L", "EG", "XL", "XG", "XXL"];

function getSizeSortValue(size: string) {
  const normalized = size.trim().toUpperCase();
  const textIndex = TEXT_SIZE_ORDER.indexOf(normalized);
  if (textIndex >= 0) return textIndex + 1000;

  const numeric = Number.parseFloat(normalized.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;

  const rangeStart = normalized.match(/^(\d+(?:\.\d+)?)-/);
  if (rangeStart) return Number.parseFloat(rangeStart[1]);

  if (normalized === "UNITALLA") return 2000;
  return 3000;
}

function sortSizes(sizes: string[]) {
  return [...sizes].sort((a, b) => {
    const aValue = getSizeSortValue(a);
    const bValue = getSizeSortValue(b);
    if (aValue !== bValue) return aValue - bValue;
    return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
  });
}

type InventoryVariant = {
  id: string;
  stock: number;
};

type InventoryProduct = {
  id: string;
  name: string;
  photo_url: string | null;
  base_price_mxn: number;
  is_active: boolean;
  categories: { name: string } | null;
  variants: InventoryVariant[];
};

type CategoryOption = {
  id: string;
  name: string;
};

export const Route = createFileRoute("/app/inventory")({
  head: () => ({ meta: [{ title: "Inventario · CAsitakin" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== "/app/inventory") return <Outlet />;

  return <InventoryList />;
}

function InventoryList() {
  const { isSeller: canManageInventory } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const q = useQuery<InventoryProduct[]>({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,photo_url,base_price_mxn,is_active,categories(name), variants:product_variants(id,stock)",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as InventoryProduct[];
    },
  });

  const filtered = (q.data ?? []).filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">Inventario</h1>
          <p className="text-sm text-muted-foreground">Productos, variantes y stock</p>
        </div>
        {canManageInventory && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo
          </Button>
        )}
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {q.isError && (
          <Card className="p-8 text-center col-span-full">
            <p className="font-medium text-destructive">No se pudo cargar el inventario</p>
            <p className="text-sm text-muted-foreground mt-1">
              {q.error instanceof Error ? q.error.message : "Error desconocido"}
            </p>
          </Card>
        )}
        {filtered.map((p) => {
          const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
          return (
            <Link key={p.id} to="/app/inventory/$productId" params={{ productId: p.id }}>
              <Card className="p-3 flex gap-3 hover:shadow-elevated transition-shadow">
                <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0">
                  {p.photo_url ? (
                    <img
                      src={p.photo_url}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium truncate">{p.name}</p>
                    {!p.is_active && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">Inactivo</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.categories?.name || "—"}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="font-numeric font-semibold">{formatMoney(p.base_price_mxn)}</p>
                    <p
                      className={`text-xs font-numeric ${totalStock < 5 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {totalStock < 5 && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                      Stock: {totalStock}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {filtered.length === 0 && !q.isLoading && !q.isError && (
          <Card className="p-8 text-center col-span-full">
            <p className="text-muted-foreground">Sin productos</p>
          </Card>
        )}
      </div>

      {canManageInventory && (
        <CreateProductDialog open={showCreate} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function CreateProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category_id: "",
    base_price_mxn: "",
    sku: "",
  });
  const [inventoryMode, setInventoryMode] = useState("simple");
  const [simpleStock, setSimpleStock] = useState("1");
  const [simpleColor, setSimpleColor] = useState("");
  const [sizeSetId, setSizeSetId] = useState("unitalla");
  const [selectedSizes, setSelectedSizes] = useState<string[]>(sortSizes(QUICK_SIZE_SETS[0].sizes));
  const [sizeStocks, setSizeStocks] = useState<Record<string, string>>({ Unitalla: "1" });
  const [sizePrices, setSizePrices] = useState<Record<string, string>>({});
  const [customSize, setCustomSize] = useState("");
  const [sizeColor, setSizeColor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const cats = useQuery<CategoryOption[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!form.name || !form.base_price_mxn) {
      toast.error("Nombre y precio requeridos");
      return;
    }
    const basePrice = Number(form.base_price_mxn);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      toast.error("Precio inválido");
      return;
    }

    const initialVariants =
      inventoryMode === "simple"
        ? [
            {
              variant_name: simpleColor ? `Unitalla · ${simpleColor}` : "Unitalla",
              size: "Unitalla",
              color: simpleColor || null,
              stock: Math.max(0, Number(simpleStock) || 0),
            },
          ]
        : selectedSizes.map((size) => ({
            variant_name: sizeColor ? `Talla ${size} · ${sizeColor}` : `Talla ${size}`,
            size,
            color: sizeColor || null,
            stock: Math.max(0, Number(sizeStocks[size]) || 0),
            price_override_mxn: sizePrices[size]
              ? Math.max(0, Number(sizePrices[size]) || 0)
              : null,
          }));

    if (initialVariants.length === 0) {
      toast.error("Agrega al menos una variante");
      return;
    }

    setLoading(true);
    try {
      let photo_url: string | null = null;
      if (file) {
        const path = `${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("product-photos")
          .upload(path, file);
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("product-photos")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        photo_url = signed?.signedUrl ?? null;
      }
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: form.name,
          description: form.description || null,
          category_id: form.category_id || null,
          base_price_mxn: basePrice,
          sku: form.sku || null,
          photo_url,
        })
        .select("id")
        .single();
      if (error) throw error;
      const productId = data.id;
      const { error: variantError } = await supabase.from("product_variants").insert(
        initialVariants.map((variant) => ({
          ...variant,
          product_id: productId,
        })),
      );
      if (variantError) {
        await supabase.from("products").delete().eq("id", productId);
        throw variantError;
      }
      toast.success("Producto e inventario creados");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["sell-products"] });
      setForm({ name: "", description: "", category_id: "", base_price_mxn: "", sku: "" });
      setInventoryMode("simple");
      setSimpleStock("1");
      setSimpleColor("");
      setSizeSetId("unitalla");
      setSelectedSizes(sortSizes(QUICK_SIZE_SETS[0].sizes));
      setSizeStocks({ Unitalla: "1" });
      setSizePrices({});
      setCustomSize("");
      setSizeColor("");
      setFile(null);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const applySizeSet = (id: string) => {
    const nextSet = QUICK_SIZE_SETS.find((s) => s.id === id) ?? QUICK_SIZE_SETS[0];
    setSizeSetId(id);
    setSelectedSizes(sortSizes(nextSet.sizes));
    setSizeStocks(Object.fromEntries(nextSet.sizes.map((size) => [size, "1"])));
    setSizePrices({});
  };

  const addCustomSize = () => {
    const nextSize = customSize.trim();
    if (!nextSize) return;
    setSelectedSizes((current) => {
      if (current.some((size) => size.toLowerCase() === nextSize.toLowerCase())) return current;
      return sortSizes([...current, nextSize]);
    });
    setSizeStocks((current) => ({ ...current, [nextSize]: current[nextSize] ?? "1" }));
    setCustomSize("");
  };

  const removeSize = (sizeToRemove: string) => {
    setSelectedSizes((current) => current.filter((size) => size !== sizeToRemove));
    setSizeStocks((current) => {
      const next = { ...current };
      delete next[sizeToRemove];
      return next;
    });
    setSizePrices((current) => {
      const next = { ...current };
      delete next[sizeToRemove];
      return next;
    });
  };

  const updateSizeStock = (size: string, stock: string) => {
    setSizeStocks((current) => ({ ...current, [size]: stock }));
  };

  const updateSizePrice = (size: string, price: string) => {
    setSizePrices((current) => ({ ...current, [size]: price }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Foto</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" /> {file ? file.name : "Subir foto"}
            </Button>
          </div>
          <div>
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select
              value={form.category_id}
              onValueChange={(v) => setForm({ ...form, category_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(cats.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Precio MXN *</Label>
              <Input
                type="number"
                min={0}
                value={form.base_price_mxn}
                onChange={(e) => setForm({ ...form, base_price_mxn: e.target.value })}
              />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
          </div>
          <Tabs value={inventoryMode} onValueChange={setInventoryMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="simple">Simple</TabsTrigger>
              <TabsTrigger value="sizes">Por tallas</TabsTrigger>
            </TabsList>
            <TabsContent value="simple" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Stock inicial *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={simpleStock}
                    onChange={(e) => setSimpleStock(e.target.value)}
                    className="font-numeric"
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input
                    value={simpleColor}
                    onChange={(e) => setSimpleColor(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sizes" className="space-y-3 pt-2">
              <div>
                <Label>Set de tallas sugerido</Label>
                <Select value={sizeSetId} onValueChange={applySizeSet}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUICK_SIZE_SETS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label>Tallas del producto</Label>
                  {selectedSizes.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setSelectedSizes([]);
                        setSizeStocks({});
                      }}
                    >
                      Borrar todas
                    </Button>
                  )}
                </div>
                <div className="min-h-10 space-y-2 rounded-md border bg-background p-2">
                  {selectedSizes.map((size) => (
                    <div
                      key={size}
                      className="grid grid-cols-[minmax(0,1fr)_88px_112px_32px] items-end gap-2"
                    >
                      <div>
                        <span className="text-xs text-muted-foreground">Talla</span>
                        <div className="rounded-md border bg-secondary px-3 py-2 text-sm font-numeric">
                          {size}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Stock</Label>
                        <Input
                          type="number"
                          min={0}
                          value={sizeStocks[size] ?? "0"}
                          onChange={(e) => updateSizeStock(size, e.target.value)}
                          className="font-numeric"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Precio</Label>
                        <Input
                          type="number"
                          min={0}
                          value={sizePrices[size] ?? ""}
                          onChange={(e) => updateSizePrice(size, e.target.value)}
                          placeholder={form.base_price_mxn || "Base"}
                          className="font-numeric"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSize(size)}
                        aria-label={`Quitar talla ${size}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {selectedSizes.length === 0 && (
                    <span className="px-1 py-1 text-sm text-muted-foreground">
                      Agrega las tallas de este producto.
                    </span>
                  )}
                </div>
              </div>
              <div>
                <Label>Agregar talla</Label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input
                    value={customSize}
                    onChange={(e) => setCustomSize(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomSize();
                      }
                    }}
                    placeholder="Ej: XS, 16, 28, Unitalla"
                    className="font-numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCustomSize}
                    disabled={!customSize.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Color</Label>
                  <Input
                    value={sizeColor}
                    onChange={(e) => setSizeColor(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Guardando..." : "Crear"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            El producto queda listo para vender con stock inicial.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
