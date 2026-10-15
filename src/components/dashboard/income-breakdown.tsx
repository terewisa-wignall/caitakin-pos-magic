import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";

// Envuelto en función: pasar supabase.from suelto pierde su `this` y falla.
const db = (table: string) => (supabase as any).from(table);

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Item = { id: string; label: string; detail: string; date: string; amount: number };
type Section = { key: string; title: string; items: Item[]; total: number };

const pad = (n: number) => String(n).padStart(2, "0");
const shortDate = (d: string) => {
  const [, m, day] = d.slice(0, 10).split("-");
  return m && day ? `${day}/${m}` : d;
};
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Mismas fuentes y mismo rango de fechas que el total "Ingresos del mes" de Inicio.
function useIncomeBreakdown(year: number, month: number, enabled: boolean) {
  return useQuery({
    queryKey: ["income-breakdown", year, month],
    enabled,
    queryFn: async (): Promise<Section[]> => {
      const startDate = `${year}-${pad(month + 1)}-01`;
      const endDate = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();

      const [orders, cash, other] = await Promise.all([
        db("orders").select("id,total,created_at").gte("created_at", start).lt("created_at", end),
        db("cash_movements").select("id,concept,amount,created_at").eq("type", "income").gte("created_at", start).lt("created_at", end),
        db("other_incomes").select("id,concept,amount,income_date").gte("income_date", startDate).lte("income_date", endDate),
      ]);

      const byDateDesc = (a: Item, b: Item) => b.date.localeCompare(a.date);
      const make = (key: string, title: string, items: Item[]): Section => ({
        key,
        title,
        items: items.sort(byDateDesc),
        total: items.reduce((s, i) => s + i.amount, 0),
      });

      // Las ventas se agrupan por día para que la lista sea corta.
      const perDay = new Map<string, { count: number; amount: number }>();
      (orders.data ?? []).forEach((o: any) => {
        const day = localDay(o.created_at);
        const cur = perDay.get(day) ?? { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += Number(o.total || 0);
        perDay.set(day, cur);
      });

      return [
        make("orders", "Ventas", Array.from(perDay.entries()).map(([day, v]) => ({
          id: day,
          label: `${v.count} ${v.count === 1 ? "venta" : "ventas"}`,
          detail: "",
          date: day,
          amount: v.amount,
        }))),
        make("cash", "Entradas de caja", (cash.data ?? []).map((r: any) => ({
          id: r.id,
          label: r.concept,
          detail: "Caja",
          date: localDay(r.created_at),
          amount: Number(r.amount || 0),
        }))),
        make("other", "Otros ingresos", (other.data ?? []).map((r: any) => ({
          id: r.id,
          label: r.concept,
          detail: "",
          date: r.income_date,
          amount: Number(r.amount || 0),
        }))),
      ].filter((s) => s.items.length > 0);
    },
  });
}

export function IncomeBreakdownDialog({
  open,
  onOpenChange,
  year,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
}) {
  const q = useIncomeBreakdown(year, month, open);
  const sections = q.data ?? [];
  const total = sections.reduce((s, x) => s + x.total, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ingresos de {MONTHS[month]} {year}</DialogTitle>
        </DialogHeader>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : q.isError ? (
          <p className="text-sm text-destructive">No se pudo cargar el desglose.</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ingresos este mes.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-baseline justify-between border-b pb-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold font-numeric">{formatMoney(total)}</span>
            </div>
            {sections.map((sec) => (
              <section key={sec.key}>
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-semibold">{sec.title}</h3>
                  <span className="font-semibold font-numeric">{formatMoney(sec.total)}</span>
                </div>
                <ul className="divide-y text-sm">
                  {sec.items.map((it) => (
                    <li key={it.id} className="flex items-start justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate">{it.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {shortDate(it.date)}{it.detail ? ` · ${it.detail}` : ""}
                        </p>
                      </div>
                      <span className="font-numeric shrink-0">{formatMoney(it.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
