import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate, formatDateShort } from "@/lib/format";
import { toast } from "sonner";
import { Printer, ReceiptText, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/commissions")({
  head: () => ({ meta: [{ title: "Comisiones · CAsitakin" }] }),
  component: CommissionsPage,
});

type CommissionRow = {
  id: string;
  commission_amount: number;
  commission_rate: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  payment_method: string | null;
  seller_id: string;
  profile: { name: string } | null;
  order: { id: string; total: number; currency: string; created_at: string } | null;
};

type ViewMode = "cutoff" | "pending" | "paid" | "by-seller";

function startOfDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function commissionCutoff(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  if (day <= 5) {
    return {
      label: `Corte 5 ${now.toLocaleDateString("es-MX", { month: "short" })}`,
      start: new Date(year, month - 1, 21),
      end: new Date(year, month, 5, 23, 59, 59),
      payDate: new Date(year, month, 5),
    };
  }
  if (day <= 20) {
    return {
      label: `Corte 20 ${now.toLocaleDateString("es-MX", { month: "short" })}`,
      start: new Date(year, month, 6),
      end: new Date(year, month, 20, 23, 59, 59),
      payDate: new Date(year, month, 20),
    };
  }
  const next = new Date(year, month + 1, 1);
  return {
    label: `Corte 5 ${next.toLocaleDateString("es-MX", { month: "short" })}`,
    start: new Date(year, month, 21),
    end: new Date(year, month + 1, 5, 23, 59, 59),
    payDate: new Date(year, month + 1, 5),
  };
}

function printableReceipt(rows: CommissionRow[], sellerName: string, label: string) {
  const total = rows.reduce((s, c) => s + Number(c.commission_amount), 0);
  const lines = rows.map((c) => `
    <tr>
      <td>${formatDateShort(c.created_at)}</td>
      <td>${formatMoney(Number(c.order?.total || 0), (c.order?.currency || c.currency) as never)}</td>
      <td>${c.commission_rate}%</td>
      <td style="text-align:right">${formatMoney(Number(c.commission_amount), c.currency as never)}</td>
    </tr>
  `).join("");
  const win = window.open("", "_blank", "width=760,height=900");
  if (!win) return;
  win.document.write(`
    <html>
      <head>
        <title>Recibo de comisiones</title>
        <style>
          body{font-family:Arial,sans-serif;padding:28px;color:#2f2925}
          h1{margin:0 0 6px;font-size:24px}
          .muted{color:#746b63;font-size:13px}
          .total{font-size:28px;font-weight:700;margin:18px 0}
          table{width:100%;border-collapse:collapse;margin-top:16px}
          th,td{border-bottom:1px solid #ddd;padding:9px;text-align:left;font-size:13px}
          th{background:#f4eee9}
          .sign{margin-top:56px;border-top:1px solid #333;width:280px;text-align:center;padding-top:8px}
        </style>
      </head>
      <body>
        <h1>Recibo de comisiones</h1>
        <div class="muted">CAsitakin · ${label}</div>
        <p><strong>Vendedora:</strong> ${sellerName}</p>
        <p><strong>Generado:</strong> ${formatDate(new Date().toISOString())}</p>
        <div class="total">${formatMoney(total)}</div>
        <table>
          <thead><tr><th>Venta</th><th>Total venta</th><th>%</th><th>Comision</th></tr></thead>
          <tbody>${lines}</tbody>
        </table>
        <div class="sign">Firma de recibido</div>
        <script>window.print()</script>
      </body>
    </html>
  `);
  win.document.close();
}

function CommissionsPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<ViewMode>(isAdmin ? "by-seller" : "cutoff");
  const [receiptRows, setReceiptRows] = useState<CommissionRow[]>([]);
  const [receiptSellerName, setReceiptSellerName] = useState<string>("");
  const [paying, setPaying] = useState<string | null>(null);
  const cutoff = useMemo(() => commissionCutoff(), []);

  const q = useQuery({
    queryKey: ["commissions", isAdmin, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      let query = supabase
        .from("commissions")
        .select(
          "id,commission_amount,commission_rate,currency,created_at,paid_at,payment_method,seller_id, profile:profiles!commissions_seller_id_fkey(name), order:orders(id,total,currency,created_at)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (!isAdmin && profile?.id) query = query.eq("seller_id", profile.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CommissionRow[];
    },
  });

  const storeTotals = useQuery({
    queryKey: ["store-totals", isAdmin, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const todayFrom = startOfDayISO();
      const monthFrom = startOfMonthISO();
      let todayQ = supabase.from("orders").select("total,currency").gte("created_at", todayFrom);
      let monthQ = supabase.from("orders").select("total,currency").gte("created_at", monthFrom);
      if (!isAdmin && profile?.id) {
        todayQ = todayQ.eq("seller_id", profile.id);
        monthQ = monthQ.eq("seller_id", profile.id);
      }
      const [today, month] = await Promise.all([todayQ, monthQ]);
      const sum = (rows: { total: number; currency: string }[] | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      return { today: sum(today.data), month: sum(month.data) };
    },
  });

  const rows = q.data ?? [];
  const cutoffRows = rows.filter((c) => !c.paid_at && new Date(c.created_at) >= cutoff.start && new Date(c.created_at) <= cutoff.end);
  const pendingRows = rows.filter((c) => !c.paid_at);
  const paidRows = rows.filter((c) => c.paid_at);
  const visibleRows = mode === "cutoff" ? cutoffRows : mode === "pending" ? pendingRows : mode === "paid" ? paidRows : [];
  const totalCutoff = cutoffRows.reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalPending = pendingRows.reduce((s, c) => s + Number(c.commission_amount), 0);
  const sellerName = profile?.name || "Vendedora";

  // Group by seller (admin only view)
  const bySeller = useMemo(() => {
    const map = new Map<string, { sellerId: string; name: string; cutoffTotal: number; pendingTotal: number; cutoffRows: CommissionRow[]; pendingRows: CommissionRow[] }>();
    rows.forEach((c) => {
      const key = c.seller_id;
      const entry = map.get(key) ?? { sellerId: key, name: c.profile?.name || "—", cutoffTotal: 0, pendingTotal: 0, cutoffRows: [], pendingRows: [] };
      if (!c.paid_at) {
        entry.pendingTotal += Number(c.commission_amount);
        entry.pendingRows.push(c);
        if (new Date(c.created_at) >= cutoff.start && new Date(c.created_at) <= cutoff.end) {
          entry.cutoffTotal += Number(c.commission_amount);
          entry.cutoffRows.push(c);
        }
      }
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.cutoffTotal - a.cutoffTotal);
  }, [rows, cutoff.start, cutoff.end]);

  const markCutoffPaid = async (sellerId: string, sellerName: string, rowsToPay: CommissionRow[]) => {
    if (rowsToPay.length === 0) return;
    if (!confirm(`Marcar como pagado el corte de ${sellerName} (${formatMoney(rowsToPay.reduce((s, c) => s + Number(c.commission_amount), 0))})?`)) return;
    setPaying(sellerId);
    const ids = rowsToPay.map((c) => c.id);
    const total = rowsToPay.reduce((s, c) => s + Number(c.commission_amount), 0);
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("commissions")
      .update({ paid_at: nowIso, payment_method: "cash" })
      .in("id", ids);
    if (upErr) { setPaying(null); toast.error(upErr.message); return; }
    await supabase.from("commission_payments").insert({
      seller_id: sellerId,
      total_amount: total,
      currency: "MXN",
      payment_method: "cash",
      paid_at: nowIso,
      cutoff_label: cutoff.label,
      note: `Corte ${cutoff.label}`,
    });
    setPaying(null);
    toast.success("Corte marcado como pagado");
    qc.invalidateQueries({ queryKey: ["commissions"] });
  };


  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Comisiones</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Todas las comisiones" : "Mis comisiones y cortes de pago"}
          </p>
        </div>
        {!isAdmin && (
          <Button size="sm" disabled={cutoffRows.length === 0} onClick={() => setReceiptRows(cutoffRows)}>
            <ReceiptText className="h-4 w-4 mr-1" /> Generar recibo
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">{cutoff.label}</p>
          <p className="text-2xl md:text-3xl font-bold font-numeric text-primary">{formatMoney(totalCutoff)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Pago {formatDateShort(ymd(cutoff.payDate))}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Pendiente total</p>
          <p className="text-2xl md:text-3xl font-bold font-numeric">{formatMoney(totalPending)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Ventas este mes</p>
          <p className="text-2xl md:text-3xl font-bold font-numeric">{formatMoney(storeTotals.data?.month ?? 0)}</p>
        </Card>
      </div>

      <Card className="p-3 space-y-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Button size="sm" variant={mode === "cutoff" ? "default" : "outline"} onClick={() => setMode("cutoff")} className="shrink-0">Corte actual</Button>
          <Button size="sm" variant={mode === "pending" ? "default" : "outline"} onClick={() => setMode("pending")} className="shrink-0">Pendientes</Button>
          <Button size="sm" variant={mode === "paid" ? "default" : "outline"} onClick={() => setMode("paid")} className="shrink-0">Pagadas</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Los cortes se pagan los días 5 y 20. Las comisiones se generan cuando se cierra una venta y usan el porcentaje configurado en RRHH.
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y">
          {visibleRows.map((c) => (
            <li key={c.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{isAdmin ? c.profile?.name || "—" : "Venta comisionada"}</p>
                  <Badge variant={c.paid_at ? "secondary" : "outline"} className="text-[10px]">
                    {c.paid_at ? "Pagada" : "Pendiente"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(c.created_at)} · {c.commission_rate}% · Venta {formatMoney(Number(c.order?.total || 0), (c.order?.currency || "MXN") as never)}
                </p>
              </div>
              <p className="font-numeric font-semibold text-accent-foreground shrink-0">
                {formatMoney(Number(c.commission_amount), c.currency as never)}
              </p>
            </li>
          ))}
          {!q.isLoading && visibleRows.length === 0 && (
            <li className="p-8 text-center text-muted-foreground text-sm">Sin comisiones en esta vista</li>
          )}
        </ul>
      </Card>

      <Dialog open={receiptRows.length > 0} onOpenChange={(open) => !open && setReceiptRows([])}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recibo de comisiones</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">{cutoff.label}</p>
              <p className="text-2xl font-bold">{formatMoney(receiptRows.reduce((s, c) => s + Number(c.commission_amount), 0))}</p>
              <p className="text-xs text-muted-foreground">{receiptRows.length} venta(s) incluidas</p>
            </Card>
            <div className="max-h-72 overflow-y-auto divide-y border rounded-md">
              {receiptRows.map((c) => (
                <div key={c.id} className="p-3 flex items-center justify-between text-sm">
                  <span>{formatDateShort(c.created_at)} · venta {formatMoney(Number(c.order?.total || 0), (c.order?.currency || "MXN") as never)}</span>
                  <strong>{formatMoney(Number(c.commission_amount), c.currency as never)}</strong>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptRows([])}>Cerrar</Button>
            <Button onClick={() => printableReceipt(receiptRows, sellerName, cutoff.label)}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir / PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
