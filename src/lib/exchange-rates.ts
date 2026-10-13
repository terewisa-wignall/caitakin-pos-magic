import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/format";

// Tipos de cambio a MXN capturados HOY. Si falta una moneda, no se puede cobrar en ella.
export type TodayRates = Partial<Record<Currency, number>>;

export function isSameLocalDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function fetchTodayRates(): Promise<TodayRates> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("base_currency,target_currency,rate,created_at")
    .eq("is_active", true)
    .eq("target_currency", "MXN");
  if (error) throw error;
  const map: TodayRates = { MXN: 1 };
  (data ?? []).forEach((r) => {
    const rate = Number(r.rate);
    if (isSameLocalDay(r.created_at) && rate > 0) map[r.base_currency as Currency] = rate;
  });
  return map;
}

// Solo administradores (lo exige la política RLS de exchange_rates).
export async function saveRate(base: "USD" | "EUR", rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tipo de cambio inválido");
  const { error: offErr } = await supabase
    .from("exchange_rates")
    .update({ is_active: false })
    .eq("base_currency", base)
    .eq("target_currency", "MXN");
  if (offErr) throw offErr;
  const { error } = await supabase.from("exchange_rates").insert({
    base_currency: base,
    target_currency: "MXN",
    rate,
    is_active: true,
  });
  if (error) throw error;
}
