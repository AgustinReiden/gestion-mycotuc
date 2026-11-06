# Promociones por categoría y gestión de categorías

## Por qué

Hoy un combo es una lista fija de productos con un precio fijo. Mycotuc vende "armá tu combo a gusto": el cliente elige N productos de una categoría (por ejemplo extractos) y el precio depende de cuántos lleva, no de cuáles. Con el sistema actual habría que cargar un combo por cada combinación posible. Las escalas por cantidad actuales (`product_price_tiers`) tampoco sirven: son por producto y solo cuentan unidades del mismo producto.

También hace falta una categoría nueva ("Hongos Secos") y que el equipo pueda crear y editar categorías sin tocar la base de datos.

Principio del pedido: **nada hardcodeado, todo configurable** desde el sistema.

## Objetivos

1. Una sección nueva **Promociones** (página propia en el menú). Es el lugar de todas las promos. El primer tipo nuevo es **"Escala por cantidad en una categoría"**; el diseño debe permitir sumar otros tipos después sin rehacer la sección.
2. Una escala por categoría se configura con:
   - la categoría;
   - los productos que entran: lista con todos los productos de la categoría tildados por defecto, se destildan los excluidos;
   - los escalones: cada uno tiene "desde N unidades", un precio y un modo, **"precio total del pack"** o **"precio por unidad"**.
3. Al vender, el sistema suma las unidades de los productos incluidos de esa categoría en el pedido y aplica el escalón que corresponde. Los productos de otras categorías o los excluidos no cuentan y van a su precio normal.
4. Los combos fijos existentes ("Combo equilibrio", "Combo x 4") pasan a mostrarse y administrarse dentro de Promociones como otro tipo de promo (hoy viven en la página Productos). Sus datos y su lógica de venta no cambian.
5. En la página **Productos**, un botón **"Categorías"** abre la lista de las categorías existentes y permite crear una nueva, renombrar o desactivar. No hay página aparte de categorías.
6. "Hongos Secos" queda creada como categoría desde la migración.
7. Todo lo anterior lo crean y editan solo los administradores.

## Fuera de alcance

- Cambiar los combos fijos ni su cálculo de precio.
- Otros tipos de promo además de las dos mencionadas (escala por categoría y combo fijo); solo se deja la estructura lista.
- Escalas que mezclen varias categorías.

## Qué sería un fracaso

- Que haya que cargar una combinación de productos por cada combo "a elección".
- Que un valor como "3 extractos = $65.000" quede escrito en el código en vez de en datos editables.
- Que el servidor acepte una venta con un precio distinto al que la promo define cuando quien vende no es admin (hoy el servidor ya rechaza precios que no coinciden con el de lista; con las escalas por categoría debe seguir pasando).
- Que el stock se descuente de un producto distinto al que realmente se llevó el cliente.

## Cómo se calcula el precio (decidido con el cliente)

Sea `q` la cantidad total de unidades incluidas de la categoría en el pedido, y el escalón aplicable el de mayor "desde N" tal que N ≤ `q`.

- Si `q` es menor que el primer escalón, no hay promo: cada producto va a su precio normal.
- Escalón **"precio por unidad"**: las `q` unidades se cobran a ese precio cada una.
- Escalón **"precio total del pack"**: se cobra ese total por las primeras N unidades y las `q − N` restantes van al precio normal de cada producto.

Ejemplo del cliente para Extractos: 3 unidades = $65.000 en total (pack), 4 unidades = otro total (pack), de 5 en adelante un precio por unidad (hasta 10 y más).

## Decisiones tomadas por mí (para revisar)

- **Qué unidades quedan dentro del pack cuando `q > N`:** el pack se arma con las unidades de mayor precio normal primero y las sobrantes son las de menor precio. Es lo más favorable al cliente. Cambiable.
- **Reparto del total del pack entre las líneas:** igual que los combos hoy, proporcional al precio normal de cada línea, con la última línea absorbiendo el redondeo y un mínimo de $0,01 por unidad.
- **Escala por categoría contra escala por producto (`product_price_tiers`):** si un producto incluido en una escala de categoría también tiene escalas propias, gana la de categoría solo cuando `q` llega al primer escalón de la categoría; si no, se aplican las del producto como hoy.
- **Una categoría tiene como máximo una escala activa.** Se puede desactivar sin borrarla.
- **Categorías desactivadas:** no se pueden usar en productos nuevos; los productos que ya las tienen no se tocan. Si una categoría se desactiva, su escala deja de aplicarse.
- **Renombrar una categoría** debe mantener a los productos asociados (hoy `products.category` guarda el nombre como texto, así que el cambio de nombre tiene que actualizarlos o migrar a una referencia por id; queda a criterio de quien construya, con la condición de que nunca queden productos huérfanos).

## Decisiones tomadas tras la revisión (mías, para revisar)

- **Combos fijos y escalas no se pisan.** Las unidades de un combo fijo no cuentan para `q` (igual que hoy: los combos no cuentan para las escalas por producto). Un renglón se cobra por combo o por escala, nunca por ambos.
- **Precio por renglón.** El servidor recalcula el precio de cada renglón con la misma regla que `pricing.ts`. Cuando un pack parte un renglón entre unidades del pack y unidades sobrantes, el precio del renglón es el total repartido dividido por su cantidad (mismo método que los combos). Si dos unidades empatan en precio normal, el desempate es por id de producto, para que el resultado sea siempre el mismo.
- **Admin y precios manuales.** Igual que hoy: un admin puede cambiar el precio de un renglón; un no admin solo puede vender al precio calculado. Un renglón con precio cambiado a mano sigue contando para `q`.
- **Un solo precio de lista.** No hay listas de precio por cliente ni por canal: el precio normal es `products.sale_price`.
- **Historial.** Cada renglón vendido guarda qué escala y qué escalón se aplicó (junto al `bundle_id` y `list_price` que ya guarda), y las ventas pasadas no cambian aunque la promo se edite o se desactive después.
- **Validación de escalones.** No se permiten "desde N" repetidos ni N ≤ 0; el precio debe ser mayor a cero; cada escalón elige su modo; no hay tope de unidades (el último escalón vale "en adelante"). Un precio por unidad mayor al normal se permite pero se avisa en pantalla.
- **Escala de categoría contra escala de producto:** se mantiene lo ya definido arriba (gana la de categoría al llegar a su primer escalón).

## Restricciones técnicas conocidas

- Next.js con cambios incompatibles con lo que se conoce: antes de escribir código hay que leer la guía relevante en `node_modules/next/dist/docs/` (lo pide `AGENTS.md`).
- Supabase con permisos por RLS: las tablas de catálogo se leen para usuarios autenticados y las escrituras van por funciones SQL solo para admin (`upsert_bundle`, etc.). Las nuevas tablas siguen el mismo patrón.
- La venta (`create_sale` o equivalente en `supabase/migrations/20261103140000_catalog_categories_tiers_bundles.sql`) calcula y valida precios en el servidor; el cálculo espejo en el cliente está en `src/lib/pricing.ts` y tiene que dar el mismo resultado. Los tests en `tests/` y `supabase/tests/business_regressions.sql` cubren esto y hay que extenderlos.
- Hoy las categorías de producto son `Extractos`, `Sales`, `Hongos Frescos`, en la tabla `product_categories`.

## Lo que queda a criterio de quien construye

- Nombres de tablas y funciones, forma exacta de las pantallas, textos, orden de las secciones.
- Cómo se muestra en la pantalla de ventas que se aplicó una promo (debe verse, por ejemplo con una etiqueta en el renglón o un descuento visible).
- Estructura interna para sumar tipos de promo futuros.
