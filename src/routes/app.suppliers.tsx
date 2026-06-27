import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { type Currency, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, PackagePlus, Plus, Search, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/suppliers")({
  head: () => ({ meta: [{ title: "Proveedores · CAsitakin" }] }),
  component: SuppliersPage,
});

type Category = { id: string; name: string };
type Supplier = {
  id: string;
  name: string;
  classification_name: string | null;
  category_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  categories: { name: string } | null;
};
type SupplierProduct = {
  id: string;
  supplier_id: string;
  category_id: string | null;
  inventory_product_id: string | null;
  name: string;
  description: string | null;
  supplier_sku: string | null;
  unit_cost: number;
  currency: string;
  min_order_qty: number | null;
  lead_time_days: number | null;
  last_quoted_at: string | null;
  is_available: boolean;
  notes: string | null;
  categories: { name: string } | null;
  products: { name: string; base_price_mxn: number } | null;
};
type InventoryOption = { id: string; name: string; base_price_mxn: number };

function SuppliersPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [supplierDialog, setSupplierDialog] = useState<Supplier | null | "new">(null);
  const [productDialog, setProductDialog] = useState<SupplierProduct | null | "new">(null);

  const categories = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const suppliers = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*, categories(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
    enabled: isAdmin,
  });

  const supplierProducts = useQuery<SupplierProduct[]>({
    queryKey: ["supplier-products", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("supplier_products")
        .select("*, categories(name), products(name,base_price_mxn)")
        .eq("supplier_id", selectedId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SupplierProduct[];
    },
    enabled: isAdmin && !!selectedId,
  });

  const inventoryProducts = useQuery<InventoryOption[]>({
    queryKey: ["supplier-inventory-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,base_price_mxn")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const filteredSuppliers = useMemo(() => {
    return (suppliers.data ?? []).filter((supplier) => {
      const haystack = [
        supplier.name,
        supplier.classification_name,
        supplier.categories?.name,
        supplier.contact_name,
        supplier.location,
      ].join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || supplier.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [suppliers.data, search, categoryFilter]);

  const selectedSupplier = (suppliers.data ?? []).find((supplier) => supplier.id === selectedId) ?? null;

  const deleteSupplier = async (supplier: Supplier) => {
    if (!confirm(`¿Borrar proveedor ${supplier.name}? También se borrará su lista de productos.`)) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", supplier.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Proveedor borrado");
      if (selectedId === supplier.id) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    }
  };

  const deleteProduct = async (product: SupplierProduct) => {
    if (!confirm(`¿Borrar ${product.name} de esta lista?`)) return;
    const { error } = await supabase.from("supplier_products").delete().eq("id", product.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Producto borrado");
      qc.invalidateQueries({ queryKey: ["supplier-products", selectedId] });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">Solo administradores</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Directorio interno, costos y listas de compra por categoría.
          </p>
        </div>
        <Button onClick={() => setSupplierDialog("new")}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo
        </Button>
      </header>

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-3">
          <Card className="p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar proveedor, contacto o clasificación..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {(categories.data ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          <div className="space-y-2">
            {filteredSuppliers.map((supplier) => (
              <Card
                key={supplier.id}
                role="button"
                tabIndex={0}
                className={`p-4 transition-shadow hover:shadow-elevated ${
                  selectedId === supplier.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedId(supplier.id)}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{supplier.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {supplier.classification_name || supplier.categories?.name || "Sin clasificación"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${supplier.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSupplierDialog(supplier);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={`Borrar ${supplier.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteSupplier(supplier);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {supplier.categories?.name && <Badge variant="secondary">{supplier.categories.name}</Badge>}
                  <Badge variant={supplier.is_active ? "default" : "outline"}>
                    {supplier.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </Card>
            ))}
            {filteredSuppliers.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">Sin proveedores</Card>
            )}
          </div>
        </section>

        <section className="space-y-3">
          {selectedSupplier ? (
            <>
              <Card className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold">{selectedSupplier.name}</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedSupplier.classification_name || selectedSupplier.categories?.name || "Sin clasificación"}
                    </p>
                  </div>
                  <Button onClick={() => setProductDialog("new")}>
                    <PackagePlus className="h-4 w-4 mr-2" /> Producto
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label="Contacto" value={selectedSupplier.contact_name} />
                  <Info label="Teléfono" value={selectedSupplier.phone} />
                  <Info label="Email" value={selectedSupplier.email} />
                  <Info label="Lugar" value={selectedSupplier.location} />
                </div>
                {selectedSupplier.notes && (
                  <p className="mt-4 rounded-md bg-muted p-3 text-sm">{selectedSupplier.notes}</p>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b p-4">
                  <h3 className="font-semibold">Lista de productos y costos</h3>
                  <p className="text-sm text-muted-foreground">
                    Sirve para comparar costos aunque no haya stock o no esté en inventario.
                  </p>
                </div>
                <div className="divide-y">
                  {(supplierProducts.data ?? []).map((product) => {
                    const linkedPrice = product.products?.base_price_mxn ?? null;
                    return (
                      <div
                        key={product.id}
                        className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{product.name}</p>
                            {product.categories?.name && <Badge variant="secondary">{product.categories.name}</Badge>}
                            {!product.is_available && <Badge variant="outline">No disponible</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {product.supplier_sku ? `SKU ${product.supplier_sku} · ` : ""}
                            {product.products?.name ? `Ligado a ${product.products.name}` : "No ligado a inventario"}
                          </p>
                          {product.description && <p className="mt-1 text-sm">{product.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {product.min_order_qty ? <span>Mínimo {product.min_order_qty}</span> : null}
                            {product.lead_time_days ? <span>Entrega {product.lead_time_days} días</span> : null}
                            {product.last_quoted_at ? <span>Cotizado {product.last_quoted_at}</span> : null}
                          </div>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="font-numeric text-lg font-semibold">
                            {formatMoney(product.unit_cost, product.currency as Currency)}
                          </p>
                          {linkedPrice !== null && (
                            <p className="text-xs text-muted-foreground">
                              Venta: {formatMoney(linkedPrice)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 md:justify-end">
                          <Button size="icon" variant="ghost" onClick={() => setProductDialog(product)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteProduct(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {(supplierProducts.data ?? []).length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">Aún no hay productos de proveedor</div>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-10 text-center text-muted-foreground">
              Elige un proveedor para ver sus productos y costos.
            </Card>
          )}
        </section>
      </div>

      <SupplierDialog
        open={supplierDialog !== null}
        supplier={supplierDialog === "new" ? null : supplierDialog}
        categories={categories.data ?? []}
        onClose={() => setSupplierDialog(null)}
        onSaved={(id) => {
          setSelectedId(id);
          qc.invalidateQueries({ queryKey: ["suppliers"] });
        }}
      />
      <SupplierProductDialog
        open={productDialog !== null && !!selectedSupplier}
        product={productDialog === "new" ? null : productDialog}
        supplierId={selectedSupplier?.id ?? ""}
        defaultCategoryId={selectedSupplier?.category_id ?? ""}
        categories={categories.data ?? []}
        inventoryProducts={inventoryProducts.data ?? []}
        onClose={() => setProductDialog(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["supplier-products", selectedId] })}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function SupplierDialog({
  open,
  supplier,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    classification_name: "",
    category_id: "",
    contact_name: "",
    phone: "",
    email: "",
    location: "",
    notes: "",
    is_active: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: supplier?.name ?? "",
      classification_name: supplier?.classification_name ?? "",
      category_id: supplier?.category_id ?? "",
      contact_name: supplier?.contact_name ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      location: supplier?.location ?? "",
      notes: supplier?.notes ?? "",
      is_active: supplier?.is_active ?? true,
    });
  }, [open, supplier]);

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const payload = {
      name,
      classification_name: form.classification_name.trim() || null,
      category_id: form.category_id || null,
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };
    const result = supplier
      ? await supabase.from("suppliers").update(payload).eq("id", supplier.id).select("id").single()
      : await supabase.from("suppliers").insert(payload).select("id").single();
    if (result.error) toast.error(result.error.message);
    else {
      toast.success(supplier ? "Proveedor actualizado" : "Proveedor creado");
      onSaved(result.data.id);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre de proveedor</Label>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <Label>Clasificación interna</Label>
            <Input
              value={form.classification_name}
              onChange={(event) => setForm({ ...form, classification_name: event.target.value })}
              placeholder="Ej. Oaxaca, Tenango, Textiles..."
            />
          </div>
          <div>
            <Label>Categoría relacionada</Label>
            <Select value={form.category_id || "none"} onValueChange={(value) => setForm({ ...form, category_id: value === "none" ? "" : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Contacto</Label>
            <Input value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div>
            <Label>Lugar</Label>
            <Input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas internas</Label>
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            <span className="text-sm">Proveedor activo</span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupplierProductDialog({
  open,
  product,
  supplierId,
  defaultCategoryId,
  categories,
  inventoryProducts,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: SupplierProduct | null;
  supplierId: string;
  defaultCategoryId: string;
  categories: Category[];
  inventoryProducts: InventoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    supplier_sku: "",
    category_id: "",
    inventory_product_id: "",
    unit_cost: "",
    currency: "MXN",
    min_order_qty: "",
    lead_time_days: "",
    last_quoted_at: "",
    notes: "",
    is_available: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: product?.name ?? "",
      description: product?.description ?? "",
      supplier_sku: product?.supplier_sku ?? "",
      category_id: product?.category_id ?? defaultCategoryId,
      inventory_product_id: product?.inventory_product_id ?? "",
      unit_cost: product ? String(product.unit_cost) : "",
      currency: product?.currency ?? "MXN",
      min_order_qty: product?.min_order_qty ? String(product.min_order_qty) : "",
      lead_time_days: product?.lead_time_days ? String(product.lead_time_days) : "",
      last_quoted_at: product?.last_quoted_at ?? "",
      notes: product?.notes ?? "",
      is_available: product?.is_available ?? true,
    });
  }, [open, product, defaultCategoryId]);

  const save = async () => {
    const cost = Number(form.unit_cost);
    if (!form.name.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Costo inválido");
      return;
    }
    const payload = {
      supplier_id: supplierId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      supplier_sku: form.supplier_sku.trim() || null,
      category_id: form.category_id || null,
      inventory_product_id: form.inventory_product_id || null,
      unit_cost: cost,
      currency: form.currency,
      min_order_qty: form.min_order_qty ? Math.max(0, Number(form.min_order_qty) || 0) : null,
      lead_time_days: form.lead_time_days ? Math.max(0, Number(form.lead_time_days) || 0) : null,
      last_quoted_at: form.last_quoted_at || null,
      notes: form.notes.trim() || null,
      is_available: form.is_available,
      updated_at: new Date().toISOString(),
    };
    const result = product
      ? await supabase.from("supplier_products").update(payload).eq("id", product.id)
      : await supabase.from("supplier_products").insert(payload);
    if (result.error) toast.error(result.error.message);
    else {
      toast.success(product ? "Producto actualizado" : "Producto agregado");
      onSaved();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto de proveedor" : "Nuevo producto de proveedor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Producto</Label>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={form.category_id || "none"} onValueChange={(value) => setForm({ ...form, category_id: value === "none" ? "" : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Producto en inventario</Label>
            <Select value={form.inventory_product_id || "none"} onValueChange={(value) => setForm({ ...form, inventory_product_id: value === "none" ? "" : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No ligado</SelectItem>
                {inventoryProducts.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Costo</Label>
            <Input
              type="number"
              step="0.01"
              value={form.unit_cost}
              onChange={(event) => setForm({ ...form, unit_cost: event.target.value })}
              className="font-numeric"
            />
          </div>
          <div>
            <Label>Moneda</Label>
            <Select value={form.currency} onValueChange={(currency) => setForm({ ...form, currency })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MXN">MXN</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>SKU proveedor</Label>
            <Input value={form.supplier_sku} onChange={(event) => setForm({ ...form, supplier_sku: event.target.value })} />
          </div>
          <div>
            <Label>Última cotización</Label>
            <Input type="date" value={form.last_quoted_at} onChange={(event) => setForm({ ...form, last_quoted_at: event.target.value })} />
          </div>
          <div>
            <Label>Mínimo de compra</Label>
            <Input type="number" value={form.min_order_qty} onChange={(event) => setForm({ ...form, min_order_qty: event.target.value })} />
          </div>
          <div>
            <Label>Días de entrega</Label>
            <Input type="number" value={form.lead_time_days} onChange={(event) => setForm({ ...form, lead_time_days: event.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas internas</Label>
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={form.is_available} onCheckedChange={(checked) => setForm({ ...form, is_available: checked })} />
            <span className="text-sm">Disponible con proveedor</span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
