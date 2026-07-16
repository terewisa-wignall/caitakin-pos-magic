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
import { Trash2, Pencil, Plus, Minus, History } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/sales")({
  head: () => ({ meta: [{ title: "Ventas · CAsitakin" }] }),
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

function SalesPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [days, setDays] = useState(60);
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderRow | null>(null);

  const since = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
  }, [days]);

  const sellers = useQuery({
    queryKey: ["sales-sellers"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("profiles").select("id,name")).data ?? [],
  });

  const orders = useQuery({
    queryKey: ["sales-orders", isAdmin, profile?.id, since, sellerFilter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,seller_id,total,currency,sold_at,created_at,discount,subtotal")
        .gte("sold_at", since)
        .order("sold_at", { ascending: false });
      if (!isAdmin && profile?.id) q = q.eq("seller_id", profile.id);
      else if (isAdmin && sellerFilter !== "all") q = q.eq("seller_id", sellerFilter);
      const { data } = await q;
      return (data ?? []) as OrderRow[];
    },
  });

  const sellerMap = useMemo(() => {
    const m = new Map<string, string>();
    (sellers.data ?? []).forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [sellers.data]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Todas las ventas" : "Tus ventas"} · últimos {days} días
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">Días</Label>
            <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 60))} className="w-24" />
          </div>
          {isAdmin && (
            <div>
              <Label className="text-xs">Vendedora</Label>
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="h-10 rounded-md border bg-background px-2 text-sm"
              >
                <option value="all">Todas</option>
                {(sellers.data ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit"><History className="h-3.5 w-3.5 mr-1" />Historial</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="pt-3">
          {orders.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (orders.data ?? []).length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">Sin ventas en este periodo.</Card>
          ) : (
            <div className="space-y-2">
              {(orders.data ?? []).map((o) => (
                <Card key={o.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold font-numeric">{formatMoney(o.total, o.currency as any)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(o.sold_at)} · {isAdmin ? (sellerMap.get(o.seller_id) || o.seller_id.slice(0, 6)) : "Tú"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditOrder(o)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteOrder(o)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Borrar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
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
