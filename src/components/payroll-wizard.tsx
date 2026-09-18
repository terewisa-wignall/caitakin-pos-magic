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
  round2,
  shiftPeriod,
  vacationDaysBySeniority,
  weekdayOf,
  WEEKDAY_SHORT,
  yearsOfService,
} from "@/lib/payroll-calc";

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
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

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
        .neq("status", "paid")
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
      setBonus(""); setSeverance(""); setImss(""); setInfonavit("");
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

  // Infonavit sugerido desde el contrato
  useEffect(() => {
    if (!open || payment || !contract.data) return;
    const c: any = contract.data;
    if (!c.infonavit_enrolled || !c.infonavit_value) return;
    const rate = num(dailyRate);
    const days = workedDates.length;
    const base = rate * days;
    const value =
      c.infonavit_type === "percent" ? round2((base * Number(c.infonavit_value)) / 100) : round2(Number(c.infonavit_value));
    setInfonavit(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract.data, payment]);

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

  const overlaps = !!lastEnd.data && periodStart <= lastEnd.data && (!payment || payment.period_start > lastEnd.data);

  const totals = computePayroll({
    dailyRate: num(dailyRate),
    daysWorked,
    vacationDays: num(vacationDays),
    christmasBonus: num(aguinaldo),
    bonus: num(bonus),
    severance: num(severance),
    imss: num(imss),
    infonavit: num(infonavit),
    loan: num(loanDeduction),
    otherDeductions: num(otherDeductions),
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

  const save = async () => {
    if (!emp?.id) { toast.error("Falta la empleada"); return; }
    if (totals.net <= 0 && totals.grossTotal <= 0) { toast.error("Marca al menos un día trabajado"); return; }
    if (num(loanDeduction) > loanBalance + 0.01) { toast.error(`El abono no puede pasar del saldo (${formatMoney(loanBalance)})`); return; }
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
      other_deductions_note: otherNote || null,
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
              <Button type="button" variant="ghost" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="flex-1 text-center">
                <p className="text-base font-semibold leading-tight">{periodLabel(periodStart, periodEnd, emp?.frequency)}</p>
                <p className="text-[11px] text-muted-foreground">{periodDays} días · sigue después del último pago</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            {overlaps && (
              <p className="text-[11px] text-destructive text-center">
                Ojo: ya pagaste hasta el {lastEnd.data}. Usa la flecha para adelantar el periodo.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowDates((v) => !v)}
              className="w-full text-[11px] text-primary flex items-center justify-center gap-1"
            >
              Cambiar fechas o duración <ChevronDown className={`h-3 w-3 transition-transform ${showDates ? "rotate-180" : ""}`} />
            </button>
            {showDates && (
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
          </section>

          {/* Ajustes opcionales */}
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
