import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronLeft, Plus, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { SizeSetPicker } from "@/components/size-set-picker";
import { flattenOnWhite } from "@/lib/remove-bg";

export const Route = createFileRoute("/app/inventory/$productId")({
  component: ProductDetail,
});

type CategoryOption = {
  id: string;
  name: string;
};

type ProductVariant = {
  id: string;
  variant_name: string;
  size: string | null;
  color: string | null;
  stock: number;
  price_override_mxn: number | null;
};

type ProductDetailData = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  photo_url: string | null;
  base_price_mxn: number;
  sku: string | null;
  is_active: boolean;
  categories: { name: string } | null;
  variants: ProductVariant[];
};

function buildVariantName(size: string, color: string, fallback: string) {
  const cleanSize = size.trim();
  const cleanColor = color.trim();
  if (cleanSize && cleanColor) return `Talla ${cleanSize} · ${cleanColor}`;
  if (cleanSize) return cleanSize.toLowerCase() === "unitalla" ? "Unitalla" : `Talla ${cleanSize}`;
  if (cleanColor) return cleanColor;
  return fallback.trim() || "Variante";
}

function ProductDetail() {
  const { productId } = Route.useParams();
  const { isSeller: canManageInventory } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [productDraft, setProductDraft] = useState({
    name: "",
    description: "",
    category_id: "",
    base_price_mxn: "",
    sku: "",
  });
  const [variantDraft, setVariantDraft] = useState({
    variant_name: "",
    size: "",
    color: "",
    stock: "0",
    price_override_mxn: "",
  });

  const product = useQuery<ProductDetailData>({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), variants:product_variants(*)")
        .eq("id", productId)
        .single();
      if (error) throw error;
      return data as ProductDetailData;
    },
  });

  const categories = useQuery<CategoryOption[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!product.data) return;
    setProductDraft({
      name: product.data.name,
      description: product.data.description ?? "",
      category_id: product.data.category_id ?? "",
      base_price_mxn: String(product.data.base_price_mxn),
      sku: product.data.sku ?? "",
    });
    setUploadFile(null);
  }, [product.data]);

  const refreshProduct = () => {
    qc.invalidateQueries({ queryKey: ["product", productId] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["sell-products"] });
  };

  const saveProduct = async () => {
    if (!productDraft.name.trim() || !productDraft.base_price_mxn) {
      toast.error("Nombre y precio requeridos");
      return;
    }
    const basePrice = Number(productDraft.base_price_mxn);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      toast.error("Precio inválido");
      return;
    }

    setSavingProduct(true);
    try {
      let photo_url = product.data?.photo_url ?? null;
      if (uploadFile) {
        let toUpload: File = uploadFile;
        try {
          toast.loading("Quitando fondo…", { id: "bg-remove" });
          toUpload = await flattenOnWhite(uploadFile);
          toast.success("Fondo limpio", { id: "bg-remove" });
        } catch (err) {
          toast.error("No se pudo quitar el fondo, se sube la foto original", {
            id: "bg-remove",
          });
          console.error(err);
        }
        const path = `${crypto.randomUUID()}-${toUpload.name}`;
        const { error: uploadError } = await supabase.storage
          .from("product-photos")
          .upload(path, toUpload);
        if (uploadError) throw uploadError;
        const { data: signed } = await supabase.storage
          .from("product-photos")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        photo_url = signed?.signedUrl ?? null;
      }

      const { error } = await supabase
        .from("products")
        .update({
          name: productDraft.name.trim(),
          description: productDraft.description.trim() || null,
          category_id: productDraft.category_id || null,
          base_price_mxn: basePrice,
          sku: productDraft.sku.trim() || null,
          photo_url,
        })
        .eq("id", productId);
      if (error) throw error;
      toast.success("Producto actualizado");
      refreshProduct();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async () => {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Producto eliminado");
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["sell-products"] });
    navigate({ to: "/app/inventory", replace: true });
  };

  const addVariant = async () => {
    const name = buildVariantName(
      variantDraft.size,
      variantDraft.color,
      variantDraft.variant_name || "Variante",
    );
    const { error } = await supabase.from("product_variants").insert({
      product_id: productId,
      variant_name: name,
      size: variantDraft.size.trim() || null,
      color: variantDraft.color.trim() || null,
      stock: Math.max(0, Number(variantDraft.stock) || 0),
      price_override_mxn: variantDraft.price_override_mxn
        ? Math.max(0, Number(variantDraft.price_override_mxn) || 0)
        : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Variante agregada");
      setVariantDraft({
        variant_name: "",
        size: "",
        color: "",
        stock: "0",
        price_override_mxn: "",
      });
      refreshProduct();
    }
  };

  const updateVariant = async (
    id: string,
    values: {
      variant_name: string;
      size: string;
      color: string;
      stock: string;
      price_override_mxn: string;
    },
  ) => {
    const { error } = await supabase
      .from("product_variants")
      .update({
        variant_name: buildVariantName(values.size, values.color, values.variant_name),
        size: values.size.trim() || null,
        color: values.color.trim() || null,
        stock: Math.max(0, Number(values.stock) || 0),
        price_override_mxn: values.price_override_mxn
          ? Math.max(0, Number(values.price_override_mxn) || 0)
          : null,
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Variante actualizada");
      refreshProduct();
    }
  };

  const removeVariant = async (id: string) => {
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Variante eliminada");
      refreshProduct();
    }
  };

  const toggleActive = async (active: boolean) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: active })
      .eq("id", productId);
    if (error) toast.error(error.message);
    else {
      toast.success(active ? "Activado" : "Desactivado");
      refreshProduct();
    }
  };

  if (product.isLoading) return <div className="p-6">Cargando...</div>;
  if (product.isError) {
    return <div className="p-6 text-destructive">No se pudo cargar el producto.</div>;
  }
  if (!product.data) return <div className="p-6">Producto no encontrado</div>;

  const p = product.data;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <Link
        to="/app/inventory"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Volver
      </Link>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="space-y-2 lg:w-40">
            <div className="h-32 w-32 rounded-lg bg-muted overflow-hidden">
              {p.photo_url ? (
                <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
              ) : null}
            </div>
            {canManageInventory && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-32"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Foto
                </Button>
                {uploadFile && <p className="text-xs text-muted-foreground">{uploadFile.name}</p>}
              </>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={productDraft.name}
                  onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })}
                  disabled={!canManageInventory}
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select
                  value={productDraft.category_id}
                  onValueChange={(v) => setProductDraft({ ...productDraft, category_id: v })}
                  disabled={!canManageInventory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Precio base MXN *</Label>
                <Input
                  type="number"
                  min={0}
                  value={productDraft.base_price_mxn}
                  onChange={(e) =>
                    setProductDraft({ ...productDraft, base_price_mxn: e.target.value })
                  }
                  disabled={!canManageInventory}
                  className="font-numeric"
                />
              </div>
              <div>
                <Label>SKU</Label>
                <Input
                  value={productDraft.sku}
                  onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })}
                  disabled={!canManageInventory}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Descripción</Label>
                <Textarea
                  rows={2}
                  value={productDraft.description}
                  onChange={(e) =>
                    setProductDraft({ ...productDraft, description: e.target.value })
                  }
                  disabled={!canManageInventory}
                />
              </div>
            </div>

            {canManageInventory && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Switch checked={p.is_active} onCheckedChange={toggleActive} />
                  <span className="text-sm">{p.is_active ? "Activo" : "Inactivo"}</span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveProduct} disabled={savingProduct}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingProduct ? "Guardando..." : "Guardar"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Borrar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Borrar producto</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esto eliminará el producto y todas sus variantes del inventario.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteProduct}>Borrar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Variantes</h2>
        <div className="space-y-2">
          {p.variants.map((v) => (
            <VariantEditor
              key={v.id}
              variant={v}
              canManageInventory={canManageInventory}
              onSave={(values) => updateVariant(v.id, values)}
              onDelete={() => removeVariant(v.id)}
            />
          ))}
          {p.variants.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin variantes</p>
          )}
        </div>

        {canManageInventory && (
          <div className="mt-5 space-y-3">
            <SizeSetPicker
              productId={productId}
              categoryName={p.categories?.name}
              onCreated={refreshProduct}
            />

            <Accordion type="single" collapsible>
              <AccordionItem value="manual" className="border rounded-lg px-3">
                <AccordionTrigger className="text-sm py-3">
                  Agregar una variante manual
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 pb-2">
                    <Input
                      placeholder="Nombre"
                      value={variantDraft.variant_name}
                      onChange={(e) =>
                        setVariantDraft({ ...variantDraft, variant_name: e.target.value })
                      }
                      className="col-span-2 lg:col-span-1"
                    />
                    <Input
                      placeholder="Talla"
                      value={variantDraft.size}
                      onChange={(e) => setVariantDraft({ ...variantDraft, size: e.target.value })}
                    />
                    <Input
                      placeholder="Color"
                      value={variantDraft.color}
                      onChange={(e) => setVariantDraft({ ...variantDraft, color: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Stock"
                      value={variantDraft.stock}
                      onChange={(e) => setVariantDraft({ ...variantDraft, stock: e.target.value })}
                      className="font-numeric"
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Precio MXN"
                      value={variantDraft.price_override_mxn}
                      onChange={(e) =>
                        setVariantDraft({ ...variantDraft, price_override_mxn: e.target.value })
                      }
                      className="font-numeric"
                    />
                  </div>
                  <Button size="sm" onClick={addVariant} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" /> Agregar
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </Card>
    </div>
  );
}

function VariantEditor({
  variant,
  canManageInventory,
  onSave,
  onDelete,
}: {
  variant: ProductVariant;
  canManageInventory: boolean;
  onSave: (values: {
    variant_name: string;
    size: string;
    color: string;
    stock: string;
    price_override_mxn: string;
  }) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState({
    variant_name: variant.variant_name,
    size: variant.size ?? "",
    color: variant.color ?? "",
    stock: String(variant.stock),
    price_override_mxn: variant.price_override_mxn ? String(variant.price_override_mxn) : "",
  });

  useEffect(() => {
    setDraft({
      variant_name: variant.variant_name,
      size: variant.size ?? "",
      color: variant.color ?? "",
      stock: String(variant.stock),
      price_override_mxn: variant.price_override_mxn ? String(variant.price_override_mxn) : "",
    });
  }, [variant]);

  return (
    <div className="grid gap-2 border rounded-lg p-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_0.9fr_auto_auto] lg:items-end">
      <div>
        <Label className="text-xs">Nombre</Label>
        <Input
          value={draft.variant_name}
          onChange={(e) => setDraft({ ...draft, variant_name: e.target.value })}
          disabled={!canManageInventory}
        />
      </div>
      <div>
        <Label className="text-xs">Talla</Label>
        <Input
          value={draft.size}
          onChange={(e) => setDraft({ ...draft, size: e.target.value })}
          disabled={!canManageInventory}
          className="font-numeric"
        />
      </div>
      <div>
        <Label className="text-xs">Color</Label>
        <Input
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          disabled={!canManageInventory}
        />
      </div>
      <div>
        <Label className="text-xs">Stock</Label>
        <Input
          type="number"
          min={0}
          value={draft.stock}
          onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
          disabled={!canManageInventory}
          className="font-numeric"
        />
      </div>
      <div>
        <Label className="text-xs">Precio</Label>
        <Input
          type="number"
          min={0}
          value={draft.price_override_mxn}
          onChange={(e) => setDraft({ ...draft, price_override_mxn: e.target.value })}
          disabled={!canManageInventory}
          placeholder="Base"
          className="font-numeric"
        />
      </div>
      {canManageInventory && (
        <>
          <Button size="icon" variant="outline" onClick={() => onSave(draft)}>
            <Save className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
