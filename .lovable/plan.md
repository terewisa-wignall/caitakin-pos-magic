## Objetivo

1. Reemplazar el logo actual por el bordado **circular de CAsitakin** que subiste, conservando la paleta actual.
2. Permitir agregar **tallas rápidas** al inventario por tipo de categoría (Niños, Niñas, Damas, Caballeros, Unitalla, Numérico), para no tener que crear cada variante una por una.

No se cambia la paleta, ni la estructura del POS, ni el resto de pantallas.

---

## 1. Logo bordado

- Subo la imagen circular bordada (`ChatGPT_Image_11_jun_2026_04_49_54_p.m..png`) como asset CDN (`src/assets/logo.png.asset.json`) usando `lovable-assets`.
- Elimino el `src/assets/logo.png` actual (el minimalista generado).
- Actualizo los 3 lugares que ya importan `@/assets/logo.png` para que importen el pointer JSON y usen su `url`:
  - `src/components/app-shell.tsx` (header sidebar y top-bar móvil)
  - `src/routes/auth.tsx` (pantalla de login)
  - `src/routes/t.$token.tsx` (ticket público)
- En el ticket impreso y la barra superior conservo el tamaño actual; el logo circular queda perfecto como ícono cuadrado.
- Como bonus rápido: actualizo el `<title>` y el favicon del root para que apunte al mismo asset (la pestaña del navegador también muestra el logo).

---

## 2. Tallas rápidas por categoría

### Problema actual

En el detalle del producto sólo hay un formulario que agrega **una variante a la vez** con campos libres (nombre, talla, color, stock, precio). Cargar un vestido con 6 tallas implica llenar el formulario 6 veces.

### Solución

En la pantalla **Detalle de producto** (`src/routes/app.inventory.$productId.tsx`), arriba del formulario actual de "Agregar variante", añado una sección nueva: **"Agregar set de tallas"**.

Componente nuevo (`src/components/size-set-picker.tsx`):

- **Selector de set de tallas** con presets:
  - Niños: `2, 4, 6, 8, 10, 12, 14`
  - Niñas: `2, 4, 6, 8, 10, 12, 14`
  - Damas: `CH, M, G, EG`
  - Caballeros: `CH, M, G, EG, XG`
  - Unitalla: `Unitalla`
  - Numérico mujer: `26, 28, 30, 32, 34`
  - Numérico hombre: `30, 32, 34, 36, 38`
  - Calzado: `22, 23, 24, 25, 26, 27, 28`
  - **Personalizado** (campo de texto separado por comas)
- Cada talla del set se muestra como **chip seleccionable** — el usuario puede desmarcar las que no aplican.
- Un solo campo **"Stock por talla"** (se aplica a todas; el stock fino se ajusta luego en la lista).
- Campo opcional **"Color"** (también se aplica a todas las tallas seleccionadas).
- Botón **"Crear N variantes"** → inserta todas las variantes en una sola operación (`product_variants` insert batch). El `variant_name` se autogenera como `Talla X` o `Talla X · Color`.

### Mejora del formulario actual

- El formulario individual de "Agregar variante" se queda, pero se colapsa en un acordeón ("Agregar una variante manual") porque el caso común será el bulk.
- En la lista de variantes existentes muestro la talla y el color como **badges** en vez de texto plano, para que se lea mejor.

### Sugerencia automática del set

Cuando el producto pertenece a una categoría con nombre que contiene `niñ`, `dama`, `caballero`, `unitalla`, etc., el selector **pre-selecciona el set sugerido** (sin forzar — puede cambiarlo).

---

## Detalles técnicos

- No hay cambios de schema: `product_variants` ya tiene `variant_name`, `size`, `color`, `stock`, `price_override_mxn`.
- El insert batch usa el cliente del navegador con la RLS existente (`admin write variants`).
- Los presets viven como constante en el componente (`SIZE_SETS`) para poder ajustarlos fácil más adelante.
- La paleta y los tokens de color (`--primary` terracota, `--secondary` verde suave, `--accent` dorado) **no se tocan**.

---

## Archivos afectados

| Archivo | Cambio |
| --- | --- |
| `src/assets/logo.png.asset.json` | nuevo pointer al logo bordado en CDN |
| `src/assets/logo.png` | eliminado (binario antiguo) |
| `src/routes/__root.tsx` | favicon apuntando al nuevo asset |
| `src/components/app-shell.tsx` | usa `logoAsset.url` |
| `src/routes/auth.tsx` | usa `logoAsset.url` |
| `src/routes/t.$token.tsx` | usa `logoAsset.url` |
| `src/components/size-set-picker.tsx` | **nuevo** — selector de set + chips + insert batch |
| `src/routes/app.inventory.$productId.tsx` | integra el picker, colapsa form manual, muestra badges |

Tiempo estimado de implementación: corto. Listo para ejecutar cuando lo apruebes.
