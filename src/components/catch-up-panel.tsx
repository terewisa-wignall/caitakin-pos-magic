import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { christmasBonus, daysAccruedThisYear, lastAnniversary, vacationDaysBySeniority, yearsOfService } from "@/lib/payroll-calc";

const db = supabase.from as any;
const n = (v: unknown) => Number(v) || 0;
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Item = { empId?: string; text: string; to: "expediente" | "costo" };

/** Panel "Poner al día": solo lee y señala lo que falta; no modifica nada. */
export function CatchUpPanel({ year }: { year: number }) {
  const q = useQuery({
    queryKey: ["catch-up", year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const [emps, docs, vac, pay, loans, employer] = await Promise.all([
        db("employees").select("id,name,salary,hire_date").eq("is_active", true).order("name"),
        db("employee_documents").select("employee_id,doc_type,created_at").eq("doc_type", "contract"),
        db("vacation_records").select("employee_id,days,start_date,status").gte("start_date", `${year - 1}-01-01`),
        db("payroll_payments").select("employee_id,vacation_days,christmas_bonus,paid_at").gte("paid_at", start).lte("paid_at", end),
        db("employee_loans").select("employee_id,balance,status").eq("status", "active"),
        db("employer_payments").select("kind,period,paid_at"),
      ]);
      return {
        emps: (emps.data ?? []) as any[],
        docs: (docs.data ?? []) as any[],
        vac: (vac.data ?? []) as any[],
        pay: (pay.data ?? []) as any[],
        loans: (loans.data ?? []) as any[],
        employer: (employer.data ?? []) as any[],
      };
    },
  });

  if (q.isLoading) return null;
  if (q.isError || !q.data) return null;
  const d = q.data;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);
  const items: Item[] = [];

  for (const e of d.emps) {
    // Contrato del mes
    const hasContract = d.docs.some((x) => x.employee_id === e.id && String(x.created_at).slice(0, 7) === monthKey);
    if (!hasContract) items.push({ empId: e.id, to: "expediente", text: `${e.name}: falta el contrato de ${MONTHS[now.getMonth()]}` });

    // Vacaciones
    const entitled = vacationDaysBySeniority(yearsOfService(e.hire_date, now)) || 12;
    const since = lastAnniversary(e.hire_date, now) ?? `${year}-01-01`;
    const taken = d.vac.filter((v) => v.employee_id === e.id && v.status !== "cancelled" && String(v.start_date) >= since).reduce((s, v) => s + n(v.days), 0);
    const paidDays = d.pay.filter((p) => p.employee_id === e.id && String(p.paid_at ?? "") >= since).reduce((s, p) => s + n(p.vacation_days), 0);
    if (taken < entitled && paidDays < entitled) {
      items.push({ empId: e.id, to: "expediente", text: `${e.name}: vacaciones sin registrar (le tocan ${entitled}, registradas ${Math.max(taken, paidDays)})` });
    }

    // Aguinaldo
    const owed = christmasBonus(n(e.salary), daysAccruedThisYear(e.hire_date, today));
    const paidAg = d.pay.filter((p) => p.employee_id === e.id).reduce((s, p) => s + n(p.christmas_bonus), 0);
    if (owed - paidAg > 1) items.push({ empId: e.id, to: "expediente", text: `${e.name}: aguinaldo acumulado sin pagar ${formatMoney(owed - paidAg)}` });

    // Préstamos y Infonavit
    const loanBalance = d.loans.filter((l) => l.employee_id === e.id).reduce((s, l) => s + n(l.balance), 0);
    if (loanBalance > 0) items.push({ empId: e.id, to: "expediente", text: `${e.name}: préstamo con saldo ${formatMoney(loanBalance)}` });
  }

  // IMSS y 4%: meses ya terminados de este año sin pago registrado
  const lastClosed = year === now.getFullYear() ? now.getMonth() : 12; // meses 0..lastClosed-1
  for (let m = 0; m < lastClosed; m++) {
    const period = `${year}-${String(m + 1).padStart(2, "0")}-01`;
    for (const [kind, label] of [["imss", "IMSS/Infonavit"], ["nomina_4pct", "4% nómina"]] as const) {
      const paid = d.employer.some((x) => x.kind === kind && x.period === period && x.paid_at);
      if (!paid) items.push({ to: "costo", text: `${label} de ${MONTHS[m]} sin pago registrado` });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">Poner al día</h2>
        <span className="text-xs text-muted-foreground">{items.length ? `${items.length} pendientes` : "Todo al día"}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> No falta nada.</p>
      ) : (
        <ul className="divide-y max-h-80 overflow-y-auto">
          {items.map((it, i) => (
            <li key={i} className="py-2 flex items-start gap-2 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <span className="flex-1">{it.text}</span>
              {it.empId && (
                <Link to="/app/hr/$employeeId" params={{ employeeId: it.empId }} className="text-xs text-primary shrink-0">Abrir</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
