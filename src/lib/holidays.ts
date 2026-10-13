/** Días de descanso obligatorio (Ley Federal del Trabajo, art. 74). */
export type Holiday = { date: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Día del mes del n-ésimo lunes (1 = primero, 3 = tercero). */
function nthMonday(year: number, month: number, nth: number) {
  const first = new Date(year, month, 1).getDay(); // 0 = domingo
  const firstMonday = 1 + ((8 - first) % 7);
  return firstMonday + 7 * (nth - 1);
}

export function legalHolidays(year: number): Holiday[] {
  const list: Holiday[] = [
    { date: iso(year, 0, 1), name: "Año Nuevo" },
    { date: iso(year, 1, nthMonday(year, 1, 1)), name: "Día de la Constitución" },
    { date: iso(year, 2, nthMonday(year, 2, 3)), name: "Natalicio de Benito Juárez" },
    { date: iso(year, 4, 1), name: "Día del Trabajo" },
    { date: iso(year, 8, 16), name: "Día de la Independencia" },
    { date: iso(year, 10, nthMonday(year, 10, 3)), name: "Día de la Revolución" },
    { date: iso(year, 11, 25), name: "Navidad" },
  ];
  // 1 de diciembre cada 6 años, por el cambio de gobierno federal (2024, 2030, 2036…)
  if (year >= 2024 && (year - 2024) % 6 === 0) list.push({ date: iso(year, 11, 1), name: "Transmisión del Poder Ejecutivo" });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function holidayOn(date: string): Holiday | undefined {
  return legalHolidays(Number(date.slice(0, 4))).find((h) => h.date === date);
}

/** Próximo festivo desde `from` (incluido), con los días que faltan. */
export function nextHoliday(from: Date = new Date()): (Holiday & { inDays: number }) | null {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (const y of [start.getFullYear(), start.getFullYear() + 1]) {
    for (const h of legalHolidays(y)) {
      const d = new Date(h.date + "T00:00:00");
      if (d >= start) return { ...h, inDays: Math.round((d.getTime() - start.getTime()) / 86400000) };
    }
  }
  return null;
}
