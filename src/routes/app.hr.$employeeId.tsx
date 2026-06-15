import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, Save, Plus, Plane, CircleDollarSign, FileText, Upload, Download, Trash2, Wallet } from "lucide-react";
import { formatMoney, formatDateShort } from "@/lib/format";

export const Route = createFileRoute("/app/hr/$employeeId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Expediente · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/app/dashboard" });
  },
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-destructive mb-3">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Reintentar</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-center text-sm text-muted-foreground">Empleada no encontrada</div>,
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const qc = useQueryClient();

  const { data: emp } = useQuery({
    queryKey: ["hr-emp", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("id", employeeId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!emp) return <div className="p-6 text-center text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <Link to="/app/hr" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> RRHH
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{emp.name}</h1>
        <p className="text-sm text-muted-foreground">{emp.position || "Sin puesto"} {emp.is_active ? "" : "· Baja"}</p>
      </header>

      <Tabs defaultValue="general">
        <TabsList className="w-full overflow-x-auto flex justify-start">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="contract">Contrato</TabsTrigger>
          <TabsTrigger value="payroll">Nómina</TabsTrigger>
          <TabsTrigger value="vacations">Vacaciones</TabsTrigger>
          <TabsTrigger value="loans">Préstamos</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="general"><GeneralTab emp={emp} onSaved={() => qc.invalidateQueries({ queryKey: ["hr-emp", employeeId] })} /></TabsContent>
        <TabsContent value="contract"><ContractTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="payroll"><PayrollTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="vacations"><VacationsTab employeeId={employeeId} hireDate={emp.hire_date} /></TabsContent>
        <TabsContent value="loans"><LoansTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="docs"><DocsTab employeeId={employeeId} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* =================== GENERAL =================== */
function GeneralTab({ emp, onSaved }: { emp: any; onSaved: () => void }) {
  const [f, setF] = useState({
    name: emp.name ?? "",
    position: emp.position ?? "",
    phone: emp.phone ?? "",
    address: emp.address ?? "",
    birth_date: emp.birth_date ?? "",
    hire_date: emp.hire_date ?? "",
    termination_date: emp.termination_date ?? "",
    nss: emp.nss ?? "",
    curp: emp.curp ?? "",
    rfc: emp.rfc ?? "",
    emergency_contact_name: emp.emergency_contact_name ?? "",
    emergency_contact_phone: emp.emergency_contact_phone ?? "",
    is_active: emp.is_active,
  });

  const save = async () => {
    const payload: any = { ...f };
    ["birth_date", "hire_date", "termination_date"].forEach((k) => { if (!payload[k]) payload[k] = null; });
    const { error } = await supabase.from("employees").update(payload).eq("id", emp.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    onSaved();
  };

  return (
    <Card className="p-4 space-y-3 mt-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div><Label>Nombre</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Puesto</Label><Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></div>
        <div><Label>Teléfono</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><Label>Fecha de nacimiento</Label><Input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></div>
        <div><Label>Fecha de ingreso</Label><Input type="date" value={f.hire_date} onChange={(e) => setF({ ...f, hire_date: e.target.value })} /></div>
        <div><Label>Fecha de baja</Label><Input type="date" value={f.termination_date} onChange={(e) => setF({ ...f, termination_date: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Dirección</Label><Textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div><Label>NSS</Label><Input value={f.nss} onChange={(e) => setF({ ...f, nss: e.target.value })} /></div>
        <div><Label>CURP</Label><Input value={f.curp} onChange={(e) => setF({ ...f, curp: e.target.value })} /></div>
        <div><Label>RFC</Label><Input value={f.rfc} onChange={(e) => setF({ ...f, rfc: e.target.value })} /></div>
        <div className="flex items-end gap-2">
          <Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} id="act" />
          <Label htmlFor="act">Activa</Label>
        </div>
        <div><Label>Contacto emergencia</Label><Input value={f.emergency_contact_name} onChange={(e) => setF({ ...f, emergency_contact_name: e.target.value })} /></div>
        <div><Label>Tel. emergencia</Label><Input value={f.emergency_contact_phone} onChange={(e) => setF({ ...f, emergency_contact_phone: e.target.value })} /></div>
      </div>
      <div className="flex justify-end"><Button onClick={save}><Save className="h-4 w-4 mr-1" /> Guardar</Button></div>
    </Card>
  );
}

/* =================== CONTRACT =================== */
function ContractTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    contract_type: "indefinido",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    pay_schedule: "monthly",
    base_amount: "",
    imss_enrolled: false,
    imss_employer_number: "",
    infonavit_enrolled: false,
    infonavit_type: "percent",
    infonavit_value: "",
    note: "",
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["hr-contracts", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employment_contracts").select("*").eq("employee_id", employeeId).order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = async () => {
    const payload: any = {
      employee_id: employeeId,
      contract_type: f.contract_type,
      start_date: f.start_date,
      end_date: f.end_date || null,
      pay_schedule: f.pay_schedule,
      base_amount: Number(f.base_amount) || 0,
      imss_enrolled: f.imss_enrolled,
      imss_employer_number: f.imss_employer_number || null,
      infonavit_enrolled: f.infonavit_enrolled,
      infonavit_type: f.infonavit_enrolled ? f.infonavit_type : null,
      infonavit_value: f.infonavit_enrolled ? Number(f.infonavit_value) || 0 : null,
      note: f.note || null,
    };
    const { error } = await supabase.from("employment_contracts").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Contrato guardado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["hr-contracts", employeeId] });
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Contrato</Button></div>
      {contracts.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin contratos</Card>
      ) : contracts.map((c: any) => (
        <Card key={c.id} className="p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium capitalize">{c.contract_type}</p>
              <p className="text-xs text-muted-foreground">{formatDateShort(c.start_date)} {c.end_date ? `→ ${formatDateShort(c.end_date)}` : "· vigente"}</p>
            </div>
            <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Activo" : "Inactivo"}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
            <div><span className="text-muted-foreground">Pago: </span>{labelSched(c.pay_schedule)}</div>
            <div><span className="text-muted-foreground">Base: </span>{formatMoney(Number(c.base_amount))}</div>
            <div><span className="text-muted-foreground">IMSS: </span>{c.imss_enrolled ? "Sí" : "No"}</div>
            <div><span className="text-muted-foreground">Infonavit: </span>{c.infonavit_enrolled ? (c.infonavit_type === "percent" ? `${c.infonavit_value}%` : formatMoney(Number(c.infonavit_value))) : "No"}</div>
          </div>
          {c.note && <p className="text-xs mt-2 text-muted-foreground">{c.note}</p>}
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuevo contrato</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tipo</Label>
                <Select value={f.contract_type} onValueChange={(v) => setF({ ...f, contract_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indefinido">Indefinido</SelectItem>
                    <SelectItem value="temporal">Temporal</SelectItem>
                    <SelectItem value="honorarios">Honorarios</SelectItem>
                    <SelectItem value="prueba">Periodo de prueba</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Esquema de pago</Label>
                <Select value={f.pay_schedule} onValueChange={(v) => setF({ ...f, pay_schedule: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Inicio</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
              <div><Label>Fin</Label><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>Monto base</Label><Input type="number" step="0.01" value={f.base_amount} onChange={(e) => setF({ ...f, base_amount: e.target.value })} /></div>
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-2"><Switch checked={f.imss_enrolled} onCheckedChange={(v) => setF({ ...f, imss_enrolled: v })} id="imss" /><Label htmlFor="imss">Alta IMSS</Label></div>
              {f.imss_enrolled && <Input placeholder="Número patronal" value={f.imss_employer_number} onChange={(e) => setF({ ...f, imss_employer_number: e.target.value })} />}
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-2"><Switch checked={f.infonavit_enrolled} onCheckedChange={(v) => setF({ ...f, infonavit_enrolled: v })} id="inf" /><Label htmlFor="inf">Infonavit</Label></div>
              {f.infonavit_enrolled && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={f.infonavit_type} onValueChange={(v) => setF({ ...f, infonavit_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% del salario</SelectItem>
                      <SelectItem value="fixed">Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" step="0.01" placeholder="Valor" value={f.infonavit_value} onChange={(e) => setF({ ...f, infonavit_value: e.target.value })} />
                </div>
              )}
            </div>
            <div><Label>Notas</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== PAYROLL =================== */
function PayrollTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    period_start: today, period_end: today, paid_at: today,
    gross_amount: "", imss_deduction: "", infonavit_deduction: "", loan_deduction: "",
    loan_id: "", payment_method: "efectivo", note: "",
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["hr-payroll", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_payments").select("*").eq("employee_id", employeeId).order("paid_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activeLoans = [] } = useQuery({
    queryKey: ["hr-loans-active", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_loans").select("*").eq("employee_id", employeeId).eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
  });

  const yearTotal = useMemo(() => {
    const y = new Date().getFullYear();
    return payments.filter((p: any) => new Date(p.paid_at).getFullYear() === y).reduce((s: number, p: any) => s + Number(p.amount), 0);
  }, [payments]);

  const onLoanChange = (id: string) => {
    const loan = activeLoans.find((l: any) => l.id === id);
    setF((prev) => ({ ...prev, loan_id: id, loan_deduction: loan?.mode === "auto" && loan.installment_amount ? String(Math.min(Number(loan.installment_amount), Number(loan.balance))) : prev.loan_deduction }));
  };

  const save = async () => {
    const gross = Number(f.gross_amount) || 0;
    const imss = Number(f.imss_deduction) || 0;
    const inf = Number(f.infonavit_deduction) || 0;
    const loan = Number(f.loan_deduction) || 0;
    const net = Math.max(0, gross - imss - inf - loan);
    const { error } = await supabase.from("payroll_payments").insert({
      employee_id: employeeId,
      period_start: f.period_start, period_end: f.period_end, paid_at: f.paid_at,
      gross_amount: gross, imss_deduction: imss, infonavit_deduction: inf, loan_deduction: loan,
      loan_id: f.loan_id || null,
      amount: net, payment_method: f.payment_method, note: f.note || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pago registrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["hr-payroll", employeeId] });
    qc.invalidateQueries({ queryKey: ["hr-loans-active", employeeId] });
  };

  return (
    <div className="space-y-3 mt-3">
      <Card className="p-3 flex items-center justify-between">
        <div><p className="text-xs text-muted-foreground">Pagado en {new Date().getFullYear()}</p><p className="text-xl font-bold">{formatMoney(yearTotal)}</p></div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Pago</Button>
      </Card>
      {payments.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin pagos</Card>
      ) : payments.map((p: any) => (
        <Card key={p.id} className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{formatMoney(Number(p.amount))}</p>
              <p className="text-xs text-muted-foreground">{formatDateShort(p.paid_at)} · {formatDateShort(p.period_start)} – {formatDateShort(p.period_end)}</p>
            </div>
            {p.payment_method && <Badge variant="outline" className="text-[10px] capitalize">{p.payment_method}</Badge>}
          </div>
          {(Number(p.imss_deduction) || Number(p.infonavit_deduction) || Number(p.loan_deduction)) > 0 && (
            <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              {p.gross_amount && <span>Bruto: {formatMoney(Number(p.gross_amount))}</span>}
              {Number(p.imss_deduction) > 0 && <span>IMSS: -{formatMoney(Number(p.imss_deduction))}</span>}
              {Number(p.infonavit_deduction) > 0 && <span>Infonavit: -{formatMoney(Number(p.infonavit_deduction))}</span>}
              {Number(p.loan_deduction) > 0 && <span>Préstamo: -{formatMoney(Number(p.loan_deduction))}</span>}
            </div>
          )}
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago de nómina</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Periodo inicio</Label><Input type="date" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></div>
              <div><Label>Periodo fin</Label><Input type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></div>
            </div>
            <div><Label>Fecha de pago</Label><Input type="date" value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} /></div>
            <div><Label>Bruto</Label><Input type="number" step="0.01" value={f.gross_amount} onChange={(e) => setF({ ...f, gross_amount: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>IMSS</Label><Input type="number" step="0.01" value={f.imss_deduction} onChange={(e) => setF({ ...f, imss_deduction: e.target.value })} /></div>
              <div><Label>Infonavit</Label><Input type="number" step="0.01" value={f.infonavit_deduction} onChange={(e) => setF({ ...f, infonavit_deduction: e.target.value })} /></div>
            </div>
            {activeLoans.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <Label>Aplicar a préstamo</Label>
                <Select value={f.loan_id || "none"} onValueChange={(v) => onLoanChange(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguno</SelectItem>
                    {activeLoans.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>Saldo {formatMoney(Number(l.balance))} · {l.mode === "auto" ? "auto" : "manual"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {f.loan_id && <Input type="number" step="0.01" placeholder="Monto a descontar" value={f.loan_deduction} onChange={(e) => setF({ ...f, loan_deduction: e.target.value })} />}
              </div>
            )}
            <div><Label>Método</Label>
              <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nota</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            <Card className="p-2 bg-muted/40 text-sm">
              <div className="flex justify-between"><span>Neto a pagar</span><span className="font-bold">{formatMoney(Math.max(0, (Number(f.gross_amount) || 0) - (Number(f.imss_deduction) || 0) - (Number(f.infonavit_deduction) || 0) - (Number(f.loan_deduction) || 0)))}</span></div>
            </Card>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}><Wallet className="h-4 w-4 mr-1" />Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== VACATIONS =================== */
function VacationsTab({ employeeId, hireDate }: { employeeId: string; hireDate: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ start_date: today, end_date: today, note: "" });

  const { data: vacs = [] } = useQuery({
    queryKey: ["hr-vacations", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vacation_records").select("*").eq("employee_id", employeeId).order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const entitled = useMemo(() => {
    if (!hireDate) return 0;
    const years = Math.max(0, Math.floor((Date.now() - new Date(hireDate).getTime()) / (365.25 * 86400000)));
    if (years < 1) return 0;
    if (years === 1) return 12;
    if (years === 2) return 14;
    if (years === 3) return 16;
    if (years === 4) return 18;
    if (years === 5) return 20;
    if (years <= 10) return 22;
    return 22 + 2 * Math.floor((years - 6) / 5);
  }, [hireDate]);

  const thisYear = new Date().getFullYear();
  const taken = vacs.filter((v: any) => v.status !== "cancelled" && new Date(v.start_date).getFullYear() === thisYear)
    .reduce((s: number, v: any) => s + Number(v.days), 0);
  const remaining = Math.max(0, entitled - taken);

  const save = async () => {
    const start = new Date(f.start_date);
    const end = new Date(f.end_date);
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days <= 0) { toast.error("Rango inválido"); return; }
    const status = end < new Date(today) ? "taken" : start > new Date(today) ? "planned" : "in_progress";
    const { error } = await supabase.from("vacation_records").insert({
      employee_id: employeeId, start_date: f.start_date, end_date: f.end_date, days, status, note: f.note || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Vacaciones registradas");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["hr-vacations", employeeId] });
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("vacation_records").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["hr-vacations", employeeId] });
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Le tocan</p><p className="text-xl font-bold">{entitled}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Tomados</p><p className="text-xl font-bold">{taken}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Restantes</p><p className="text-xl font-bold text-primary">{remaining}</p></Card>
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(true)}><Plane className="h-4 w-4 mr-1" /> Registrar</Button></div>
      {vacs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin vacaciones</Card>
      ) : vacs.map((v: any) => (
        <Card key={v.id} className="p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{formatDateShort(v.start_date)} – {formatDateShort(v.end_date)}</p>
            <p className="text-xs text-muted-foreground">{v.days} días {v.note ? `· ${v.note}` : ""}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={v.status === "cancelled" ? "secondary" : v.status === "in_progress" ? "default" : "outline"} className="text-[10px] capitalize">{labelVac(v.status)}</Badge>
            {v.status !== "cancelled" && <Button size="icon" variant="ghost" onClick={() => cancel(v.id)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar vacaciones</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Desde</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
              <div><Label>Hasta</Label><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Nota</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== LOANS =================== */
function LoansTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ principal: "", mode: "manual", installment_amount: "", start_date: today, note: "" });
  const [pay, setPay] = useState({ amount: "", paid_at: today, note: "" });

  const { data: loans = [] } = useQuery({
    queryKey: ["hr-loans", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_loans").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ["hr-loan-payments", employeeId],
    queryFn: async () => {
      const ids = loans.map((l: any) => l.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("loan_payments").select("*").in("loan_id", ids).order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: loans.length > 0,
  });

  const save = async () => {
    const principal = Number(f.principal);
    if (!principal || principal <= 0) { toast.error("Monto inválido"); return; }
    const { error } = await supabase.from("employee_loans").insert({
      employee_id: employeeId, principal, balance: principal,
      mode: f.mode, installment_amount: f.mode === "auto" ? Number(f.installment_amount) || null : null,
      start_date: f.start_date, note: f.note || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Préstamo creado");
    setOpen(false);
    setF({ principal: "", mode: "manual", installment_amount: "", start_date: today, note: "" });
    qc.invalidateQueries({ queryKey: ["hr-loans", employeeId] });
  };

  const addPayment = async (loanId: string) => {
    const amount = Number(pay.amount);
    if (!amount || amount <= 0) { toast.error("Monto inválido"); return; }
    const loan = loans.find((l: any) => l.id === loanId);
    if (!loan) return;
    const applied = Math.min(amount, Number(loan.balance));
    const { error: e1 } = await supabase.from("loan_payments").insert({
      loan_id: loanId, amount: applied, paid_at: pay.paid_at, source: "manual", note: pay.note || null,
    });
    if (e1) { toast.error(e1.message); return; }
    const newBalance = Number(loan.balance) - applied;
    const { error: e2 } = await supabase.from("employee_loans").update({
      balance: newBalance, status: newBalance <= 0 ? "paid" : "active",
    }).eq("id", loanId);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Abono registrado");
    setPayOpen(null);
    setPay({ amount: "", paid_at: today, note: "" });
    qc.invalidateQueries({ queryKey: ["hr-loans", employeeId] });
    qc.invalidateQueries({ queryKey: ["hr-loan-payments", employeeId] });
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(true)}><CircleDollarSign className="h-4 w-4 mr-1" /> Préstamo</Button></div>
      {loans.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin préstamos</Card>
      ) : loans.map((l: any) => {
        const payments = allPayments.filter((p: any) => p.loan_id === l.id);
        return (
          <Card key={l.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium">{formatMoney(Number(l.principal))} <span className="text-xs text-muted-foreground">desde {formatDateShort(l.start_date)}</span></p>
                <p className="text-xs">Saldo: <span className="font-semibold">{formatMoney(Number(l.balance))}</span> · {l.mode === "auto" ? `Auto ${formatMoney(Number(l.installment_amount || 0))}` : "Manual"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={l.status === "paid" ? "secondary" : l.status === "cancelled" ? "outline" : "default"} className="text-[10px] capitalize">{l.status}</Badge>
                {l.status === "active" && <Button size="sm" variant="outline" onClick={() => setPayOpen(l.id)}>Abonar</Button>}
              </div>
            </div>
            {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
            {payments.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                {payments.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{formatDateShort(p.paid_at)} · {p.source}</span>
                    <span className="font-medium">-{formatMoney(Number(p.amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo préstamo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Monto</Label><Input type="number" step="0.01" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></div>
            <div><Label>Fecha</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
            <div>
              <Label>Modo de descuento</Label>
              <Select value={f.mode} onValueChange={(v) => setF({ ...f, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (yo registro cada abono)</SelectItem>
                  <SelectItem value="auto">Automático (descuento fijo cada nómina)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.mode === "auto" && <div><Label>Cuota por nómina</Label><Input type="number" step="0.01" value={f.installment_amount} onChange={(e) => setF({ ...f, installment_amount: e.target.value })} /></div>}
            <div><Label>Nota</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar abono</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Monto</Label><Input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
            <div><Label>Fecha</Label><Input type="date" value={pay.paid_at} onChange={(e) => setPay({ ...pay, paid_at: e.target.value })} /></div>
            <div><Label>Nota</Label><Textarea rows={2} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPayOpen(null)}>Cancelar</Button><Button onClick={() => payOpen && addPayment(payOpen)}>Abonar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== DOCS =================== */
function DocsTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["hr-docs", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_documents").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${employeeId}/${docType}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("employee-docs").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("employee_documents").insert({
        employee_id: employeeId, doc_type: docType, file_path: path, file_name: file.name,
        mime_type: file.type || null, size_bytes: file.size,
      });
      if (insErr) throw insErr;
      toast.success("Documento subido");
      qc.invalidateQueries({ queryKey: ["hr-docs", employeeId] });
    } catch (e: any) {
      toast.error(e.message || "Error al subir");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("employee-docs").createSignedUrl(path, 60);
    if (error || !data) { toast.error("Error al generar enlace"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.click();
  };

  const remove = async (id: string, path: string) => {
    if (!confirm("¿Eliminar documento?")) return;
    await supabase.storage.from("employee-docs").remove([path]);
    const { error } = await supabase.from("employee_documents").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["hr-docs", employeeId] });
  };

  return (
    <div className="space-y-3 mt-3">
      <Card className="p-3 space-y-2">
        <Label>Subir documento</Label>
        <div className="grid grid-cols-2 gap-2">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contract">Contrato</SelectItem>
              <SelectItem value="ine">INE</SelectItem>
              <SelectItem value="imss">IMSS</SelectItem>
              <SelectItem value="infonavit">Infonavit</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" /> {uploading ? "Subiendo…" : "Elegir archivo"}
          </Button>
        </div>
        <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </Card>

      {docs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin documentos</Card>
      ) : docs.map((d: any) => (
        <Card key={d.id} className="p-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{d.file_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{labelDoc(d.doc_type)} · {formatDateShort(d.created_at)} {d.size_bytes ? `· ${(d.size_bytes/1024).toFixed(0)} KB` : ""}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => download(d.file_path, d.file_name)}><Download className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => remove(d.id, d.file_path)}><Trash2 className="h-4 w-4" /></Button>
        </Card>
      ))}
    </div>
  );
}

function labelSched(s: string) {
  return ({ daily: "Diario", weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual" } as Record<string, string>)[s] ?? s;
}
function labelVac(s: string) {
  return ({ planned: "Próximas", in_progress: "Disfrutando", taken: "Tomadas", cancelled: "Cancelada" } as Record<string, string>)[s] ?? s;
}
function labelDoc(s: string) {
  return ({ contract: "Contrato", ine: "INE", imss: "IMSS", infonavit: "Infonavit", other: "Otro" } as Record<string, string>)[s] ?? s;
}
