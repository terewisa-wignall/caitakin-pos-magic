import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";

// Envuelto en función: pasar supabase.from suelto pierde su `this` y falla.
const db = (table: string) => (supabase as any).from(table);

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TYPE_LABEL: Record<string, string> = { fixed: "Fijo", variable: "Variable", unexpected: "Imprevisto" };

type Item = { id: string; label: string; detail: string; date: string; amount: number };
type Section = { key: string; title: string; items: Item[]; total: number };

const pad = (n: number) => String(n).padStart(2, "0");
const shortDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}` : d;
};

// Mismas fuentes y mismo rango de fechas que el total "Egresos del mes" de Inicio.
function useExpensesBreakdown(year: number, month: number, enabled: boolean) {
  return useQuery({
    queryKey: ["expenses-breakdown", year, month],
    enabled,
    queryFn: async (): Promise<Section[]> => {
      const startDate = `${year}-${pad(month + 1)}-01`;
      const endDate = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();

      const [expenses, cash, payroll, comm] = await Promise.all([
        db("expenses").select("id,concept,amount,type,category,expense_date").gte("expense_date", startDate).lte("expense_date", endDate),
        db("cash_movements").select("id,concept,amount,created_at").eq("type", "expense").gte("created_at", start).lt("created_at", end),
        db("payroll_payments").select("id,amount,paid_at,period_start,period_end,employee:employees(name)").gte("paid_at", startDate).lte("paid_at", endDate),
        db("commission_payments").select("id,total_amount,paid_at,cutoff_label,seller:profiles(name)").gte("paid_at", startDate).lte("paid_at", endDate),
      ]);

      const byDateDesc = (a: Item, b: Item) => b.date.localeCompare(a.date);
      const make = (key: string, title: string, items: Item[]): Section => ({
        key,
        title,
        items: items.sort(byDateDesc),
        total: items.reduce((s, i) => s + i.amount, 0),
      });

      return [
        make("payroll", "Nómina", (payroll.data ?? []).map((r: any) => ({
          id: r.id,
          label: r.employee?.name ?? "Empleada",
          detail: `Periodo ${shortDate(r.period_start)} al ${shortDate(r.period_end)}`,
          date: r.paid_at,
          amount: Number(r.amount || 0),
        }))),
        make("expenses", "Gastos", (expenses.data ?? []).map((r: any) => ({
          id: r.id,
          label: r.concept,
          detail: [TYPE_LABEL[r.type] ?? r.type, r.category].filter(Boolean).join(" · "),
          date: r.expense_date,
          amount: Number(r.amount || 0),
        }))),
        make("cash", "Salidas de caja", (cash.data ?? []).map((r: any) => ({
          id: r.id,
          label: r.concept,
          detail: "Caja",
          date: r.created_at,
          amount: Number(r.amount || 0),
        }))),
        make("commissions", "Comisiones pagadas", (comm.data ?? []).map((r: any) => ({
          id: r.id,
          label: r.seller?.name ?? "Vendedora",
          detail: r.cutoff_label ?? "",
          date: r.paid_at,
          amount: Number(r.total_amount || 0),
        }))),
      ].filter((s) => s.items.length > 0);
    },
  });
}

export function ExpensesBreakdownDialog({
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
  const q = useExpensesBreakdown(year, month, open);
  const sections = q.data ?? [];
  const total = sections.reduce((s, x) => s + x.total, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Egresos de {MONTHS[month]} {year}</DialogTitle>
        </DialogHeader>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : q.isError ? (
          <p className="text-sm text-destructive">No se pudo cargar el desglose.</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay egresos este mes.</p>
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
