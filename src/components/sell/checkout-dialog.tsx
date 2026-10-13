import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Banknote,
  Camera,
  ChevronDown,
  CreditCard,
  IdCard,
  Landmark,
  Plus,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, type Currency } from "@/lib/format";
import { saveRate, type TodayRates } from "@/lib/exchange-rates";
import { cn } from "@/lib/utils";

export type PaymentMethod = "cash" | "transfer" | "debit_card" | "credit_card";
export type Payment = { method: PaymentMethod; currency: Currency; amount: number; voucherFile?: File | null };
export type CheckoutPayload = { currency: Currency; payments: Payment[] };

type SimpleMethod = "cash" | "card" | "transfer";

const CURRENCIES: Currency[] = ["MXN", "USD", "EUR"];
const BILLS: Record<Currency, number[]> = {
  MXN: [50, 100, 200, 500, 1000],
  USD: [1, 5, 10, 20, 50, 100],
  EUR: [5, 10, 20, 50, 100],
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Cada pago en moneda extranjera se redondea a centavos; esto absorbe esa diferencia al convertir a MXN.
export function paymentsToleranceMxn(payments: Payment[], rates: TodayRates) {
  return payments.reduce(
    (tol, p) => (p.currency === "MXN" ? tol : tol + 0.005 * (rates[p.currency] ?? 0)),
    0.01,
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotalMxn: number;
  totalMxn: number;
  discount: number;
  setDiscount: (n: number) => void;
  soldAtLocal: string;
  setSoldAtLocal: (s: string) => void;
  customerIdFile: File | null;
  setCustomerIdFile: (f: File | null) => void;
  rates: TodayRates;
  isAdmin: boolean;
  loading: boolean;
  onConfirm: (payload: CheckoutPayload) => void;
};

export function CheckoutDialog({
  open, onOpenChange, subtotalMxn, totalMxn, discount, setDiscount, soldAtLocal, setSoldAtLocal,
  customerIdFile, setCustomerIdFile, rates, isAdmin, loading, onConfirm,
}: Props) {
  const [method, setMethod] = useState<SimpleMethod>("cash");
  const [cardType, setCardType] = useState<"debit_card" | "credit_card">("debit_card");
  const [currency, setCurrency] = useState<Currency>("MXN");
  const [received, setReceived] = useState("");
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [mixed, setMixed] = useState(false);
  const [mixedPayments, setMixedPayments] = useState<Payment[]>([{ method: "cash", currency: "MXN", amount: 0 }]);
  const idCameraRef = useRef<HTMLInputElement>(null);

  const isCash = method === "cash";
  // Tarjeta y transferencia se cobran en pesos (así lo cobra el banco).
  const payCurrency: Currency = isCash ? currency : "MXN";
  const rate = payCurrency === "MXN" ? 1 : rates[payCurrency];
  const due = rate ? round2(totalMxn / rate) : 0;
  const receivedNum = received === "" ? due : Number(received) || 0;
  const change = round2(receivedNum - due);
  const shortCash = isCash && receivedNum < due - 0.001;

  const quickAmounts = useMemo(() => {
    const out: number[] = [];
    for (const bill of BILLS[payCurrency]) {
      const v = Math.ceil(due / bill) * bill;
      if (v > due + 0.001 && !out.includes(v)) out.push(v);
    }
    return out.sort((a, b) => a - b).slice(0, 3);
  }, [due, payCurrency]);

  // Pago mixto
  const mixedMissing = [...new Set(mixedPayments.filter((p) => p.amount > 0 && !rates[p.currency]).map((p) => p.currency))];
  const mixedPaidMxn = mixedPayments.reduce((s, p) => s + Math.max(0, p.amount || 0) * (rates[p.currency] ?? 0), 0);
  const mixedDelta = mixedPaidMxn - totalMxn;
  const mixedOk = mixedMissing.length === 0 && Math.abs(mixedDelta) <= paymentsToleranceMxn(mixedPayments, rates);
  const setMixedPayment = (i: number, p: Partial<Payment>) =>
    setMixedPayments((ps) => ps.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const canConfirm = !loading && totalMxn > 0 && (mixed ? mixedOk : !!rate && !shortCash);

  const confirm = () => {
    if (!canConfirm) return;
    if (mixed) {
      onConfirm({ currency: "MXN", payments: mixedPayments.filter((p) => p.amount > 0) });
      return;
    }
    const resolved: PaymentMethod = isCash ? "cash" : method === "card" ? cardType : "transfer";
    onConfirm({
      currency: payCurrency,
      payments: [{ method: resolved, currency: payCurrency, amount: due, voucherFile: isCash ? null : voucherFile }],
    });
  };

  const today = nowLocalInput().slice(0, 10);
  const backdated = soldAtLocal && soldAtLocal.slice(0, 10) !== today;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 w-full max-w-none h-[100dvh] rounded-none sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-lg">
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle>Cobrar</DialogTitle>
          <DialogDescription className="sr-only">Elige la forma de pago y confirma la venta</DialogDescription>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-4xl font-bold font-numeric text-primary">{formatMoney(totalMxn)}</p>
            {discount > 0 && (
              <p className="text-xs text-muted-foreground mt-1 font-numeric">
                {formatMoney(subtotalMxn)} − descuento {formatMoney(discount)}
              </p>
            )}
          </div>

          {!mixed ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <MethodButton active={method === "cash"} onClick={() => setMethod("cash")} icon={<Banknote className="h-6 w-6" />} label="Efectivo" />
                <MethodButton active={method === "card"} onClick={() => setMethod("card")} icon={<CreditCard className="h-6 w-6" />} label="Tarjeta" />
                <MethodButton active={method === "transfer"} onClick={() => setMethod("transfer")} icon={<Landmark className="h-6 w-6" />} label="Transferencia" />
              </div>

              {method === "card" && (
                <div className="grid grid-cols-2 gap-2">
                  <ChipButton active={cardType === "debit_card"} onClick={() => setCardType("debit_card")}>Débito</ChipButton>
                  <ChipButton active={cardType === "credit_card"} onClick={() => setCardType("credit_card")}>Crédito</ChipButton>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Moneda</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CURRENCIES.map((c) => (
                    <ChipButton
                      key={c}
                      active={payCurrency === c}
                      disabled={!isCash && c !== "MXN"}
                      onClick={() => { setCurrency(c); setReceived(""); }}
                    >
                      {c}
                    </ChipButton>
                  ))}
                </div>
                {!isCash && (
                  <p className="text-xs text-muted-foreground">Tarjeta y transferencia se cobran en pesos (MXN).</p>
                )}
              </div>

              {!rate ? (
                <RateMissing currencies={[payCurrency]} isAdmin={isAdmin} />
              ) : payCurrency !== "MXN" ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground">A pagar en {payCurrency}</p>
                  <p className="text-2xl font-bold font-numeric">{formatMoney(due, payCurrency)}</p>
                  <p className="text-[11px] text-muted-foreground font-numeric">
                    Tipo de cambio de hoy: 1 {payCurrency} = {formatMoney(rate)}
                  </p>
                </div>
              ) : null}

              {isCash && rate && (
                <div className="space-y-2">
                  <Label htmlFor="received" className="text-xs text-muted-foreground">Recibido ({payCurrency})</Label>
                  <Input
                    id="received"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder={String(due)}
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    className="h-12 text-lg font-numeric"
                  />
                  <div className="flex flex-wrap gap-2">
                    <ChipButton active={received === "" || Number(received) === due} onClick={() => setReceived(String(due))}>
                      Exacto
                    </ChipButton>
                    {quickAmounts.map((v) => (
                      <ChipButton key={v} active={Number(received) === v} onClick={() => setReceived(String(v))}>
                        {formatMoney(v, payCurrency)}
                      </ChipButton>
                    ))}
                  </div>
                  <div
                    className={cn(
                      "rounded-lg p-3 flex items-center justify-between",
                      shortCash ? "bg-red-50 text-red-900" : "bg-green-50 text-green-900",
                    )}
                  >
                    <span className="font-medium">{shortCash ? "Falta" : "Cambio"}</span>
                    <span className="text-2xl font-bold font-numeric">{formatMoney(Math.abs(change), payCurrency)}</span>
                  </div>
                </div>
              )}

              {!isCash && <VoucherUpload file={voucherFile} onChange={setVoucherFile} />}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pago mixto</p>
              {mixedPayments.map((p, i) => (
                <div key={i} className="space-y-1 rounded-md border p-2">
                  <div className="grid grid-cols-[1fr_80px_1fr_auto] gap-1 items-center">
                    <Select value={p.method} onValueChange={(v) => setMixedPayment(i, { method: v as PaymentMethod, voucherFile: v === "cash" ? null : p.voucherFile ?? null })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="transfer">Transfer.</SelectItem>
                        <SelectItem value="debit_card">Débito</SelectItem>
                        <SelectItem value="credit_card">Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={p.currency} onValueChange={(v) => setMixedPayment(i, { currency: v as Currency })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" inputMode="decimal" value={p.amount || ""} onChange={(e) => setMixedPayment(i, { amount: Number(e.target.value) || 0 })} className="h-10 font-numeric" />
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setMixedPayments(mixedPayments.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {p.method !== "cash" && (
                    <VoucherUpload file={p.voucherFile ?? null} compact onChange={(file) => setMixedPayment(i, { voucherFile: file })} />
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setMixedPayments([...mixedPayments, { method: "cash", currency: "MXN", amount: 0 }])}>
                <Plus className="h-3 w-3 mr-1" /> Agregar pago
              </Button>
              {mixedMissing.length > 0 && <RateMissing currencies={mixedMissing} isAdmin={isAdmin} />}
              <div className={cn("rounded-md border p-2 text-sm", mixedOk ? "bg-green-50 border-green-200 text-green-900" : "bg-amber-50 border-amber-200 text-amber-900")}>
                <div className="flex justify-between gap-2">
                  <span>Pagado</span>
                  <span className="font-numeric">{formatMoney(mixedPaidMxn)}</span>
                </div>
                {!mixedOk && mixedMissing.length === 0 && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span>{mixedDelta < 0 ? "Falta" : "Excede"}</span>
                    <span className="font-numeric">{formatMoney(Math.abs(mixedDelta))}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {totalMxn > 1000 && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 min-w-0">
                <IdCard className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {customerIdFile ? "ID del cliente tomada ✓" : "Venta mayor a $1,000 · ID opcional"}
                </span>
              </span>
              <input
                ref={idCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setCustomerIdFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => idCameraRef.current?.click()}>
                <Camera className="h-3.5 w-3.5 mr-1" />
                {customerIdFile ? "Repetir" : "Tomar foto de ID"}
              </Button>
            </div>
          )}

          <div className="border-t pt-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm text-muted-foreground"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
            >
              <span>Más opciones</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
            </button>
            {showMore && (
              <div className="space-y-3 pt-3">
                <div>
                  <Label className="text-xs">Descuento (MXN)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={discount || ""}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="font-numeric"
                  />
                </div>
                <div>
                  <Label className="text-xs">Fecha de la venta</Label>
                  <Input
                    type="datetime-local"
                    value={soldAtLocal || nowLocalInput()}
                    onChange={(e) => setSoldAtLocal(e.target.value)}
                    className="font-numeric"
                  />
                  {backdated && (
                    <p className="text-[11px] text-amber-700 mt-1">Registrando venta atrasada del {soldAtLocal.slice(0, 10)}</p>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setMixed((m) => !m)}>
                  {mixed ? "Volver a pago simple" : "Pago mixto (varias formas de pago)"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t p-4">
          <Button className="w-full h-14 text-lg font-bold" disabled={!canConfirm} onClick={confirm}>
            {loading
              ? "Cobrando..."
              : `Confirmar ${mixed ? formatMoney(totalMxn) : formatMoney(due, payCurrency)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MethodButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-20 flex-col items-center justify-center gap-1 rounded-lg border-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ChipButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-11 min-w-16 rounded-md border px-3 text-sm font-medium font-numeric transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50",
      )}
    >
      {children}
    </button>
  );
}

function RateMissing({ currencies, isAdmin }: { currencies: Currency[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Falta el tipo de cambio de hoy ({currencies.join(", ")}). Pide al administrador que lo capture en Configuración, o cobra en MXN.
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      for (const c of currencies) {
        if (c === "MXN") continue;
        await saveRate(c, Number(values[c]));
      }
      await qc.invalidateQueries({ queryKey: ["rates-active"] });
      qc.invalidateQueries({ queryKey: ["rates-all"] });
      toast.success("Tipo de cambio de hoy guardado");
    } catch (e) {
      toast.error((e as Error).message || "No se pudo guardar el tipo de cambio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-amber-900">
      <p className="text-sm font-medium">Captura el tipo de cambio de hoy</p>
      {currencies.filter((c) => c !== "MXN").map((c) => (
        <div key={c} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-sm font-numeric">1 {c} = $</span>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder={c === "USD" ? "Ej. 18.50" : "Ej. 20.00"}
            value={values[c] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
            className="bg-white font-numeric"
          />
        </div>
      ))}
      <Button size="sm" className="w-full" disabled={saving} onClick={save}>
        {saving ? "Guardando..." : "Guardar tipo de cambio"}
      </Button>
    </div>
  );
}

export function VoucherUpload({ file, onChange, compact = false }: { file: File | null; onChange: (file: File | null) => void; compact?: boolean }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  return (
    <div className={compact ? "space-y-1" : "rounded-md border bg-muted/30 p-2 space-y-1"}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Comprobante HSBC</p>
          <p className="text-[11px] text-muted-foreground">{file ? "Foto tomada ✓" : "Pide la foto del voucher de banco."}</p>
        </div>
        <div className="shrink-0">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" size="sm" className="h-9 px-2 text-xs" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-3.5 w-3.5 mr-1" />
            {file ? "Repetir" : "Tomar foto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
