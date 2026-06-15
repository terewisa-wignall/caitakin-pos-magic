import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, ShoppingCart, Trash2, Plus, Minus, MessageCircle, Mail, Upload, IdCard } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney, type Currency } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/app/sell")({
  head: () => ({ meta: [{ title: "Vender · CAsitakin" }] }),
  component: SellPage,
});

type Variant = { id: string; variant_name: string; size: string | null; color: string | null; stock: number; price_override_mxn: number | null };
type Product = { id: string; name: string; photo_url: string | null; base_price_mxn: number; category_id: string | null; variants: Variant[]; categories: { name: string } | null };
type CartLine = { variantId: string; productId: string; name: string; variantLabel: string; unitPriceMxn: number; quantity: number; stock: number };
type PaymentMethod = "cash" | "transfer" | "debit_card" | "credit_card";
type Payment = { method: PaymentMethod; currency: Currency; amount: number; voucherFile?: File | null };

function isBankPayment(method: PaymentMethod) {
  return method !== "cash";
}

function needsVoucher(method: PaymentMethod) {
  return isBankPayment(method);
}

function getFileExt(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  return file.type === "image/png" ? "png" : "jpg";
}

async function uploadSaleDoc(userId: string, orderId: string, kind: "voucher" | "customer-id", file: File) {
  const path = `${userId}/${orderId}/${kind}-${crypto.randomUUID()}.${getFileExt(file)}`;
  const { error } = await supabase.storage.from("sale-docs").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

function SellPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [variantPickerFor, setVariantPickerFor] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [currency, setCurrency] = useState<Currency>("MXN");
  const [payments, setPayments] = useState<Payment[]>([{ method: "cash", currency: "MXN", amount: 0 }]);
  const [customerIdFile, setCustomerIdFile] = useState<File | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [ticket, setTicket] = useState<{ token: string; total: number } | null>(null);

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });

  const products = useQuery({
    queryKey: ["sell-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,photo_url,base_price_mxn,category_id, categories(name), variants:product_variants(id,variant_name,size,color,stock,price_override_mxn)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  const rates = useQuery({
    queryKey: ["rates-active"],
    queryFn: async () => {
      const { data } = await supabase.from("exchange_rates").select("base_currency,target_currency,rate").eq("is_active", true);
      const map: Record<string, number> = { MXN: 1 };
      (data ?? []).forEach((r) => { if (r.target_currency === "MXN") map[r.base_currency] = Number(r.rate); });
      return map;
    },
  });

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
  const totalDisplay = currency === "MXN" ? totalMxn : totalMxn / (rates.data?.[currency] ?? 1);

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

  const checkout = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No autenticado");
      if (cart.length === 0) throw new Error("Carrito vacío");

      const paymentsClean = payments.filter((p) => p.amount > 0);
      if (paymentsClean.length === 0) throw new Error("Registra al menos un pago");

      const rate = currency === "MXN" ? 1 : (rates.data?.[currency] ?? 1);
      const totalInCurrency = currency === "MXN" ? totalMxn : totalMxn / rate;

      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        seller_id: user.id,
        subtotal: subtotalMxn,
        discount,
        total: totalInCurrency,
        currency,
        exchange_rate_used: rate,
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

      let customerIdPath: string | null = null;
      if (customerIdFile) {
        customerIdPath = await uploadSaleDoc(user.id, order.id, "customer-id", customerIdFile);
        const { error: idErr } = await supabase
          .from("orders")
          .update({ customer_id_file_path: customerIdPath, customer_id_file_name: customerIdFile.name })
          .eq("id", order.id);
        if (idErr) throw idErr;
      }

      const paymentsToInsert = await Promise.all(paymentsClean.map(async (p) => {
        let voucherPath: string | null = null;
        if (p.voucherFile) {
          voucherPath = await uploadSaleDoc(user.id, order.id, "voucher", p.voucherFile);
        }
        return {
          order_id: order.id,
          payment_method: p.method,
          bank: isBankPayment(p.method) ? "HSBC" : null,
          currency: p.currency,
          amount: p.amount,
          exchange_rate_used: p.currency === "MXN" ? 1 : (rates.data?.[p.currency] ?? 1),
          voucher_file_path: voucherPath,
          voucher_file_name: p.voucherFile?.name ?? null,
        };
      }));
      const { error: payErr } = await supabase.from("payments").insert(paymentsToInsert);
      if (payErr) throw payErr;

      const { data: ticket, error: tErr } = await supabase.from("tickets").insert({ order_id: order.id }).select("public_token").single();
      if (tErr || !ticket) throw tErr || new Error("No se pudo crear el ticket");

      return { token: ticket.public_token as string, total: totalInCurrency };
    },
    onSuccess: (data) => {
      setTicket(data);
      setCart([]); setDiscount(0); setPayments([{ method: "cash", currency: "MXN", amount: 0 }]);
      setCustomerIdFile(null);
      setCartOpen(false);
      qc.invalidateQueries({ queryKey: ["sell-products"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: any) => toast.error(e.message || "Error al cobrar"),
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      {/* Product picker */}
      <div className="flex-1 min-w-0 p-3 md:p-6">
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
                      {p.photo_url ? (
                        <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
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

      {/* Cart - desktop */}
      <aside className="hidden lg:flex lg:w-96 border-l bg-card flex-col">
        <CartPanel
          cart={cart} subtotalMxn={subtotalMxn} totalMxn={totalMxn} totalDisplay={totalDisplay}
          discount={discount} setDiscount={setDiscount} currency={currency} setCurrency={setCurrency}
          payments={payments} setPayments={setPayments}
          customerIdFile={customerIdFile} setCustomerIdFile={setCustomerIdFile}
          updateQty={updateQty} removeLine={removeLine}
          checkout={() => checkout.mutate()} loading={checkout.isPending}
        />
      </aside>

      {/* Cart - mobile */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetTrigger asChild>
          <button className="lg:hidden fixed right-4 bottom-20 z-20 bg-primary text-primary-foreground rounded-full px-4 py-3 shadow-elevated flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <span className="font-semibold font-numeric">{cart.length}</span>
            <span className="text-sm">· {formatMoney(totalDisplay, currency)}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b"><SheetTitle>Carrito</SheetTitle></SheetHeader>
          <CartPanel
            cart={cart} subtotalMxn={subtotalMxn} totalMxn={totalMxn} totalDisplay={totalDisplay}
            discount={discount} setDiscount={setDiscount} currency={currency} setCurrency={setCurrency}
            payments={payments} setPayments={setPayments}
            customerIdFile={customerIdFile} setCustomerIdFile={setCustomerIdFile}
            updateQty={updateQty} removeLine={removeLine}
            checkout={() => checkout.mutate()} loading={checkout.isPending}
          />
        </SheetContent>
      </Sheet>

      {/* Variant picker */}
      <Dialog open={!!variantPickerFor} onOpenChange={(o) => !o && setVariantPickerFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{variantPickerFor?.name}</DialogTitle></DialogHeader>
          {variantPickerFor && variantPickerFor.variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este producto no tiene variantes. <Link to="/app/inventory" className="text-primary underline">Agregar</Link></p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {variantPickerFor?.variants.map((v) => (
                <button
                  key={v.id}
                  disabled={v.stock <= 0}
                  onClick={() => { addLine(variantPickerFor, v); setVariantPickerFor(null); }}
                  className="border rounded-lg p-3 text-left hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <p className="font-medium">{v.variant_name}</p>
                  <p className="text-xs text-muted-foreground">Stock: {v.stock}</p>
                  <p className="text-sm font-semibold font-numeric mt-1">{formatMoney(Number(v.price_override_mxn ?? variantPickerFor.base_price_mxn))}</p>
                </button>
              ))}
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
              <p className="text-2xl font-bold font-numeric">{formatMoney(ticket.total, currency)}</p>
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
            <Button onClick={() => setTicket(null)} className="w-full">Nueva venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CartPanel({
  cart, subtotalMxn, totalMxn, totalDisplay, discount, setDiscount, currency, setCurrency,
  payments, setPayments, customerIdFile, setCustomerIdFile, updateQty, removeLine, checkout, loading,
}: any) {
  const setPayment = (i: number, p: Partial<Payment>) => setPayments((ps: Payment[]) => ps.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const showCustomerIdReminder = totalMxn > 1000;
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carrito vacío</p>
        ) : cart.map((l: CartLine) => (
          <div key={l.variantId} className="flex gap-3 items-start">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.variantLabel}</p>
              <p className="text-sm font-numeric mt-1">{formatMoney(l.unitPriceMxn)}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.variantId, -1)}><Minus className="h-3 w-3" /></Button>
              <span className="w-6 text-center font-numeric text-sm">{l.quantity}</span>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.variantId, 1)}><Plus className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLine(l.variantId)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Descuento (MXN)</Label>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} className="font-numeric" />
          </div>
          <div>
            <Label className="text-xs">Divisa</Label>
            <Select value={currency} onValueChange={(v: Currency) => setCurrency(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MXN">MXN</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-numeric">{formatMoney(subtotalMxn)}</span></div>
        <div className="flex justify-between text-sm"><span>Descuento</span><span className="font-numeric">−{formatMoney(discount)}</span></div>
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="font-numeric text-primary">{formatMoney(totalDisplay, currency)}</span></div>

        {showCustomerIdReminder && (
          <Card className="p-3 bg-amber-50 border-amber-200 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <IdCard className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-amber-900">Venta mayor a $1,000</p>
                <p className="text-xs text-amber-800">Solicita ID del cliente. No es obligatorio para cobrar.</p>
              </div>
            </div>
            <Label className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900">
              <Upload className="h-3.5 w-3.5" />
              {customerIdFile ? "Cambiar foto de ID" : "Subir foto de ID"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setCustomerIdFile(e.target.files?.[0] ?? null)} />
            </Label>
            {customerIdFile && <p className="truncate text-xs text-amber-800">{customerIdFile.name}</p>}
          </Card>
        )}

        <Tabs defaultValue="single">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="single">Pago simple</TabsTrigger>
            <TabsTrigger value="mixed">Pago mixto</TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="space-y-2 pt-3">
            <Select value={payments[0]?.method} onValueChange={(v) => setPayment(0, { method: v as PaymentMethod, voucherFile: needsVoucher(v as PaymentMethod) ? payments[0]?.voucherFile ?? null : null })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="debit_card">Débito</SelectItem>
                <SelectItem value="credit_card">Crédito</SelectItem>
              </SelectContent>
            </Select>
            {needsVoucher(payments[0]?.method) && (
              <VoucherUpload
                file={payments[0]?.voucherFile ?? null}
                onChange={(file) => setPayment(0, { voucherFile: file })}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Select value={payments[0]?.currency} onValueChange={(v) => setPayment(0, { currency: v as Currency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Monto" value={payments[0]?.amount || ""} onChange={(e) => setPayment(0, { amount: Number(e.target.value) || 0 })} className="font-numeric" />
            </div>
            <Button size="sm" variant="link" className="px-0" onClick={() => setPayment(0, { amount: totalDisplay, currency })}>Usar total</Button>
          </TabsContent>
          <TabsContent value="mixed" className="space-y-2 pt-3">
            {payments.map((p: Payment, i: number) => (
              <div key={i} className="space-y-1 rounded-md border p-2">
                <div className="grid grid-cols-[1fr_80px_1fr_auto] gap-1 items-center">
                  <Select value={p.method} onValueChange={(v) => setPayment(i, { method: v as PaymentMethod, voucherFile: needsVoucher(v as PaymentMethod) ? p.voucherFile ?? null : null })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="transfer">Transfer.</SelectItem>
                      <SelectItem value="debit_card">Débito</SelectItem>
                      <SelectItem value="credit_card">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={p.currency} onValueChange={(v) => setPayment(i, { currency: v as Currency })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MXN">MXN</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" value={p.amount || ""} onChange={(e) => setPayment(i, { amount: Number(e.target.value) || 0 })} className="h-9 font-numeric" />
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setPayments(payments.filter((_: any, idx: number) => idx !== i))}><Trash2 className="h-3 w-3" /></Button>
                </div>
                {needsVoucher(p.method) && (
                  <VoucherUpload
                    file={p.voucherFile ?? null}
                    compact
                    onChange={(file) => setPayment(i, { voucherFile: file })}
                  />
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setPayments([...payments, { method: "cash", currency: "MXN", amount: 0 }])}>
              <Plus className="h-3 w-3 mr-1" /> Agregar pago
            </Button>
          </TabsContent>
        </Tabs>

        <Button className="w-full" size="lg" disabled={loading || cart.length === 0 || totalMxn <= 0} onClick={checkout}>
          {loading ? "Cobrando..." : "Cobrar"}
        </Button>
      </div>
    </div>
  );
}

function VoucherUpload({
  file,
  onChange,
  compact = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1" : "rounded-md border bg-muted/30 p-2 space-y-1"}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Comprobante HSBC</p>
          <p className="text-[11px] text-muted-foreground">Pide la foto del voucher de banco.</p>
        </div>
        <Label className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium">
          <Upload className="h-3.5 w-3.5" />
          Foto
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        </Label>
      </div>
      {file && <p className="truncate text-[11px] text-muted-foreground">{file.name}</p>}
    </div>
  );
}
