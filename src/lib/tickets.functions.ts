import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ token: z.string().uuid() });

export const getPublicTicket = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .select("order_id, created_at, public_token")
      .eq("public_token", data.token)
      .maybeSingle();

    if (error || !ticket) throw new Error("Ticket no encontrado");

    const [orderRes, itemsRes, paymentsRes] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, subtotal, discount, total, currency, seller_id, created_at")
        .eq("id", ticket.order_id)
        .single(),
      supabaseAdmin
        .from("order_items")
        .select("id, product_name_snapshot, variant_snapshot, quantity, unit_price, total")
        .eq("order_id", ticket.order_id),
      supabaseAdmin
        .from("payments")
        .select("id, payment_method, currency, amount")
        .eq("order_id", ticket.order_id),
    ]);

    const order = orderRes.data;
    if (!order) throw new Error("Ticket no encontrado");

    let sellerName = "—";
    if (order.seller_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", order.seller_id)
        .maybeSingle();
      sellerName = prof?.name || "—";
    }

    return {
      ticket,
      order,
      items: itemsRes.data ?? [],
      payments: paymentsRes.data ?? [],
      sellerName,
    };
  });
