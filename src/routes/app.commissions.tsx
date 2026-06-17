import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/commissions")({
  head: () => ({ meta: [{ title: "Comisiones · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/app/sell" });
  },
  component: CommissionsPage,
});

function CommissionsPage() {
  const { profile, isAdmin } = useAuth();
  const q = useQuery({
    queryKey: ["commissions", isAdmin, profile?.id],
    queryFn: async () => {
      let q = supabase.from("commissions").select("*, profile:profiles!commissions_seller_id_fkey(name), order:orders(total,currency,created_at)").order("created_at", { ascending: false }).limit(100);
      if (!isAdmin && profile?.id) q = q.eq("seller_id", profile.id);
      return (await q).data ?? [];
    },
  });

  const total = (q.data ?? []).reduce((s: number, c: any) => s + Number(c.commission_amount), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header><h1 className="text-2xl md:text-3xl font-bold">Comisiones</h1><p className="text-sm text-muted-foreground">{isAdmin ? "Todas" : "Mis comisiones"}</p></header>
      <Card className="p-5"><p className="text-xs text-muted-foreground">Total acumulado</p><p className="text-3xl font-bold font-numeric text-primary">{formatMoney(total)}</p></Card>
      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {(q.data ?? []).map((c: any) => (
            <li key={c.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{isAdmin ? (c.profile?.name || "—") : "Comisión"}</p>
                <p className="text-xs text-muted-foreground">{formatDate(c.created_at)} · {c.commission_rate}% · Venta {formatMoney(Number(c.order?.total || 0), c.order?.currency || "MXN")}</p>
              </div>
              <p className="font-numeric font-semibold text-accent-foreground">{formatMoney(Number(c.commission_amount), c.currency)}</p>
            </li>
          ))}
          {q.data?.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Sin comisiones</li>}
        </ul>
      </Card>
    </div>
  );
}
