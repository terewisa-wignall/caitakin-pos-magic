import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeSize, sortSizes } from "@/lib/sizes";

type SizeSet = { id: string; label: string; sizes: string[] };

const SIZE_SETS: SizeSet[] = [
  { id: "ninos", label: "Niños (2-14)", sizes: ["2", "4", "6", "8", "10", "12", "14"] },
  { id: "ninas", label: "Niñas (2-14)", sizes: ["2", "4", "6", "8", "10", "12", "14"] },
  { id: "bebes", label: "Bebés (0-24m)", sizes: ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m"] },
  { id: "damas", label: "Damas (CH-EG)", sizes: ["CH", "M", "G", "EG"] },
  { id: "caballeros", label: "Caballeros (CH-XG)", sizes: ["CH", "M", "G", "EG", "XG"] },
  { id: "unitalla", label: "Unitalla", sizes: ["Unitalla"] },
  { id: "num-mujer", label: "Numérico mujer (26-34)", sizes: ["26", "28", "30", "32", "34"] },
  { id: "num-hombre", label: "Numérico hombre (30-38)", sizes: ["30", "32", "34", "36", "38"] },
  { id: "calzado", label: "Calzado (22-28)", sizes: ["22", "23", "24", "25", "26", "27", "28"] },
  { id: "custom", label: "Personalizado", sizes: [] },
];

function suggestSetId(categoryName?: string | null): string {
  const n = (categoryName || "").toLowerCase();
  if (n.includes("bebé") || n.includes("bebe")) return "bebes";
  if (n.includes("niñ") || n.includes("nin")) return "ninos";
  if (n.includes("dama") || n.includes("mujer")) return "damas";
  if (n.includes("caballero") || n.includes("hombre")) return "caballeros";
  if (n.includes("unitalla")) return "unitalla";
  if (n.includes("calzado") || n.includes("zapato")) return "calzado";
  return "damas";
}

export function SizeSetPicker({
  productId,
  categoryName,
  existingSizes = [],
  onCreated,
}: {
  productId: string;
  categoryName?: string | null;
  existingSizes?: string[];
  onCreated: () => void;
}) {
  const initialSet = useMemo(() => suggestSetId(categoryName), [categoryName]);
  const [setId, setSetId] = useState<string>(initialSet);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customSizes, setCustomSizes] = useState("");
  const [color, setColor] = useState("");
  const [stockPerSize, setStockPerSize] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  // When the set changes, preselect all of its sizes
  useEffect(() => {
    const set = SIZE_SETS.find((s) => s.id === setId);
    if (!set || set.id === "custom") {
      setSelected(new Set(set?.sizes ?? []));
    } else {
      setSelected(new Set(set.sizes));
    }
  }, [setId]);

  // Re-suggest the set when the category changes (only if user hasn't customized)
  useEffect(() => {
    setSetId(initialSet);
  }, [initialSet]);

  const currentSet = SIZE_SETS.find((s) => s.id === setId)!;
  const availableSizes =
    currentSet.id === "custom"
      ? customSizes.split(",").map((s) => s.trim()).filter(Boolean)
      : currentSet.sizes;
  const existingSizeSet = useMemo(
    () => new Set(existingSizes.map((size) => normalizeSize(size))),
    [existingSizes],
  );

  const toggleSize = (size: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  };

  const selectedSizes =
    currentSet.id === "custom"
      ? availableSizes
      : availableSizes.filter((s) => selected.has(s));
  const duplicateSizes = selectedSizes.filter((size) => existingSizeSet.has(normalizeSize(size)));
  const sizesToCreate = sortSizes(
    selectedSizes.filter((size) => !existingSizeSet.has(normalizeSize(size))),
  );

  const submit = async () => {
    if (sizesToCreate.length === 0) {
      toast.error("Selecciona al menos una talla");
      return;
    }
    setLoading(true);
    try {
      const rows = sizesToCreate.map((size) => ({
        product_id: productId,
        variant_name: color ? `Talla ${size} · ${color}` : `Talla ${size}`,
        size,
        color: color || null,
        stock: Number(stockPerSize) || 0,
      }));
      const { error } = await supabase.from("product_variants").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} variante${rows.length === 1 ? "" : "s"} creada${rows.length === 1 ? "" : "s"}`);
      setColor("");
      setCustomSizes("");
      setStockPerSize(1);
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Agregar set de tallas</p>
        <span className="text-xs text-muted-foreground">
          {sizesToCreate.length} nueva{sizesToCreate.length === 1 ? "" : "s"}
        </span>
      </div>

      <div>
        <Label className="text-xs">Tipo</Label>
        <Select value={setId} onValueChange={setSetId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SIZE_SETS.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {currentSet.id === "custom" ? (
        <div>
          <Label className="text-xs">Tallas (separadas por coma)</Label>
          <Input
            value={customSizes}
            onChange={(e) => setCustomSizes(e.target.value)}
            placeholder="Ej: XS, S, M, L, XL"
          />
        </div>
      ) : (
        <div>
          <Label className="text-xs">Tallas a crear (toca para incluir/excluir)</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {availableSizes.map((size) => {
              const active = selected.has(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors font-numeric",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:bg-muted",
                  )}
                  aria-pressed={active}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {duplicateSizes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Ya existen: {sortSizes(duplicateSizes).join(", ")}. No se duplicarán.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Stock por talla</Label>
          <Input
            type="number"
            min={0}
            value={stockPerSize}
            onChange={(e) => setStockPerSize(Number(e.target.value))}
            className="font-numeric"
          />
        </div>
        <div>
          <Label className="text-xs">Color (opcional)</Label>
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="Ej: Rojo"
          />
        </div>
      </div>

      <Button onClick={submit} disabled={loading || sizesToCreate.length === 0} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        {loading ? "Creando..." : `Crear ${sizesToCreate.length || ""} variante${sizesToCreate.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
