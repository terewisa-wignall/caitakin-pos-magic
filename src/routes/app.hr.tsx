import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Search, ChevronRight, Briefcase, Plane, CircleDollarSign, Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/app/hr")({
  ssr: false,
  head: () => ({ meta: [{ title: "RRHH · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/app/dashboard" });
  },
  component: HRPage,
});

type Filter = "all" | "active" | "inactive" | "with_loan" | "on_vacation";
type EmployeeKind = "regular" | "shift_cover";

const SHIFT_COVER_POSITION = "Cubre turnos";

function isShiftCover(position?: string | null) {
  return (position ?? "").trim().toLowerCase() === SHIFT_COVER_POSITION.toLowerCase();
}

function HRPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "regular" as EmployeeKind, position: "", salary: "", frequency: "monthly", hire_date: new Date().toISOString().slice(0, 10) });
  const [editEmp, setEditEmp] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", kind: "regular" as EmployeeKind, position: "", salary: "", frequency: "monthly", hire_date: "", is_active: true });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,position,salary,frequency,is_active,hire_date,termination_date")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["hr-active-loans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_loans")
        .select("employee_id,balance")
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activeVac = [] } = useQuery({
    queryKey: ["hr-active-vacations"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("vacation_records")
        .select("employee_id,start_date,end_date,status")
        .lte("start_date", today)
        .gte("end_date", today)
        .in("status", ["planned", "in_progress"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const loanMap = useMemo(() => {
    const m = new Map<string, number>();
    loans.forEach((l: any) => m.set(l.employee_id, (m.get(l.employee_id) ?? 0) + Number(l.balance)));
    return m;
  }, [loans]);
  const vacSet = useMemo(() => new Set(activeVac.map((v: any) => v.employee_id)), [activeVac]);

  const filtered = employees.filter((e: any) => {
    if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "active" && !e.is_active) return false;
    if (filter === "inactive" && e.is_active) return false;
    if (filter === "with_loan" && !loanMap.has(e.id)) return false;
    if (filter === "on_vacation" && !vacSet.has(e.id)) return false;
    return true;
  });

  const stats = useMemo(() => ({
    active: employees.filter((e: any) => e.is_active).length,
    onVac: activeVac.length,
    loanTotal: loans.reduce((s: number, l: any) => s + Number(l.balance), 0),
  }), [employees, activeVac, loans]);

  const create = async () => {
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    const shiftCover = form.kind === "shift_cover";
    const { error } = await supabase.from("employees").insert({
      name: form.name.trim(),
      position: shiftCover ? SHIFT_COVER_POSITION : form.position.trim() || null,
      salary: Number(form.salary) || 0,
      frequency: (shiftCover ? "weekly" : form.frequency) as any,
      hire_date: form.hire_date || null,
      is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Empleada agregada");
    setOpen(false);
    setForm({ name: "", kind: "regular", position: "", salary: "", frequency: "monthly", hire_date: new Date().toISOString().slice(0, 10) });
    qc.invalidateQueries({ queryKey: ["hr-employees"] });
  };

  const openEdit = (employee: any) => {
    const shiftCover = isShiftCover(employee.position);
    setEditEmp(employee);
    setEditForm({
      name: employee.name ?? "",
      kind: shiftCover ? "shift_cover" : "regular",
      position: shiftCover ? SHIFT_COVER_POSITION : employee.position ?? "",
      salary: String(employee.salary ?? ""),
      frequency: shiftCover ? "weekly" : employee.frequency ?? "monthly",
      hire_date: employee.hire_date ?? "",
      is_active: Boolean(employee.is_active),
    });
  };

  const updateEmployee = async () => {
    if (!editEmp) return;
    if (!editForm.name.trim()) { toast.error("Nombre requerido"); return; }
    const shiftCover = editForm.kind === "shift_cover";
    const { error } = await supabase
      .from("employees")
      .update({
        name: editForm.name.trim(),
        position: shiftCover ? SHIFT_COVER_POSITION : editForm.position.trim() || null,
        salary: Number(editForm.salary) || 0,
        frequency: (shiftCover ? "weekly" : editForm.frequency) as any,
        hire_date: editForm.hire_date || null,
        is_active: editForm.is_active,
      })
      .eq("id", editEmp.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Empleada actualizada");
    setEditEmp(null);
    qc.invalidateQueries({ queryKey: ["hr-employees"] });
  };

  const deleteEmployee = async (employee: any) => {
    if (!confirm(`¿Borrar a ${employee.name}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("employees").delete().eq("id", employee.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Empleada borrada");
    qc.invalidateQueries({ queryKey: ["hr-employees"] });
  };

  const openEmployee = (employeeId: string) => {
    navigate({ to: "/app/hr/$employeeId", params: { employeeId } });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Recursos Humanos</h1>
          <p className="text-sm text-muted-foreground">Expediente de vendedoras</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><UserPlus className="h-4 w-4 mr-1" /> Agregar</Button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><div className="flex items-center gap-2 text-muted-foreground text-xs"><Briefcase className="h-3.5 w-3.5" />Activas</div><p className="text-xl font-bold mt-1">{stats.active}</p></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-muted-foreground text-xs"><Plane className="h-3.5 w-3.5" />Vacaciones</div><p className="text-xl font-bold mt-1">{stats.onVac}</p></Card>
        <Card className="p-3"><div className="flex items-center gap-2 text-muted-foreground text-xs"><CircleDollarSign className="h-3.5 w-3.5" />Préstamos</div><p className="text-base md:text-xl font-bold mt-1 truncate">{formatMoney(stats.loanTotal)}</p></Card>
      </div>

      <Card className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {([
            ["active", "Activas"],
            ["all", "Todas"],
            ["with_loan", "Con préstamo"],
            ["on_vacation", "Vacaciones"],
            ["inactive", "Bajas"],
          ] as [Filter, string][]).map(([k, l]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)} className="shrink-0">{l}</Button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Sin resultados</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e: any) => {
            const initials = e.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
            const loanBal = loanMap.get(e.id);
            const onVac = vacSet.has(e.id);
            const shiftCover = isShiftCover(e.position);
            return (
              <Card
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => openEmployee(e.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEmployee(e.id);
                  }
                }}
                className="p-3 flex items-center gap-3 hover:bg-accent/30 active:bg-accent/50 transition cursor-pointer"
              >
                  <div className="h-11 w-11 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0">{initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{e.name}</p>
                      {!e.is_active && <Badge variant="secondary" className="text-[10px]">Baja</Badge>}
                      {shiftCover && <Badge variant="outline" className="text-[10px]">Cubre turnos</Badge>}
                      {onVac && <Badge className="bg-blue-500 text-[10px]">Vacaciones</Badge>}
                      {loanBal && <Badge variant="outline" className="text-[10px]">Préstamo {formatMoney(loanBal)}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.position || "Sin puesto"} · {formatMoney(Number(e.salary))} {labelFreq(e.frequency)}{shiftCover ? " · 2 días/semana" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      aria-label={`Editar ${e.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(e);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Borrar ${e.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteEmployee(e);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva empleada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as EmployeeKind, position: v === "shift_cover" ? SHIFT_COVER_POSITION : "", frequency: v === "shift_cover" ? "weekly" : form.frequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="shift_cover">Cubre turnos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Puesto</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Vendedora" disabled={form.kind === "shift_cover"} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Sueldo</Label><Input type="number" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
              <div>
                <Label>Frecuencia</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })} disabled={form.kind === "shift_cover"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.kind === "shift_cover" && (
              <Card className="p-3 bg-muted/40 text-sm text-muted-foreground">
                Cubre turnos trabaja 2 días por semana y no maneja vacaciones.
              </Card>
            )}
            <div><Label>Fecha de ingreso</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editEmp)} onOpenChange={(nextOpen) => !nextOpen && setEditEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar empleada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={editForm.kind} onValueChange={(v) => setEditForm({ ...editForm, kind: v as EmployeeKind, position: v === "shift_cover" ? SHIFT_COVER_POSITION : "", frequency: v === "shift_cover" ? "weekly" : editForm.frequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="shift_cover">Cubre turnos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Puesto</Label><Input value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} placeholder="Vendedora" disabled={editForm.kind === "shift_cover"} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Sueldo</Label><Input type="number" step="0.01" value={editForm.salary} onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })} /></div>
              <div>
                <Label>Frecuencia</Label>
                <Select value={editForm.frequency} onValueChange={(v) => setEditForm({ ...editForm, frequency: v })} disabled={editForm.kind === "shift_cover"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editForm.kind === "shift_cover" && (
              <Card className="p-3 bg-muted/40 text-sm text-muted-foreground">
                Cubre turnos trabaja 2 días por semana y no maneja vacaciones.
              </Card>
            )}
            <div><Label>Fecha de ingreso</Label><Input type="date" value={editForm.hire_date} onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
              Activa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmp(null)}>Cancelar</Button>
            <Button onClick={updateEmployee}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function labelFreq(f: string) {
  return { daily: "diario", weekly: "semanal", biweekly: "quincenal", monthly: "mensual" }[f] ?? f;
}
