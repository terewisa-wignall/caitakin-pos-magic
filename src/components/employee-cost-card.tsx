import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Receipt, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDateShort } from "@/lib/format";
import { parseEmployerPdf } from "@/lib/employer-pdf";

const db = supabase.from as any;
const BUCKET = "employee-docs";
const n = (v: unknown) => Number(v) || 0;
const KIND: Record<string, string> = { imss: "IMSS e Infonavit (SIPARE)", nomina_4pct: "4% impuesto sobre nómina" };

type EmployerPayment = {
  id: string; kind: string; period: string; bimester: string | null; due_date: string | null;
  patronal: number; obrera: number; total: number; doc_path: string | null; paid_at: string | null; receipt_path: string | null;
};

/** Cuánto cuestan las empleadas en el mes. Solo administradoras (RLS en employer_payments). */
export function EmployeeCostCard({ monthStart, monthEnd, payments }: { monthStart: string; monthEnd: string; payments: any[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const pdfInput = useRef<HTMLInputElement>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const commissions = useQuery({
    queryKey: ["cost-commissions", monthStart],
    queryFn: async () => {
      const { data } = await db("commission_payments").select("total_amount").gte("paid_at", monthStart).lte("paid_at", monthEnd);
      return ((data ?? []) as { total_amount: number }[]).reduce((s, r) => s + n(r.total_amount), 0);
    },
  });

  const employer = useQuery({
    queryKey: ["employer-payments"],
    queryFn: async () => {
      const { data, error } = await db("employer_payments").select("*").order("period", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as EmployerPayment[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["employer-payments"] });

  const rows = payments.filter((p) => p.paid_at >= monthStart && p.paid_at <= monthEnd);
  const sum = (f: (p: any) => number) => rows.reduce((s, p) => s + f(p), 0);
  const gross = sum((p) => n(p.gross_amount) || n(p.amount));
  const finiquito = sum((p) => n(p.vacation_amount) + n(p.vacation_premium) + n(p.christmas_bonus));
  const comm = commissions.data ?? 0;

  const paidThisMonth = (employer.data ?? []).filter((e) => e.paid_at && e.paid_at >= monthStart && e.paid_at <= monthEnd);
  const imss = paidThisMonth.filter((e) => e.kind === "imss").reduce((s, e) => s + n(e.patronal), 0);
  const tax4Paid = paidThisMonth.filter((e) => e.kind === "nomina_4pct").reduce((s, e) => s + n(e.total), 0);
  const tax4 = tax4Paid || Math.round((gross + comm) * 0.04 * 100) / 100;
  const total = gross + comm + imss + tax4;
  const pending = (employer.data ?? []).filter((e) => !e.paid_at);

  const uploadFile = async (file: File, folder: string, id: string) => {
    const path = `employer/${id}/${folder}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  };

  const onPdf = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await parseEmployerPdf(file);
      if (!parsed) { toast.error("No pude leer este PDF. Debe ser el SIPARE o la declaración del 4%."); return; }
      const id = crypto.randomUUID();
      const doc_path = await uploadFile(file, "doc", id);
      const { error } = await db("employer_payments").insert({ id, ...parsed, doc_path, created_by: user?.id });
      if (error) throw error;
      toast.success(`${KIND[parsed.kind]}: ${formatMoney(parsed.total)} por pagar`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir el PDF");
    } finally {
      setBusy(false);
    }
  };

  const onReceipt = async (file: File) => {
    if (!receiptFor) return;
    setBusy(true);
    try {
      const receipt_path = await uploadFile(file, "pago", receiptFor);
      const { error } = await db("employer_payments").update({ receipt_path, paid_at: new Date().toISOString().slice(0, 10) }).eq("id", receiptFor);
      if (error) throw error;
      toast.success("Pago registrado");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir el comprobante");
    } finally {
      setBusy(false);
      setReceiptFor(null);
    }
  };

  const open = async (path: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data) return toast.error("No se pudo abrir el archivo");
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (e: EmployerPayment) => {
    if (!confirm("¿Eliminar este pago?")) return;
    const { error } = await db("employer_payments").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    const paths = [e.doc_path, e.receipt_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    refresh();
  };

  const Line = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
    <div className="flex justify-between text-sm py-1.5 border-b last:border-b-0">
      <span className="text-muted-foreground">
        {label}
        {hint && <span className="block text-[11px]">{hint}</span>}
      </span>
      <span className="font-numeric">{formatMoney(value)}</span>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="flex items-end justify-between mb-2">
        <h2 className="font-semibold text-sm">Costo de empleadas del mes</h2>
        <p className="text-xl font-bold font-numeric">{formatMoney(total)}</p>
      </div>
      <Line label="Sueldos y bonos" value={gross - finiquito} />
      <Line label="Finiquito mensual" value={finiquito} hint="Vacaciones, prima y aguinaldo" />
      <Line label="Comisiones" value={comm} />
      <Line label="IMSS e Infonavit patronal" value={imss} hint="Cuenta cuando registras el comprobante de pago" />
      <Line label="4% impuesto sobre nómina" value={tax4} hint={tax4Paid ? "Pagado" : "Estimado sobre sueldos + comisiones"} />

      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pagos del contador</h3>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => pdfInput.current?.click()}>
          <FileUp className="h-4 w-4 mr-1" /> Subir PDF
        </Button>
      </div>
      <input ref={pdfInput} type="file" accept="application/pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPdf(f); }} />
      <input ref={receiptInput} type="file" accept="application/pdf,image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onReceipt(f); }} />

      {employer.isError ? (
        <p className="text-sm text-destructive mt-2">No se pudieron cargar los pagos.</p>
      ) : !(employer.data ?? []).length ? (
        <p className="text-sm text-muted-foreground mt-2">Sube el PDF que te manda la contadora (SIPARE o 4%).</p>
      ) : (
        <ul className="mt-2 divide-y">
          {(employer.data ?? []).slice(0, 8).map((e) => (
            <li key={e.id} className="py-2 flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {KIND[e.kind]} · {e.period.slice(5, 7)}/{e.period.slice(0, 4)}{" "}
                  {e.paid_at ? <Badge variant="outline" className="text-[10px]">Pagado {formatDateShort(e.paid_at)}</Badge> : <Badge className="text-[10px]">Por pagar</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(e.total)}{e.kind === "imss" ? ` (patronal ${formatMoney(e.patronal)})` : ""}
                  {e.due_date && !e.paid_at ? ` · vence ${formatDateShort(e.due_date)}` : ""}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ver PDF" onClick={() => open(e.doc_path)}><FileText className="h-4 w-4" /></Button>
              {e.paid_at ? (
                e.receipt_path && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ver comprobante" onClick={() => open(e.receipt_path)}><Receipt className="h-4 w-4" /></Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => { setReceiptFor(e.id); receiptInput.current?.click(); }}>Subir comprobante</Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Eliminar" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && <p className="text-[11px] text-muted-foreground mt-2">{pending.length} por pagar</p>}
    </Card>
  );
}
