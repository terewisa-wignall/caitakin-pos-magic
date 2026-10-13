import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatMoney, type Currency } from "@/lib/format";
import { ShoppingCart, TrendingUp, TrendingDown, AlertTriangle, UserCheck, CalendarClock, Plus, Check, HandCoins, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMonthTotals } from "@/routes/app.finance";
import { nextHoliday } from "@/lib/holidays";

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

const db = supabase.from as any;

// Suma por moneda sin convertir: mezclar MXN, USD y EUR en un solo número da un total falso.
type Totals = Partial<Record<Currency, number>>;

function sumByCurrency(rows: { currency: string | null; amount: number | string | null }[]): Totals {
  const totals: Totals = {};
  for (const r of rows) {
    const cur = (r.currency || "MXN") as Currency;
    totals[cur] = (totals[cur] ?? 0) + Number(r.amount || 0);
  }
  return totals;
}

function formatTotals(totals: Totals | undefined) {
  const entries = Object.entries(totals ?? {}).filter(([, v]) => (v ?? 0) !== 0) as [Currency, number][];
  if (entries.length === 0) return formatMoney(0);
  return entries.map(([cur, v]) => formatMoney(v, cur)).join(" · ");
}

function Dashboard() {
  const { profile } = useAuth();
  const now = new Date();
  const month = useMonthTotals(now.getFullYear(), now.getMonth());

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase.from("orders").select("total,currency").gte("sold_at", today.toISOString());
      const totalToday = sumByCurrency((orders ?? []).map((o) => ({ currency: o.currency, amount: o.total })));

      const { data: lowStock } = await supabase
        .from("product_variants")
        .select("id, variant_name, stock, product:products!inner(name,discontinued)")
        .lt("stock", 5)
        .eq("is_active", true)
        .eq("product.discontinued", false)
        .order("stock", { ascending: true })
        .limit(8);

      // Turnos: cajas abiertas y quién las abrió
      const { data: sessions } = await supabase.from("cash_sessions").select("id,opened_at,opened_by").eq("status", "open");
      const ids = (sessions ?? []).map((x) => x.opened_by);
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id,name").in("id", ids)
        : { data: [] as { id: string; name: string }[] };
      const shifts = (sessions ?? []).map((x) => ({
        id: x.id,
        opened_at: x.opened_at,
        name: people?.find((p) => p.id === x.opened_by)?.name ?? "—",
      }));

      return { totalToday, countToday: (orders ?? []).length, lowStock: lowStock ?? [], shifts };
    },
  });

  const s = stats.data;
  const m = month.data;
  const expenses = m ? m.expensesTotal + m.payrollTotal + m.commPayTotal : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Hola, {profile?.name || "—"}</h1>
        <p className="text-muted-foreground text-sm">Vista de administrador</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={ShoppingCart} label="Ventas hoy" value={formatTotals(s?.totalToday)} hint={`${s?.countToday ?? 0} órdenes`} tone="primary" />
        <StatCard icon={TrendingUp} label="Ingresos del mes" value={formatMoney(m?.incomeTotal ?? 0)} hint="Ventas y otros ingresos" tone="success" />
        <StatCard icon={TrendingDown} label="Egresos del mes" value={formatMoney(expenses)} hint="Gastos, nómina, comisiones" tone="accent" />
        <StatCard icon={AlertTriangle} label="Poco stock" value={String(s?.lowStock.length ?? 0)} hint="Variantes < 5" tone="destructive" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Turnos con caja abierta</h2>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          {!s?.shifts.length ? (
            <p className="text-sm text-muted-foreground">Ninguna caja abierta.</p>
          ) : (
            <ul className="space-y-2">
              {s.shifts.map((x) => (
                <li key={x.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{x.name}</span>
                  <span className="text-muted-foreground">desde {new Date(x.opened_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <HolidayNotice />

        <LoanRequests />

        <Reminders />

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

function HolidayNotice() {
  const h = nextHoliday();
  if (!h || h.inDays > 21) return null;
  const when = h.inDays === 0 ? "es hoy" : h.inDays === 1 ? "es mañana" : `en ${h.inDays} días`;
  return (
    <Card className="p-5 border-amber-300 bg-amber-50/50">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold">Día festivo {when}</h2>
        <CalendarClock className="h-4 w-4 text-amber-600" />
      </div>
      <p className="text-sm">{new Date(h.date + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} · {h.name}</p>
      <p className="text-xs text-muted-foreground mt-1">Descanso obligatorio. A quien trabaje ese día se le paga doble extra (el sistema lo suma solo al generar el recibo).</p>
    </Card>
  );
}

function LoanRequests() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["loan-requests"],
    queryFn: async () => {
      const { data, error } = await db("employee_loans").select("id,principal,created_at,employee:employees(name)").eq("status", "requested").order("created_at");
      if (error) throw error;
      return (data ?? []) as { id: string; principal: number; created_at: string; employee: { name: string } | null }[];
    },
  });
  const decide = async (id: string, principal: number, accept: boolean) => {
    const patch = accept ? { status: "active", balance: principal } : { status: "rejected" };
    const { error } = await db("employee_loans").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(accept ? "Préstamo aceptado" : "Solicitud rechazada");
    qc.invalidateQueries({ queryKey: ["loan-requests"] });
  };
  if (!list.data?.length) return null;
  return (
    <Card className="p-5 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Solicitudes de préstamo</h2>
        <HandCoins className="h-4 w-4 text-primary" />
      </div>
      <ul className="space-y-2">
        {list.data.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{r.employee?.name ?? "—"} · {formatMoney(Number(r.principal))}</p>
              <p className="text-xs text-muted-foreground">Pedido el {new Date(r.created_at).toLocaleDateString("es-MX")}</p>
            </div>
            <Button size="sm" onClick={() => decide(r.id, Number(r.principal), true)}>Aceptar</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Rechazar" onClick={() => decide(r.id, Number(r.principal), false)}><X className="h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type Reminder = { id: string; title: string; kind: string; due_date: string; amount: number | null; currency: string };

function daysLeft(date: string) {
  const d = new Date(date + "T00:00:00");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function Reminders() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("pago");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");

  const list = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await db("reminders").select("*").is("done_at", null).order("due_date", { ascending: true }).limit(20);
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  const add = async () => {
    if (!title.trim() || !due) return toast.error("Falta el nombre y la fecha límite");
    const { error } = await db("reminders").insert({ title: title.trim(), kind, due_date: due, amount: amount ? Number(amount) : null });
    if (error) return toast.error(error.message);
    setTitle(""); setDue(""); setAmount(""); setOpen(false);
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  const done = async (id: string) => {
    const { error } = await db("reminders").update({ done_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Pagos y vencimientos</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Agregar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo recordatorio</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Qué es</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Licencia municipal, renta, SAT…" /></div>
              <div>
                <Label>Tipo</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="pago">Pago por hacer</option>
                  <option value="permiso">Permiso (municipal, estatal, federal)</option>
                  <option value="documento">Documento</option>
                </select>
              </div>
              <div><Label>Fecha límite</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div><Label>Monto (opcional)</Label><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <Button className="w-full" onClick={add}>Guardar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {list.isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar los recordatorios.</p>
      ) : !list.data?.length ? (
        <p className="text-sm text-muted-foreground">Nada pendiente.</p>
      ) : (
        <ul className="space-y-2">
          {list.data.map((r) => {
            const d = daysLeft(r.due_date);
            const tone = d < 0 ? "text-destructive" : d <= 7 ? "text-amber-600" : "text-muted-foreground";
            return (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <CalendarClock className={`h-4 w-4 shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}{r.amount ? ` · ${formatMoney(Number(r.amount))}` : ""}</p>
                  <p className={`text-xs ${tone}`}>{d < 0 ? `Vencido hace ${-d} d` : d === 0 ? "Vence hoy" : `En ${d} d`} · {r.kind}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => done(r.id)} aria-label="Marcar como hecho"><Check className="h-4 w-4" /></Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
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
