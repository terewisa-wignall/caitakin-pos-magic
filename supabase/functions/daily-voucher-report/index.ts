import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type Payment = {
  amount: number;
  bank: string | null;
  currency: string;
  exchange_rate_used: number;
  payment_method: string;
  voucher_file_name: string | null;
  voucher_file_path: string | null;
};

type Order = {
  id: string;
  created_at: string;
  currency: string;
  customer_id_file_name: string | null;
  customer_id_file_path: string | null;
  exchange_rate_used: number;
  total: number;
  seller: { name: string | null; email: string } | null;
  payments: Payment[];
};

const CURRENCY = ["MXN", "USD", "EUR"];
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const TIME_ZONE = "America/Cancun";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function addToTotals(totals: Record<string, number>, currency: string, amount: number) {
  totals[currency] = (totals[currency] ?? 0) + amount;
}

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function cancunDayBounds(date: string) {
  const start = new Date(`${date}T00:00:00-05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tableRows(totals: Record<string, number>) {
  return CURRENCY
    .map((currency) => `<tr><td>${currency}</td><td style="text-align:right">${money(totals[currency] ?? 0, currency)}</td></tr>`)
    .join("");
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const reportDate = url.searchParams.get("date") || localDate();
    const recipient = Deno.env.get("DAILY_REPORT_EMAIL");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("DAILY_REPORT_FROM") || "CAsitakin <onboarding@resend.dev>";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!recipient) throw new Error("Falta DAILY_REPORT_EMAIL");
    if (!resendApiKey) throw new Error("Falta RESEND_API_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Faltan credenciales de Supabase");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { start, end } = cancunDayBounds(reportDate);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        created_at,
        currency,
        customer_id_file_name,
        customer_id_file_path,
        exchange_rate_used,
        total,
        seller:profiles!orders_seller_id_fkey(name,email),
        payments(amount,bank,currency,exchange_rate_used,payment_method,voucher_file_name,voucher_file_path)
      `)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const orders = (data ?? []) as unknown as Order[];
    const salesTotals: Record<string, number> = {};
    const bankTotals: Record<string, number> = {};
    const cashTotals: Record<string, number> = {};
    const missingVoucher: string[] = [];
    const missingId: string[] = [];
    const docRefs: Array<{ path: string; name: string }> = [];

    for (const order of orders) {
      addToTotals(salesTotals, order.currency, Number(order.total) || 0);
      const orderTotalMxn = order.currency === "MXN"
        ? Number(order.total) || 0
        : (Number(order.total) || 0) * (Number(order.exchange_rate_used) || 1);

      if (orderTotalMxn > 1000) {
        if (order.customer_id_file_path) {
          docRefs.push({
            path: order.customer_id_file_path,
            name: `ID-${order.id}-${order.customer_id_file_name || "cliente.jpg"}`,
          });
        } else {
          missingId.push(order.id);
        }
      }

      for (const payment of order.payments ?? []) {
        const isBank = payment.bank === "HSBC" || payment.payment_method !== "cash";
        addToTotals(isBank ? bankTotals : cashTotals, payment.currency, Number(payment.amount) || 0);
        if (isBank) {
          if (payment.voucher_file_path) {
            docRefs.push({
              path: payment.voucher_file_path,
              name: `Voucher-${order.id}-${payment.voucher_file_name || "hsbc.jpg"}`,
            });
          } else {
            missingVoucher.push(order.id);
          }
        }
      }
    }

    const attachments: Array<{ filename: string; content: string }> = [];
    const skippedAttachments: string[] = [];
    let attachmentBytes = 0;

    for (const doc of docRefs) {
      const { data: blob, error: downloadError } = await supabase.storage.from("sale-docs").download(doc.path);
      if (downloadError || !blob) {
        skippedAttachments.push(`${doc.name} (no se pudo descargar)`);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (attachmentBytes + bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        skippedAttachments.push(`${doc.name} (excede limite del email)`);
        continue;
      }
      attachmentBytes += bytes.byteLength;
      attachments.push({ filename: doc.name, content: bytesToBase64(bytes) });
    }

    const html = `
      <h2>Cierre diario CAsitakin - ${escapeHtml(reportDate)}</h2>
      <p><strong>Ventas:</strong> ${orders.length}</p>
      <h3>Total vendido</h3>
      <table cellpadding="6" cellspacing="0" border="1">${tableRows(salesTotals)}</table>
      <h3>Banco HSBC (transferencia, debito, credito)</h3>
      <table cellpadding="6" cellspacing="0" border="1">${tableRows(bankTotals)}</table>
      <h3>Efectivo</h3>
      <table cellpadding="6" cellspacing="0" border="1">${tableRows(cashTotals)}</table>
      <p><strong>Fotos adjuntas:</strong> ${attachments.length}</p>
      ${missingVoucher.length ? `<p><strong>Ventas de banco sin voucher:</strong> ${missingVoucher.map(escapeHtml).join(", ")}</p>` : ""}
      ${missingId.length ? `<p><strong>Ventas mayores a $1,000 sin ID:</strong> ${missingId.map(escapeHtml).join(", ")}</p>` : ""}
      ${skippedAttachments.length ? `<p><strong>Adjuntos omitidos:</strong> ${skippedAttachments.map(escapeHtml).join(", ")}</p>` : ""}
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `Cierre diario CAsitakin - ${reportDate}`,
        html,
        attachments,
      }),
    });

    const emailBody = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) {
      throw new Error(emailBody?.message || "No se pudo enviar el correo");
    }

    return Response.json({
      ok: true,
      date: reportDate,
      orders: orders.length,
      attachments: attachments.length,
      skippedAttachments,
      email: emailBody,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
});
