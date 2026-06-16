import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { ShoppingCart, TrendingUp, AlertTriangle, Coins, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/app/sell" });
  },
  component: Dashboard,
});

function Dashboard() {
  const { profile, isAdmin } = useAuth();

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const stats = useQuery({
    queryKey: ["dashboard-stats", isAdmin, profile?.id],
    queryFn: async () => {
      const todayIso = today.toISOString();
      let q = supabase.from("orders").select("id,total,currency,created_at,seller_id").gte("created_at", todayIso);
      if (!isAdmin && profile?.id) q = q.eq("seller_id", profile.id);
      const { data: orders } = await q;

      const totalToday = (orders ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
      const countToday = (orders ?? []).length;

      const { data: lowStock } = await supabase
        .from("product_variants")
        .select("id, variant_name, stock, product:products(name)")
        .lt("stock", 5)
        .eq("is_active", true)
        .order("stock", { ascending: true })
        .limit(8);

      let commQ = supabase.from("commissions").select("commission_amount,currency,created_at").gte("created_at", todayIso);
      if (!isAdmin && profile?.id) commQ = commQ.eq("seller_id", profile.id);
      const { data: commissions } = await commQ;
      const commTotal = (commissions ?? []).reduce((s, c) => s + Number(c.commission_amount || 0), 0);

      // Caja abierta
      const { data: cash } = await supabase.from("cash_sessions").select("*").eq("status", "open").limit(1).maybeSingle();

      return { totalToday, countToday, lowStock: lowStock ?? [], commTotal, cash };
    },
  });

  const s = stats.data;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Hola, {profile?.name || "—"}</h1>
        <p className="text-muted-foreground text-sm">{isAdmin ? "Vista de administrador" : "Vista de vendedor"}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={ShoppingCart} label="Ventas hoy" value={formatMoney(s?.totalToday ?? 0)} hint={`${s?.countToday ?? 0} órdenes`} tone="primary" />
        <StatCard icon={Coins} label="Comisión hoy" value={formatMoney(s?.commTotal ?? 0)} hint={`${profile?.commission_rate ?? 5}%`} tone="accent" />
        <StatCard icon={Wallet} label="Caja" value={s?.cash ? "Abierta" : "Cerrada"} hint={s?.cash ? "En operación" : "Necesita apertura"} tone={s?.cash ? "success" : "muted"} />
        <StatCard icon={AlertTriangle} label="Poco stock" value={String(s?.lowStock.length ?? 0)} hint="Variantes < 5" tone="destructive" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Acciones rápidas</h2>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/app/sell" className="rounded-lg bg-primary text-primary-foreground px-3 py-3 text-sm font-medium text-center hover:opacity-90">Nueva venta</Link>
            <Link to="/app/cash" className="rounded-lg bg-secondary text-secondary-foreground px-3 py-3 text-sm font-medium text-center hover:opacity-90">Ir a caja</Link>
            <Link to="/app/inventory" className="rounded-lg border px-3 py-3 text-sm font-medium text-center hover:bg-accent">Inventario</Link>
            <Link to="/app/reports" className="rounded-lg border px-3 py-3 text-sm font-medium text-center hover:bg-accent">Reportes</Link>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Alertas de stock</h2>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          {s?.lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todo en orden.</p>
          ) : (
            <ul className="space-y-2">
              {s?.lowStock.map((v: any) => (
                <li key={v.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{v.product?.name} · {v.variant_name}</span>
                  <span className="font-numeric font-semibold text-destructive">{v.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: string; hint?: string; tone?: string }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/30 text-accent-foreground",
    success: "bg-secondary/30 text-secondary-foreground",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="p-4">
      <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg mb-2 ${tones[tone ?? "primary"]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl md:text-2xl font-bold font-numeric tracking-tight truncate">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </Card>
  );
}
