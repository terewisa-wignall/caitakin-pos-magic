import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, FileText, IdCard, Plus, Pencil, Share2, Trash2, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { formatMoney, formatDateShort } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { PayrollWizard } from "@/components/payroll-wizard";
import { downloadReceiptImage, shareReceiptImage, receiptFilename } from "@/lib/receipt-image";

export const Route = createFileRoute("/app/payroll")({
  ssr: false,
  head: () => ({ meta: [{ title: "Nómina · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: PayrollPage,
});

function labelFreq(f?: string | null) {
  return { daily: "diario", weekly: "semanal", biweekly: "quincenal", monthly: "mensual" }[f ?? ""] ?? f;
}

function PayrollPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>;
  return isAdmin ? <AdminPayrollView /> : <MyPayrollView />;
}

/* ============================================================
   Vista Vendedora — Mi nómina (solo lo del día, sin historial)
   ============================================================ */
function MyPayrollView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [dataOpen, setDataOpen] = useState(false);

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

  const emp = employee.data as any;

  const todayReceipts = useQuery({
    queryKey: ["my-payroll-today", emp?.id],
    enabled: !!emp?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("*")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const loans = useQuery({
    queryKey: ["my-loans", emp?.id],
    enabled: !!emp?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_loans")
        .select("id,balance,installment_amount,mode,status,currency")
        .eq("employee_id", emp.id)
        .neq("status", "paid");
      return data ?? [];
    },
  });

  const loanBalance = (loans.data ?? []).reduce((s: number, l: any) => s + Number(l.balance || 0), 0);

  if (employee.isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Cargando nómina...</div>;
  }

  if (!emp) {
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
          <p className="text-xs text-muted-foreground">Pago por día</p>
          <p className="text-lg font-bold font-numeric">{formatMoney(Number(emp.salary))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Se paga</p>
          <p className="text-lg font-bold">{labelFreq(emp.frequency)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Saldo préstamo</p>
          <p className="text-lg font-bold font-numeric">{formatMoney(loanBalance)}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Recibos de hoy</h2>
          <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> sin historial</Badge>
        </div>
        <div className="space-y-2">
          {(todayReceipts.data ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
              <div className="min-w-0">
                <p className="font-medium font-numeric">{formatMoney(Number(p.amount))}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateShort(p.period_start)} – {formatDateShort(p.period_end)} · {p.days_worked} días
                </p>
                {p.receipt_number && <p className="text-[11px] text-muted-foreground">{p.receipt_number}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.is_settlement && <Badge className="text-[10px]">Finiquito</Badge>}
                <Button size="sm" variant="outline" onClick={() => setReceipt(p)}><Share2 className="h-3.5 w-3.5 mr-1" /> Recibo</Button>
              </div>
            </div>
          ))}
          {(todayReceipts.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aquí aparecen los recibos que generes hoy. El historial completo lo lleva administración.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold flex items-center gap-2"><IdCard className="h-4 w-4" /> Mis datos</p>
          <p className="text-xs text-muted-foreground truncate">
            Seguro social {emp.nss || "—"} · CURP {emp.curp || "—"} · RFC {emp.rfc || "—"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDataOpen(true)}>Editar</Button>
      </Card>

      <PayrollWizard
        open={open}
        emp={emp}
        onClose={() => setOpen(false)}
        onSaved={(p) => {
          setReceipt(p);
          qc.invalidateQueries({ queryKey: ["my-payroll-today", emp.id] });
          qc.invalidateQueries({ queryKey: ["my-loans", emp.id] });
        }}
      />
      <EmployeeDataDialog
        open={dataOpen}
        emp={emp}
        onClose={() => setDataOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["my-employee", user?.id] })}
      />
      <ReceiptDialog open={!!receipt} payment={receipt} emp={emp} onClose={() => setReceipt(null)} />
    </div>
  );
}

/* ============================================================
   Datos personales de la empleada
   ============================================================ */
function EmployeeDataDialog({
  open, emp, onClose, onSaved,
}: { open: boolean; emp: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: emp?.name ?? "",
      phone: emp?.phone ?? "",
      address: emp?.address ?? "",
      birth_date: emp?.birth_date ?? "",
      nss: emp?.nss ?? "",
      curp: emp?.curp ?? "",
      rfc: emp?.rfc ?? "",
      emergency_contact_name: emp?.emergency_contact_name ?? "",
      emergency_contact_phone: emp?.emergency_contact_phone ?? "",
    });
  }, [open, emp?.id]);

  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({ ...form, birth_date: form.birth_date || null })
      .eq("id", emp.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Datos guardados");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mis datos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre completo</Label><Input value={form.name ?? ""} onChange={set("name")} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Teléfono</Label><Input value={form.phone ?? ""} onChange={set("phone")} /></div>
            <div><Label>Fecha de nacimiento</Label><Input type="date" value={form.birth_date ?? ""} onChange={set("birth_date")} /></div>
          </div>
          <div><Label>Dirección</Label><Input value={form.address ?? ""} onChange={set("address")} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Seguro social</Label><Input value={form.nss ?? ""} onChange={set("nss")} /></div>
            <div><Label>CURP</Label><Input value={form.curp ?? ""} onChange={set("curp")} /></div>
            <div><Label>RFC</Label><Input value={form.rfc ?? ""} onChange={set("rfc")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Contacto de emergencia</Label><Input value={form.emergency_contact_name ?? ""} onChange={set("emergency_contact_name")} /></div>
            <div><Label>Teléfono de emergencia</Label><Input value={form.emergency_contact_phone ?? ""} onChange={set("emergency_contact_phone")} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            El sueldo, el puesto y la fecha de ingreso solo los puede cambiar administración.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Vista Admin — historial completo de todo el equipo
   ============================================================ */
function AdminPayrollView() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<{ payment: any; emp: any } | null>(null);

  const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  const yearStart = new Date(year, 0, 1).toISOString().slice(0, 10);
  const yearEnd = new Date(year, 11, 31).toISOString().slice(0, 10);

  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const employees = useQuery({
    queryKey: ["admin-payroll-employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").order("is_active", { ascending: false }).order("name");
      return data ?? [];
    },
  });

  const yearPayments = useQuery({
    queryKey: ["admin-payroll-year", year],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_payments")
        .select("*")
        .gte("paid_at", yearStart).lte("paid_at", yearEnd);
      return data ?? [];
    },
  });

  const detail = useQuery({
    queryKey: ["admin-payroll-detail", selectedEmpId],
    enabled: !!selectedEmpId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_payments")
        .select("*")
        .eq("employee_id", selectedEmpId!)
        .order("paid_at", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  const totalsByEmp = useMemo(() => {
    const map = new Map<string, { month: number; year: number }>();
    (yearPayments.data ?? []).forEach((p: any) => {
      const entry = map.get(p.employee_id) ?? { month: 0, year: 0 };
      entry.year += Number(p.amount) || 0;
      if (p.paid_at >= monthStart && p.paid_at <= monthEnd) entry.month += Number(p.amount) || 0;
      map.set(p.employee_id, entry);
    });
    return map;
  }, [yearPayments.data, monthStart, monthEnd]);

  const totalMonthAll = useMemo(
    () => (yearPayments.data ?? [])
      .filter((p: any) => p.paid_at >= monthStart && p.paid_at <= monthEnd)
      .reduce((s: number, p: any) => s + Number(p.amount), 0),
    [yearPayments.data, monthStart, monthEnd],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-payroll-year"] });
    qc.invalidateQueries({ queryKey: ["admin-payroll-detail", selectedEmpId] });
  };

  const selectedEmp = (employees.data ?? []).find((e: any) => e.id === selectedEmpId);

  const removePayment = async (p: any) => {
    if (!confirm("¿Eliminar este recibo?")) return;
    const { error } = await supabase.from("payroll_payments").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Recibo eliminado");
    refresh();
  };

  const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Nómina</h1>
        <p className="text-sm text-muted-foreground">Historial completo del equipo. Puedes generar, editar y borrar cualquier recibo o finiquito.</p>
      </header>

      <Card className="p-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center min-w-0">
          <p className="font-semibold">{MONTHS_FULL[month]} {year}</p>
          <p className="text-xs text-muted-foreground">Nómina del mes: <span className="font-semibold text-foreground">{formatMoney(totalMonthAll)}</span></p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 text-sm">Empleadas</h2>
        <ul className="divide-y">
          {(employees.data ?? []).map((e: any) => {
            const t = totalsByEmp.get(e.id) ?? { month: 0, year: 0 };
            return (
              <li key={e.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate flex items-center gap-2">
                    {e.name}
                    {!e.is_active && <Badge variant="outline" className="text-[10px]">Inactiva</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {e.position || "—"} · {formatMoney(Number(e.salary))} por día · {labelFreq(e.frequency)}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-numeric">
                    Mes {formatMoney(t.month)} · Año {formatMoney(t.year)}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setSelectedEmpId(e.id)}>Historial</Button>
                  <Button size="sm" onClick={() => setEditing({ mode: "new", emp: e })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Recibo
                  </Button>
                </div>
              </li>
            );
          })}
          {(employees.data ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              No hay empleadas. Ve a RRHH para agregar.
            </li>
          )}
        </ul>
      </Card>

      <Dialog open={!!selectedEmpId} onOpenChange={(o) => !o && setSelectedEmpId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedEmp?.name || "Historial"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(detail.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border rounded-lg p-3">
                <div className="min-w-0">
                  <p className="font-medium font-numeric flex items-center gap-2">
                    {formatMoney(Number(p.amount))}
                    {p.is_settlement && <Badge className="text-[10px]">Finiquito</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateShort(p.paid_at)} · {formatDateShort(p.period_start)}–{formatDateShort(p.period_end)} · {p.days_worked ?? 0} días
                  </p>
                  {p.receipt_number && <p className="text-[11px] text-muted-foreground">{p.receipt_number}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setReceipt({ payment: p, emp: selectedEmp })}><Share2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing({ mode: "edit", emp: selectedEmp, payment: p })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removePayment(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {(detail.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin recibos aún.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PayrollWizard
        open={!!editing}
        emp={editing?.emp}
        payment={editing?.mode === "edit" ? editing.payment : null}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />

      <ReceiptDialog
        open={!!receipt}
        payment={receipt?.payment}
        emp={receipt?.emp}
        onClose={() => setReceipt(null)}
      />
    </div>
  );
}

/* ============================================================
   Recibo imprimible
   ============================================================ */
function receiptRows(payment: any) {
  const salary = (Number(payment.daily_rate) || 0) * (Number(payment.days_worked) || 0);
  const earnings: [string, number][] = [
    ["Sueldo", salary],
    ["Vacaciones", Number(payment.vacation_amount) || 0],
    ["Prima vacacional", Number(payment.vacation_premium) || 0],
    ["Aguinaldo", Number(payment.christmas_bonus) || 0],
    ["Bono", Number(payment.bonus_amount) || 0],
    ["Indemnizacion", Number(payment.severance_amount) || 0],
  ];
  const deductions: [string, number][] = [
    ["IMSS", Number(payment.imss_deduction) || 0],
    ["Infonavit", Number(payment.infonavit_deduction) || 0],
    ["Prestamo", Number(payment.loan_deduction) || 0],
    [payment.other_deductions_note || "Otras", Number(payment.other_deductions) || 0],
  ];
  const totalEarnings = earnings.reduce((s, [, v]) => s + v, 0);
  const totalDeductions = deductions.reduce((s, [, v]) => s + v, 0);
  return { earnings, deductions, totalEarnings, totalDeductions };
}

function receiptHtml(payment: any, emp: any) {
  const { earnings, deductions, totalEarnings, totalDeductions } = receiptRows(payment);
  const list = (rows: [string, number][]) =>
    rows.filter(([, v]) => v > 0).map(([k, v]) => `<tr><td>${k}</td><td class="r">${formatMoney(v)}</td></tr>`).join("") ||
    `<tr><td colspan="2" class="muted">Sin conceptos</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${payment.receipt_number || "Recibo de nomina"}</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111}.box{border:2px solid #111;max-width:780px;margin:auto;padding:0}
    header{padding:16px;border-bottom:2px solid #111}h1{font-size:20px;margin:0 0 4px;text-transform:uppercase}
    .muted{color:#555;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
    table{width:100%;border-collapse:collapse;font-size:14px}td{padding:7px 12px;border-bottom:1px solid #ddd}
    .r{text-align:right;font-variant-numeric:tabular-nums}.col{border-right:2px solid #111}
    .cap{padding:8px 12px;background:#f3f3f3;font-weight:700;font-size:12px;text-transform:uppercase;border-bottom:1px solid #111}
    .tot{display:flex;justify-content:space-between;align-items:center;padding:16px;border-top:2px solid #111}
    .big{font-size:36px;font-weight:800}
    @media print{button{display:none}body{margin:0}.box{margin:0;max-width:none;border:0}}
  </style></head><body><button onclick="window.print()">Guardar / imprimir PDF</button><div class="box">
    <header>
      <h1>${emp?.name ?? ""}</h1>
      <div class="muted">${emp?.position ?? ""} ${emp?.hire_date ? "· Ingreso " + formatDateShort(emp.hire_date) : ""}</div>
      <div class="muted">NSS ${emp?.nss || "—"} · CURP ${emp?.curp || "—"} · RFC ${emp?.rfc || "—"}</div>
      <div class="muted">Periodo ${formatDateShort(payment.period_start)} – ${formatDateShort(payment.period_end)} · ${Number(payment.days_worked) || 0} dias trabajados · Pago ${formatDateShort(payment.paid_at)}</div>
      <div class="muted">${payment.is_settlement ? "FINIQUITO" : "Recibo de nomina"} ${payment.receipt_number || ""} ${payment.termination_reason ? "· " + payment.termination_reason : ""}</div>
    </header>
    <div class="grid">
      <div class="col"><div class="cap">Percepciones ${formatMoney(totalEarnings)}</div><table>${list(earnings)}</table></div>
      <div><div class="cap">Deducciones ${formatMoney(totalDeductions)}</div><table>${list(deductions)}</table></div>
    </div>
    <div class="tot"><div><div class="muted">TOTAL A PAGAR</div><div class="big">${formatMoney(Number(payment.amount) || 0)}</div></div>
      <div class="muted">${payment.note ? "Nota: " + payment.note : ""}</div></div>
  </div><script>setTimeout(()=>window.print(),300)</script></body></html>`;
}

function ReceiptDialog({ open, payment, emp, onClose }: { open: boolean; payment: any; emp: any; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"png" | "share" | null>(null);
  if (!payment) return null;
  const { earnings, deductions, totalEarnings, totalDeductions } = receiptRows(payment);

  const filename = () => receiptFilename(emp?.name ?? "nomina", payment.period_start, payment.period_end);
  const shareText = `Recibo de nómina de ${emp?.name ?? ""} · ${formatDateShort(payment.period_start)} – ${formatDateShort(payment.period_end)} · Total a pagar ${formatMoney(Number(payment.amount) || 0)}`;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setBusy("png");
    try {
      await downloadReceiptImage(cardRef.current, filename());
      toast.success("Imagen del recibo descargada");
    } catch {
      toast.error("No se pudo generar la imagen");
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    setBusy("share");
    try {
      const r = await shareReceiptImage(cardRef.current, filename(), shareText);
      if (r === "fallback") toast.success("Imagen descargada: adjúntala en WhatsApp");
    } catch {
      toast.error("No se pudo compartir el recibo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{payment.is_settlement ? "Finiquito" : "Recibo de nómina"}</DialogTitle></DialogHeader>
        <div ref={cardRef} className="border rounded-lg overflow-hidden bg-background">
          <div className="p-3 border-b">
            <p className="font-semibold uppercase">{emp?.name}</p>
            <p className="text-xs text-muted-foreground">{emp?.position || "—"} · NSS {emp?.nss || "—"} · CURP {emp?.curp || "—"} · RFC {emp?.rfc || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateShort(payment.period_start)} – {formatDateShort(payment.period_end)} · {Number(payment.days_worked) || 0} días · pago {formatDateShort(payment.paid_at)}
            </p>
          </div>
          <div className="grid md:grid-cols-2">
            <div className="border-b md:border-b-0 md:border-r">
              <p className="px-3 py-2 bg-muted text-xs font-semibold uppercase">Percepciones {formatMoney(totalEarnings)}</p>
              {earnings.filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-2 text-sm border-b last:border-b-0">
                  <span className="text-muted-foreground">{k}</span><span className="font-numeric">{formatMoney(v)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="px-3 py-2 bg-muted text-xs font-semibold uppercase">Deducciones {formatMoney(totalDeductions)}</p>
              {deductions.filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-2 text-sm border-b last:border-b-0">
                  <span className="text-muted-foreground">{k}</span><span className="font-numeric">− {formatMoney(v)}</span>
                </div>
              ))}
              {deductions.every(([, v]) => v <= 0) && <p className="px-3 py-2 text-sm text-muted-foreground">Sin deducciones</p>}
            </div>
          </div>
          <div className="flex items-center justify-between border-t p-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Total a pagar</p>
              <p className="text-3xl font-bold font-numeric">{formatMoney(Number(payment.amount) || 0)}</p>
            </div>
            <p className="text-xs text-muted-foreground text-right">{payment.receipt_number}<br />{payment.note}</p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button variant="outline" onClick={handleDownload} disabled={busy !== null}>
            <Download className="h-4 w-4 mr-1" /> {busy === "png" ? "Generando..." : "Descargar imagen"}
          </Button>
          <Button onClick={handleShare} disabled={busy !== null}>
            <Share2 className="h-4 w-4 mr-1" /> {busy === "share" ? "Preparando..." : "Enviar por WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
