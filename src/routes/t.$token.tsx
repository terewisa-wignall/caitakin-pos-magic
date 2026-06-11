import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { formatMoney, formatDate } from "@/lib/format";
import logo from "@/assets/logo.png";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/t/$token")({
  head: () => ({ meta: [{ title: "Ticket · CAsitakin" }] }),
  component: PublicTicket,
});

function PublicTicket() {
  const { token } = Route.useParams();

  const q = useQuery({
    queryKey: ["public-ticket", token],
    queryFn: async () => {
      const { data: ticket, error } = await supabase.from("tickets").select("order_id,created_at").eq("public_token", token).maybeSingle();
      if (error || !ticket) throw new Error("Ticket no encontrado");
      const [{ data: order }, { data: items }, { data: payments }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", ticket.order_id).single(),
        supabase.from("order_items").select("*").eq("order_id", ticket.order_id),
        supabase.from("payments").select("*").eq("order_id", ticket.order_id),
      ]);
      let sellerName = "—";
      if (order?.seller_id) {
        const { data: prof } = await supabase.from("profiles").select("name").eq("id", order.seller_id).maybeSingle();
        sellerName = prof?.name || "—";
      }
      return { ticket, order, items: items ?? [], payments: payments ?? [], sellerName };
    },
  });

  if (q.isLoading) return <div className="min-h-screen flex items-center justify-center">Cargando ticket...</div>;
  if (q.error || !q.data?.order) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Ticket no encontrado</div>;

  const { order, items, payments, sellerName } = q.data;
  const cur = (order.currency as any) || "MXN";
  const url = typeof window !== "undefined" ? `${window.location.origin}/t/${token}` : "";

  return (
    <div className="min-h-screen bg-muted py-6 px-4">
      <div className="max-w-md mx-auto">
        <Card className="p-6 print:shadow-none print:border-0">
          <div className="text-center mb-4">
            <img src={logo} alt="CAsitakin" width={64} height={64} className="h-16 w-16 mx-auto" />
            <h1 className="text-xl font-bold mt-1">CAsitakin</h1>
            <p className="text-xs text-muted-foreground">Artesanía mexicana</p>
          </div>
          <div className="text-xs text-muted-foreground mb-3 grid grid-cols-2 gap-1">
            <span>Fecha:</span><span className="text-right">{formatDate(order.created_at)}</span>
            <span>Vendedor:</span><span className="text-right">{sellerName}</span>
            <span>Ticket #:</span><span className="text-right font-mono">{token.slice(0, 8)}</span>
          </div>
          <div className="border-t border-dashed my-3"></div>
          <ul className="space-y-2 text-sm">
            {items.map((it: any) => (
              <li key={it.id} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate">{it.product_name_snapshot}</span>
                  <span className="text-xs text-muted-foreground">{it.variant_snapshot} · {it.quantity} × {formatMoney(Number(it.unit_price), order.currency)}</span>
                </span>
                <span className="font-numeric font-medium">{formatMoney(Number(it.total), order.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-dashed my-3"></div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-numeric">{formatMoney(Number(order.subtotal))}</span></div>
            {Number(order.discount) > 0 && <div className="flex justify-between"><span>Descuento</span><span className="font-numeric">−{formatMoney(Number(order.discount))}</span></div>}
            <div className="flex justify-between text-lg font-bold pt-1"><span>Total</span><span className="font-numeric text-primary">{formatMoney(Number(order.total), order.currency)}</span></div>
          </div>
          <div className="border-t border-dashed my-3"></div>
          <p className="text-xs font-medium mb-1">Pagos</p>
          <ul className="text-xs space-y-0.5">
            {payments.map((p: any) => (
              <li key={p.id} className="flex justify-between"><span>{p.payment_method}</span><span className="font-numeric">{formatMoney(Number(p.amount), p.currency)}</span></li>
            ))}
          </ul>
          <div className="flex justify-center mt-4">
            <QRCodeSVG value={url} size={120} />
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2">¡Gracias por tu compra!</p>
        </Card>
        <Button onClick={() => window.print()} variant="outline" className="w-full mt-3 print:hidden">
          <Printer className="h-4 w-4 mr-2" /> Imprimir
        </Button>
      </div>
    </div>
  );
}
