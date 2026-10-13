import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Pencil, Plus, Minus, History, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate, type Currency } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/sales")({
  head: () => ({ meta: [{ title: "Resumen de ventas · CAsitakin" }] }),
  component: SalesPage,
});

type OrderRow = {
  id: string;
  seller_id: string;
  total: number;
  currency: string;
  sold_at: string;
  created_at: string;
  discount: number;
  subtotal: number;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_name_snapshot: string;
  variant_snapshot: string | null;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total: number;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

type Period = "today" | "yesterday" | "week" | "month";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  debit_card: "Débito",
  credit_card: "Crédito",
};

const PAYMENT_ICONS: Record<string, string> = {
  cash: "💵",
  transfer: "🏦",
  debit_card: "💳",
  credit_card: "💳",
};

type SaleRow = OrderRow & {
  exchange_rate_used: number | null;
  order_items: { product_name_snapshot: string; quantity: number }[];
  payments: { payment_method: string; currency: string; amount: number }[];
  // Un ticket por venta: Supabase lo devuelve como objeto (o null), no como lista.
  tickets: { public_token: string } | null;
};

function periodRange(period: Period) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (period === "week") {
    // Semana de lunes a domingo.
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === "month") {
    start.setDate(1);
  }
  return { since: start.toISOString(), until: end.toISOString() };
}

// Total de la venta en pesos (las ventas en USD/EUR guardan el tipo de cambio usado).
function orderTotalMxn(o: SaleRow) {
  const total = Number(o.total || 0);
  return o.currency === "MXN" ? total : total * Number(o.exchange_rate_used || 1);
}

function localDayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const dayLabel = (iso: string) => {
  const s = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short" }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function SalesPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderRow | null>(null);

  const { since, until } = useMemo(() => periodRange(period), [period]);

  const sellers = useQuery({
    queryKey: ["sales-sellers"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("profiles").select("id,name")).data ?? [],
  });

  const orders = useQuery({
    queryKey: ["sales-orders", isAdmin, profile?.id, since, until, sellerFilter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id,seller_id,total,currency,exchange_rate_used,sold_at,created_at,discount,subtotal, order_items(product_name_snapshot,quantity), payments(payment_method,currency,amount), tickets(public_token)",
        )
        .gte("sold_at", since)
        .lt("sold_at", until)
        .order("sold_at", { ascending: false });
      if (!isAdmin && profile?.id) q = q.eq("seller_id", profile.id);
      else if (isAdmin && sellerFilter !== "all") q = q.eq("seller_id", sellerFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const sellerMap = useMemo(() => {
    const m = new Map<string, string>();
    (sellers.data ?? []).forEach((s: { id: string; name: string }) => m.set(s.id, s.name));
    return m;
  }, [sellers.data]);
  const sellerName = (id: string) => (isAdmin ? sellerMap.get(id) || "—" : "Tú");

  const summary = useMemo(() => {
    const list = orders.data ?? [];
    const totalMxn = list.reduce((s, o) => s + orderTotalMxn(o), 0);
    const byPayment = new Map<string, { method: string; currency: string; amount: number }>();
    const bySeller = new Map<string, { totalMxn: number; count: number }>();
    const byDay = new Map<string, { label: string; totalMxn: number; orders: SaleRow[] }>();
    for (const o of list) {
      for (const p of o.payments ?? []) {
        const key = `${p.payment_method}|${p.currency}`;
        const cur = byPayment.get(key) ?? { method: p.payment_method, currency: p.currency, amount: 0 };
        cur.amount += Number(p.amount || 0);
        byPayment.set(key, cur);
      }
      const s = bySeller.get(o.seller_id) ?? { totalMxn: 0, count: 0 };
      s.totalMxn += orderTotalMxn(o);
      s.count += 1;
      bySeller.set(o.seller_id, s);
      const dk = localDayKey(o.sold_at);
      const d = byDay.get(dk) ?? { label: dayLabel(o.sold_at), totalMxn: 0, orders: [] };
      d.totalMxn += orderTotalMxn(o);
      d.orders.push(o);
      byDay.set(dk, d);
    }
    return {
      totalMxn,
      count: list.length,
      payments: [...byPayment.values()].sort((a, b) => b.amount - a.amount),
      sellers: [...bySeller.entries()].sort((a, b) => b[1].totalMxn - a[1].totalMxn),
      days: [...byDay.values()],
    };
  }, [orders.data]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Resumen de ventas</h1>
          <p className="text-sm text-muted-foreground">{isAdmin ? "Todas las ventas" : "Tus ventas"}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={period === p.id ? "default" : "outline"}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </Button>
          ))}
          {isAdmin && (
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="Vendedora"
            >
              <option value="all">Todas las vendedoras</option>
              {(sellers.data ?? []).map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Ventas</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit"><History className="h-3.5 w-3.5 mr-1" />Historial de cambios</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="pt-3 space-y-4">
          {orders.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : orders.isError ? (
            <Card className="p-8 text-center text-destructive">No se pudieron cargar las ventas.</Card>
          ) : summary.count === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">Sin ventas en este periodo.</Card>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Total vendido</p>
                  <p className="text-3xl font-bold font-numeric text-primary">{formatMoney(summary.totalMxn)}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.count} {summary.count === 1 ? "venta" : "ventas"}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Por forma de pago</p>
                  <ul className="space-y-0.5 text-sm">
                    {summary.payments.map((p) => (
                      <li key={`${p.method}|${p.currency}`} className="flex justify-between gap-2">
                        <span>
                          {PAYMENT_ICONS[p.method] ?? ""} {PAYMENT_LABELS[p.method] ?? p.method}
                          {p.currency !== "MXN" && <span className="text-muted-foreground"> ({p.currency})</span>}
                        </span>
                        <span className="font-numeric">{formatMoney(p.amount, p.currency as Currency)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Por vendedora</p>
                  <ul className="space-y-0.5 text-sm">
                    {summary.sellers.map(([id, s]) => (
                      <li key={id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {sellerName(id)} <span className="text-muted-foreground">· {s.count}</span>
                        </span>
                        <span className="font-numeric">{formatMoney(s.totalMxn)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              {summary.days.map((day) => (
                <section key={day.label} className="space-y-1">
                  <div className="flex items-baseline justify-between border-b pb-1">
                    <h2 className="font-semibold">{day.label}</h2>
                    <span className="text-sm font-numeric">Total {formatMoney(day.totalMxn)}</span>
                  </div>
                  {day.orders.map((o) => {
                    const open = openId === o.id;
                    const items = (o.order_items ?? []).map(
                      (it) => `${it.product_name_snapshot.trim()}${it.quantity > 1 ? ` (${it.quantity})` : ""}`,
                    );
                    const methods = [...new Set((o.payments ?? []).map((p) => p.payment_method))];
                    const token = o.tickets?.public_token;
                    return (
                      <div key={o.id} className="rounded-md border bg-card">
                        <button
                          type="button"
                          className="w-full p-3 text-left grid grid-cols-[4.75rem_minmax(0,1fr)_auto] gap-x-2 items-center"
                          onClick={() => setOpenId(open ? null : o.id)}
                          aria-expanded={open}
                        >
                          <span className="font-numeric text-sm text-muted-foreground whitespace-nowrap">{timeLabel(o.sold_at)}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">
                              {sellerName(o.seller_id)} ·{" "}
                              {methods.map((m) => `${PAYMENT_ICONS[m] ?? ""} ${PAYMENT_LABELS[m] ?? m}`).join(" + ")}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {items.length === 0
                                ? "—"
                                : items.map((it, idx) => (
                                    <span key={idx} className="block">• {it}</span>
                                  ))}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block font-semibold font-numeric">{formatMoney(Number(o.total), o.currency as Currency)}</span>
                            {o.currency !== "MXN" && (
                              <span className="block text-[11px] text-muted-foreground font-numeric">≈ {formatMoney(orderTotalMxn(o))}</span>
                            )}
                          </span>
                        </button>
                        {open && (
                          <div className="flex flex-wrap gap-2 border-t p-2">
                            {token && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={`/t/${token}`} target="_blank" rel="noreferrer">
                                  <Receipt className="h-3.5 w-3.5 mr-1" /> Ver ticket
                                </a>
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setEditOrder(o)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteOrder(o)}>
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Borrar
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
            </>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="audit" className="pt-3">
            <AuditList />
          </TabsContent>
        )}
      </Tabs>

      {editOrder && (
        <EditOrderDialog
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => {
            setEditOrder(null);
            qc.invalidateQueries({ queryKey: ["sales-orders"] });
            qc.invalidateQueries({ queryKey: ["sell-products"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }}
        />
      )}

      {deleteOrder && (
        <DeleteOrderDialog
          order={deleteOrder}
          onClose={() => setDeleteOrder(null)}
          onDeleted={() => {
            setDeleteOrder(null);
            qc.invalidateQueries({ queryKey: ["sales-orders"] });
            qc.invalidateQueries({ queryKey: ["sell-products"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }}
        />
      )}
    </div>
  );
}

function EditOrderDialog({ order, onClose, onSaved }: { order: OrderRow; onClose: () => void; onSaved: () => void }) {
  const [soldAt, setSoldAt] = useState(toLocalInput(order.sold_at));
  const [discount, setDiscount] = useState(Number(order.discount || 0));
  const [note, setNote] = useState("");

  const items = useQuery({
    queryKey: ["sales-items", order.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("id,order_id,product_name_snapshot,variant_snapshot,variant_id,quantity,unit_price,total")
        .eq("order_id", order.id);
      return (data ?? []) as OrderItem[];
    },
  });

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());

  const rows = (items.data ?? []).map((it) => ({
    ...it,
    qty: quantities[it.id] ?? it.quantity,
    removed: toRemove.has(it.id),
  }));

  const newSubtotal = rows
    .filter((r) => !r.removed)
    .reduce((s, r) => s + Number(r.unit_price) * r.qty, 0);
  const newTotal = Math.max(0, newSubtotal - discount);

  const save = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error("Escribe una nota del cambio");

      // Update items: qty changes / removals
      for (const r of rows) {
        if (r.removed) {
          const { error } = await supabase.from("order_items").delete().eq("id", r.id);
          if (error) throw error;
        } else if (r.qty !== r.quantity) {
          const newRowTotal = Number(r.unit_price) * r.qty;
          const { error } = await supabase
            .from("order_items")
            .update({ quantity: r.qty, total: newRowTotal })
            .eq("id", r.id);
          if (error) throw error;
        }
      }

      // 3) Update order
      const { error: oErr } = await supabase
        .from("orders")
        .update({
          sold_at: new Date(soldAt).toISOString(),
          subtotal: newSubtotal,
          discount,
          total: newTotal,
        })
        .eq("id", order.id);
      if (oErr) throw oErr;

      // 4) Append explicit note to audit log
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("order_audit_log").insert({
        order_id: order.id,
        action: "update",
        changed_by: u.user?.id ?? null,
        note: note.trim(),
        diff: { manual_note: true, new: { sold_at: soldAt, subtotal: newSubtotal, discount, total: newTotal } },
      });
    },
    onSuccess: () => {
      toast.success("Venta actualizada");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message || "No se pudo actualizar"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar venta</DialogTitle>
          <DialogDescription>Los cambios ajustan stock y comisiones automáticamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label className="text-xs">Fecha de la venta</Label>
            <Input type="datetime-local" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Artículos</Label>
            {items.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando...</p>
            ) : (
              <div className="space-y-2 mt-1">
                {rows.map((r) => (
                  <div key={r.id} className={`flex items-center gap-2 rounded border p-2 ${r.removed ? "opacity-40" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.product_name_snapshot}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.variant_snapshot} · {formatMoney(Number(r.unit_price), order.currency as any)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7"
                        disabled={r.removed}
                        onClick={() => setQuantities((q) => ({ ...q, [r.id]: Math.max(1, (q[r.id] ?? r.quantity) - 1) }))}
                      ><Minus className="h-3 w-3" /></Button>
                      <span className="w-8 text-center font-numeric text-sm">{r.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7"
                        disabled={r.removed}
                        onClick={() => setQuantities((q) => ({ ...q, [r.id]: (q[r.id] ?? r.quantity) + 1 }))}
                      ><Plus className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => setToRemove((s) => {
                          const next = new Set(s);
                          if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                          return next;
                        })}
                      ><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Descuento ({order.currency})</Label>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} className="font-numeric" />
          </div>

          <div className="flex justify-between text-sm border-t pt-2">
            <span>Nuevo total</span>
            <span className="font-numeric font-bold text-primary">{formatMoney(newTotal, order.currency as any)}</span>
          </div>

          <div>
            <Label className="text-xs">Motivo del cambio (obligatorio)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: cliente devolvió una pieza" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending || !note.trim()} onClick={() => save.mutate()}>
            {save.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOrderDialog({ order, onClose, onDeleted }: { order: OrderRow; onClose: () => void; onDeleted: () => void }) {
  const [note, setNote] = useState("");

  const del = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error("Escribe el motivo del borrado");
      const { data: u } = await supabase.auth.getUser();
      // Log first (so it's not lost by cascade), then delete.
      await supabase.from("order_audit_log").insert({
        order_id: order.id,
        action: "delete",
        changed_by: u.user?.id ?? null,
        note: note.trim(),
        diff: { manual_note: true, snapshot: order },
      });
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Venta borrada y stock restaurado"); onDeleted(); },
    onError: (e: any) => toast.error(e.message || "No se pudo borrar"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borrar venta</DialogTitle>
          <DialogDescription>
            Se devolverá el stock de {formatMoney(order.total, order.currency as any)}. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Motivo (obligatorio)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: venta duplicada" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={del.isPending || !note.trim()} onClick={() => del.mutate()}>
            {del.isPending ? "Borrando..." : "Sí, borrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditList() {
  const audit = useQuery({
    queryKey: ["order-audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_audit_log")
        .select("id,order_id,action,changed_by,changed_at,note")
        .order("changed_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  if (audit.isLoading) return <p className="text-sm text-muted-foreground">Cargando...</p>;
  if ((audit.data ?? []).length === 0) return <Card className="p-8 text-center text-muted-foreground">Sin cambios registrados.</Card>;

  return (
    <div className="space-y-2">
      {(audit.data ?? []).map((a: any) => (
        <Card key={a.id} className="p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="font-medium capitalize">{a.action}</span>
            <span className="text-xs text-muted-foreground">{formatDate(a.changed_at)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Orden: {a.order_id.slice(0, 8)}</p>
          {a.note && <p className="text-xs mt-1">{a.note}</p>}
        </Card>
      ))}
    </div>
  );
}
