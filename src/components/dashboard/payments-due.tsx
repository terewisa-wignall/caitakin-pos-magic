import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, HandCoins, Plus, Repeat, Truck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";

// reminders no está en los tipos generados.
// Envuelto en función: pasar supabase.from suelto pierde su `this` y falla.
const db = (table: string) => (supabase as any).from(table);

type Repeat = "weekly" | "semimonthly" | "monthly" | null;
type Reminder = {
  id: string;
  title: string;
  kind: string;
  due_date: string;
  amount: number | null;
  currency: string;
  note: string | null;
  repeat: Repeat;
  employee_id: string | null;
  done_at?: string | null;
};
export type Debt = {
  id: string;
  amount: number;
  incurred_on: string;
  due_on: string | null;
  description: string | null;
  suppliers: { name: string } | null;
  supplier_debt_payments: { amount: number }[];
};

type Item =
  | { type: "reminder"; key: string; due: string; reminder: Reminder }
  | { type: "debt"; key: string; due: string | null; debt: Debt; balance: number };

const KIND_LABEL: Record<string, string> = {
  pago: "Pago",
  permiso: "Permiso",
  documento: "Documento",
  nomina: "Nómina",
};
const REPEAT_LABEL: Record<string, string> = {
  weekly: "cada semana",
  semimonthly: "el 15 y fin de mes",
  monthly: "cada mes",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayIso() {
  return toIso(new Date());
}

function daysLeft(date: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((parseIso(date).getTime() - t.getTime()) / 86400000);
}

// Siguiente fecha de un recordatorio que se repite.
function nextDue(due: string, repeat: Repeat): string | null {
  const d = parseIso(due);
  if (repeat === "weekly") return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
  if (repeat === "monthly") {
    const lastOfNext = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    return toIso(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), lastOfNext)));
  }
  if (repeat === "semimonthly") {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (d.getDate() < 15) return toIso(new Date(d.getFullYear(), d.getMonth(), 15));
    if (d.getDate() < last) return toIso(new Date(d.getFullYear(), d.getMonth(), last));
    return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 15));
  }
  return null;
}

// Monto aproximado de nómina: la mediana de sus últimos 3 recibos (sin finiquitos),
// para que un recibo raro o duplicado no mueva mucho el estimado.
function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(parseIso(iso));
}

function dueText(due: string | null) {
  if (!due) return { text: "Sin fecha para pagar", tone: "text-muted-foreground" };
  const d = daysLeft(due);
  const tone = d < 0 ? "text-destructive" : d <= 3 ? "text-amber-600" : "text-muted-foreground";
  const text = d < 0 ? `Vencido hace ${-d} d` : d === 0 ? "Hoy" : d === 1 ? "Mañana" : `${shortDate(due)} · en ${d} d`;
  return { text, tone };
}

export function PaymentsDue({ className }: { className?: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [payDebt, setPayDebt] = useState<{ debt: Debt; balance: number } | null>(null);

  const reminders = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await db("reminders").select("*").is("done_at", null).order("due_date", { ascending: true }).limit(50);
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  // Nóminas cerradas en los últimos 3 días, para ver la confirmación.
  const recentPaid = useQuery({
    queryKey: ["reminders", "recent-paid"],
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data, error } = await db("reminders").select("*").eq("kind", "nomina").gte("done_at", since).order("done_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  const employeeIds = [...new Set((reminders.data ?? []).map((r) => r.employee_id).filter(Boolean))] as string[];
  const estimates = useQuery({
    queryKey: ["payroll-estimates", employeeIds.join(",")],
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("employee_id,amount,created_at")
        .in("employee_id", employeeIds)
        .eq("is_settlement", false)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const id of employeeIds) {
        const m = median((data ?? []).filter((p) => p.employee_id === id).slice(0, 3).map((p) => Number(p.amount)));
        if (m != null) out[id] = m;
      }
      return out;
    },
  });

  const debts = useQuery({
    queryKey: ["supplier-debts"],
    queryFn: async () => {
      const { data, error } = await db("supplier_debts")
        .select("id,amount,incurred_on,due_on,description, suppliers(name), supplier_debt_payments(amount)")
        .order("incurred_on");
      if (error) throw error;
      return (data ?? []) as Debt[];
    },
  });

  const items = useMemo<Item[]>(() => {
    const list: Item[] = (reminders.data ?? []).map((r) => ({ type: "reminder", key: "r" + r.id, due: r.due_date, reminder: r }));
    for (const d of debts.data ?? []) {
      const balance = Math.round((Number(d.amount) - d.supplier_debt_payments.reduce((s, p) => s + Number(p.amount), 0)) * 100) / 100;
      if (balance > 0.005) list.push({ type: "debt", key: "d" + d.id, due: d.due_on, debt: d, balance });
    }
    // Con fecha primero (la más próxima arriba); deudas sin fecha al final.
    return list.sort((a, b) => (a.due ?? "9999") .localeCompare(b.due ?? "9999"));
  }, [reminders.data, debts.data]);

  const totalDebt = items.reduce((s, i) => (i.type === "debt" ? s + i.balance : s), 0);

  const doneReminder = async (r: Reminder) => {
    const { error } = await db("reminders").update({ done_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error(error.message);
    const next = nextDue(r.due_date, r.repeat);
    if (next) {
      const { error: e2 } = await db("reminders").insert({
        title: r.title, kind: r.kind, due_date: next, amount: r.kind === "nomina" ? null : r.amount,
        currency: r.currency, note: r.kind === "nomina" ? null : r.note, repeat: r.repeat, employee_id: r.employee_id,
      });
      if (e2) toast.error(e2.message);
      else toast.success(`Listo. Siguiente: ${shortDate(next)}`);
    }
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  const estimateFor = (r: Reminder) => (r.employee_id ? estimates.data?.[r.employee_id] : undefined);

  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold">Pagos y vencimientos</h2>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Agregar
        </Button>
      </div>
      {totalDebt > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          Debes a proveedores: <span className="font-numeric font-semibold text-foreground">{formatMoney(totalDebt)}</span>
        </p>
      )}

      {reminders.isError || debts.isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar los pagos pendientes.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada pendiente.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const { text, tone } = dueText(it.due);
            if (it.type === "debt") {
              return (
                <li key={it.key} className="flex items-center gap-2 text-sm">
                  <Truck className={`h-4 w-4 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      {it.debt.suppliers?.name ?? "Proveedor"} · <span className="font-numeric">{formatMoney(it.balance)}</span>
                    </p>
                    <p className={`text-xs ${tone}`}>
                      {text} · deuda desde {shortDate(it.debt.incurred_on)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setPayDebt({ debt: it.debt, balance: it.balance })}>
                    <HandCoins className="h-4 w-4 mr-1" />Abonar
                  </Button>
                </li>
              );
            }
            const r = it.reminder;
            const Icon = r.kind === "nomina" ? Users : CalendarClock;
            return (
              <li key={it.key} className="flex items-center gap-2 text-sm">
                <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">
                    {r.title}
                    {r.amount ? (
                      <span className="font-numeric"> · {formatMoney(Number(r.amount))}</span>
                    ) : estimateFor(r) ? (
                      <span className="font-numeric text-muted-foreground"> · ≈ {formatMoney(estimateFor(r)!)}</span>
                    ) : null}
                  </p>
                  <p className={`text-xs ${tone}`}>
                    {text} · {KIND_LABEL[r.kind] ?? r.kind}
                    {r.repeat && (
                      <span className="text-muted-foreground"> · <Repeat className="inline h-3 w-3" /> {REPEAT_LABEL[r.repeat]}</span>
                    )}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => doneReminder(r)} aria-label="Marcar como hecho">
                  <Check className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {(recentPaid.data ?? []).length > 0 && (
        <ul className="mt-3 space-y-1 border-t pt-3">
          {(recentPaid.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 shrink-0 text-green-600" />
              <span className="truncate">
                {r.title} · pagada{r.amount ? <span className="font-numeric"> · {formatMoney(Number(r.amount))}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <AddDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {payDebt && <PayDebtDialog debt={payDebt.debt} balance={payDebt.balance} onClose={() => setPayDebt(null)} />}
    </Card>
  );
}

function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"pago" | "nomina" | "permiso" | "documento" | "deuda">("pago");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [repeat, setRepeat] = useState<string>("");
  const [supplierId, setSupplierId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [incurred, setIncurred] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const suppliers = useQuery<{ id: string; name: string }[]>({
    queryKey: ["suppliers-min"],
    enabled: open && kind === "deuda",
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const employees = useQuery<{ id: string; name: string }[]>({
    queryKey: ["employees-min"],
    enabled: open && kind === "nomina",
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setTitle(""); setDue(""); setAmount(""); setRepeat(""); setSupplierId(""); setEmployeeId(""); setIncurred(todayIso());
  };

  const save = async () => {
    setSaving(true);
    try {
      if (kind === "deuda") {
        if (!supplierId || !(Number(amount) > 0)) throw new Error("Falta el proveedor y el monto");
        const { error } = await db("supplier_debts").insert({
          supplier_id: supplierId, amount: Number(amount), incurred_on: incurred, due_on: due || null, description: title.trim() || null,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["supplier-debts"] });
      } else {
        if (!title.trim() || !due) throw new Error("Falta el nombre y la fecha");
        const { error } = await db("reminders").insert({
          title: title.trim(), kind, due_date: due, amount: amount ? Number(amount) : null, repeat: repeat || null,
          employee_id: kind === "nomina" && employeeId ? employeeId : null,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["reminders"] });
      }
      toast.success("Guardado");
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const select = "w-full h-10 rounded-md border bg-background px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo pago pendiente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <select className={select} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="pago">Pago por hacer</option>
              <option value="nomina">Nómina</option>
              <option value="deuda">Deuda con proveedor</option>
              <option value="permiso">Permiso (municipal, estatal, federal)</option>
              <option value="documento">Documento</option>
            </select>
          </div>
          {kind === "deuda" ? (
            <>
              <div>
                <Label>Proveedor</Label>
                <select className={select} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Elige…</option>
                  {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><Label>Monto que debes</Label><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>Desde cuándo</Label><Input type="date" value={incurred} onChange={(e) => setIncurred(e.target.value)} /></div>
              <div><Label>Fecha para pagar (opcional)</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div><Label>Nota (opcional)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. pedido de muñecas" /></div>
            </>
          ) : (
            <>
              {kind === "nomina" && (
                <div>
                  <Label>Empleada</Label>
                  <select
                    className={select}
                    value={employeeId}
                    onChange={(e) => {
                      setEmployeeId(e.target.value);
                      const name = (employees.data ?? []).find((x) => x.id === e.target.value)?.name;
                      if (name && !title.trim()) setTitle(`Nómina ${name}`);
                    }}
                  >
                    <option value="">Elige…</option>
                    {(employees.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Se marca sola como pagada cuando se haga su recibo de nómina.</p>
                </div>
              )}
              <div>
                <Label>Qué es</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "nomina" ? "Nómina Olga" : "Renta, licencia, SAT…"} />
              </div>
              <div><Label>Fecha</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div>
                <Label>Se repite</Label>
                <select className={select} value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                  <option value="">No se repite</option>
                  <option value="weekly">Cada semana</option>
                  <option value="semimonthly">Quincenal (15 y último del mes)</option>
                  <option value="monthly">Cada mes</option>
                </select>
              </div>
              <div><Label>Monto (opcional)</Label><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            </>
          )}
          <Button className="w-full" disabled={saving} onClick={save}>{saving ? "Guardando..." : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PayDebtDialog({ debt, balance, onClose }: { debt: Debt; balance: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(balance));
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(amount);
    if (!(value > 0)) return toast.error("Escribe el monto del abono");
    if (value > balance + 0.005) return toast.error(`El abono no puede ser mayor al saldo (${formatMoney(balance)})`);
    setSaving(true);
    const { error } = await db("supplier_debt_payments").insert({ debt_id: debt.id, amount: value, paid_on: date, note: note.trim() || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(value >= balance - 0.005 ? "Deuda liquidada" : `Abono registrado. Saldo: ${formatMoney(balance - value)}`);
    qc.invalidateQueries({ queryKey: ["supplier-debts"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Abonar a {debt.suppliers?.name ?? "proveedor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Saldo pendiente: <span className="font-numeric font-semibold text-foreground">{formatMoney(balance)}</span>
          </p>
          <div><Label>Monto del abono</Label><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Fecha</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Nota (opcional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. transferencia BBVA" /></div>
          <Button className="w-full" disabled={saving} onClick={save}>{saving ? "Guardando..." : "Registrar abono"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
