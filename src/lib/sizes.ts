const TEXT_SIZE_ORDER = ["XXS", "XS", "S", "CH", "M", "G", "L", "EG", "XL", "XG", "XXL"];

export function getSizeSortValue(size: string) {
  const normalized = size.trim().toUpperCase();
  const textIndex = TEXT_SIZE_ORDER.indexOf(normalized);
  if (textIndex >= 0) return textIndex + 1000;

  const numeric = Number.parseFloat(normalized.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;

  const rangeStart = normalized.match(/^(\d+(?:\.\d+)?)-/);
  if (rangeStart) return Number.parseFloat(rangeStart[1]);

  if (normalized === "UNITALLA") return 2000;
  return 3000;
}

export function normalizeSize(size: string) {
  return size.trim().toUpperCase();
}

export function sortSizes(sizes: string[]) {
  return [...sizes].sort((a, b) => {
    const aValue = getSizeSortValue(a);
    const bValue = getSizeSortValue(b);
    if (aValue !== bValue) return aValue - bValue;
    return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
  });
}

export function sortVariantsBySize<T extends { size: string | null; variant_name: string }>(
  variants: T[],
) {
  return [...variants].sort((a, b) => {
    const aSize = a.size || a.variant_name;
    const bSize = b.size || b.variant_name;
    const aValue = getSizeSortValue(aSize);
    const bValue = getSizeSortValue(bSize);
    if (aValue !== bValue) return aValue - bValue;
    return aSize.localeCompare(bSize, "es", { numeric: true, sensitivity: "base" });
  });
}
