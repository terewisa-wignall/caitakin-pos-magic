import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator, ChevronDown, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import {
  addDays,
  christmasBonus,
  computePayroll,
  dateRange,
  daysAccruedThisYear,
  nextPeriod,
  periodLabel,
  proportionalVacationDays,
  infonavitExplainDates,
  infonavitForDates,
  round2,
  shiftPeriod,
  vacationDaysBySeniority,
  weekdayOf,
  WEEKDAY_SHORT,
  yearsOfService,
} from "@/lib/payroll-calc";
import { holidayOn } from "@/lib/holidays";

const num = (v: string | number) => Number(v) || 0;

export function PayrollWizard({
  open,
  emp,
  payment,
  canEditRate,
  onClose,
  onSaved,
}: {
  open: boolean;
  emp: any;
  payment?: any | null;
  canEditRate?: boolean;
  onClose: () => void;
  onSaved: (payment: any) => void;
}) {
  const { user, isAdmin } = useAuth();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [paidAt, setPaidAt] = useState(today);
  const [workedDates, setWorkedDates] = useState<string[]>([]);
  const [dailyRate, setDailyRate] = useState("0");
  const [vacationDays, setVacationDays] = useState("0");
  const [aguinaldo, setAguinaldo] = useState("0");
  const [bonus, setBonus] = useState("");
  const [severance, setSeverance] = useState("");
  const [imss, setImss] = useState("");
  const [infonavit, setInfonavit] = useState("");
  const [loanDeduction, setLoanDeduction] = useState("");
  const [newLoan, setNewLoan] = useState("");
  type Extra = { type: "in" | "out"; concept: string; custom: string; amount: string };
  const [extras, setExtras] = useState<Extra[]>([]);
  const [infoHint, setInfoHint] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showDates, setShowDates] = useState(false);

  const loans = useQuery({
    queryKey: ["payroll-wizard-loans", emp?.id],
    enabled: open && !!emp?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_loans")
        .select("id,balance,installment_amount,mode,status,currency")
        .eq("employee_id", emp.id)
        .eq("status", "active")
        .order("start_date", { ascending: true });
      return data ?? [];
    },
  });

  const contract = useQuery({
    queryKey: ["payroll-wizard-contract", emp?.id],
    enabled: open && !!emp?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("employment_contracts")
        .select("*")
        .eq("employee_id", emp.id)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
  });

  // Último periodo pagado (para que el siguiente sea consecutivo)
  const lastEnd = useQuery({
    queryKey: ["payroll-last-period", emp?.id],
    enabled: open && !!emp?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("last_payroll_period_end", { _employee_id: emp.id });
      return (data as string | null) ?? null;
    },
  });

  const activeLoan = (loans.data ?? [])[0] as any | undefined;
  const loanBalance = Number(activeLoan?.balance ?? 0);

  // Cargar valores al abrir
  useEffect(() => {
    if (!open) return;
    setShowAdjust(false);
    setShowDates(false);
    if (payment) {
      setPeriodStart(payment.period_start ?? today);
      setPeriodEnd(payment.period_end ?? today);
      setPaidAt(payment.paid_at ?? today);
      setWorkedDates(
        Array.isArray(payment.worked_dates) && payment.worked_dates.length
          ? (payment.worked_dates as string[])
          : dateRange(payment.period_start ?? today, payment.period_end ?? today),
      );
      setDailyRate(String(payment.daily_rate ?? emp?.salary ?? 0));
      setVacationDays(String(payment.vacation_days ?? 0));
      setAguinaldo(String(payment.christmas_bonus ?? 0));
      setBonus(payment.bonus_amount ? String(payment.bonus_amount) : "");
      setExtras(
        Array.isArray(payment.extras)
          ? payment.extras.map((x: any) => ({
              type: x.type === "out" ? "out" : "in",
              concept: x.loan ? "Abono a deuda" : "Otro motivo",
              custom: x.loan ? "" : String(x.concept ?? ""),
              amount: String(x.amount ?? ""),
            }))
          : [],
      );
      setSeverance(payment.severance_amount ? String(payment.severance_amount) : "");
      setImss(payment.imss_deduction ? String(payment.imss_deduction) : "");
      setInfonavit(payment.infonavit_deduction ? String(payment.infonavit_deduction) : "");
      setLoanDeduction(payment.loan_deduction ? String(payment.loan_deduction) : "");
      setOtherDeductions(payment.other_deductions ? String(payment.other_deductions) : "");
      setOtherNote(payment.other_deductions_note ?? "");
      setMethod(payment.payment_method ?? "cash");
      setNote(payment.note ?? "");
    } else {
      setPaidAt(today);
      setDailyRate(String(emp?.salary ?? 0));
      setVacationDays("0");
      setAguinaldo("0");
      setBonus(""); setSeverance(""); setExtras([]); setImss(""); setInfonavit("");
      setLoanDeduction(""); setOtherDeductions(""); setOtherNote("");
      setMethod("cash"); setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?.id, emp?.id]);

  // Periodo consecutivo sugerido (recibo nuevo)
  useEffect(() => {
    if (!open || payment || lastEnd.isLoading) return;
    const p = nextPeriod(lastEnd.data ?? null, emp?.frequency, today);
    setPeriodStart(p.start);
    setPeriodEnd(p.end);
    setWorkedDates(dateRange(p.start, p.end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment, lastEnd.data, lastEnd.isLoading, emp?.id]);

  // Infonavit sugerido desde el contrato (por cuota bimestral: se reparte por los días pagados)
  useEffect(() => {
    if (!open || payment || !contract.data) return;
    const c: any = contract.data;
    if (!c.infonavit_enrolled || !c.infonavit_value) return;
    const rate = num(dailyRate);
    const dates = workedDates.filter((d) => d >= periodStart && d <= periodEnd);
    const base = rate * dates.length;
    const value =
      c.infonavit_type === "percent"
        ? round2((base * Number(c.infonavit_value)) / 100)
        : c.infonavit_type === "bimonthly"
          ? infonavitForDates(Number(c.infonavit_value), dates)
          : round2(Number(c.infonavit_value));
    setInfonavit(String(value));
    setInfoHint(c.infonavit_type === "bimonthly" ? infonavitExplainDates(Number(c.infonavit_value), dates) ?? "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract.data, payment, periodStart, periodEnd, workedDates]);

  // Préstamo sugerido
  useEffect(() => {
    if (!open || payment || !activeLoan) return;
    const suggested =
      activeLoan.mode === "auto" && activeLoan.installment_amount
        ? Math.min(Number(activeLoan.installment_amount), loanBalance)
        : 0;
    setLoanDeduction(suggested > 0 ? String(round2(suggested)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeLoan?.id, payment]);

  const days = dateRange(periodStart, periodEnd);
  const periodDays = days.length;
  const daysWorked = workedDates.filter((d) => days.includes(d)).length;

  const years = useMemo(() => yearsOfService(emp?.hire_date, new Date(periodEnd + "T00:00:00")), [emp?.hire_date, periodEnd]);
  const entitledVacation = vacationDaysBySeniority(years);
  const suggestedVacationDays = useMemo(
    () => proportionalVacationDays(emp?.hire_date, periodEnd),
    [emp?.hire_date, periodEnd],
  );
  const suggestedAguinaldo = useMemo(
    () => christmasBonus(num(dailyRate), daysAccruedThisYear(emp?.hire_date, periodEnd)),
    [dailyRate, emp?.hire_date, periodEnd],
  );

  // Finiquito automático: aguinaldo (15 días) + vacaciones + prima, proporcional a los días pagados (÷ 360)
  useEffect(() => {
    if (!open || payment || !emp?.weekly_settlement) return;
    const rate = num(dailyRate);
    const vd = entitledVacation || 12;
    setAguinaldo(String(round2((rate * 15 * daysWorked) / 360)));
    setVacationDays(String(Math.round(((vd * daysWorked) / 360) * 10000) / 10000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment, emp?.weekly_settlement, dailyRate, daysWorked, entitledVacation]);

  const overlaps = !!lastEnd.data && periodStart <= lastEnd.data && (!payment || payment.period_start > lastEnd.data);

  const holidaysInPeriod = days.filter((d) => holidayOn(d));
  const holidayDays = workedDates.filter((d) => days.includes(d) && holidayOn(d)).length;

  const extraLines = extras
    .filter((e) => num(e.amount) > 0)
    .map((e) => ({ type: e.type, concept: e.concept, label: e.concept === "Otro motivo" ? e.custom.trim() || "Otro motivo" : e.concept, amt: num(e.amount) }));
  const extrasIn = extraLines.filter((e) => e.type === "in").reduce((a, e) => a + e.amt, 0);
  const extrasLoan = extraLines.filter((e) => e.type === "out" && e.concept === "Abono a deuda").reduce((a, e) => a + e.amt, 0);
  const extrasOut = extraLines.filter((e) => e.type === "out" && e.concept !== "Abono a deuda");
  const extrasOther = extrasOut.reduce((a, e) => a + e.amt, 0);

  const totals = computePayroll({
    holidayDays,
    dailyRate: num(dailyRate),
    daysWorked,
    vacationDays: num(vacationDays),
    christmasBonus: num(aguinaldo),
    bonus: num(bonus) + extrasIn,
    severance: num(severance),
    imss: num(imss),
    infonavit: num(infonavit),
    loan: num(loanDeduction) + extrasLoan,
    otherDeductions: num(otherDeductions) + extrasOther,
  });

  const setPeriod = (start: string, end: string) => {
    setPeriodStart(start);
    setPeriodEnd(end);
    setWorkedDates(dateRange(start, end));
  };

  const move = (delta: number) => {
    const p = shiftPeriod(periodStart, periodEnd, delta);
    setPeriod(p.start, p.end);
  };

  const setQuickPeriod = (len: number) => setPeriod(periodStart, addDays(periodStart, len - 1));

  const toggleDay = (d: string) => {
    setWorkedDates((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  // Las empleadas solo generan el recibo del periodo en curso (misma regla que la base de datos).
  const periodAllowed = isAdmin || (periodStart <= periodEnd && periodStart <= today && periodEnd >= addDays(today, -3));

  const save = async () => {
    if (!periodAllowed) {
      toast.error("Solo puedes generar el recibo del periodo en curso.");
      return;
    }
    if (!emp?.id) { toast.error("Falta la empleada"); return; }
    if (totals.net <= 0 && totals.grossTotal <= 0) { toast.error("Marca al menos un día trabajado"); return; }
    if (num(loanDeduction) + extrasLoan > loanBalance + 0.01) { toast.error(`El abono no puede pasar del saldo (${formatMoney(loanBalance)})`); return; }
    if (overlaps && !confirm(`Este periodo se cruza con uno ya pagado (hasta el ${lastEnd.data}). ¿Guardar de todas formas?`)) return;
    setSaving(true);
    const payload: any = {
      employee_id: emp.id,
      period_start: periodStart,
      period_end: periodEnd,
      period_days: periodDays,
      paid_at: paidAt,
      worked_dates: workedDates.filter((d) => days.includes(d)).sort(),
      days_worked: daysWorked,
      holiday_days: holidayDays,
      double_days: 0,
      extras: extraLines.map((e) => ({ type: e.type, concept: e.label, amount: e.amt, loan: e.concept === "Abono a deuda" })),
      daily_rate: num(dailyRate),
      gross_amount: totals.grossTotal,
      vacation_days: num(vacationDays),
      vacation_amount: totals.vacationAmount,
      vacation_premium: totals.vacationPremium,
      christmas_bonus: totals.christmasBonus,
      bonus_amount: totals.bonus,
      severance_amount: totals.severance,
      imss_deduction: totals.imss,
      infonavit_deduction: totals.infonavit,
      loan_deduction: totals.loan,
      loan_id: totals.loan > 0 ? activeLoan?.id ?? null : null,
      other_deductions: totals.otherDeductions,
      other_deductions_note: [otherNote, ...extrasOut.map((e) => e.label)].filter(Boolean).join(", ") || null,
      amount: totals.net,
      currency: "MXN",
      payment_method: method,
      note: note || null,
    };
    if (!payment) {
      payload.created_by = user?.id;
      payload.receipt_number = `NOM-${new Date(paidAt).getFullYear()}-${Date.now().toString().slice(-6)}`;
    }
    const { data, error } = payment
      ? await supabase.from("payroll_payments").update(payload).eq("id", payment.id).select("*").maybeSingle()
      : await supabase.from("payroll_payments").insert(payload).select("*").maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (!payment && num(newLoan) > 0) {
      const { error: loanErr } = await supabase.from("employee_loans").insert({
        employee_id: emp.id, principal: num(newLoan), balance: 0, status: "requested", mode: "manual", start_date: paidAt, note: "Solicitado desde su recibo",
      });
      if (loanErr) toast.error("Recibo guardado, pero no se pudo registrar el préstamo: " + loanErr.message);
      else toast.success("Solicitud de préstamo enviada: " + formatMoney(num(newLoan)));
    }
    toast.success(payment ? "Recibo actualizado" : "Recibo guardado");
    onSaved(data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-4 pt-4 md:px-6">
          <DialogTitle className="text-base md:text-lg">
            {payment ? "Editar recibo" : "Nuevo recibo"} · {emp?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 md:px-6 pb-28 space-y-4">
          {/* Periodo consecutivo */}
          <section className="space-y-2">
            <div className="flex items-center gap-1">
              {isAdmin ? <Button type="button" variant="ghost" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button> : <span className="w-9" />}
              <div className="flex-1 text-center">
                <p className="text-base font-semibold leading-tight">{periodLabel(periodStart, periodEnd, emp?.frequency)}</p>
                <p className="text-[11px] text-muted-foreground">{periodDays} días · sigue después del último pago</p>
              </div>
              {isAdmin ? <Button type="button" variant="ghost" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button> : <span className="w-9" />}
            </div>
            {overlaps && (
              <p className="text-[11px] text-destructive text-center">
                Ojo: ya pagaste hasta el {lastEnd.data}. Usa la flecha para adelantar el periodo.
              </p>
            )}
            {!periodAllowed && (
              <p className="text-[11px] text-destructive text-center">
                Este periodo no es el actual. Solo puedes generar el recibo del periodo en curso; pídele a administración el de otro periodo.
              </p>
            )}
            {isAdmin && <button
              type="button"
              onClick={() => setShowDates((v) => !v)}
              className="w-full text-[11px] text-primary flex items-center justify-center gap-1"
            >
              Cambiar fechas o duración <ChevronDown className={`h-3 w-3 transition-transform ${showDates ? "rotate-180" : ""}`} />
            </button>}
            {isAdmin && showDates && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Del</Label>
                    <Input type="date" value={periodStart} onChange={(e) => setPeriod(e.target.value, periodEnd)} />
                  </div>
                  <div>
                    <Label>Al</Label>
                    <Input type="date" value={periodEnd} onChange={(e) => setPeriod(periodStart, e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[7, 10, 15, 30].map((n) => (
                    <Button key={n} type="button" size="sm" variant="outline" onClick={() => setQuickPeriod(n)}>
                      {n} días
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Días trabajados */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Días trabajados ({daysWorked} de {periodDays})
              </p>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setWorkedDates(dateRange(periodStart, periodEnd))}>Todos</Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setWorkedDates([])}>Ninguno</Button>
              </div>
            </div>
            {holidaysInPeriod.length > 0 && (
              <p className="rounded-lg bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 text-xs">
                Festivo en este periodo: {holidaysInPeriod.map((h) => `${holidayOn(h)?.name} (${new Date(h + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })})`).join(", ")}. Es día de descanso obligatorio (LFT art. 74). Si se trabaja, se paga un salario doble además del que ya le corresponde por el descanso (art. 75).
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Cobrar desde el</Label>
                <Input type="date" min={periodStart} max={periodEnd}
                  value={[...workedDates].filter((d) => days.includes(d)).sort()[0] ?? ""}
                  onChange={(e) => {
                    const to = [...workedDates].filter((d) => days.includes(d)).sort().slice(-1)[0] ?? periodEnd;
                    if (e.target.value) setWorkedDates(dateRange(e.target.value, e.target.value > to ? e.target.value : to));
                  }} />
              </div>
              <div>
                <Label className="text-xs">hasta el</Label>
                <Input type="date" min={periodStart} max={periodEnd}
                  value={[...workedDates].filter((d) => days.includes(d)).sort().slice(-1)[0] ?? ""}
                  onChange={(e) => {
                    const from = [...workedDates].filter((d) => days.includes(d)).sort()[0] ?? periodStart;
                    if (e.target.value) setWorkedDates(dateRange(e.target.value < from ? e.target.value : from, e.target.value));
                  }} />
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const active = workedDates.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-lg border py-2 text-center transition-colors ${
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                    }`}
                  >
                    <span className="block text-[10px] opacity-70">{WEEKDAY_SHORT[weekdayOf(d)]}</span>
                    <span className="block text-sm font-semibold">{Number(d.slice(8, 10))}</span>
                    {holidayOn(d) && <span className="block text-[9px] font-semibold leading-none pb-0.5">festivo</span>}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Pago por día</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  disabled={canEditRate === false}
                  className="font-numeric"
                />
              </div>
              <div>
                <Label>Fecha de pago</Label>
                <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Sueldo · {daysWorked} × {formatMoney(num(dailyRate))}</span>
              <span className="font-semibold font-numeric">{formatMoney(totals.salary)}</span>
            </div>
            {totals.holidayPay > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Festivo trabajado · {holidayDays} (pago doble extra)</span>
                <span className="font-semibold font-numeric">{formatMoney(totals.holidayPay)}</span>
              </div>
            )}
            {totals.vacationAmount + totals.vacationPremium + totals.christmasBonus > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Finiquito · {daysWorked} días (automático)</span>
                <span className="font-semibold font-numeric">{formatMoney(totals.vacationAmount + totals.vacationPremium + totals.christmasBonus)}</span>
              </div>
            )}
            {!isAdmin && totals.infonavit > 0 && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Infonavit (automático)</span>
                  <span className="font-semibold font-numeric">− {formatMoney(totals.infonavit)}</span>
                </div>
                {infoHint && <p className="text-[11px] text-muted-foreground mt-1">{infoHint.replace("Infonavit: ", "")}</p>}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Extras y descuentos</p>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                onClick={() => setExtras((p) => [...p, { type: "in", concept: "Día doble", custom: "", amount: String(round2(num(dailyRate))) }])}>
                + Agregar
              </Button>
            </div>
            {extras.length === 0 && <p className="text-xs text-muted-foreground">Día doble, bono, premio, abono a una deuda u otro motivo.</p>}
            {extras.map((x, i) => {
              const concepts = x.type === "in" ? ["Día doble", "Bono", "Premio", "Otro motivo"] : [...(loanBalance > 0 ? ["Abono a deuda"] : []), "Otro motivo"];
              const upd = (patch: Partial<Extra>) => setExtras((p) => p.map((e, j) => (j === i ? { ...e, ...patch } : e)));
              return (
                <div key={i} className="rounded-lg border p-2 space-y-2">
                  <div className="grid grid-cols-[96px_1fr_auto] gap-2">
                    <select className="h-10 rounded-md border bg-background px-2 text-sm" value={x.type}
                      onChange={(e) => { const t = e.target.value as "in" | "out"; upd({ type: t, concept: t === "in" ? "Día doble" : loanBalance > 0 ? "Abono a deuda" : "Otro motivo", custom: "" }); }}>
                      <option value="in">Suma</option>
                      <option value="out">Resta</option>
                    </select>
                    <select className="h-10 rounded-md border bg-background px-2 text-sm" value={x.concept}
                      onChange={(e) => upd({ concept: e.target.value, amount: e.target.value === "Día doble" && !x.amount ? String(round2(num(dailyRate))) : x.amount })}>
                      {concepts.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Button type="button" size="icon" variant="ghost" className="h-10 w-10" aria-label="Quitar"
                      onClick={() => setExtras((p) => p.filter((_, j) => j !== i))}>×</Button>
                  </div>
                  {x.concept === "Otro motivo" && (
                    <Input placeholder="Concepto (ej. uniforme, regalo, anticipo)" value={x.custom} onChange={(e) => upd({ custom: e.target.value })} />
                  )}
                  <div>
                    <Input type="number" inputMode="decimal" step="0.01" placeholder="Monto" value={x.amount} onChange={(e) => upd({ amount: e.target.value })} className="font-numeric" />
                    {x.concept === "Abono a deuda" && <p className="text-[11px] text-muted-foreground mt-1">Se abona a tu deuda · saldo {formatMoney(loanBalance)}</p>}
                  </div>
                </div>
              );
            })}
          </section>

          {!isAdmin && (
            <section className="space-y-2">
              <Label>Solicitar un préstamo</Label>
              <Input type="number" inputMode="decimal" step="0.01" placeholder="0" value={newLoan}
                onChange={(e) => setNewLoan(e.target.value)} className="font-numeric" />
              <p className="text-[11px] text-muted-foreground">Queda como solicitud; administración la acepta o la rechaza.</p>
            </section>
          )}

          {/* Ajustes opcionales: solo administración */}
          {isAdmin && (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdjust((v) => !v)}
              className="w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium"
            >
              <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Ajustes (opcional)</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdjust ? "rotate-180" : ""}`} />
            </button>

            {showAdjust && (
              <div className="space-y-3">
                <Card className="p-3 space-y-3 bg-muted/30">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Se le suma</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="flex items-center justify-between">
                        Días de vacaciones
                        <button type="button" className="text-[11px] text-primary" onClick={() => setVacationDays(String(suggestedVacationDays))}>
                          usar {suggestedVacationDays}
                        </button>
                      </Label>
                      <Input type="number" inputMode="decimal" step="0.5" value={vacationDays} onChange={(e) => setVacationDays(e.target.value)} className="font-numeric" />
                      <p className="text-[11px] text-muted-foreground mt-1">{years} año(s) · le tocan {entitledVacation || 12} al año</p>
                    </div>
                    <div>
                      <Label className="flex items-center justify-between">
                        Aguinaldo
                        <button type="button" className="text-[11px] text-primary" onClick={() => setAguinaldo(String(suggestedAguinaldo))}>
                          usar {formatMoney(suggestedAguinaldo)}
                        </button>
                      </Label>
                      <Input type="number" inputMode="decimal" step="0.01" value={aguinaldo} onChange={(e) => setAguinaldo(e.target.value)} className="font-numeric" />
                    </div>
                  </div>
                  <Row label="Vacaciones" value={formatMoney(totals.vacationAmount)} />
                  <Row label="Prima vacacional (25%)" value={formatMoney(totals.vacationPremium)} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Bono</Label>
                      <Input type="number" inputMode="decimal" step="0.01" placeholder="0" value={bonus} onChange={(e) => setBonus(e.target.value)} className="font-numeric" />
                    </div>
                    <div>
                      <Label>Pago extra</Label>
                      <Input type="number" inputMode="decimal" step="0.01" placeholder="0" value={severance} onChange={(e) => setSeverance(e.target.value)} className="font-numeric" />
                    </div>
                  </div>
                </Card>

                <Card className="p-3 space-y-3 bg-muted/30">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Se le resta</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>IMSS</Label>
                      <Input type="number" inputMode="decimal" step="0.01" placeholder="0" value={imss} onChange={(e) => setImss(e.target.value)} className="font-numeric" />
                    </div>
                    <div>
                      <Label>Infonavit</Label>
                      <Input type="number" inputMode="decimal" step="0.01" placeholder="0" value={infonavit} onChange={(e) => setInfonavit(e.target.value)} className="font-numeric" />
                      {infoHint && <p className="text-[11px] text-muted-foreground mt-1">{infoHint.replace("Infonavit: ", "")}</p>}
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center justify-between">
                      Abono a préstamo
                      <span className="text-[11px] text-muted-foreground">saldo {formatMoney(loanBalance)}</span>
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0"
                      value={loanDeduction}
                      onChange={(e) => setLoanDeduction(e.target.value)}
                      disabled={loanBalance <= 0}
                      className="font-numeric"
                    />
                    {loanBalance > 0 && (
                      <button type="button" className="text-[11px] text-primary mt-1" onClick={() => setLoanDeduction(String(round2(loanBalance)))}>
                        liquidar todo el saldo
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Otras deducciones</Label>
                      <Input type="number" inputMode="decimal" step="0.01" placeholder="0" value={otherDeductions} onChange={(e) => setOtherDeductions(e.target.value)} className="font-numeric" />
                    </div>
                    <div>
                      <Label>Concepto</Label>
                      <Input placeholder="Ej. uniforme" value={otherNote} onChange={(e) => setOtherNote(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                    <span>Total deducciones</span>
                    <span className="font-numeric">− {formatMoney(totals.deductionsTotal)}</span>
                  </div>
                </Card>

                <Card className="p-3 space-y-3">
                  <div>
                    <Label>Forma de pago</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                        <SelectItem value="debit_card">Débito</SelectItem>
                        <SelectItem value="credit_card">Crédito</SelectItem>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nota</Label>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. semana del lunes al domingo" />
                  </div>
                </Card>
              </div>
            )}
          </section>
          )}
        </div>

        {/* Resumen fijo */}
        <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-4 md:px-6 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1"><Calculator className="h-4 w-4" /> Total a pagar</span>
            <span className="text-2xl font-bold text-primary font-numeric">{formatMoney(totals.net)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving ? "Guardando..." : payment ? "Guardar cambios" : "Guardar y descargar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {label}
        {hint && <span className="block text-[11px]">{hint}</span>}
      </span>
      <span className="font-semibold font-numeric">{value}</span>
    </div>
  );
}
