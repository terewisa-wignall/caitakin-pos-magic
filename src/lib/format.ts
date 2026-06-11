export type Currency = "MXN" | "USD" | "EUR";

export const currencySymbol: Record<Currency, string> = {
  MXN: "$",
  USD: "US$",
  EUR: "€",
};

export function formatMoney(amount: number, currency: Currency = "MXN") {
  const fmt = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
  return fmt.format(amount || 0);
}

export function formatDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatDateShort(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(d);
}
