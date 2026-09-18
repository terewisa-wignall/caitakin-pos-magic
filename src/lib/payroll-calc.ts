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
};

export type PayrollTotals = {
  salary: number;
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
  const grossTotal = round2(salary + vacationAmount + vacationPremium + aguinaldo + bonus + severance);

  const imss = round2(input.imss);
  const infonavit = round2(input.infonavit);
  const loan = round2(input.loan);
  const otherDeductions = round2(input.otherDeductions);
  const deductionsTotal = round2(imss + infonavit + loan + otherDeductions);

  return {
    salary,
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
