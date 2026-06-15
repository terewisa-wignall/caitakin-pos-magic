import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate, type Currency } from "@/lib/format";

const MXN_DENOMINATIONS = [500, 200, 100, 50, 20] as const;
const USD_DENOMINATIONS = [100, 50, 20, 10, 5, 1] as const;

type Counts = Record<string, string>;

function emptyCounts(denominations: readonly number[]) {
  return Object.fromEntries(denominations.map((d) => [String(d), ""])) as Counts;
}

function countTotal(counts: Counts, denominations: readonly number[]) {
  return denominations.reduce((sum, denomination) => {
    const count = Math.max(0, Number(counts[String(denomination)]) || 0);
    return sum + denomination * count;
  }, 0);
}

export const Route = createFileRoute("/app/cash")({
  head: () => ({ meta: [{ title: "Caja · CAsitakin" }] }),
  component: CashPage,
});

function CashPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState<"open" | "close" | "income" | "expense" | null>(null);

  const session = useQuery({
    queryKey: ["cash-session"],
    queryFn: async () => {
      const { data } = await supabase.from("cash_sessions").select("*").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const movements = useQuery({
    queryKey: ["cash-movements", session.data?.id],
    queryFn: async () => {
      if (!session.data) return [];
      const { data } = await supabase.from("cash_movements").select("*").eq("cash_session_id", session.data.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!session.data,
  });

  const summary = (() => {
    const sums: Record<string, { income: number; expense: number }> = { MXN: { income: 0, expense: 0 }, USD: { income: 0, expense: 0 }, EUR: { income: 0, expense: 0 } };
    (movements.data ?? []).forEach((m: any) => {
      if (!sums[m.currency]) sums[m.currency] = { income: 0, expense: 0 };
      if (m.type === "income") sums[m.currency].income += Number(m.amount);
      else sums[m.currency].expense += Number(m.amount);
    });
    return sums;
  })();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl md:text-3xl font-bold">Caja</h1><p className="text-sm text-muted-foreground">Apertura, cierre y movimientos</p></div>
        {!session.data ? (
          <Button onClick={() => setOpenDialog("open")}><Unlock className="h-4 w-4 mr-2" /> Abrir caja</Button>
        ) : (
          <Button variant="outline" onClick={() => setOpenDialog("close")}><Lock className="h-4 w-4 mr-2" /> Cerrar</Button>
        )}
      </header>

      {!session.data ? (
        <Card className="p-8 text-center">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No hay caja abierta</p>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted-foreground">Caja abierta desde</p>
                <p className="font-medium">{formatDate(session.data.opened_at)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {(["MXN", "USD", "EUR"] as const).map((c) => {
                const s: any = session.data;
                const opening = Number(s?.[`opening_amount_${c.toLowerCase()}`] || 0);
                return (
                  <div key={c} className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{c}</p>
                    <p className="text-xs">Apertura: <span className="font-numeric">{formatMoney(opening, c)}</span></p>
                    <p className="text-xs text-success">+ {formatMoney(summary[c].income, c)}</p>
                    <p className="text-xs text-destructive">− {formatMoney(summary[c].expense, c)}</p>
                    <p className="font-numeric font-semibold mt-1">{formatMoney(opening + summary[c].income - summary[c].expense, c)}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setOpenDialog("income")} className="h-12"><ArrowDownCircle className="h-4 w-4 mr-2" /> Ingreso</Button>
            <Button onClick={() => setOpenDialog("expense")} variant="outline" className="h-12"><ArrowUpCircle className="h-4 w-4 mr-2" /> Egreso</Button>
          </div>

          <Card className="p-5">
            <h2 className="font-semibold mb-3">Movimientos</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(movements.data ?? []).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.concept}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(m.created_at)} · {m.payment_method || "—"}</p>
                  </div>
                  <p className={`font-numeric font-semibold ${m.type === "income" ? "text-success" : "text-destructive"}`}>
                    {m.type === "income" ? "+" : "−"}{formatMoney(Number(m.amount), m.currency)}
                  </p>
                </div>
              ))}
              {movements.data?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos</p>}
            </div>
          </Card>
        </>
      )}

      <SessionDialog
        type={openDialog}
        session={session.data}
        userId={user?.id ?? ""}
        onClose={() => { setOpenDialog(null); qc.invalidateQueries({ queryKey: ["cash-session"] }); qc.invalidateQueries({ queryKey: ["cash-movements"] }); }}
      />
    </div>
  );
}

function SessionDialog({ type, session, userId, onClose }: any) {
  const [mxn, setMxn] = useState(0); const [usd, setUsd] = useState(0); const [eur, setEur] = useState(0);
  const [mxnCounts, setMxnCounts] = useState<Counts>(() => emptyCounts(MXN_DENOMINATIONS));
  const [mxnCoins, setMxnCoins] = useState("");
  const [usdCounts, setUsdCounts] = useState<Counts>(() => emptyCounts(USD_DENOMINATIONS));
  const [concept, setConcept] = useState(""); const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<Currency>("MXN"); const [method, setMethod] = useState("cash");
  const [loading, setLoading] = useState(false);

  const openingMxn = countTotal(mxnCounts, MXN_DENOMINATIONS) + Math.max(0, Number(mxnCoins) || 0);
  const openingUsd = countTotal(usdCounts, USD_DENOMINATIONS);

  const resetCashCount = () => {
    setMxn(0); setUsd(0); setEur(0);
    setMxnCounts(emptyCounts(MXN_DENOMINATIONS));
    setMxnCoins("");
    setUsdCounts(emptyCounts(USD_DENOMINATIONS));
  };

  const submit = async () => {
    setLoading(true);
    try {
      if (type === "open") {
        const { error } = await supabase.from("cash_sessions").insert({
          opened_by: userId, opening_amount_mxn: openingMxn, opening_amount_usd: openingUsd, opening_amount_eur: 0,
        });
        if (error) throw error; toast.success("Caja abierta");
      } else if (type === "close") {
        const { error } = await supabase.from("cash_sessions").update({
          status: "closed", closed_by: userId, closed_at: new Date().toISOString(),
          closing_amount_mxn: mxn, closing_amount_usd: usd, closing_amount_eur: eur,
        }).eq("id", session.id);
        if (error) throw error; toast.success("Caja cerrada");
      } else if (type === "income" || type === "expense") {
        if (!concept || !amount) { toast.error("Datos incompletos"); setLoading(false); return; }
        const { error } = await supabase.from("cash_movements").insert({
          cash_session_id: session.id, type, concept, amount, currency, payment_method: method, created_by: userId,
        });
        if (error) throw error; toast.success("Registrado");
      }
      resetCashCount(); setConcept(""); setAmount(0);
      onClose();
    } catch (e: any) { toast.error(e.message || "Error"); }
    finally { setLoading(false); }
  };

  const title = { open: "Abrir caja", close: "Cerrar caja", income: "Registrar ingreso", expense: "Registrar egreso" }[type as string] || "";

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={type === "open" ? "max-h-[90vh] overflow-y-auto" : undefined}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {type === "open" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Cuenta el fondo inicial por denominación.</p>
            <CashCountTable
              title="Pesos"
              currency="MXN"
              denominations={MXN_DENOMINATIONS}
              counts={mxnCounts}
              onCountChange={(denomination, value) => setMxnCounts((prev) => ({ ...prev, [denomination]: value }))}
              coinsValue={mxnCoins}
              onCoinsChange={setMxnCoins}
              total={openingMxn}
            />
            <CashCountTable
              title="Dólares"
              currency="USD"
              denominations={USD_DENOMINATIONS}
              counts={usdCounts}
              onCountChange={(denomination, value) => setUsdCounts((prev) => ({ ...prev, [denomination]: value }))}
              total={openingUsd}
            />
            <Card className="p-3 bg-muted/40 text-sm text-muted-foreground">
              EUR no se incluye como fondo inicial. Si reciben euros durante el día, regístralos como ingreso en EUR.
            </Card>
          </div>
        )}
        {type === "close" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Monto final por moneda:</p>
            <div><Label>MXN</Label><Input type="number" value={mxn} onChange={(e) => setMxn(Number(e.target.value))} className="font-numeric" /></div>
            <div><Label>USD</Label><Input type="number" value={usd} onChange={(e) => setUsd(Number(e.target.value))} className="font-numeric" /></div>
            <div><Label>EUR</Label><Input type="number" value={eur} onChange={(e) => setEur(Number(e.target.value))} className="font-numeric" /></div>
          </div>
        )}
        {(type === "income" || type === "expense") && (
          <div className="space-y-3">
            <div><Label>Concepto</Label><Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Compra de materiales" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Monto</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="font-numeric" /></div>
              <div><Label>Moneda</Label>
                <Select value={currency} onValueChange={(v: Currency) => setCurrency(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="MXN">MXN</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="debit_card">Débito</SelectItem><SelectItem value="credit_card">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <Button onClick={submit} disabled={loading} className="w-full">{loading ? "Guardando..." : "Confirmar"}</Button>
      </DialogContent>
    </Dialog>
  );
}

function CashCountTable({
  title,
  currency,
  denominations,
  counts,
  onCountChange,
  coinsValue,
  onCoinsChange,
  total,
}: {
  title: string;
  currency: Currency;
  denominations: readonly number[];
  counts: Counts;
  onCountChange: (denomination: string, value: string) => void;
  coinsValue?: string;
  onCoinsChange?: (value: string) => void;
  total: number;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/50 px-3 py-2 text-center text-sm font-semibold uppercase">{title}</div>
      <div className="grid grid-cols-[1fr_1fr_1fr] border-t text-xs font-semibold uppercase text-muted-foreground">
        <div className="border-r px-2 py-2 text-center">Denominación</div>
        <div className="border-r px-2 py-2 text-center">Cant</div>
        <div className="px-2 py-2 text-center">Importe</div>
      </div>
      {denominations.map((denomination) => {
        const count = Math.max(0, Number(counts[String(denomination)]) || 0);
        return (
          <div key={denomination} className="grid grid-cols-[1fr_1fr_1fr] items-center border-t">
            <div className="border-r px-2 py-2 text-center font-numeric">{denomination}</div>
            <div className="border-r p-1">
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={counts[String(denomination)]}
                onChange={(e) => onCountChange(String(denomination), e.target.value)}
                className="h-8 text-center font-numeric"
              />
            </div>
            <div className="px-2 py-2 text-right font-numeric">{formatMoney(denomination * count, currency)}</div>
          </div>
        );
      })}
      {onCoinsChange && (
        <div className="grid grid-cols-[1fr_1fr_1fr] items-center border-t">
          <div className="border-r px-2 py-2 text-center font-medium">Mon</div>
          <div className="border-r px-2 py-2 text-center text-xs text-muted-foreground">Monto</div>
          <div className="p-1">
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={coinsValue}
              onChange={(e) => onCoinsChange(e.target.value)}
              className="h-8 text-right font-numeric"
            />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-sm">
        <span className="font-medium">Total</span>
        <span className="font-numeric font-semibold">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}
