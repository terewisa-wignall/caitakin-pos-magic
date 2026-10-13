import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  MessageCircle,
  Mail,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney, type Currency } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { QRCodeSVG } from "qrcode.react";
import { sortVariantsBySize } from "@/lib/sizes";
import { fetchTodayRates } from "@/lib/exchange-rates";
import { compressDocumentPhoto } from "@/lib/image-compress";
import {
  CheckoutDialog,
  paymentsToleranceMxn,
  type CheckoutPayload,
  type PaymentMethod,
} from "@/components/sell/checkout-dialog";

export const Route = createFileRoute("/app/sell")({
  head: () => ({ meta: [{ title: "Vender · CAsitakin" }] }),
  component: SellPage,
});

type Variant = { id: string; variant_name: string; size: string | null; color: string | null; stock: number; price_override_mxn: number | null };
type Product = { id: string; name: string; photo_url: string | null; photo_thumb_url: string | null; base_price_mxn: number; category_id: string | null; variants: Variant[]; categories: { name: string } | null };
type CartLine = { variantId: string; productId: string; name: string; variantLabel: string; unitPriceMxn: number; quantity: number; stock: number };

function isBankPayment(method: PaymentMethod) {
  return method !== "cash";
}

function getFileExt(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  return file.type === "image/png" ? "png" : "jpg";
}

async function uploadSaleDoc(userId: string, orderId: string, kind: "voucher" | "customer-id", original: File) {
  const file = await compressDocumentPhoto(original);
  const path = `${userId}/${orderId}/${kind}-${crypto.randomUUID()}.${getFileExt(file)}`;
  const { error } = await supabase.storage.from("sale-docs").upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}

async function ensureOrderCommission(orderId: string, sellerId: string, total: number, orderCurrency: Currency) {
  const { data: existing } = await supabase.from("commissions").select("id").eq("order_id", orderId).limit(1);
  if ((existing ?? []).length > 0) return;
  const { data: sellerProfile } = await supabase.from("profiles").select("commission_rate").eq("id", sellerId).maybeSingle();
  const rate = Number(sellerProfile?.commission_rate ?? 5);
  if (!Number.isFinite(rate) || rate <= 0) return;
  const { error } = await supabase.from("commissions").insert({
    seller_id: sellerId,
    order_id: orderId,
    commission_rate: rate,
    commission_amount: Math.round((Number(total || 0) * rate / 100) * 100) / 100,
    currency: orderCurrency,
  });
  if (error) console.warn("No se pudo crear la comisión de respaldo", error.message);
}

function SellPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [variantPickerFor, setVariantPickerFor] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerIdFile, setCustomerIdFile] = useState<File | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Se incrementa tras cada venta para que la ventana de cobro empiece limpia.
  const [checkoutKey, setCheckoutKey] = useState(0);
  const [ticket, setTicket] = useState<{ token: string; total: number; currency: Currency } | null>(null);
  // Vacío = "ahora" al momento de cobrar. Solo se llena para registrar ventas atrasadas.
  const [soldAtLocal, setSoldAtLocal] = useState("");

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });

  const products = useQuery({
    queryKey: ["sell-products"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id,name,photo_url,photo_thumb_url,base_price_mxn,category_id, categories(name), variants:product_variants(id,variant_name,size,color,stock,price_override_mxn)")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        const list = (data ?? []) as unknown as Product[];
        // Cache for offline use.
        void import("@/lib/offline-db").then((m) =>
          m.cacheProducts(
            list.map((p) => ({
              id: p.id,
              name: p.name,
              photo_url: p.photo_url,
              photo_thumb_url: p.photo_thumb_url,
              base_price_mxn: p.base_price_mxn,
              category_id: p.category_id,
              categories: p.categories,
              variants: p.variants,
              cached_at: Date.now(),
            })),
          ),
        );
        return list;
      } catch (e) {
        // Fallback to cached snapshot when offline.
        const m = await import("@/lib/offline-db");
        const cached = await m.loadCachedProducts();
        if (cached.length > 0) return cached as unknown as Product[];
        throw e;
      }
    },
  });

  const rates = useQuery({
    queryKey: ["rates-active"],
    queryFn: fetchTodayRates,
  });
  const todayRates = rates.data ?? { MXN: 1 };

  const filtered = useMemo(() => {
    const list = products.data ?? [];
    return list.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === "all" || p.category_id === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [products.data, search, categoryFilter]);

  const subtotalMxn = cart.reduce((s, l) => s + l.unitPriceMxn * l.quantity, 0);
  const totalMxn = Math.max(0, subtotalMxn - discount);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  const addLine = (product: Product, variant: Variant) => {
    if (variant.stock <= 0) { toast.error("Sin stock"); return; }
    setCart((c) => {
      const existing = c.find((l) => l.variantId === variant.id);
      if (existing) {
        if (existing.quantity + 1 > variant.stock) { toast.error("Stock insuficiente"); return c; }
        return c.map((l) => l.variantId === variant.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...c, {
        variantId: variant.id, productId: product.id, name: product.name,
        variantLabel: variant.variant_name,
        unitPriceMxn: Number(variant.price_override_mxn ?? product.base_price_mxn),
        quantity: 1, stock: variant.stock,
      }];
    });
    toast.success(`${product.name} agregado`);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((c) => c.map((l) => {
      if (l.variantId !== id) return l;
      const q = Math.max(1, Math.min(l.stock, l.quantity + delta));
      return { ...l, quantity: q };
    }));
  };
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.variantId !== id));

  const openCheckout = () => {
    if (cart.length === 0) return;
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  // Ofertas: toman piezas reales del inventario y aplican el descuento.
  const OFFERS = [
    { id: "sombrero-abanico", label: "Abanico + Sombrero", price: 1000, items: [{ match: "sombrero", qty: 1 }, { match: "abanico", qty: 1 }] },
    { id: "2-abanicos", label: "2 Abanicos", price: 700, items: [{ match: "abanico", qty: 2 }] },
  ];
  const applyOffer = (offer: (typeof OFFERS)[number]) => {
    const list = products.data ?? [];
    const picks: { product: Product; variant: Variant; qty: number }[] = [];
    for (const it of offer.items) {
      const candidates = list
        .filter((p) => p.name.toLowerCase().includes(it.match))
        .flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })))
        .map((c) => ({ ...c, free: c.variant.stock - (cart.find((l) => l.variantId === c.variant.id)?.quantity ?? 0) }))
        .filter((c) => c.free >= it.qty)
        .sort((a, b) => b.free - a.free);
      if (!candidates[0]) { toast.error(`Sin stock de ${it.match} para la oferta`); return; }
      picks.push({ ...candidates[0], qty: it.qty });
    }
    const normal = picks.reduce((s, p) => s + Number(p.variant.price_override_mxn ?? p.product.base_price_mxn) * p.qty, 0);
    setCart((c) => {
      let next = [...c];
      for (const { product, variant, qty } of picks) {
        const ex = next.find((l) => l.variantId === variant.id);
        next = ex
          ? next.map((l) => (l.variantId === variant.id ? { ...l, quantity: l.quantity + qty } : l))
          : [...next, { variantId: variant.id, productId: product.id, name: product.name, variantLabel: variant.variant_name, unitPriceMxn: Number(variant.price_override_mxn ?? product.base_price_mxn), quantity: qty, stock: variant.stock }];
      }
      return next;
    });
    setDiscount((d) => d + Math.max(0, normal - offer.price));
    toast.success(`Oferta ${offer.label} agregada: ${formatMoney(offer.price)}`);
  };

  const checkout = useMutation({
    mutationFn: async ({ currency, payments }: CheckoutPayload) => {
      if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (cart.length === 0) throw new Error("Carrito vacío");

      const paymentsClean = payments.filter((p) => p.amount > 0);
      if (paymentsClean.length === 0) throw new Error("Registra al menos un pago");
      const rateOf = (c: Currency) => (c === "MXN" ? 1 : todayRates[c]);
      for (const p of paymentsClean) {
        if (!rateOf(p.currency)) throw new Error(`Falta el tipo de cambio de hoy para ${p.currency}`);
      }
      const paidMxn = paymentsClean.reduce((sum, p) => sum + Number(p.amount || 0) * rateOf(p.currency)!, 0);
      const paymentDifference = paidMxn - totalMxn;
      if (Math.abs(paymentDifference) > paymentsToleranceMxn(paymentsClean, todayRates)) {
        throw new Error(
          paymentDifference < 0
            ? `Falta registrar ${formatMoney(Math.abs(paymentDifference), "MXN")} en pagos`
            : `El pago excede el total por ${formatMoney(paymentDifference, "MXN")}`,
        );
      }

      const rate = rateOf(currency)!;
      const totalInCurrency = currency === "MXN" ? totalMxn : totalMxn / rate;

      const soldAtIso = soldAtLocal ? new Date(soldAtLocal).toISOString() : new Date().toISOString();
      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        seller_id: user.id,
        subtotal: subtotalMxn,
        discount,
        total: totalInCurrency,
        currency,
        exchange_rate_used: rate,
        sold_at: soldAtIso,
      }).select("id").single();
      if (orderErr || !order) throw orderErr || new Error("No se pudo crear la orden");

      const items = cart.map((l) => ({
        order_id: order.id,
        product_id: l.productId,
        variant_id: l.variantId,
        product_name_snapshot: l.name,
        variant_snapshot: l.variantLabel,
        quantity: l.quantity,
        unit_price: currency === "MXN" ? l.unitPriceMxn : l.unitPriceMxn / rate,
        total: (currency === "MXN" ? l.unitPriceMxn : l.unitPriceMxn / rate) * l.quantity,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(items);
      if (itemsErr) throw itemsErr;

      if (customerIdFile) {
        const doc = await uploadSaleDoc(user.id, order.id, "customer-id", customerIdFile);
        const { error: idErr } = await supabase
          .from("orders")
          .update({ customer_id_file_path: doc.path, customer_id_file_name: doc.name })
          .eq("id", order.id);
        if (idErr) throw idErr;
      }

      const paymentsToInsert = await Promise.all(paymentsClean.map(async (p) => {
        const voucher = p.voucherFile ? await uploadSaleDoc(user.id, order.id, "voucher", p.voucherFile) : null;
        return {
          order_id: order.id,
          payment_method: p.method,
          bank: isBankPayment(p.method) ? "HSBC" : null,
          currency: p.currency,
          amount: p.amount,
          exchange_rate_used: rateOf(p.currency)!,
          voucher_file_path: voucher?.path ?? null,
          voucher_file_name: voucher?.name ?? null,
        };
      }));
      const { error: payErr } = await supabase.from("payments").insert(paymentsToInsert);
      if (payErr) throw payErr;
      await ensureOrderCommission(order.id, user.id, totalInCurrency, currency);

      const { data: ticket, error: tErr } = await supabase.from("tickets").insert({ order_id: order.id }).select("public_token").single();
      if (tErr || !ticket) throw tErr || new Error("No se pudo crear el ticket");

      return { token: ticket.public_token as string, total: totalInCurrency, currency };
    },
    onSuccess: (data) => {
      toast.success("Venta registrada");
      setTicket(data);
      setCart([]); setDiscount(0); setSoldAtLocal("");
      setCustomerIdFile(null);
      setCheckoutOpen(false);
      setCheckoutKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["sell-products"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) =>
      toast.error("No se pudo registrar la venta. El carrito sigue aquí; intenta de nuevo.", {
        description: e?.message,
        duration: 8000,
      }),
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      {/* Product picker */}
      <div className="flex-1 min-w-0 p-3 pb-24 md:p-6 md:pb-24 lg:pb-6">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {(cats.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {OFFERS.map((o) => (
            <Button key={o.id} type="button" variant="secondary" className="h-auto py-2 flex-col" onClick={() => applyOffer(o)}>
              <span className="text-xs">Oferta · {o.label}</span>
              <span className="font-numeric font-bold">{formatMoney(o.price)}</span>
            </Button>
          ))}
        </div>

        {products.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No hay productos. <Link to="/app/inventory" className="text-primary underline">Crear uno</Link></p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
              return (
                <button key={p.id} onClick={() => setVariantPickerFor(p)} className="text-left">
                  <Card className="overflow-hidden hover:shadow-elevated transition-shadow">
                    <div className="aspect-square bg-muted relative">
                      {p.photo_thumb_url || p.photo_url ? (
                        <img src={p.photo_thumb_url ?? p.photo_url ?? ""} alt={p.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Sin foto</div>
                      )}
                      {totalStock === 0 && (
                        <span className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded">Agotado</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.categories?.name || "—"}</p>
                      <p className="font-semibold font-numeric mt-1">{formatMoney(p.base_price_mxn)}</p>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart - desktop: ocupa toda la altura, el botón Cobrar queda fijo abajo */}
      <aside className="hidden lg:flex lg:w-96 lg:sticky lg:top-0 lg:h-screen self-start border-l bg-card flex-col">
        <CartPanel cart={cart} itemCount={itemCount} totalMxn={totalMxn} discount={discount}
          updateQty={updateQty} removeLine={removeLine} onCharge={openCheckout} />
      </aside>

      {/* Celular / tablet: barra fija con carrito y Cobrar */}
      <div className="lg:hidden fixed inset-x-0 bottom-[57px] md:bottom-0 z-20 flex gap-2 border-t bg-card/95 backdrop-blur p-2">
        <Button variant="outline" className="h-12 px-4 gap-2" onClick={() => setCartOpen(true)} aria-label="Ver carrito">
          <ShoppingCart className="h-5 w-5" />
          <span className="font-numeric font-semibold">{itemCount}</span>
        </Button>
        <Button className="h-12 flex-1 text-base font-bold" disabled={cart.length === 0 || totalMxn <= 0} onClick={openCheckout}>
          {cart.length === 0 ? "Agrega productos" : `Cobrar ${formatMoney(totalMxn)}`}
        </Button>
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="sr-only"><SheetTitle>Carrito</SheetTitle></SheetHeader>
          <CartPanel cart={cart} itemCount={itemCount} totalMxn={totalMxn} discount={discount}
            updateQty={updateQty} removeLine={removeLine} onCharge={openCheckout} />
        </SheetContent>
      </Sheet>

      <CheckoutDialog
        key={checkoutKey}
        open={checkoutOpen}
        onOpenChange={(o) => { if (!checkout.isPending) setCheckoutOpen(o); }}
        subtotalMxn={subtotalMxn}
        totalMxn={totalMxn}
        discount={discount}
        setDiscount={setDiscount}
        soldAtLocal={soldAtLocal}
        setSoldAtLocal={setSoldAtLocal}
        customerIdFile={customerIdFile}
        setCustomerIdFile={setCustomerIdFile}
        rates={todayRates}
        isAdmin={isAdmin}
        loading={checkout.isPending}
        onConfirm={(payload) => checkout.mutate(payload)}
      />

      {/* Variant picker */}
      <Dialog open={!!variantPickerFor} onOpenChange={(o) => !o && setVariantPickerFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{variantPickerFor?.name}</DialogTitle></DialogHeader>
          {variantPickerFor && variantPickerFor.variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este producto no tiene variantes. <Link to="/app/inventory" className="text-primary underline">Agregar</Link></p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {variantPickerFor && sortVariantsBySize(variantPickerFor.variants).map((v) => {
                const picked = variantPickerFor;
                return (
                  <button
                    key={v.id}
                    disabled={v.stock <= 0}
                    onClick={() => { addLine(picked, v); setVariantPickerFor(null); }}
                    className="border rounded-lg p-3 text-left hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <p className="font-medium">{v.variant_name}</p>
                    <p className="text-xs text-muted-foreground">Stock: {v.stock}</p>
                    <p className="text-sm font-semibold font-numeric mt-1">{formatMoney(Number(v.price_override_mxn ?? picked.base_price_mxn))}</p>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ticket dialog */}
      <Dialog open={!!ticket} onOpenChange={(o) => !o && setTicket(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>¡Venta registrada!</DialogTitle></DialogHeader>
          {ticket && (
            <div className="space-y-4 text-center">
              <p className="text-2xl font-bold font-numeric">{formatMoney(ticket.total, ticket.currency)}</p>
              <div className="flex justify-center"><QRCodeSVG value={`${window.location.origin}/t/${ticket.token}`} size={180} /></div>
              <p className="text-xs text-muted-foreground break-all">{window.location.origin}/t/{ticket.token}</p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  className="inline-flex items-center justify-center rounded-md bg-secondary text-secondary-foreground px-3 py-2 text-sm hover:opacity-90"
                  href={`https://wa.me/?text=${encodeURIComponent(`Tu ticket de CAsitakin: ${window.location.origin}/t/${ticket.token}`)}`}
                  target="_blank" rel="noreferrer"
                ><MessageCircle className="h-4 w-4 mr-2" /> WhatsApp</a>
                <a
                  className="inline-flex items-center justify-center rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm hover:opacity-90"
                  href={`mailto:?subject=${encodeURIComponent("Tu ticket de CAsitakin")}&body=${encodeURIComponent(`Mira tu ticket: ${window.location.origin}/t/${ticket.token}`)}`}
                ><Mail className="h-4 w-4 mr-2" /> Email</a>
              </div>
              <a href={`/t/${ticket.token}`} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary underline">Ver ticket</a>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTicket(null)} className="w-full h-12 text-base">Nueva venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CartPanel({
  cart, itemCount, totalMxn, discount, updateQty, removeLine, onCharge,
}: {
  cart: CartLine[];
  itemCount: number;
  totalMxn: number;
  discount: number;
  updateQty: (id: string, delta: number) => void;
  removeLine: (id: string) => void;
  onCharge: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <p className="font-semibold">Carrito</p>
        <p className="text-sm text-muted-foreground font-numeric">
          {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Toca un producto para agregarlo</p>
        ) : cart.map((l) => (
          <div key={l.variantId} className="flex gap-2 items-center rounded-md border p-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{l.name}</p>
              <p className="text-xs text-muted-foreground truncate">{l.variantLabel}</p>
              <p className="text-xs font-numeric mt-0.5">
                {formatMoney(l.unitPriceMxn * l.quantity)}
                {l.quantity > 1 && <span className="text-muted-foreground"> · {formatMoney(l.unitPriceMxn)} c/u</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => updateQty(l.variantId, -1)} aria-label="Quitar uno"><Minus className="h-4 w-4" /></Button>
              <span className="w-7 text-center font-numeric">{l.quantity}</span>
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => updateQty(l.variantId, 1)} aria-label="Agregar uno"><Plus className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => removeLine(l.variantId)} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t bg-card p-3 space-y-1">
        {discount > 0 && (
          <p className="text-xs text-muted-foreground text-center font-numeric">Incluye descuento de {formatMoney(discount)}</p>
        )}
        <Button className="w-full h-14 text-lg font-bold" disabled={cart.length === 0 || totalMxn <= 0} onClick={onCharge}>
          {cart.length === 0 ? "Agrega productos" : `Cobrar ${formatMoney(totalMxn)}`}
        </Button>
      </div>
    </div>
  );
}
