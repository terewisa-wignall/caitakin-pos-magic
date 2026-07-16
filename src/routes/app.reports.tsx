import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Reportes · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/app/sell" });
  },
  component: ReportsPage,
});

function ReportsPage() {
  const { profile, isAdmin } = useAuth();
  const since = new Date(); since.setDate(since.getDate() - 30);

  const orders = useQuery({
    queryKey: ["report-orders", isAdmin, profile?.id],
    queryFn: async () => {
      let q = supabase.from("orders").select("id,total,currency,sold_at,seller_id").gte("sold_at", since.toISOString());
      if (!isAdmin && profile?.id) q = q.eq("seller_id", profile.id);
      return (await q).data ?? [];
    },
  });

  const movements = useQuery({
    queryKey: ["report-movements"],
    queryFn: async () => (await supabase.from("cash_movements").select("type,amount,currency,created_at").gte("created_at", since.toISOString())).data ?? [],
  });

  const lowStock = useQuery({
    queryKey: ["report-stock"],
    queryFn: async () => (await supabase.from("product_variants").select("variant_name,stock,product:products(name)").order("stock", { ascending: true }).limit(20)).data ?? [],
  });

  const sellers = useQuery({
    queryKey: ["report-sellers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,name");
      return data ?? [];
    },
  });

  // Aggregate by day (MXN-equivalent)
  const byDay = (() => {
    const map: Record<string, number> = {};
    (orders.data ?? []).forEach((o: any) => {
      const day = new Date(o.sold_at).toISOString().slice(0, 10);
      const rate = o.currency === "MXN" ? 1 : 18.5;
      map[day] = (map[day] || 0) + Number(o.total) * rate;
    });
    return Object.entries(map).sort().map(([day, total]) => ({ day: day.slice(5), total: Math.round(total) }));
  })();

  const totalSales = (orders.data ?? []).reduce((s: number, o: any) => s + Number(o.total), 0);
  const totalIncome = (movements.data ?? []).filter((m: any) => m.type === "income").reduce((s: number, m: any) => s + Number(m.amount), 0);
  const totalExpense = (movements.data ?? []).filter((m: any) => m.type === "expense").reduce((s: number, m: any) => s + Number(m.amount), 0);

  const bySeller = (() => {
    const map = new Map<string, number>();
    (orders.data ?? []).forEach((o: any) => map.set(o.seller_id, (map.get(o.seller_id) || 0) + Number(o.total)));
    const sellersMap = new Map((sellers.data ?? []).map((s: any) => [s.id, s.name]));
    return Array.from(map.entries()).map(([id, total]) => ({ name: sellersMap.get(id) || id.slice(0, 6), total }));
  })();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header><h1 className="text-2xl md:text-3xl font-bold">Reportes</h1><p className="text-sm text-muted-foreground">Últimos 30 días</p></header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ventas totales</p><p className="text-xl font-bold font-numeric">{formatMoney(totalSales)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Órdenes</p><p className="text-xl font-bold font-numeric">{orders.data?.length || 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ingresos caja</p><p className="text-xl font-bold font-numeric text-success">{formatMoney(totalIncome)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Egresos caja</p><p className="text-xl font-bold font-numeric text-destructive">{formatMoney(totalExpense)}</p></Card>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="w-full sm:w-auto"><TabsTrigger value="sales">Ventas</TabsTrigger><TabsTrigger value="stock">Inventario</TabsTrigger>{isAdmin && <TabsTrigger value="sellers">Vendedores</TabsTrigger>}</TabsList>

        <TabsContent value="sales" className="pt-3">
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Ventas por día (MXN aprox.)</h2>
            <div className="h-64">
              <ResponsiveContainer><BarChart data={byDay}><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="total" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="pt-3">
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Variantes con menor stock</h2>
            <ul className="space-y-2">
              {(lowStock.data ?? []).map((v: any, i: number) => (
                <li key={i} className="flex justify-between text-sm border-b pb-2 last:border-0">
                  <span>{v.product?.name} · {v.variant_name}</span>
                  <span className={`font-numeric font-semibold ${v.stock < 5 ? "text-destructive" : ""}`}>{v.stock}</span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="sellers" className="pt-3">
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Ventas por vendedor</h2>
              <div className="h-64">
                <ResponsiveContainer><BarChart data={bySeller}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="total" fill="hsl(var(--accent))" /></BarChart></ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
