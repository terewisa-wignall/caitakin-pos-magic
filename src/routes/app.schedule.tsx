import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, Download, Plus, Trash2, X, CalendarDays } from "lucide-react";
import * as htmlToImage from "html-to-image";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/app/schedule")({
  ssr: false,
  head: () => ({ meta: [{ title: "Horarios · CAsitakin" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: SchedulePage,
});

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAY_SHORT  = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDayNum(d: Date) { return String(d.getDate()); }
function fmtRange(a: Date, b: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${a.toLocaleDateString("es-MX", opts)} — ${b.toLocaleDateString("es-MX", opts)} ${b.getFullYear()}`;
}
function fmtShiftHours(shift: any, override?: string | null) {
  if (override) return override;
  if (!shift?.start_time) return "";
  return `${shift.start_time.slice(0, 5)}–${shift.end_time?.slice(0, 5) ?? ""}`;
}
function shiftClasses(color: string) {
  switch (color) {
    case "primary":   return "bg-primary/15 text-primary border-primary/30";
    case "secondary": return "bg-secondary/40 text-secondary-foreground border-secondary";
    case "accent":    return "bg-accent/40 text-accent-foreground border-accent";
    case "muted":     return "bg-muted text-muted-foreground border-border";
    default:          return "bg-muted text-muted-foreground border-border";
  }
}

function SchedulePage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const captureRef = useRef<HTMLDivElement>(null);
  const [addContext, setAddContext] = useState<{ date: string; shiftId: string } | null>(null);
  const [editEntry, setEditEntry] = useState<any | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const shifts = useQuery({
    queryKey: ["schedule-shifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_shifts").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const employees = useQuery({
    queryKey: ["schedule-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name,is_active").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const entries = useQuery({
    queryKey: ["schedule-entries", isoDate(weekStart)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_entries")
        .select("*")
        .gte("work_date", isoDate(weekStart))
        .lte("work_date", isoDate(weekEnd));
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of entries.data ?? []) {
      const key = `${e.work_date}|${e.shift_id}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [entries.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["schedule-entries", isoDate(weekStart)] });

  const clearWeek = async () => {
    if (!confirm("¿Borrar todo el horario de esta semana?")) return;
    const { error } = await supabase.from("schedule_entries").delete()
      .gte("work_date", isoDate(weekStart)).lte("work_date", isoDate(weekEnd));
    if (error) return toast.error(error.message);
    toast.success("Semana vaciada");
    refresh();
  };

  const downloadImage = async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(captureRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `horario-${isoDate(weekStart)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      toast.error("No se pudo generar la imagen");
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" /> Horarios
          </h1>
          <p className="text-sm text-muted-foreground">{fmtRange(weekStart, weekEnd)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoy</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}><Copy className="h-4 w-4 mr-1" /> Copiar</Button>
          <Button variant="outline" size="sm" onClick={downloadImage}><Download className="h-4 w-4 mr-1" /> Imagen</Button>
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={clearWeek} className="text-destructive"><Trash2 className="h-4 w-4 mr-1" /> Limpiar</Button>
          )}
        </div>
      </header>

      <div ref={captureRef} className="bg-background rounded-lg border overflow-hidden">
        {/* Capture header */}
        <div className="hidden print:flex md:flex items-center gap-3 p-3 border-b bg-card">
          <img src={logoAsset.url} alt="CAsitakin" className="h-9 w-9" />
          <div className="min-w-0">
            <p className="font-semibold">CAsitakin — Horario</p>
            <p className="text-xs text-muted-foreground">{fmtRange(weekStart, weekEnd)}</p>
          </div>
        </div>

        {/* Desktop grid */}
        <div className="hidden md:grid" style={{ gridTemplateColumns: `120px repeat(7, minmax(0, 1fr))` }}>
          <div className="border-b border-r p-2 bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">Turno</div>
          {days.map((d, i) => (
            <div key={i} className="border-b p-2 bg-muted/40 text-center">
              <p className="text-xs uppercase text-muted-foreground">{DAY_SHORT[i]}</p>
              <p className="text-lg font-semibold leading-none">{fmtDayNum(d)}</p>
            </div>
          ))}
          {(shifts.data ?? []).flatMap((s: any) => [
              <div key={`h-${s.id}`} className="border-b border-r p-2 flex flex-col justify-center">
                <p className="text-sm font-semibold">{s.label}</p>
                {s.start_time && <p className="text-[11px] text-muted-foreground">{s.start_time.slice(0,5)}–{s.end_time?.slice(0,5)}</p>}
              </div>,
              ...days.map((d) => {
                const key = `${isoDate(d)}|${s.id}`;
                const list = grouped.get(key) ?? [];
                return (
                  <button
                    key={`c-${s.id}-${isoDate(d)}`}
                    onClick={() => setAddContext({ date: isoDate(d), shiftId: s.id })}
                    className="border-b border-l text-left p-1.5 min-h-[80px] hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex flex-col gap-1">
                      {list.map((e: any) => {
                        const emp = employees.data?.find((x: any) => x.id === e.employee_id);
                        return (
                          <span
                            key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); setEditEntry(e); }}
                            className={`rounded px-2 py-1 text-xs border ${shiftClasses(s.color)} truncate cursor-pointer`}
                          >
                            <span className="font-medium">{emp?.name ?? "—"}</span>
                            {e.label_override && <span className="opacity-80"> · {e.label_override}</span>}
                          </span>
                        );
                      })}
                      {list.length === 0 && <span className="text-[11px] text-muted-foreground/60">+ agregar</span>}
                    </div>
                  </button>
                );
              }),
          ])}
        </div>

        {/* Mobile: por día */}
        <div className="md:hidden divide-y">
          {days.map((d, di) => (
            <div key={di} className="p-3">
              <div className="flex items-baseline justify-between mb-2">
                <p className="font-semibold">{DAY_LABELS[di]}</p>
                <p className="text-sm text-muted-foreground">{fmtDayNum(d)} {d.toLocaleDateString("es-MX", { month: "short" })}</p>
              </div>
              <div className="space-y-2">
                {(shifts.data ?? []).map((s: any) => {
                  const list = grouped.get(`${isoDate(d)}|${s.id}`) ?? [];
                  return (
                    <div key={s.id} className={`rounded-lg border ${shiftClasses(s.color)} p-2`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold">{s.label} {s.start_time && <span className="text-[11px] opacity-80">· {s.start_time.slice(0,5)}–{s.end_time?.slice(0,5)}</span>}</p>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddContext({ date: isoDate(d), shiftId: s.id })}><Plus className="h-4 w-4" /></Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {list.map((e: any) => {
                          const emp = employees.data?.find((x: any) => x.id === e.employee_id);
                          return (
                            <button key={e.id} onClick={() => setEditEntry(e)} className="rounded-full bg-background/70 px-2.5 py-1 text-xs border">
                              {emp?.name ?? "—"}{e.label_override ? ` · ${e.label_override}` : ""}
                            </button>
                          );
                        })}
                        {list.length === 0 && <span className="text-xs opacity-60">Sin asignar</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddEntryDialog
        open={!!addContext}
        onClose={() => setAddContext(null)}
        context={addContext}
        employees={employees.data ?? []}
        shifts={shifts.data ?? []}
        userId={user?.id}
        onSaved={refresh}
      />
      <EditEntryDialog
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        employees={employees.data ?? []}
        shifts={shifts.data ?? []}
        onSaved={refresh}
      />
      <CopyWeekDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        currentWeekStart={weekStart}
        userId={user?.id}
        onDone={refresh}
      />
    </div>
  );
}

function AddEntryDialog({ open, onClose, context, employees, shifts, userId, onSaved }: any) {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [labelOverride, setLabelOverride] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync when opened
  useEffect(() => {
    if (open && context) {
      setShiftId(context.shiftId);
      setEmployeeId("");
      setLabelOverride("");
      setNote("");
    }
  }, [open, context]);

  const save = async () => {
    if (!employeeId || !shiftId || !context) { toast.error("Elige empleada"); return; }
    setSaving(true);
    const { error } = await supabase.from("schedule_entries").insert({
      work_date: context.date,
      shift_id: shiftId,
      employee_id: employeeId,
      label_override: labelOverride || null,
      note: note || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Agregado");
    onSaved();
    onClose();
  };

  if (!context) return null;
  const dateLabel = new Date(context.date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Dialog open={open} onOpenChange={(n) => !n && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agregar al horario</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 capitalize">{dateLabel}</p>
        <div className="space-y-3">
          <div>
            <Label>Turno</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                {shifts.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Empleada</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Elegir empleada" /></SelectTrigger>
              <SelectContent>
                {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Hora personalizada (opcional)</Label>
            <Input value={labelOverride} onChange={(e) => setLabelOverride(e.target.value)} placeholder="Ej. 9AM-2PM" />
          </div>
          <div>
            <Label>Nota (opcional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryDialog({ entry, onClose, employees, shifts, onSaved }: any) {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [labelOverride, setLabelOverride] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setEmployeeId(entry.employee_id ?? "");
      setShiftId(entry.shift_id);
      setLabelOverride(entry.label_override ?? "");
      setNote(entry.note ?? "");
    }
  }, [entry]);

  if (!entry) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("schedule_entries").update({
      employee_id: employeeId || null,
      shift_id: shiftId,
      label_override: labelOverride || null,
      note: note || null,
    }).eq("id", entry.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Actualizado");
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!confirm("¿Eliminar este turno?")) return;
    const { error } = await supabase.from("schedule_entries").delete().eq("id", entry.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    onSaved();
    onClose();
  };

  const dateLabel = new Date(entry.work_date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Dialog open={!!entry} onOpenChange={(n) => !n && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar turno</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 capitalize">{dateLabel}</p>
        <div className="space-y-3">
          <div>
            <Label>Turno</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {shifts.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Empleada</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Hora personalizada</Label>
            <Input value={labelOverride} onChange={(e) => setLabelOverride(e.target.value)} placeholder="Ej. 9AM-2PM" />
          </div>
          <div>
            <Label>Nota</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-row justify-between">
          <Button variant="destructive" onClick={remove}><X className="h-4 w-4 mr-1" /> Borrar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyWeekDialog({ open, onClose, currentWeekStart, userId, onDone }: any) {
  const [fromDate, setFromDate] = useState(() => isoDate(addDays(currentWeekStart, -7)));
  const [toDate, setToDate] = useState(() => isoDate(currentWeekStart));
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const from = startOfWeek(new Date(fromDate + "T12:00:00"));
    const to = startOfWeek(new Date(toDate + "T12:00:00"));
    const { data: src, error } = await supabase
      .from("schedule_entries").select("*")
      .gte("work_date", isoDate(from)).lte("work_date", isoDate(addDays(from, 6)));
    if (error) { setBusy(false); return toast.error(error.message); }
    if (mode === "replace") {
      const del = await supabase.from("schedule_entries").delete()
        .gte("work_date", isoDate(to)).lte("work_date", isoDate(addDays(to, 6)));
      if (del.error) { setBusy(false); return toast.error(del.error.message); }
    }
    const rows = (src ?? []).map((e: any) => {
      const srcDay = new Date(e.work_date + "T12:00:00");
      const offset = Math.round((srcDay.getTime() - from.getTime()) / 86400000);
      return {
        work_date: isoDate(addDays(to, offset)),
        shift_id: e.shift_id,
        employee_id: e.employee_id,
        label_override: e.label_override,
        note: e.note,
        created_by: userId,
      };
    });
    if (rows.length) {
      const ins = await supabase.from("schedule_entries").insert(rows);
      if (ins.error) { setBusy(false); return toast.error(ins.error.message); }
    }
    setBusy(false);
    toast.success(`Copiado (${rows.length} entradas)`);
    onDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(n) => !n && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Copiar horario</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Copiar de la semana que contiene</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label>Pegar en la semana que contiene</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <Label>¿Qué hacer con lo que ya hay?</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Reemplazar semana destino</SelectItem>
                <SelectItem value="merge">Agregar sin borrar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={run} disabled={busy}>{busy ? "Copiando…" : "Copiar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
