import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, AlertTriangle, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/app/inventory")({
  head: () => ({ meta: [{ title: "Inventario · CAsitakin" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const q = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,photo_url,base_price_mxn,is_active,categories(name), variants:product_variants(id,stock)")
        .order("name");
      return data ?? [];
    },
  });

  const filtered = (q.data ?? []).filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">Inventario</h1>
          <p className="text-sm text-muted-foreground">Productos, variantes y stock</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> Nuevo</Button>
        )}
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p: any) => {
          const totalStock = p.variants.reduce((s: number, v: any) => s + v.stock, 0);
          return (
            <Link key={p.id} to="/app/inventory/$productId" params={{ productId: p.id }}>
              <Card className="p-3 flex gap-3 hover:shadow-elevated transition-shadow">
                <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0">
                  {p.photo_url ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium truncate">{p.name}</p>
                    {!p.is_active && <span className="text-xs bg-muted px-2 py-0.5 rounded">Inactivo</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.categories?.name || "—"}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="font-numeric font-semibold">{formatMoney(p.base_price_mxn)}</p>
                    <p className={`text-xs font-numeric ${totalStock < 5 ? "text-destructive" : "text-muted-foreground"}`}>
                      {totalStock < 5 && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                      Stock: {totalStock}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {filtered.length === 0 && !q.isLoading && (
          <Card className="p-8 text-center col-span-full"><p className="text-muted-foreground">Sin productos</p></Card>
        )}
      </div>

      {isAdmin && <CreateProductDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "", description: "", category_id: "", base_price_mxn: "", sku: "" });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const cats = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [] });

  const submit = async () => {
    if (!form.name || !form.base_price_mxn) { toast.error("Nombre y precio requeridos"); return; }
    setLoading(true);
    try {
      let photo_url: string | null = null;
      if (file) {
        const path = `${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("product-photos").upload(path, file);
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("product-photos").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        photo_url = signed?.signedUrl ?? null;
      }
      const { error } = await supabase.from("products").insert({
        name: form.name, description: form.description || null,
        category_id: form.category_id || null,
        base_price_mxn: Number(form.base_price_mxn),
        sku: form.sku || null, photo_url,
      });
      if (error) throw error;
      toast.success("Producto creado");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["sell-products"] });
      setForm({ name: "", description: "", category_id: "", base_price_mxn: "", sku: "" });
      setFile(null);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo producto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Foto</Label>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="w-full">
              <Upload className="h-4 w-4 mr-2" /> {file ? file.name : "Subir foto"}
            </Button>
          </div>
          <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Descripción</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div>
            <Label>Categoría</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Precio MXN *</Label><Input type="number" value={form.base_price_mxn} onChange={(e) => setForm({ ...form, base_price_mxn: e.target.value })} /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          </div>
          <Button onClick={submit} disabled={loading} className="w-full">{loading ? "Guardando..." : "Crear"}</Button>
          <p className="text-xs text-muted-foreground text-center">Agrega variantes y stock desde el detalle del producto.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
