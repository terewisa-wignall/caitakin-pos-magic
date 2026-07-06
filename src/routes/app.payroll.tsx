import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calculator, Download, FileText, Plus, Printer } from "lucide-react";
import { formatMoney, formatDateShort } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/payroll")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mi nómina · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: MyPayrollPage,
});

function dailyRateFromEmployee(emp: any) {
  return Number(emp?.salary || 0);
}

function labelFreq(f?: string | null) {
  return { daily: "diario", weekly: "semanal", biweekly: "quincenal", monthly: "mensual" }[f ?? ""] ?? f;
}

function MyPayrollPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const employee = useQuery({
    queryKey: ["my-employee", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("profile_id", user?.id ?? "")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const payments = useQuery({
    queryKey: ["my-payroll", employee.data?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("*")
        .eq("employee_id", employee.data?.id ?? "")
        .order("paid_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employee.data?.id,
  });

  const yearTotal = useMemo(() => {
    const y = new Date().getFullYear();
    return (payments.data ?? [])
      .filter((p: any) => new Date(p.paid_at).getFullYear() === y)
      .reduce((s: number, p: any) => s + Number(p.amount), 0);
  }, [payments.data]);

  if (employee.isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Cargando nómina...</div>;
  }

  if (!employee.data) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card className="p-6 text-center space-y-2">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Mi nómina</h1>
          <p className="text-sm text-muted-foreground">
            Tu usuario todavía no está vinculado a una empleada de RRHH. Una administradora debe abrir RRHH, editar tu empleada y seleccionar tu usuario.
          </p>
        </Card>
      </div>
    );
  }

  const emp = employee.data;
  const dailyRate = dailyRateFromEmployee(emp);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Mi nómina</h1>
          <p className="text-sm text-muted-foreground truncate">{emp.name} · {emp.position || "Sin puesto"}</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Generar</Button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Sueldo por día</p>
          <p className="text-lg font-bold font-numeric">{formatMoney(Number(emp.salary))}</p>
          <p className="text-[11px] text-muted-foreground">base de cálculo</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Se paga</p>
          <p className="text-lg font-bold">{labelFreq(emp.frequency)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Este año</p>
          <p className="text-lg font-bold font-numeric">{formatMoney(yearTotal)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Recibos guardados</h2>
        <div className="space-y-2">
          {(payments.data ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
              <div className="min-w-0">
                <p className="font-medium">{formatMoney(Number(p.amount))}</p>
                <p className="text-xs text-muted-foreground">{formatDateShort(p.paid_at)} · {formatDateShort(p.period_start)} - {formatDateShort(p.period_end)}</p>
                {p.receipt_number && <p className="text-[11px] text-muted-foreground">{p.receipt_number}</p>}
              </div>
              <div className="flex items-center gap-1">
                {p.created_by === user?.id && <Badge variant="outline" className="text-[10px]">Generado por mí</Badge>}
                <Button size="sm" variant="outline" onClick={() => setReceipt(p)}><Printer className="h-3.5 w-3.5 mr-1" /> PDF</Button>
              </div>
            </div>
          ))}
          {(payments.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Todavía no hay recibos.</p>}
        </div>
      </Card>

      <PayrollSelfDialog
        open={open}
        emp={emp}
        dailyRate={dailyRate}
        onClose={() => setOpen(false)}
        onSaved={(payment) => {
          setReceipt(payment);
          qc.invalidateQueries({ queryKey: ["my-payroll", emp.id] });
        }}
      />
      <ReceiptDialog open={!!receipt} payment={receipt} emp={emp} onClose={() => setReceipt(null)} />
    </div>
  );
}

function PayrollSelfDialog({
  open,
  emp,
  dailyRate,
  onClose,
  onSaved,
}: {
  open: boolean;
  emp: any;
  dailyRate: number;
  onClose: () => void;
  onSaved: (payment: any) => void;
}) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [paidAt, setPaidAt] = useState(today);
  const [daysWorked, setDaysWorked] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const salaryBase = dailyRate * (Number(daysWorked) || 0);
  const net = Math.max(0, salaryBase);

  const save = async () => {
    if (!daysWorked || Number(daysWorked) <= 0) { toast.error("Captura días trabajados"); return; }
    setSaving(true);
    const receiptNumber = `NOM-${new Date(paidAt).getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase
      .from("payroll_payments")
      .insert({
        employee_id: emp.id,
        period_start: periodStart,
        period_end: periodEnd,
        paid_at: paidAt,
        days_worked: Number(daysWorked),
        daily_rate: dailyRate,
        gross_amount: salaryBase,
        amount: net,
        payment_method: "pendiente",
        note: note || null,
        receipt_number: receiptNumber,
        created_by: user?.id,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Recibo generado y guardado");
    setDaysWorked("");
    setNote("");
    onClose();
    onSaved(data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generar recibo de nómina</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Periodo inicio</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
            <div><Label>Periodo fin</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          </div>
          <div><Label>Fecha del recibo</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          <Card className="p-3 bg-muted/40 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Calculator className="h-4 w-4" /> Cálculo</div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Días trabajados</Label><Input type="number" step="0.5" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} /></div>
              <div><Label>Sueldo por día</Label><Input value={formatMoney(dailyRate)} disabled /></div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total del recibo</span>
              <span className="font-bold text-primary">{formatMoney(net)}</span>
            </div>
          </Card>
          <div><Label>Nota para administración</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Semana del lunes al domingo" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar recibo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function receiptHtml(payment: any, emp: any) {
  const salaryBase = (Number(payment.daily_rate) || 0) * (Number(payment.days_worked) || 0);
  const deductions = (Number(payment.imss_deduction) || 0) + (Number(payment.infonavit_deduction) || 0) + (Number(payment.loan_deduction) || 0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${payment.receipt_number || "Recibo de nomina"}</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111} .box{border:2px solid #111;max-width:760px;margin:auto}
    .grid{display:grid}.top{grid-template-columns:2fr 1fr;border-bottom:2px solid #111}.cell{padding:18px;border-right:2px solid #111;text-align:center}.cell:last-child{border-right:0}
    .mid{grid-template-columns:1fr 1fr 1fr 2fr;border-bottom:2px solid #111}.label{font-size:12px;text-transform:uppercase}.value{font-size:20px;font-weight:700;margin-top:6px}
    .body{grid-template-columns:1fr 1.5fr 2fr;min-height:210px}.row{padding:14px;border-bottom:1px solid #111}.total{display:flex;align-items:center;justify-content:center;flex-direction:column}
    h1{font-size:24px;margin:0;text-transform:uppercase}.big{font-size:44px;font-weight:800}.note{border-top:1px solid #111;padding:12px}.muted{color:#555;font-size:12px}
    @media print{button{display:none} body{margin:0}.box{margin:0;max-width:none}}
  </style></head><body><button onclick="window.print()">Guardar / imprimir PDF</button><div class="box">
    <div class="grid top"><div class="cell"><h1>${emp.name}</h1></div><div class="cell"><div class="value">${formatDateShort(payment.paid_at)}</div></div></div>
    <div class="grid mid">
      <div class="cell"><div class="label">Sueldo</div><div class="value">${formatMoney(salaryBase)}</div></div>
      <div class="cell"><div class="label">Por dia</div><div class="value">${formatMoney(Number(payment.daily_rate) || 0)}</div></div>
      <div class="cell"><div class="label">Dias</div><div class="value">${Number(payment.days_worked) || 0}</div></div>
      <div class="cell"><div class="label">Periodo</div><div class="value">${formatDateShort(payment.period_start)} - ${formatDateShort(payment.period_end)}</div></div>
    </div>
    <div class="grid body">
      <div><div class="row">Bono</div><div class="row">Finiquito</div><div class="row">Deducciones</div></div>
      <div><div class="row">${formatMoney(Number(payment.bonus_amount) || 0)}</div><div class="row">${formatMoney(Number(payment.severance_amount) || 0)}</div><div class="row">${formatMoney(deductions)}</div></div>
      <div class="total"><div class="label">Total</div><div class="big">${formatMoney(Number(payment.amount) || 0)}</div><div class="muted">${payment.receipt_number || ""}</div></div>
    </div>
    ${payment.note ? `<div class="note">Nota: ${payment.note}</div>` : ""}
  </div><script>setTimeout(()=>window.print(),300)</script></body></html>`;
}

function ReceiptDialog({ open, payment, emp, onClose }: { open: boolean; payment: any; emp: any; onClose: () => void }) {
  if (!payment) return null;
  const salaryBase = (Number(payment.daily_rate) || 0) * (Number(payment.days_worked) || 0);
  const deductions = (Number(payment.imss_deduction) || 0) + (Number(payment.infonavit_deduction) || 0) + (Number(payment.loan_deduction) || 0);
  const downloadPdf = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permite ventanas emergentes para generar el PDF"); return; }
    w.document.write(receiptHtml(payment, emp));
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Recibo de nómina</DialogTitle></DialogHeader>
        <div className="border rounded-lg overflow-hidden bg-white text-black">
          <div className="grid grid-cols-[2fr_1fr] border-b">
            <div className="p-4 text-center font-mono text-xl font-semibold uppercase">{emp.name}</div>
            <div className="p-4 text-center border-l font-semibold">{formatDateShort(payment.paid_at)}</div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_2fr] border-b text-center">
            <div className="border-r p-3"><p className="text-xs uppercase">Sueldo</p><p className="font-semibold">{formatMoney(salaryBase)}</p></div>
            <div className="border-r p-3"><p className="text-xs uppercase">Por día</p><p className="font-semibold">{formatMoney(Number(payment.daily_rate) || 0)}</p></div>
            <div className="border-r p-3"><p className="text-xs uppercase">Días</p><p className="font-semibold">{Number(payment.days_worked) || 0}</p></div>
            <div className="p-3"><p className="text-xs uppercase">Periodo</p><p className="font-semibold">{formatDateShort(payment.period_start)} - {formatDateShort(payment.period_end)}</p></div>
          </div>
          <div className="grid grid-cols-[1fr_2fr_2fr] min-h-48">
            <div className="border-r">
              <div className="border-b p-3 text-center font-medium">Bono</div>
              <div className="border-b p-3 text-center font-medium">Finiquito mensual</div>
              <div className="p-3 text-center font-medium">Deducciones</div>
            </div>
            <div className="border-r">
              <div className="border-b p-3 text-right font-semibold">{formatMoney(Number(payment.bonus_amount) || 0)}</div>
              <div className="border-b p-3 text-right font-semibold">{formatMoney(Number(payment.severance_amount) || 0)}</div>
              <div className="p-3 text-right font-semibold">{formatMoney(deductions)}</div>
            </div>
            <div className="flex flex-col items-center justify-center p-5">
              <p className="text-sm uppercase">Total</p>
              <p className="text-4xl font-bold">{formatMoney(Number(payment.amount) || 0)}</p>
              {payment.receipt_number && <p className="mt-3 text-xs text-muted-foreground">{payment.receipt_number}</p>}
            </div>
          </div>
          {payment.note && <div className="border-t p-3 text-sm">Nota: {payment.note}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={downloadPdf}><Download className="h-4 w-4 mr-1" /> Descargar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
