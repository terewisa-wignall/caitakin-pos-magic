import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { SizeSetPicker } from "@/components/size-set-picker";

export const Route = createFileRoute("/app/inventory/$productId")({
  component: ProductDetail,
});

function ProductDetail() {
  const { productId } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const product = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), variants:product_variants(*)")
        .eq("id", productId).single();
      if (error) throw error;
      return data;
    },
  });

  const [variantDraft, setVariantDraft] = useState({ variant_name: "", size: "", color: "", stock: 0, price_override_mxn: "" });

  const addVariant = async () => {
    if (!variantDraft.variant_name) { toast.error("Nombre de variante requerido"); return; }
    const { error } = await supabase.from("product_variants").insert({
      product_id: productId,
      variant_name: variantDraft.variant_name,
      size: variantDraft.size || null,
      color: variantDraft.color || null,
      stock: Number(variantDraft.stock) || 0,
      price_override_mxn: variantDraft.price_override_mxn ? Number(variantDraft.price_override_mxn) : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Variante agregada");
      setVariantDraft({ variant_name: "", size: "", color: "", stock: 0, price_override_mxn: "" });
      qc.invalidateQueries({ queryKey: ["product", productId] });
    }
  };

  const updateVariantStock = async (id: string, stock: number) => {
    const { error } = await supabase.from("product_variants").update({ stock }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["product", productId] });
  };

  const removeVariant = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Eliminada"); qc.invalidateQueries({ queryKey: ["product", productId] }); }
  };

  const toggleActive = async (active: boolean) => {
    const { error } = await supabase.from("products").update({ is_active: active }).eq("id", productId);
    if (error) toast.error(error.message);
    else { toast.success(active ? "Activado" : "Desactivado"); qc.invalidateQueries({ queryKey: ["product", productId] }); }
  };

  if (product.isLoading) return <div className="p-6">Cargando...</div>;
  if (!product.data) return <div className="p-6">Producto no encontrado</div>;

  const p = product.data;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <Link to="/app/inventory" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Volver
      </Link>

      <Card className="p-5 flex gap-4 flex-col sm:flex-row">
        <div className="h-32 w-32 rounded-lg bg-muted overflow-hidden shrink-0">
          {p.photo_url ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" /> : null}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{p.name}</h1>
          <p className="text-sm text-muted-foreground">{p.categories?.name || "—"} · SKU: {p.sku || "—"}</p>
          <p className="text-lg font-numeric font-semibold mt-2">${Number(p.base_price_mxn).toFixed(2)} MXN</p>
          {p.description && <p className="text-sm text-muted-foreground mt-2">{p.description}</p>}
          {isAdmin && (
            <div className="flex items-center gap-2 mt-3">
              <Switch checked={p.is_active} onCheckedChange={toggleActive} />
              <span className="text-sm">{p.is_active ? "Activo" : "Inactivo"}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Variantes</h2>
        <div className="space-y-2">
          {p.variants.map((v: any) => (
            <div key={v.id} className="grid grid-cols-[1fr_80px_auto] gap-2 items-center border rounded-lg p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{v.variant_name}</p>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {v.size && <Badge variant="secondary" className="font-numeric">{v.size}</Badge>}
                  {v.color && <Badge variant="outline">{v.color}</Badge>}
                  {v.price_override_mxn && (
                    <span className="text-xs text-muted-foreground font-numeric">
                      ${Number(v.price_override_mxn).toFixed(2)}
                    </span>
                  )}
                  {!v.size && !v.color && !v.price_override_mxn && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <Input
                type="number" defaultValue={v.stock} className="font-numeric h-9"
                onBlur={(e) => { const n = Number(e.target.value); if (n !== v.stock && isAdmin) updateVariantStock(v.id, n); }}
                disabled={!isAdmin}
                aria-label="Stock"
              />
              {isAdmin && (
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeVariant(v.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {p.variants.length === 0 && <p className="text-sm text-muted-foreground">Sin variantes</p>}
        </div>

        {isAdmin && (
          <div className="mt-5 space-y-3">
            <SizeSetPicker
              productId={productId}
              categoryName={p.categories?.name}
              onCreated={() => qc.invalidateQueries({ queryKey: ["product", productId] })}
            />

            <Accordion type="single" collapsible>
              <AccordionItem value="manual" className="border rounded-lg px-3">
                <AccordionTrigger className="text-sm py-3">Agregar una variante manual</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pb-2">
                    <Input placeholder="Nombre*" value={variantDraft.variant_name} onChange={(e) => setVariantDraft({ ...variantDraft, variant_name: e.target.value })} className="col-span-2 sm:col-span-1" />
                    <Input placeholder="Talla" value={variantDraft.size} onChange={(e) => setVariantDraft({ ...variantDraft, size: e.target.value })} />
                    <Input placeholder="Color" value={variantDraft.color} onChange={(e) => setVariantDraft({ ...variantDraft, color: e.target.value })} />
                    <Input type="number" placeholder="Stock" value={variantDraft.stock} onChange={(e) => setVariantDraft({ ...variantDraft, stock: Number(e.target.value) })} className="font-numeric" />
                    <Input type="number" placeholder="Precio MXN" value={variantDraft.price_override_mxn} onChange={(e) => setVariantDraft({ ...variantDraft, price_override_mxn: e.target.value })} className="font-numeric" />
                  </div>
                  <Button size="sm" onClick={addVariant} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> Agregar</Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </Card>
    </div>
  );
}
