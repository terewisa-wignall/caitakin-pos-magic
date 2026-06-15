## Objetivo

Cuando se sube una foto de producto (alta de producto o edición), procesarla automáticamente para quitar el fondo y dejar el producto sobre fondo blanco limpio, antes de subirla al storage.

## Cómo va a funcionar

1. El usuario selecciona la foto como hoy (botón actual en Inventario / detalle de producto).
2. Antes de subir, la imagen pasa por un paso de "limpieza":
   - Se recorta el fondo automáticamente (queda solo el producto).
   - Se pega el producto sobre un lienzo blanco cuadrado del mismo tamaño.
   - Se exporta como JPG comprimido.
3. La foto resultante (producto + fondo blanco) es la que se guarda en el bucket `product-photos` y se muestra en la app.
4. Indicador visual mientras procesa ("Quitando fondo…") para que el admin sepa que tarda unos segundos la primera vez.

## Detalles técnicos

- Librería: `@imgly/background-removal` (corre 100% en el navegador con WASM, sin API key ni costo, sin enviar la foto a terceros). Primera ejecución descarga el modelo (~40 MB) y queda cacheado.
- Nuevo helper `src/lib/remove-bg.ts` con una función `flattenOnWhite(file: File): Promise<File>` que:
  - Llama a `removeBackground(file)` → obtiene PNG transparente.
  - Dibuja en un `<canvas>` con `fillStyle = "#fff"` de fondo.
  - Exporta a JPG (calidad 0.9) y devuelve un nuevo `File`.
- Cambios en los dos puntos de subida actuales:
  - `src/routes/app.inventory.tsx` (modal "Nuevo producto"): correr `flattenOnWhite` antes del `supabase.storage.upload`.
  - `src/routes/app.inventory.$productId.tsx` (editar producto): igual.
- Estado `processing` para deshabilitar el botón Guardar y mostrar texto "Quitando fondo…".
- Fallback: si la librería falla (imagen muy rara, sin memoria, etc.), se sube la foto original y se muestra un toast informativo, sin bloquear al usuario.
- Tamaño máximo de imagen de entrada: si pasa de ~10 MB se rechaza con toast para no tronar la pestaña.

## Lo que NO cambia

- Bucket, políticas, esquema de BD, flujo de variantes, ni el resto del inventario.
- Las fotos ya subidas se quedan como están (no se reprocesan en lote).
- No se agregan claves ni servicios externos.

## Archivos a tocar

- nuevo: `src/lib/remove-bg.ts`
- editado: `src/routes/app.inventory.tsx`
- editado: `src/routes/app.inventory.$productId.tsx`
- editado: `package.json` (agregar `@imgly/background-removal`)
