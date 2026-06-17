import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/commissions")({
  head: () => ({ meta: [{ title: "Comisiones · CAsitakin" }] }),
  component: CommissionsPage,
});

type CommissionRow = {
  id: string;
  commission_amount: number;
  commission_rate: number;
  currency: string;
  created_at: string;
  seller_id: string;
  profile: { name: string } | null;
  order: { total: number; currency: string; created_at: string } | null;
};

function startOfDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function CommissionsPage() {
  const { profile, isAdmin } = useAuth();

  const q = useQuery({
    queryKey: ["commissions", isAdmin, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      let query = supabase
        .from("commissions")
        .select(
          "id,commission_amount,commission_rate,currency,created_at,seller_id, profile:profiles!commissions_seller_id_fkey(name), order:orders(total,currency,created_at)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isAdmin && profile?.id) query = query.eq("seller_id", profile.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CommissionRow[];
    },
  });

  // Totales de la tienda (visible para todos los autenticados via RLS de orders se filtra,
  // así que para sellers mostramos solo lo suyo si RLS no expone más).
  const storeTotals = useQuery({
    queryKey: ["store-totals"],
    enabled: !!profile?.id,
    queryFn: async () => {
      const todayFrom = startOfDayISO();
      const monthFrom = startOfMonthISO();
      const [today, month] = await Promise.all([
        supabase.from("orders").select("total,currency").gte("created_at", todayFrom),
        supabase.from("orders").select("total,currency").gte("created_at", monthFrom),
      ]);
      const sum = (rows: { total: number; currency: string }[] | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      return { today: sum(today.data), month: sum(month.data) };
    },
  });

  const myTotal = (q.data ?? []).reduce((s, c) => s + Number(c.commission_amount), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Comisiones</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Todas las comisiones" : "Mis comisiones"}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">
            {isAdmin ? "Total comisiones" : "Mis comisiones acumuladas"}
          </p>
          <p className="text-2xl md:text-3xl font-bold font-numeric text-primary">
            {formatMoney(myTotal)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Ventas de la tienda hoy</p>
          <p className="text-2xl md:text-3xl font-bold font-numeric">
            {formatMoney(storeTotals.data?.today ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Ventas de la tienda este mes</p>
          <p className="text-2xl md:text-3xl font-bold font-numeric">
            {formatMoney(storeTotals.data?.month ?? 0)}
          </p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {(q.data ?? []).map((c) => (
            <li key={c.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {isAdmin ? c.profile?.name || "—" : "Comisión"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(c.created_at)} · {c.commission_rate}% · Venta{" "}
                  {formatMoney(Number(c.order?.total || 0), (c.order?.currency || "MXN") as never)}
                </p>
              </div>
              <p className="font-numeric font-semibold text-accent-foreground shrink-0">
                {formatMoney(Number(c.commission_amount), c.currency as never)}
              </p>
            </li>
          ))}
          {!q.isLoading && q.data?.length === 0 && (
            <li className="p-6 text-center text-muted-foreground text-sm">Sin comisiones aún</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
