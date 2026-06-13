import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Check, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Configuración · CAsitakin" }] }),
  component: SettingsPage,
});

type ExchangeRate = {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  is_active: boolean;
};

type Category = {
  id: string;
  name: string;
};

function SettingsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const rates = useQuery<ExchangeRate[]>({
    queryKey: ["rates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const cats = useQuery<Category[]>({
    queryKey: ["categories-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [usdRate, setUsdRate] = useState("");
  const [eurRate, setEurRate] = useState("");
  const [newCat, setNewCat] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setCategoryDrafts(
      Object.fromEntries((cats.data ?? []).map((category) => [category.id, category.name])),
    );
  }, [cats.data]);

  const updateRate = async (base: string, rate: number) => {
    if (!rate || rate <= 0) {
      toast.error("Tasa inválida");
      return;
    }
    await supabase
      .from("exchange_rates")
      .update({ is_active: false })
      .eq("base_currency", base)
      .eq("target_currency", "MXN");
    const { error } = await supabase.from("exchange_rates").insert({
      base_currency: base,
      target_currency: "MXN",
      rate,
      is_active: true,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Tipo de cambio actualizado");
      qc.invalidateQueries({ queryKey: ["rates-all"] });
      qc.invalidateQueries({ queryKey: ["rates-active"] });
    }
  };

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    const { error } = await supabase.from("categories").insert({ name });
    if (error) toast.error(error.message);
    else {
      toast.success("Categoría creada");
      setNewCat("");
      qc.invalidateQueries({ queryKey: ["categories-all"] });
    }
  };

  const updateCategory = async (id: string) => {
    const name = categoryDrafts[id]?.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const { error } = await supabase.from("categories").update({ name }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Categoría actualizada");
      qc.invalidateQueries({ queryKey: ["categories-all"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["sell-products"] });
    }
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Categoría eliminada");
      qc.invalidateQueries({ queryKey: ["categories-all"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["sell-products"] });
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

  const activeUsd = (rates.data ?? []).find((r) => r.base_currency === "USD" && r.is_active)?.rate;
  const activeEur = (rates.data ?? []).find((r) => r.base_currency === "EUR" && r.is_active)?.rate;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Configuración</h1>
      </header>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Tipos de cambio (a MXN)</h2>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label>USD → MXN (actual: {activeUsd ?? "—"})</Label>
              <Input
                type="number"
                step="0.01"
                value={usdRate}
                onChange={(e) => setUsdRate(e.target.value)}
                placeholder="Ej. 18.50"
                className="font-numeric"
              />
            </div>
            <Button onClick={() => updateRate("USD", Number(usdRate))}>Actualizar</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label>EUR → MXN (actual: {activeEur ?? "—"})</Label>
              <Input
                type="number"
                step="0.01"
                value={eurRate}
                onChange={(e) => setEurRate(e.target.value)}
                placeholder="Ej. 20.00"
                className="font-numeric"
              />
            </div>
            <Button onClick={() => updateRate("EUR", Number(eurRate))}>Actualizar</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Categorías</h2>
        <div className="space-y-2">
          {(cats.data ?? []).map((c) => {
            const changed = (categoryDrafts[c.id] ?? "") !== c.name;
            return (
              <div
                key={c.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b pb-2 last:border-0"
              >
                <Input
                  value={categoryDrafts[c.id] ?? ""}
                  onChange={(e) => setCategoryDrafts({ ...categoryDrafts, [c.id]: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="outline"
                  disabled={!changed}
                  onClick={() => updateCategory(c.id)}
                  aria-label={`Guardar ${c.name}`}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => deleteCategory(c.id)}
                  aria-label={`Borrar ${c.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <Input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="Nueva categoría"
            onKeyDown={(e) => {
              if (e.key === "Enter") addCategory();
            }}
          />
          <Button onClick={addCategory}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
