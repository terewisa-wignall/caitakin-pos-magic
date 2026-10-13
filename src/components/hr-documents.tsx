import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatDateShort } from "@/lib/format";
import { serviceYearWindows, vacationDaysBySeniority, yearsOfService } from "@/lib/payroll-calc";
import { esc, printHtml } from "@/lib/print-html";

const db = supabase.from as any;
const n = (v: unknown) => Number(v) || 0;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const COMPANY = "CAsitakin";

function entitledDays(hire: string | null, at: Date) {
  return vacationDaysBySeniority(yearsOfService(hire, at)) || 12;
}

/* ---------------- Control de vacaciones + constancia por periodo ---------------- */
export function ConstanciaTab({ emp }: { emp: any }) {
  const today = new Date();
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [months, setMonths] = useState("4");

  const range = useMemo(() => {
    const [y, m] = startMonth.split("-").map(Number);
    const count = Math.max(1, Math.min(12, Number(months) || 4));
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m - 1 + count, 0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: iso(start), end: iso(end), count, y, m };
  }, [startMonth, months]);

  const data = useQuery({
    queryKey: ["hr-constancia", emp.id, range.start, range.end],
    queryFn: async () => {
      const yearFrom = `${today.getFullYear() - 4}-01-01`;
      const [pay, vac] = await Promise.all([
        db("payroll_payments").select("*").eq("employee_id", emp.id).gte("paid_at", range.start).lte("paid_at", range.end).order("paid_at"),
        db("vacation_records").select("*").eq("employee_id", emp.id).gte("start_date", yearFrom).order("start_date"),
      ]);
      return { pay: (pay.data ?? []) as any[], vac: (vac.data ?? []) as any[] };
    },
  });

  const windows = serviceYearWindows(emp.hire_date, today, 3);
  const vacRows = windows.map((w, i) => {
    const entitled = vacationDaysBySeniority(w.years) || 12;
    const taken = (data.data?.vac ?? []).filter((v) => v.status !== "cancelled" && String(v.start_date) >= w.start && String(v.start_date) <= w.end).reduce((sum, v) => sum + n(v.days), 0);
    const carry = i === windows.length - 1 ? n(emp.vacation_carryover) : 0;
    return { y: `${formatDateShort(w.start)} – ${formatDateShort(w.end)}`, entitled: entitled + carry, taken, pending: Math.max(0, entitled + carry - taken) };
  });

  const byMonth = Array.from({ length: range.count }, (_, i) => {
    const d = new Date(range.y, range.m - 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const rows = (data.data?.pay ?? []).filter((p) => String(p.paid_at).startsWith(key));
    const sum = (f: (p: any) => number) => rows.reduce((s, p) => s + f(p), 0);
    return {
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      days: sum((p) => n(p.days_worked)),
      salary: sum((p) => n(p.daily_rate) * n(p.days_worked)),
      finiquito: sum((p) => n(p.vacation_amount) + n(p.vacation_premium) + n(p.christmas_bonus)),
      extra: sum((p) => n(p.bonus_amount) + n(p.severance_amount)),
      deductions: sum((p) => n(p.imss_deduction) + n(p.infonavit_deduction) + n(p.loan_deduction) + n(p.other_deductions)),
      net: sum((p) => n(p.amount)),
    };
  });
  const totals = byMonth.reduce((a, r) => ({ days: a.days + r.days, salary: a.salary + r.salary, finiquito: a.finiquito + r.finiquito, extra: a.extra + r.extra, deductions: a.deductions + r.deductions, net: a.net + r.net }), { days: 0, salary: 0, finiquito: 0, extra: 0, deductions: 0, net: 0 });

  const print = () => {
    const rows = byMonth.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.days}</td><td class="n">${formatMoney(r.salary)}</td><td class="n">${formatMoney(r.finiquito)}</td><td class="n">${formatMoney(r.extra)}</td><td class="n">${formatMoney(r.deductions)}</td><td class="n">${formatMoney(r.net)}</td></tr>`).join("");
    const vrows = vacRows.map((v) => `<tr><td>${v.y}</td><td class="n">${v.entitled}</td><td class="n">${v.taken}</td><td class="n">${v.pending}</td></tr>`).join("");
    const html = `<h1>${COMPANY}</h1>
<p class="muted">Constancia de pagos y prestaciones · del ${formatDateShort(range.start)} al ${formatDateShort(range.end)}</p>
<p><b>${esc(emp.name)}</b>${emp.position ? ` · ${esc(emp.position)}` : ""}<br/>Fecha de ingreso: ${emp.hire_date ? formatDateShort(emp.hire_date) : "—"}</p>
<h2>Pagos recibidos</h2>
<table><tr><th>Mes</th><th class="n">Días</th><th class="n">Sueldo</th><th class="n">Finiquito (aguinaldo, vacaciones, prima)</th><th class="n">Bonos y otros</th><th class="n">Descuentos</th><th class="n">Neto pagado</th></tr>${rows}
<tr><th>Total</th><th class="n">${totals.days}</th><th class="n">${formatMoney(totals.salary)}</th><th class="n">${formatMoney(totals.finiquito)}</th><th class="n">${formatMoney(totals.extra)}</th><th class="n">${formatMoney(totals.deductions)}</th><th class="n">${formatMoney(totals.net)}</th></tr></table>
<h2>Vacaciones</h2>
<table><tr><th>Año de servicio</th><th class="n">Días que le tocan</th><th class="n">Tomados</th><th class="n">Pendientes</th></tr>${vrows}</table>
<p>Reconozco haber recibido los pagos y prestaciones que se detallan en esta constancia, así como los recibos de nómina correspondientes a cada periodo, y que no se me adeuda cantidad alguna por estos conceptos, salvo lo que aquí se señala como pendiente.</p>
<div class="sign"><div>${esc(emp.name)}<br/>Empleada</div><div>${COMPANY}<br/>Patrón</div></div>
<p class="muted">Lugar y fecha: ______________________________</p>`;
    if (!printHtml(`Constancia ${emp.name}`, html)) toast.error("Permite las ventanas emergentes para imprimir");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Control de vacaciones</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>Año de servicio</th><th className="text-right">Le tocan</th><th className="text-right">Tomados</th><th className="text-right">Pendientes</th></tr></thead>
          <tbody>
            {vacRows.map((v) => (
              <tr key={v.y} className="border-t"><td className="py-1.5">{v.y}</td><td className="text-right">{v.entitled}</td><td className="text-right">{v.taken}</td><td className={`text-right ${v.pending > 0 ? "text-amber-600 font-semibold" : ""}`}>{v.pending}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground mt-2">Los días que le tocan salen de su fecha de ingreso (más los pendientes de años anteriores que anotaste) ({emp.hire_date ? formatDateShort(emp.hire_date) : "sin capturar"}). Los tomados, de las vacaciones registradas en la pestaña Vacaciones.</p>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Constancia de pagos para firmar</h3>
        <p className="text-xs text-muted-foreground">Resume los pagos de varios meses en una hoja que ella firma una vez (por ejemplo cada 4 meses). Los recibos de cada pago siguen siendo la prueba de cada semana.</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Desde el mes</Label><Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} /></div>
          <div><Label>Meses</Label><Input type="number" min="1" max="12" value={months} onChange={(e) => setMonths(e.target.value)} /></div>
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th>Mes</th><th className="text-right">Sueldo</th><th className="text-right">Finiquito</th><th className="text-right">Neto</th></tr></thead>
          <tbody>
            {byMonth.map((r) => (
              <tr key={r.label} className="border-t"><td className="py-1">{r.label}</td><td className="text-right">{formatMoney(r.salary)}</td><td className="text-right">{formatMoney(r.finiquito)}</td><td className="text-right">{formatMoney(r.net)}</td></tr>
            ))}
          </tbody>
        </table>
        <Button onClick={print} disabled={data.isLoading}><Printer className="h-4 w-4 mr-1" /> Imprimir constancia</Button>
      </Card>
    </div>
  );
}

/* ---------------- Finiquito y formato de renuncia ---------------- */
export function SeparationTab({ emp }: { emp: any }) {
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [pendingSalaryDays, setPendingSalaryDays] = useState("0");
  const [vacDays, setVacDays] = useState("");

  const year = Number(endDate.slice(0, 4));
  const paid = useQuery({
    queryKey: ["hr-finiquito-paid", emp.id, year],
    queryFn: async () => {
      const { data } = await db("payroll_payments").select("vacation_amount,vacation_premium,christmas_bonus").eq("employee_id", emp.id).gte("paid_at", `${year}-01-01`).lte("paid_at", `${year}-12-31`);
      return (data ?? []) as any[];
    },
  });

  const daily = n(emp.salary);
  const hire = emp.hire_date as string | null;
  const end = new Date(endDate + "T00:00:00");
  const jan1 = new Date(year, 0, 1);
  const startOfYear = hire && new Date(hire + "T00:00:00") > jan1 ? new Date(hire + "T00:00:00") : jan1;
  const aguinaldoDays = Math.max(0, Math.min(365, Math.floor((end.getTime() - startOfYear.getTime()) / 86400000) + 1));
  const aguinaldo = Math.round(daily * 15 * (aguinaldoDays / 365) * 100) / 100;

  const entitled = entitledDays(hire, end);
  const lastAnniv = (() => {
    if (!hire) return jan1;
    const h = new Date(hire + "T00:00:00");
    const a = new Date(end.getFullYear(), h.getMonth(), h.getDate());
    return a > end ? new Date(end.getFullYear() - 1, h.getMonth(), h.getDate()) : a;
  })();
  const sinceAnniv = Math.max(0, Math.floor((end.getTime() - lastAnniv.getTime()) / 86400000) + 1);
  const suggestedVac = Math.round(entitled * (sinceAnniv / 365) * 100) / 100;
  const vd = vacDays === "" ? suggestedVac : n(vacDays);
  const vacation = Math.round(daily * vd * 100) / 100;
  const premium = Math.round(vacation * 0.25 * 100) / 100;
  const salary = Math.round(daily * n(pendingSalaryDays) * 100) / 100;

  const advance = (paid.data ?? []).reduce((s, p) => s + n(p.vacation_amount) + n(p.vacation_premium) + n(p.christmas_bonus), 0);
  const gross = salary + aguinaldo + vacation + premium;
  const total = Math.max(0, gross - advance);

  const printFiniquito = () => {
    const html = `<h1>${COMPANY}</h1><p class="muted">Recibo de finiquito · terminación de la relación de trabajo el ${formatDateShort(endDate)}</p>
<p><b>${esc(emp.name)}</b>${emp.position ? ` · ${esc(emp.position)}` : ""}<br/>Ingreso: ${hire ? formatDateShort(hire) : "—"} · Sueldo diario: ${formatMoney(daily)}</p>
<table><tr><th>Concepto</th><th class="n">Importe</th></tr>
<tr><td>Salario pendiente (${n(pendingSalaryDays)} días)</td><td class="n">${formatMoney(salary)}</td></tr>
<tr><td>Aguinaldo proporcional (${aguinaldoDays} días del año)</td><td class="n">${formatMoney(aguinaldo)}</td></tr>
<tr><td>Vacaciones pendientes (${vd} días)</td><td class="n">${formatMoney(vacation)}</td></tr>
<tr><td>Prima vacacional (25 %)</td><td class="n">${formatMoney(premium)}</td></tr>
<tr><th>Suma</th><th class="n">${formatMoney(gross)}</th></tr>
<tr><td>Menos: finiquito ya pagado en el año</td><td class="n">- ${formatMoney(advance)}</td></tr>
<tr><th>Total a pagar</th><th class="n">${formatMoney(total)}</th></tr></table>
<p>Recibo la cantidad señalada por concepto de finiquito, y declaro que ${COMPANY} no me adeuda cantidad alguna por salarios, aguinaldo, vacaciones, prima vacacional u otras prestaciones, salvo lo aquí asentado.</p>
<div class="sign"><div>${esc(emp.name)}<br/>Empleada</div><div>${COMPANY}<br/>Patrón</div></div><p class="muted">Lugar y fecha: ______________________________</p>`;
    if (!printHtml(`Finiquito ${emp.name}`, html)) toast.error("Permite las ventanas emergentes para imprimir");
  };

  const printResignation = () => {
    const html = `<h1>Carta de renuncia</h1><p class="muted">Lugar y fecha: ______________________________</p>
<p>A ${COMPANY}:</p>
<p>Por medio de la presente, yo <b>${esc(emp.name)}</b>, manifiesto que de manera libre y voluntaria renuncio al empleo que desempeño${emp.position ? ` como ${esc(emp.position)}` : ""}, con efectos a partir del ____ de ______________ de ________.</p>
<p>Agradezco la oportunidad brindada y manifiesto que recibiré el pago de mi finiquito conforme a la ley.</p>
<div class="sign"><div>${esc(emp.name)}<br/>Firma</div></div>
<p class="muted">Este formato solo debe llenarse y firmarse en el momento en que la persona decida renunciar.</p>`;
    if (!printHtml(`Renuncia ${emp.name}`, html)) toast.error("Permite las ventanas emergentes para imprimir");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Finiquito</h3>
        <p className="text-xs text-muted-foreground">Se calcula con su sueldo diario ({formatMoney(daily)}) y su fecha de ingreso. Revisa los datos antes de imprimir.</p>
        <div className="grid grid-cols-3 gap-2">
          <div><Label>Último día</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div><Label>Días de sueldo pendientes</Label><Input type="number" value={pendingSalaryDays} onChange={(e) => setPendingSalaryDays(e.target.value)} /></div>
          <div><Label>Días de vacaciones</Label><Input type="number" step="0.5" placeholder={String(suggestedVac)} value={vacDays} onChange={(e) => setVacDays(e.target.value)} /></div>
        </div>
        <div className="text-sm divide-y border rounded-md">
          {[["Salario pendiente", salary], [`Aguinaldo proporcional (${aguinaldoDays} días)`, aguinaldo], [`Vacaciones (${vd} días)`, vacation], ["Prima vacacional 25 %", premium], ["Menos: finiquito ya pagado este año", -advance]].map(([k, v]) => (
            <div key={k as string} className="flex justify-between px-3 py-1.5"><span className="text-muted-foreground">{k}</span><span className="font-numeric">{formatMoney(v as number)}</span></div>
          ))}
          <div className="flex justify-between px-3 py-2 font-semibold"><span>Total a pagar</span><span className="font-numeric">{formatMoney(total)}</span></div>
        </div>
        <Button onClick={printFiniquito}><Printer className="h-4 w-4 mr-1" /> Imprimir finiquito</Button>
      </Card>
      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-sm">Formato de renuncia</h3>
        <p className="text-xs text-muted-foreground">En blanco, sin fecha. Úsalo solo cuando la empleada decida renunciar; una firmada por adelantado no es válida.</p>
        <Button variant="outline" onClick={printResignation}><Printer className="h-4 w-4 mr-1" /> Imprimir formato</Button>
      </Card>
    </div>
  );
}
