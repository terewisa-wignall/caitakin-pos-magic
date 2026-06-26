import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Users, Coins, Lock, Plus,
  ChevronLeft, ChevronRight, Briefcase, FileBarChart, Pencil, Trash2,
} from "lucide-react";
import { formatMoney, formatDateShort } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/app/finance")({
  ssr: false,
  head: () => ({ meta: [{ title: "Finanzas · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/app/dashboard" });
  },
  component: FinancePage,
});

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 1).toISOString();
  const startDate = new Date(year, month, 1).toISOString().slice(0, 10);
  const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end, startDate, endDate };
}

function FinancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const shift = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Finanzas</h1>
          <p className="text-sm text-muted-foreground">Vista consolidada del negocio</p>
        </div>
      </header>

      <Card className="p-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center min-w-0">
          <p className="font-semibold">{MONTHS_FULL[month]} {year}</p>
          <p className="text-xs text-muted-foreground">Periodo seleccionado</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList className="w-full overflow-x-auto flex justify-start sm:justify-center">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="income">Ingresos</TabsTrigger>
          <TabsTrigger value="expenses">Gastos</TabsTrigger>
          <TabsTrigger value="payroll">Nómina</TabsTrigger>
          <TabsTrigger value="commissions">Comisiones</TabsTrigger>
          <TabsTrigger value="closings">Cierres</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="pt-3"><SummaryTab year={year} month={month} /></TabsContent>
        <TabsContent value="income" className="pt-3"><IncomeTab year={year} month={month} /></TabsContent>
        <TabsContent value="expenses" className="pt-3"><ExpensesTab year={year} month={month} /></TabsContent>
        <TabsContent value="payroll" className="pt-3"><PayrollTab year={year} month={month} /></TabsContent>
        <TabsContent value="commissions" className="pt-3"><CommissionsTab /></TabsContent>
        <TabsContent value="closings" className="pt-3"><ClosingsTab year={year} setYear={setYear} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Hooks de datos ---------------- */

function useMonthTotals(year: number, month: number) {
  const { start, end, startDate, endDate } = monthRange(year, month);
  return useQuery({
    queryKey: ["finance-totals", year, month],
    queryFn: async () => {
      const [orders, cashMv, expenses, payroll, commPay, otherInc] = await Promise.all([
        supabase.from("orders").select("total,currency,created_at").gte("created_at", start).lt("created_at", end),
        supabase.from("cash_movements").select("type,amount,currency").gte("created_at", start).lt("created_at", end),
        (supabase.from as any)("expenses").select("amount,currency,type").gte("expense_date", startDate).lte("expense_date", endDate),
        (supabase.from as any)("payroll_payments").select("amount,currency").gte("paid_at", startDate).lte("paid_at", endDate),
        (supabase.from as any)("commission_payments").select("total_amount,currency").gte("paid_at", startDate).lte("paid_at", endDate),
        (supabase.from as any)("other_incomes").select("amount,currency").gte("income_date", startDate).lte("income_date", endDate),
      ]);
      const sum = (rows: any[] | null, key: string) => (rows ?? []).reduce((s, r) => s + Number(r[key] || 0), 0);
      const cashIncome = (cashMv.data ?? []).filter((m: any) => m.type === "income").reduce((s: number, m: any) => s + Number(m.amount), 0);
      const cashExpense = (cashMv.data ?? []).filter((m: any) => m.type === "expense").reduce((s: number, m: any) => s + Number(m.amount), 0);
      const ordersTotal = sum(orders.data, "total");
      const otherIncomesTotal = sum(otherInc.data, "amount");
      const expensesTotal = sum(expenses.data, "amount") + cashExpense;
      const payrollTotal = sum(payroll.data, "amount");
      const commPayTotal = sum(commPay.data, "total_amount");
      const incomeTotal = ordersTotal + cashIncome + otherIncomesTotal;
      const profit = incomeTotal - expensesTotal - payrollTotal - commPayTotal;
      const expensesByType: Record<string, number> = { fixed: 0, variable: 0, unexpected: 0 };
      (expenses.data ?? []).forEach((e: any) => { expensesByType[e.type] = (expensesByType[e.type] || 0) + Number(e.amount); });
      return { ordersTotal, cashIncome, cashExpense, otherIncomesTotal, expensesTotal, payrollTotal, commPayTotal, incomeTotal, profit, expensesByType };
    },
  });
}

/* ---------------- Resumen ---------------- */

function SummaryTab({ year, month }: { year: number; month: number }) {
  const t = useMonthTotals(year, month);
  const d = t.data;

  const yearly = useQuery({
    queryKey: ["finance-yearly", year],
    queryFn: async () => {
      const start = new Date(year, 0, 1).toISOString();
      const end = new Date(year + 1, 0, 1).toISOString();
      const startD = `${year}-01-01`, endD = `${year}-12-31`;
      const [orders, cashMv, expenses, payroll, commPay, otherInc] = await Promise.all([
        supabase.from("orders").select("total,created_at").gte("created_at", start).lt("created_at", end),
        supabase.from("cash_movements").select("type,amount,created_at").gte("created_at", start).lt("created_at", end),
        (supabase.from as any)("expenses").select("amount,expense_date").gte("expense_date", startD).lte("expense_date", endD),
        (supabase.from as any)("payroll_payments").select("amount,paid_at").gte("paid_at", startD).lte("paid_at", endD),
        (supabase.from as any)("commission_payments").select("total_amount,paid_at").gte("paid_at", startD).lte("paid_at", endD),
        (supabase.from as any)("other_incomes").select("amount,income_date").gte("income_date", startD).lte("income_date", endD),
      ]);
      const months = Array.from({ length: 12 }, (_, i) => ({ m: MONTHS[i], income: 0, expense: 0, profit: 0 }));
      const addByDate = (rows: any[] | null, dateKey: string, amountKey: string, target: "income" | "expense") => {
        (rows ?? []).forEach((r: any) => { const mo = new Date(r[dateKey]).getMonth(); months[mo][target] += Number(r[amountKey] || 0); });
      };
      addByDate(orders.data, "created_at", "total", "income");
      addByDate(otherInc.data, "income_date", "amount", "income");
      (cashMv.data ?? []).forEach((r: any) => { const mo = new Date(r.created_at).getMonth(); months[mo][r.type === "income" ? "income" : "expense"] += Number(r.amount || 0); });
      addByDate(expenses.data, "expense_date", "amount", "expense");
      addByDate(payroll.data, "paid_at", "amount", "expense");
      addByDate(commPay.data, "paid_at", "total_amount", "expense");
      months.forEach((m) => { m.profit = Math.round(m.income - m.expense); m.income = Math.round(m.income); m.expense = Math.round(m.expense); });
      return months;
    },
  });

  const totalProfit = (yearly.data ?? []).reduce((s, m) => s + m.profit, 0);
  const totalIncome = (yearly.data ?? []).reduce((s, m) => s + m.income, 0);
  const totalExpense = (yearly.data ?? []).reduce((s, m) => s + m.expense, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={TrendingUp} label="Ingresos" value={d?.incomeTotal || 0} tone="success" />
        <StatCard icon={TrendingDown} label="Gastos" value={d?.expensesTotal || 0} tone="destructive" />
        <StatCard icon={Briefcase} label="Nómina" value={d?.payrollTotal || 0} />
        <StatCard icon={Coins} label="Comisiones pagadas" value={d?.commPayTotal || 0} />
      </div>

      <Card className="p-5">
        <p className="text-xs text-muted-foreground">Utilidad del mes</p>
        <p className={`text-3xl md:text-4xl font-bold font-numeric ${(d?.profit || 0) >= 0 ? "text-success" : "text-destructive"}`}>
          {formatMoney(d?.profit || 0)}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Ventas {formatMoney(d?.ordersTotal || 0)} · Caja {formatMoney(d?.cashIncome || 0)} · Otros {formatMoney(d?.otherIncomesTotal || 0)}
        </p>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <div className="border rounded-lg p-2"><p className="text-muted-foreground">Fijos</p><p className="font-numeric font-semibold">{formatMoney(d?.expensesByType.fixed || 0)}</p></div>
          <div className="border rounded-lg p-2"><p className="text-muted-foreground">Variables</p><p className="font-numeric font-semibold">{formatMoney(d?.expensesByType.variable || 0)}</p></div>
          <div className="border rounded-lg p-2"><p className="text-muted-foreground">Imprevistos</p><p className="font-numeric font-semibold">{formatMoney(d?.expensesByType.unexpected || 0)}</p></div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Utilidad mensual {year}</h2>
          <p className="text-xs text-muted-foreground">Total año: <span className={`font-numeric font-semibold ${totalProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(totalProfit)}</span></p>
        </div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={yearly.data ?? []}>
              <XAxis dataKey="m" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
          <div><p className="text-muted-foreground">Ingresos año</p><p className="font-numeric font-semibold text-success">{formatMoney(totalIncome)}</p></div>
          <div><p className="text-muted-foreground">Gastos año</p><p className="font-numeric font-semibold text-destructive">{formatMoney(totalExpense)}</p></div>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "success" | "destructive" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`} />
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
      <p className={`text-lg md:text-xl font-bold font-numeric ${tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : ""}`}>
        {formatMoney(value)}
      </p>
    </Card>
  );
}

/* ---------------- Ingresos ---------------- */

function IncomeTab({ year, month }: { year: number; month: number }) {
  const { start, end, startDate, endDate } = monthRange(year, month);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["finance-income", year, month],
    queryFn: async () => {
      const [orders, cashMv, otherInc] = await Promise.all([
        supabase.from("orders").select("id,total,currency,created_at").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }),
        supabase.from("cash_movements").select("id,concept,amount,currency,created_at").eq("type", "income").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }),
        (supabase.from as any)("other_incomes").select("id,concept,amount,currency,income_date,note").gte("income_date", startDate).lte("income_date", endDate).order("income_date", { ascending: false }),
      ]);
      const rows = [
        ...((orders.data ?? []).map((o: any) => ({ id: `o-${o.id}`, origin: "venta", concept: `Venta ${String(o.id).slice(0, 6)}`, amount: Number(o.total), currency: o.currency, date: o.created_at }))),
        ...((cashMv.data ?? []).map((m: any) => ({ id: `c-${m.id}`, origin: "caja", concept: m.concept, amount: Number(m.amount), currency: m.currency, date: m.created_at }))),
        ...((otherInc.data ?? []).map((m: any) => ({ ...m, id: `i-${m.id}`, rawId: m.id, origin: "otro", amount: Number(m.amount), date: m.income_date }))),
      ];
      rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
      return rows;
    },
  });

  const [filter, setFilter] = useState<"all" | "venta" | "caja" | "otro">("all");
  const visible = (q.data ?? []).filter((r) => filter === "all" || r.origin === filter);
  const total = visible.reduce((s, r) => s + r.amount, 0);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-income"] });
    qc.invalidateQueries({ queryKey: ["finance-totals"] });
    qc.invalidateQueries({ queryKey: ["finance-yearly"] });
  };
  const removeIncome = async (row: any) => {
    if (!confirm("¿Eliminar ingreso?")) return;
    const { error } = await (supabase.from as any)("other_incomes").delete().eq("id", row.rawId);
    if (error) { toast.error(error.message); return; }
    toast.success("Ingreso eliminado");
    refresh();
  };

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Total filtrado</p>
          <p className="text-2xl font-bold font-numeric text-success">{formatMoney(total)}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Otro ingreso</Button>
      </Card>

      <div className="flex gap-1.5 flex-wrap">
        {(["all", "venta", "caja", "otro"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : f === "venta" ? "Ventas" : f === "caja" ? "Caja" : "Otros"}
          </Button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {visible.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.concept}</p>
                <p className="text-xs text-muted-foreground">{formatDateShort(r.date)} · <Badge variant="outline" className="text-[10px] py-0">{r.origin}</Badge></p>
              </div>
              <div className="flex items-center gap-1">
                <p className="font-numeric font-semibold text-success">+{formatMoney(r.amount, r.currency as any)}</p>
                {r.origin === "otro" && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeIncome(r)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
            </li>
          ))}
          {visible.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Sin ingresos</li>}
        </ul>
      </Card>

      <OtherIncomeDialog open={open} onClose={() => { setOpen(false); refresh(); }} />
      <OtherIncomeDialog income={editing} open={!!editing} onClose={() => { setEditing(null); refresh(); }} />
    </div>
  );
}

function OtherIncomeDialog({ open, onClose, income }: { open: boolean; onClose: () => void; income?: any | null }) {
  const { user } = useAuth();
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("MXN");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConcept(income?.concept ?? "");
    setAmount(Number(income?.amount ?? 0));
    setCurrency(income?.currency ?? "MXN");
    setDate(income?.income_date ?? income?.date ?? new Date().toISOString().slice(0, 10));
    setMethod(income?.payment_method ?? "cash");
    setNote(income?.note ?? "");
  }, [open, income]);

  const submit = async () => {
    if (!concept || !amount) { toast.error("Concepto y monto"); return; }
    setSaving(true);
    const payload = {
      concept, amount, currency, income_date: date, payment_method: method, note: note || null, created_by: user?.id,
    };
    const { error } = income?.rawId
      ? await (supabase.from as any)("other_incomes").update(payload).eq("id", income.rawId)
      : await (supabase.from as any)("other_incomes").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(income?.rawId ? "Ingreso actualizado" : "Ingreso registrado");
    setConcept(""); setAmount(0); setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{income?.rawId ? "Editar ingreso" : "Otro ingreso"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Concepto</Label><Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Renta cobrada" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Monto</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="font-numeric" /></div>
            <div><Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="MXN">MXN</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Fecha</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Método</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="debit_card">Débito</SelectItem><SelectItem value="credit_card">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Nota</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={saving} className="w-full">{saving ? "Guardando..." : "Guardar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Gastos ---------------- */

function ExpensesTab({ year, month }: { year: number; month: number }) {
  const { startDate, endDate } = monthRange(year, month);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [filter, setFilter] = useState<"all" | "fixed" | "variable" | "unexpected">("all");

  const q = useQuery({
    queryKey: ["finance-expenses", year, month],
    queryFn: async () => (await (supabase.from as any)("expenses").select("*").gte("expense_date", startDate).lte("expense_date", endDate).order("expense_date", { ascending: false })).data ?? [],
  });

  const visible = (q.data ?? []).filter((e: any) => filter === "all" || e.type === filter);
  const total = visible.reduce((s: number, e: any) => s + Number(e.amount), 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-expenses"] });
    qc.invalidateQueries({ queryKey: ["finance-totals"] });
    qc.invalidateQueries({ queryKey: ["finance-yearly"] });
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar gasto?")) return;
    const { error } = await (supabase.from as any)("expenses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    refresh();
  };

  const labels: Record<string, string> = { fixed: "Fijo", variable: "Variable", unexpected: "Imprevisto" };
  const recurrenceLabels: Record<string, string> = {
    weekly: "Semanal",
    biweekly: "Quincenal",
    monthly: "Mensual",
    bimonthly: "Bimestral",
  };

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Total filtrado</p>
          <p className="text-2xl font-bold font-numeric text-destructive">{formatMoney(total)}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo gasto</Button>
      </Card>

      <div className="flex gap-1.5 flex-wrap">
        {(["all", "fixed", "variable", "unexpected"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : labels[f]}
          </Button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {visible.map((e: any) => (
            <li key={e.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{e.concept}</p>
                  <Badge variant="outline" className="text-[10px] py-0">{labels[e.type]}</Badge>
                  {e.is_recurring && (
                    <Badge variant="secondary" className="text-[10px] py-0">
                      {recurrenceLabels[e.recurring_frequency] || "Recurrente"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{formatDateShort(e.expense_date)} · {e.category || "—"} · {e.payment_method || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-numeric font-semibold text-destructive">−{formatMoney(Number(e.amount), e.currency)}</p>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
          {visible.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Sin gastos</li>}
        </ul>
      </Card>

      <ExpenseDialog open={open} onClose={() => { setOpen(false); refresh(); }} />
      <ExpenseDialog expense={editing} open={!!editing} onClose={() => { setEditing(null); refresh(); }} />
    </div>
  );
}

function ExpenseDialog({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: any | null }) {
  const { user } = useAuth();
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("MXN");
  const [type, setType] = useState<"fixed" | "variable" | "unexpected">("variable");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"weekly" | "biweekly" | "monthly" | "bimonthly">("monthly");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConcept(expense?.concept ?? "");
    setAmount(Number(expense?.amount ?? 0));
    setCurrency(expense?.currency ?? "MXN");
    setType(expense?.type ?? "variable");
    setCategory(expense?.category ?? "");
    setDate(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
    setMethod(expense?.payment_method ?? "cash");
    setNote(expense?.note ?? "");
    setRecurring(Boolean(expense?.is_recurring));
    setRecurringFrequency(expense?.recurring_frequency ?? "monthly");
  }, [open, expense]);

  const submit = async () => {
    if (!concept || !amount) { toast.error("Concepto y monto"); return; }
    setSaving(true);
    const payload = {
      concept, amount, currency, type, category: category || null,
      expense_date: date, payment_method: method, note: note || null,
      is_recurring: type === "fixed" ? recurring : false,
      recurring_frequency: type === "fixed" && recurring ? recurringFrequency : null,
      created_by: user?.id,
    };
    const { error } = expense?.id
      ? await (supabase.from as any)("expenses").update(payload).eq("id", expense.id)
      : await (supabase.from as any)("expenses").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(expense?.id ? "Gasto actualizado" : "Gasto registrado");
    setConcept(""); setAmount(0); setCategory(""); setNote(""); setRecurring(false); setRecurringFrequency("monthly");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{expense?.id ? "Editar gasto" : "Nuevo gasto"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Concepto</Label><Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Renta local" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Monto</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="font-numeric" /></div>
            <div><Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="MXN">MXN</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Tipo</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fijo</SelectItem>
                  <SelectItem value="variable">Variable</SelectItem>
                  <SelectItem value="unexpected">Imprevisto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Categoría</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Renta, luz…" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Fecha</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Método</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="debit_card">Débito</SelectItem><SelectItem value="credit_card">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === "fixed" && (
            <div className="space-y-3 border rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium">Recurrente</p><p className="text-xs text-muted-foreground">Se repetirá según la periodicidad</p></div>
                <Switch checked={recurring} onCheckedChange={setRecurring} />
              </div>
              {recurring && (
                <div>
                  <Label>Periodicidad</Label>
                  <Select value={recurringFrequency} onValueChange={(v: any) => setRecurringFrequency(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="biweekly">Quincenal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                      <SelectItem value="bimonthly">Bimestral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <div><Label>Nota</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={saving} className="w-full">{saving ? "Guardando..." : "Guardar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Nómina ---------------- */

function PayrollTab({ year, month }: { year: number; month: number }) {
  const { startDate, endDate } = monthRange(year, month);
  const qc = useQueryClient();
  const [openEmp, setOpenEmp] = useState(false);
  const [openPay, setOpenPay] = useState<any | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-payroll"] });
    qc.invalidateQueries({ queryKey: ["finance-totals"] });
    qc.invalidateQueries({ queryKey: ["finance-yearly"] });
  };

  const employees = useQuery({
    queryKey: ["finance-employees"],
    queryFn: async () => (await (supabase.from as any)("employees").select("*").order("is_active", { ascending: false }).order("name")).data ?? [],
  });

  const payments = useQuery({
    queryKey: ["finance-payroll", year, month],
    queryFn: async () => (await (supabase.from as any)("payroll_payments").select("*, employee:employees(name,position)").gte("paid_at", startDate).lte("paid_at", endDate).order("paid_at", { ascending: false })).data ?? [],
  });

  const totalMonth = (payments.data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const removePayment = async (payment: any) => {
    if (!confirm("¿Eliminar pago de nómina?")) return;
    const { error } = await (supabase.from as any)("payroll_payments").delete().eq("id", payment.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pago eliminado");
    refresh();
  };

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Nómina pagada este mes</p>
          <p className="text-2xl font-bold font-numeric">{formatMoney(totalMonth)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenEmp(true)}><Users className="h-4 w-4 mr-1" /> Empleado</Button>
          <Button onClick={() => setOpenPay({})} disabled={(employees.data ?? []).length === 0}><Plus className="h-4 w-4 mr-1" /> Pago</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2 text-sm">Empleados</h3>
        <ul className="divide-y">
          {(employees.data ?? []).map((e: any) => (
            <li key={e.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{e.name} {!e.is_active && <Badge variant="outline" className="text-[10px]">Inactivo</Badge>}</p>
                <p className="text-xs text-muted-foreground">{e.position || "—"} · {formatMoney(Number(e.salary))} por día · pago {e.frequency === "weekly" ? "semanal" : "mensual"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setOpenPay({ employee: e })}>Pagar</Button>
            </li>
          ))}
          {(employees.data ?? []).length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Sin empleados. Agrega uno arriba.</li>}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2 text-sm">Pagos del mes</h3>
        <ul className="divide-y">
          {(payments.data ?? []).map((p: any) => (
            <li key={p.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{p.employee?.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{formatDateShort(p.paid_at)} · {formatDateShort(p.period_start)}–{formatDateShort(p.period_end)}</p>
              </div>
              <div className="flex items-center gap-1">
                <p className="font-numeric font-semibold">{formatMoney(Number(p.amount), p.currency)}</p>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpenPay({ payment: p })}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removePayment(p)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
          {(payments.data ?? []).length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Sin pagos</li>}
        </ul>
      </Card>

      <EmployeeDialog open={openEmp} onClose={() => { setOpenEmp(false); qc.invalidateQueries({ queryKey: ["finance-employees"] }); }} />
      <PayrollDialog open={!!openPay} preset={openPay?.employee} payment={openPay?.payment} employees={employees.data ?? []} onClose={() => { setOpenPay(null); refresh(); }} />
    </div>
  );
}

function EmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [salary, setSalary] = useState(0);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    const { error } = await (supabase.from as any)("employees").insert({ name, position: position || null, salary, frequency, is_active: true });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Empleado agregado");
    setName(""); setPosition(""); setSalary(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Puesto</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Vendedora, ayudante…" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Sueldo por día</Label><Input type="number" value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="font-numeric" /></div>
            <div><Label>Periodicidad</Label>
              <Select value={frequency} onValueChange={(v: any) => setFrequency(v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="monthly">Mensual</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={saving} className="w-full">{saving ? "Guardando..." : "Guardar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayrollDialog({ open, preset, payment, employees, onClose }: { open: boolean; preset?: any; payment?: any; employees: any[]; onClose: () => void }) {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [amount, setAmount] = useState(0);
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (payment?.id) {
      setEmployeeId(payment.employee_id);
      setAmount(Number(payment.amount || 0));
      setPeriodStart(payment.period_start ?? new Date().toISOString().slice(0, 10));
      setPeriodEnd(payment.period_end ?? new Date().toISOString().slice(0, 10));
      setPaidAt(payment.paid_at ?? new Date().toISOString().slice(0, 10));
      setMethod(payment.payment_method ?? "cash");
      setNote(payment.note ?? "");
      return;
    }
    if (preset?.id) { setEmployeeId(preset.id); setAmount(Number(preset.salary || 0)); }
  }, [open, payment, preset?.id, preset?.salary]);

  const submit = async () => {
    if (!employeeId || !amount) { toast.error("Empleado y monto"); return; }
    setSaving(true);
    const payload = {
      employee_id: employeeId, amount, currency: "MXN",
      period_start: periodStart, period_end: periodEnd,
      paid_at: paidAt, payment_method: method, note: note || null, created_by: user?.id,
    };
    const { error } = payment?.id
      ? await (supabase.from as any)("payroll_payments").update(payload).eq("id", payment.id)
      : await (supabase.from as any)("payroll_payments").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(payment?.id ? "Pago actualizado" : "Pago registrado");
    setAmount(0); setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{payment?.id ? "Editar pago de nómina" : "Pago de nómina"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Empleado</Label>
            <Select value={employeeId} onValueChange={(v) => { setEmployeeId(v); const e = employees.find((x) => x.id === v); if (e) setAmount(Number(e.salary || 0)); }}>
              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Periodo desde</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
            <div><Label>Periodo hasta</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Monto</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="font-numeric" /></div>
            <div><Label>Pagado el</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          </div>
          <div><Label>Método</Label>
            <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="debit_card">Débito</SelectItem><SelectItem value="credit_card">Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Nota</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={saving} className="w-full">{saving ? "Guardando..." : payment?.id ? "Guardar cambios" : "Registrar pago"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Comisiones ---------------- */

function CommissionsTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openPay, setOpenPay] = useState(false);
  const [filter, setFilter] = useState<"pending" | "paid">("pending");

  const q = useQuery({
    queryKey: ["finance-commissions", filter],
    queryFn: async () => {
      let qq: any = supabase.from("commissions").select("*, seller:profiles!commissions_seller_id_fkey(name), order:orders(id,total,currency,created_at)").order("created_at", { ascending: false }).limit(300);
      if (filter === "pending") qq = qq.is("paid_at", null); else qq = qq.not("paid_at", "is", null);
      return (await qq).data ?? [];
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const quickCutoff = (day: 5 | 20) => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59);
    const next = new Set<string>();
    (q.data ?? []).forEach((c: any) => { if (!c.paid_at && new Date(c.created_at) <= cutoff) next.add(c.id); });
    setSelected(next);
    toast.success(`${next.size} comisiones seleccionadas`);
  };

  const selectedRows = (q.data ?? []).filter((c: any) => selected.has(c.id));
  const totalSelected = selectedRows.reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance-commissions"] });
    qc.invalidateQueries({ queryKey: ["finance-totals"] });
    qc.invalidateQueries({ queryKey: ["finance-yearly"] });
  };

  const undoPayment = async (commission: any) => {
    if (!confirm("¿Deshacer este pago de comisión? La comisión volverá a pendientes.")) return;
    const paymentId = commission.payment_id;
    const { error } = await supabase.from("commissions").update({
      paid_at: null,
      payment_id: null,
      payment_method: null,
    } as any).eq("id", commission.id);
    if (error) { toast.error(error.message); return; }
    if (paymentId) {
      const { data: stillUsed } = await supabase.from("commissions").select("id").eq("payment_id", paymentId).limit(1);
      if ((stillUsed ?? []).length === 0) {
        await (supabase.from as any)("commission_payments").delete().eq("id", paymentId);
      }
    }
    toast.success("Pago de comisión deshecho");
    refresh();
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex gap-1.5">
            <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => { setFilter("pending"); setSelected(new Set()); }}>Pendientes</Button>
            <Button size="sm" variant={filter === "paid" ? "default" : "outline"} onClick={() => { setFilter("paid"); setSelected(new Set()); }}>Pagadas</Button>
          </div>
          {filter === "pending" && (
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => quickCutoff(5)}>Corte 5</Button>
              <Button size="sm" variant="outline" onClick={() => quickCutoff(20)}>Corte 20</Button>
            </div>
          )}
        </div>
        {filter === "pending" && selected.size > 0 && (
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">{selected.size} seleccionadas</p>
              <p className="font-numeric font-semibold">{formatMoney(totalSelected)}</p>
            </div>
            <Button onClick={() => setOpenPay(true)}>Marcar como pagadas</Button>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {(q.data ?? []).map((c: any) => (
            <li key={c.id} className="p-3 flex items-center gap-3">
              {filter === "pending" && (
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{c.seller?.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{formatDateShort(c.created_at)} · {c.commission_rate}%{c.paid_at && ` · Pagada ${formatDateShort(c.paid_at)}`}</p>
              </div>
              <div className="flex items-center gap-1">
                <p className="font-numeric font-semibold">{formatMoney(Number(c.commission_amount), c.currency)}</p>
                {filter === "paid" && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => undoPayment(c)}>
                    Deshacer
                  </Button>
                )}
              </div>
            </li>
          ))}
          {(q.data ?? []).length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Sin comisiones</li>}
        </ul>
      </Card>

      <PayCommissionsDialog
        open={openPay}
        rows={selectedRows}
        total={totalSelected}
        onClose={(done) => {
          setOpenPay(false);
          if (done) { setSelected(new Set()); refresh(); }
        }}
      />
    </div>
  );
}

function PayCommissionsDialog({ open, rows, total, onClose }: { open: boolean; rows: any[]; total: number; onClose: (done: boolean) => void }) {
  const { user } = useAuth();
  const [method, setMethod] = useState("transfer");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const sellerId = rows[0].seller_id;
      const allSame = rows.every((r) => r.seller_id === sellerId);
      const { data: pay, error: payErr } = await (supabase.from as any)("commission_payments").insert({
        seller_id: allSame ? sellerId : null,
        total_amount: total, currency: rows[0].currency || "MXN",
        paid_at: paidAt, payment_method: method,
        cutoff_label: label || null, created_by: user?.id,
      }).select().single();
      if (payErr) throw payErr;
      const ids = rows.map((r) => r.id);
      const { error: updErr } = await supabase.from("commissions").update({
        paid_at: new Date(paidAt).toISOString(),
        payment_id: pay.id,
        payment_method: method,
      } as any).in("id", ids);
      if (updErr) throw updErr;
      toast.success("Comisiones marcadas como pagadas");
      onClose(true);
    } catch (e: any) { toast.error(e.message || "Error"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pagar {rows.length} comisiones</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Card className="p-3"><p className="text-xs text-muted-foreground">Total a pagar</p><p className="text-2xl font-bold font-numeric">{formatMoney(total)}</p></Card>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Fecha pago</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
            <div><Label>Método</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="debit_card">Débito</SelectItem><SelectItem value="credit_card">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Etiqueta de corte (opcional)</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Corte 20 jun" /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={saving} className="w-full">{saving ? "Guardando..." : "Confirmar pago"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Cierres ---------------- */

function ClosingsTab({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const closings = useQuery({
    queryKey: ["finance-closings", year],
    queryFn: async () => (await (supabase.from as any)("monthly_closings").select("*").eq("year", year).order("month")).data ?? [],
  });

  const yearly = useQuery({
    queryKey: ["finance-yearly", year],
  }) as any;

  const months = yearly.data ?? [];
  const totalProfit = months.reduce((s: number, m: any) => s + (m.profit || 0), 0);
  const totalIncome = months.reduce((s: number, m: any) => s + (m.income || 0), 0);
  const totalExpense = months.reduce((s: number, m: any) => s + (m.expense || 0), 0);

  const closedMap = new Map((closings.data ?? []).map((c: any) => [c.month, c]));

  const closeMonth = async (m: number) => {
    if (!months[m]) { toast.error("Sin datos del mes"); return; }
    const snapshot = months[m];
    const { error } = await (supabase.from as any)("monthly_closings").upsert({
      year, month: m + 1, snapshot, closed_by: user?.id, closed_at: new Date().toISOString(),
    }, { onConflict: "year,month" });
    if (error) { toast.error(error.message); return; }
    toast.success(`${MONTHS_FULL[m]} cerrado`);
    qc.invalidateQueries({ queryKey: ["finance-closings"] });
  };

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <p className="font-semibold">Año {year}</p>
        <Button variant="ghost" size="icon" onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ingresos año</p><p className="text-lg font-bold font-numeric text-success">{formatMoney(totalIncome)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Gastos año</p><p className="text-lg font-bold font-numeric text-destructive">{formatMoney(totalExpense)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Utilidad año</p><p className={`text-lg font-bold font-numeric ${totalProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(totalProfit)}</p></Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {MONTHS_FULL.map((label, m) => {
            const row = months[m] || { income: 0, expense: 0, profit: 0 };
            const closed = closedMap.get(m + 1) as any;
            return (
              <li key={m} className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{label}</p>
                    {closed && <Badge variant="secondary" className="text-[10px]"><Lock className="h-3 w-3 mr-1" />Cerrado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Ing {formatMoney(row.income)} · Gas {formatMoney(row.expense)}</p>
                </div>
                <div className="text-right">
                  <p className={`font-numeric font-semibold ${row.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(row.profit)}</p>
                  <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => closeMonth(m)}>
                    <FileBarChart className="h-3 w-3 mr-1" />{closed ? "Re-cerrar" : "Cerrar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
