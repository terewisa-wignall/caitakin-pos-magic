/**
 * Cálculos de nómina y finiquito conforme a la LFT (reforma 2023).
 * Funciones puras: reciben números y regresan números redondeados a 2 decimales.
 */

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Días de vacaciones por año según antigüedad (reforma 2023). */
export function vacationDaysBySeniority(years: number): number {
  if (years < 1) return 0;
  if (years === 1) return 12;
  if (years === 2) return 14;
  if (years === 3) return 16;
  if (years === 4) return 18;
  if (years === 5) return 20;
  if (years <= 10) return 22;
  return 22 + 2 * Math.floor((years - 6) / 5);
}

export function yearsOfService(hireDate?: string | null, at: Date = new Date()): number {
  if (!hireDate) return 0;
  const h = new Date(hireDate + "T00:00:00");
  if (isNaN(h.getTime())) return 0;
  let years = at.getFullYear() - h.getFullYear();
  const beforeAnniversary =
    at.getMonth() < h.getMonth() || (at.getMonth() === h.getMonth() && at.getDate() < h.getDate());
  if (beforeAnniversary) years--;
  return Math.max(0, years);
}

/** Días transcurridos del año en curso desde el 1 de enero (o desde el ingreso si fue este año). */
export function daysAccruedThisYear(hireDate: string | null | undefined, upTo: string): number {
  const end = new Date(upTo + "T00:00:00");
  if (isNaN(end.getTime())) return 0;
  const jan1 = new Date(end.getFullYear(), 0, 1);
  let start = jan1;
  if (hireDate) {
    const h = new Date(hireDate + "T00:00:00");
    if (!isNaN(h.getTime()) && h > jan1) start = h;
  }
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(0, Math.min(365, diff));
}

/** Aguinaldo: 15 días de salario al año, proporcional a los días trabajados del año. */
export function christmasBonus(dailyRate: number, accruedDays: number, daysPerYear = 15): number {
  return round2((Number(dailyRate) || 0) * daysPerYear * (accruedDays / 365));
}

/** Vacaciones proporcionales del año en curso, en días. */
export function proportionalVacationDays(hireDate: string | null | undefined, upTo: string): number {
  const years = yearsOfService(hireDate, new Date(upTo + "T00:00:00"));
  const entitled = vacationDaysBySeniority(years);
  if (entitled === 0) {
    // Primer año: proporcional a 12 días.
    const accrued = daysAccruedThisYear(hireDate, upTo);
    return round2(12 * (accrued / 365));
  }
  const accrued = daysAccruedThisYear(hireDate, upTo);
  return round2(entitled * (accrued / 365));
}

export type PayrollInput = {
  dailyRate: number;
  daysWorked: number;
  vacationDays: number;
  /** 0.25 = 25% de prima vacacional */
  vacationPremiumRate?: number;
  christmasBonus: number;
  bonus: number;
  severance: number;
  imss: number;
  infonavit: number;
  loan: number;
  otherDeductions: number;
  /** Festivos trabajados: la ley manda pagar el doble EXTRA (2 × sueldo por cada uno). */
  holidayDays?: number;
  /** Días dobles: se paga un día más (1 × sueldo por cada uno). */
  doubleDays?: number;
};

export type PayrollTotals = {
  salary: number;
  holidayPay: number;
  doublePay: number;
  vacationAmount: number;
  vacationPremium: number;
  christmasBonus: number;
  bonus: number;
  severance: number;
  grossTotal: number;
  imss: number;
  infonavit: number;
  loan: number;
  otherDeductions: number;
  deductionsTotal: number;
  net: number;
};

export function computePayroll(input: PayrollInput): PayrollTotals {
  const rate = Number(input.dailyRate) || 0;
  const salary = round2(rate * (Number(input.daysWorked) || 0));
  const vacationAmount = round2(rate * (Number(input.vacationDays) || 0));
  const vacationPremium = round2(vacationAmount * (input.vacationPremiumRate ?? 0.25));
  const aguinaldo = round2(input.christmasBonus);
  const bonus = round2(input.bonus);
  const severance = round2(input.severance);
  const holidayPay = round2(rate * 2 * (Number(input.holidayDays) || 0));
  const doublePay = round2(rate * (Number(input.doubleDays) || 0));
  const grossTotal = round2(salary + holidayPay + doublePay + vacationAmount + vacationPremium + aguinaldo + bonus + severance);

  const imss = round2(input.imss);
  const infonavit = round2(input.infonavit);
  const loan = round2(input.loan);
  const otherDeductions = round2(input.otherDeductions);
  const deductionsTotal = round2(imss + infonavit + loan + otherDeductions);

  return {
    salary,
    holidayPay,
    doublePay,
    vacationAmount,
    vacationPremium,
    christmasBonus: aguinaldo,
    bonus,
    severance,
    grossTotal,
    imss,
    infonavit,
    loan,
    otherDeductions,
    deductionsTotal,
    net: round2(Math.max(0, grossTotal - deductionsTotal)),
  };
}

/** Lista de fechas (YYYY-MM-DD) entre dos fechas inclusive. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return out;
  const cur = new Date(s);
  while (cur <= e && out.length < 400) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const WEEKDAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];

export function weekdayOf(iso: string): number {
  return new Date(iso + "T00:00:00").getDay();
}

/** Días que dura el periodo según cómo se le paga. */
export function periodLengthFor(frequency?: string | null, start?: string): number {
  if (frequency === "daily") return 1;
  if (frequency === "biweekly") return 15;
  if (frequency === "monthly") {
    if (start) {
      const d = new Date(start + "T00:00:00");
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    }
    return 30;
  }
  return 7;
}

/** Periodo consecutivo: arranca al día siguiente del último pagado. */
export function nextPeriod(lastEnd: string | null | undefined, frequency?: string | null, today?: string) {
  const base = today ?? new Date().toISOString().slice(0, 10);
  const start = lastEnd ? addDays(lastEnd, 1) : addDays(base, -(periodLengthFor(frequency) - 1));
  const len = periodLengthFor(frequency, start);
  return { start, end: addDays(start, len - 1) };
}

export function shiftPeriod(start: string, end: string, delta: number) {
  const len = dateRange(start, end).length || 1;
  const newStart = addDays(start, delta * len);
  return { start: newStart, end: addDays(newStart, len - 1) };
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Semana del 11 al 17 de septiembre" */
export function periodLabel(start: string, end: string, frequency?: string | null): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "Periodo";
  const noun =
    frequency === "daily" ? "Día" : frequency === "biweekly" ? "Quincena" : frequency === "monthly" ? "Mes" : "Semana";
  if (frequency === "daily" || start === end) {
    return `${noun} ${s.getDate()} de ${MONTHS_ES[s.getMonth()]}`;
  }
  const sameMonth = s.getMonth() === e.getMonth();
  return sameMonth
    ? `${noun} del ${s.getDate()} al ${e.getDate()} de ${MONTHS_ES[e.getMonth()]}`
    : `${noun} del ${s.getDate()} de ${MONTHS_ES[s.getMonth()]} al ${e.getDate()} de ${MONTHS_ES[e.getMonth()]}`;
}

/** ¿El periodo se cruza con alguno ya pagado? */
export function findOverlap(
  start: string,
  end: string,
  periods: { id?: string; period_start: string; period_end: string }[],
  ignoreId?: string,
) {
  return periods.find(
    (p) => p.id !== ignoreId && p.period_start <= end && p.period_end >= start,
  );
}

/** Último aniversario de ingreso (YYYY-MM-DD) en o antes de `at`. Las vacaciones se ganan por año de servicio, no por año calendario. */
export function lastAnniversary(hireDate: string | null | undefined, at: Date = new Date()): string | null {
  if (!hireDate) return null;
  const h = new Date(hireDate + "T00:00:00");
  if (isNaN(h.getTime())) return null;
  let a = new Date(at.getFullYear(), h.getMonth(), h.getDate());
  if (a > at) a = new Date(at.getFullYear() - 1, h.getMonth(), h.getDate());
  if (a < h) a = h;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`;
}

/** Ventanas de los últimos `count` años de servicio: del aniversario al día anterior al siguiente. */
export function serviceYearWindows(hireDate: string | null | undefined, at: Date, count = 3) {
  const last = lastAnniversary(hireDate, at);
  if (!last) return [];
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const out: { start: string; end: string; years: number }[] = [];
  const h = new Date(hireDate + "T00:00:00");
  let start = new Date(last + "T00:00:00");
  for (let i = 0; i < count; i++) {
    const next = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    out.unshift({ start: iso(start), end: iso(new Date(next.getTime() - 86400000)), years: yearsOfService(hireDate, start) });
    start = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    if (start < h) break;
  }
  return out;
}

/** Cuota de Infonavit por bimestre repartida por días: monto ÷ días del bimestre × días del periodo. */
export function infonavitForPeriod(bimonthlyAmount: number, periodStart: string, periodEnd: string): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  let total = 0;
  const cur = new Date(periodStart + "T00:00:00");
  const end = new Date(periodEnd + "T00:00:00");
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) return 0;
  const cache = new Map<string, number>();
  while (cur <= end) {
    const m0 = cur.getMonth() - (cur.getMonth() % 2);
    const key = `${cur.getFullYear()}-${pad(m0 + 1)}`;
    if (!cache.has(key)) {
      const first = new Date(cur.getFullYear(), m0, 1);
      const last = new Date(cur.getFullYear(), m0 + 2, 0);
      cache.set(key, Math.round((last.getTime() - first.getTime()) / 86400000) + 1);
    }
    total += bimonthlyAmount / cache.get(key)!;
    cur.setDate(cur.getDate() + 1);
  }
  return round2(total);
}

/** Texto que explica el descuento de Infonavit por bimestre: "$2,651.42 por bimestre ÷ 61 días = $43.47 por día × 7 días". */
export function infonavitExplain(bimonthlyAmount: number, periodStart: string, periodEnd: string): string | null {
  const s = new Date(periodStart + "T00:00:00");
  const e = new Date(periodEnd + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return null;
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const bim = (d: Date) => d.getFullYear() * 10 + Math.floor(d.getMonth() / 2);
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const total = infonavitForPeriod(bimonthlyAmount, periodStart, periodEnd);
  if (bim(s) !== bim(e)) return `Infonavit: ${money(bimonthlyAmount)} por bimestre repartido por días × ${days} días = ${money(total)}`;
  const m0 = s.getMonth() - (s.getMonth() % 2);
  const bimDays = Math.round((new Date(s.getFullYear(), m0 + 2, 0).getTime() - new Date(s.getFullYear(), m0, 1).getTime()) / 86400000) + 1;
  return `Infonavit: ${money(bimonthlyAmount)} por bimestre ÷ ${bimDays} días = ${money(bimonthlyAmount / bimDays)} por día × ${days} días = ${money(total)}`;
}

/** Infonavit repartido por días PAGADOS: por cada fecha, cuota del bimestre ÷ días de ese bimestre. */
export function infonavitForDates(bimonthlyAmount: number, dates: string[]): number {
  const cache = new Map<string, number>();
  let total = 0;
  for (const iso of dates) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) continue;
    const m0 = d.getMonth() - (d.getMonth() % 2);
    const key = `${d.getFullYear()}-${m0}`;
    if (!cache.has(key)) {
      cache.set(key, Math.round((new Date(d.getFullYear(), m0 + 2, 0).getTime() - new Date(d.getFullYear(), m0, 1).getTime()) / 86400000) + 1);
    }
    total += bimonthlyAmount / cache.get(key)!;
  }
  return round2(total);
}

/** Texto: "$2,651.42 por bimestre ÷ 61 días = $43.47 por día × 7 días pagados = $304.26". */
export function infonavitExplainDates(bimonthlyAmount: number, dates: string[]): string | null {
  if (!dates.length) return null;
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const total = infonavitForDates(bimonthlyAmount, dates);
  const d = new Date(dates[0] + "T00:00:00");
  const m0 = d.getMonth() - (d.getMonth() % 2);
  const bimDays = Math.round((new Date(d.getFullYear(), m0 + 2, 0).getTime() - new Date(d.getFullYear(), m0, 1).getTime()) / 86400000) + 1;
  return `Infonavit: ${money(bimonthlyAmount)} por bimestre ÷ ${bimDays} días = ${money(bimonthlyAmount / bimDays)} por día × ${dates.length} días pagados = ${money(total)}`;
}
