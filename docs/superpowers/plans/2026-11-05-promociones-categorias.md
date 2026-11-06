# Promociones por categoría y gestión de categorías Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sección "Promociones" con escalas de precio por cantidad por categoría (con productos excluibles), combos fijos movidos ahí, y gestión de categorías desde Productos.

**Architecture:** Tablas nuevas de escalas por categoría + una función SQL pura `price_category_scales(items jsonb)` que calcula el total de cada renglón; `create_sale_order_core` la usa y la misma regla se espeja en TypeScript (`src/lib/category-scales.ts`) para el carrito. Las escrituras van por RPC solo-admin, como `upsert_bundle`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, react-hook-form + zod 4, Supabase (Postgres, RLS, RPC), vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-promociones-categorias-design.md`

## Global Constraints

- `AGENTS.md`: este Next.js tiene cambios incompatibles; leer la guía relevante en `node_modules/next/dist/docs/` antes de escribir páginas o server actions.
- Todo configurable desde el sistema; ningún precio, cantidad ni nombre de categoría escrito en el código (salvo el seed de "Hongos Secos").
- Solo admin crea y edita escalas y categorías (`public.require_admin()`).
- Los combos fijos conservan sus tablas y su lógica de venta; sus unidades no cuentan para `q`.
- Un renglón se cobra por combo o por escala, nunca por ambos. Una categoría tiene como máximo una escala.
- Textos de interfaz en español rioplatense, igual que el resto de la app (`validators.ts`, paneles).
- Migraciones nuevas con nombre `2026110512xxxx_*.sql`, posteriores a `20261105120000_voided_payments_and_master_data_guards.sql`. Nunca aplicar migraciones a la base de producción sin que Agustín lo apruebe.
- Regla de precio (idéntica en SQL y TS). `q` = suma de cantidades de renglones de producto directo (no combo) cuyo producto pertenece a la categoría de una escala **activa** y no está excluido. Escalón aplicable = el de mayor `min_qty` ≤ `q`; si no hay, la escala no aplica. Modo `unit`: total del renglón = cantidad × precio del escalón. Modo `pack` con N = `min_qty`: las N unidades de mayor `products.sale_price` (desempate por product id, luego por posición del renglón) forman el pack y se cobran en total al precio del escalón, repartido entre sus renglones proporcional a `sale_price × unidades del pack en ese renglón` (el último renglón del pack absorbe el redondeo); las `q − N` unidades restantes se cobran a `products.sale_price`. Total de un renglón = parte de pack + sobrantes.
- Escala de categoría contra escala por producto: si `q` llega al primer escalón de la escala de categoría gana la de categoría; si no, el renglón usa `resolve_product_price` como hoy.
- Validación de venta (renglón con escala): precio unitario enviado `u`, cantidad `n`, total esperado `T`. Si `abs(round(u*n,2) - T) <= 0.01*n` el renglón vale `T`. Si no: un no admin recibe excepción "El precio unitario debe coincidir con el precio de lista; solo un administrador puede cambiarlo"; un admin fija `round(u*n,2)` como total. `unit_price` guardado = `greatest(round(total/n, 2), 0.01)`; `list_price` = `round(T/n, 2)`.
- Validación de escalones: `min_qty > 0`, sin `min_qty` repetidos, `price > 0`, `mode` ∈ (`unit`,`pack`), al menos un escalón.

## Review Focus

- Cantidades decimales (por ejemplo 0,5 unidades) y el mismo producto repartido en dos renglones del pedido: el total del pedido debe seguir dando exactamente el total del escalón.
- `q` mayor que el último escalón (por ejemplo 12 con último escalón "desde 5 por unidad"): aplica el último escalón, sin error.
- Escala o categoría desactivada después de configurarla: la venta se cobra a precio normal, sin error.
- Producto excluido, o de otra categoría, junto con productos incluidos: no cuenta para `q` y se cobra a su precio normal.
- Renombrar una categoría: los productos y la escala siguen asociados y no queda ningún producto huérfano.

---

### Task 1: Categorías editables en la base

**Files:**
- Create: `supabase/migrations/20261105130000_category_management.sql`
- Test: `supabase/tests/business_regressions.sql` (agregar bloque al final, antes del `raise exception 'PASS...'`)

**Interfaces:**
- Produces: `public.save_product_category(payload jsonb) returns public.product_categories` con payload `{ id?: uuid, name: text, isActive?: boolean }`. Solo admin.

- [ ] **Step 1: Escribir verificaciones en `business_regressions.sql`** (usando `pg_temp.check_that` / `pg_temp.fails` del archivo): un no admin falla al llamar `save_product_category`; admin crea "Categoria Test"; nombre duplicado (sin distinguir mayúsculas) falla; renombrar una categoría con un producto actualiza `products.category` al nombre nuevo y no deja productos con el nombre viejo; desactivar una categoría la deja `is_active = false` sin tocar sus productos; "Hongos Secos" existe y está activa.
- [ ] **Step 2: Crear la migración** con (a) `insert into public.product_categories (name) values ('Hongos Secos') on conflict (name) do nothing;` (b) la función `save_product_category`: `require_admin()`, nombre obligatorio de 2+ caracteres tras `trim`, unicidad `lower(name)` (índice único nuevo `product_categories_name_lower_key`), alta o edición por `id`; al renombrar actualiza `products.category` del nombre viejo al nuevo después de renombrar la fila (el trigger `products_assert_category` exige que el nombre exista y esté activo); (c) `revoke ... from public, anon; grant ... to authenticated;` como en `20261103140000_catalog_categories_tiers_bundles.sql`.
- [ ] **Step 3: Verificar.** Correr `business_regressions.sql` contra una base de prueba con todas las migraciones (rama de desarrollo de Supabase; pedir permiso a Agustín antes de crearla). Esperado: `PASS: N verificaciones OK`.
- [ ] **Step 4: Commit** `feat: gestión de categorías en la base y categoría Hongos Secos`.

### Task 2: Escalas por categoría en la base (tablas, RPC y cálculo)

**Files:**
- Create: `supabase/migrations/20261105140000_category_price_scales.sql`
- Test: `supabase/tests/business_regressions.sql`

**Interfaces:**
- Produces tablas `category_price_scales (id, category_id unique → product_categories, is_active, created_at, updated_at)`, `category_price_scale_tiers (id, scale_id, min_qty numeric(14,2), price numeric(14,2), mode text check in ('unit','pack'), unique(scale_id,min_qty))`, `category_price_scale_excluded_products (scale_id, product_id, primary key (scale_id,product_id))`. RLS: lectura para `authenticated`, sin escritura directa (igual que `product_bundles`).
- Produces `public.save_category_price_scale(payload jsonb) returns public.category_price_scales` con payload `{ id?: uuid, categoryId: uuid, isActive?: boolean, excludedProductIds: uuid[], tiers: { minQty: number, price: number, mode: "unit"|"pack" }[] }`. Solo admin; reemplaza tiers y exclusiones; aplica las validaciones de escalones.
- Produces `public.price_category_scales(p_items jsonb) returns table (item_index integer, line_total numeric, scale_id uuid, tier_min_qty numeric)`; `item_index` es 0-based sobre `p_items` (items con `productId`, `quantity`, `bundleId` opcional). Solo devuelve renglones afectados por una escala. Implementa la regla de precio de Global Constraints.
- Produces columnas nuevas `sales_order_items.price_scale_id uuid references category_price_scales(id)` y `sales_order_items.price_scale_min_qty numeric(14,2)`, ambas nullables.
- Consumes: `public.require_admin()`, `public.products(sale_price, category, is_active)`.

- [ ] **Step 1: Escribir verificaciones en `business_regressions.sql`** con Extractos de prueba (precios de lista 25000, 22000, 20000, 20000) y escalones `{3, 65000, pack}`, `{4, 80000, pack}`, `{5, 15000, unit}`: `price_category_scales` para 2 unidades no devuelve filas; para 3 unidades distintas suma exactamente 65000; para 4 suma 80000; para 6 suma 90000; con solo el escalón `{3, 65000, pack}` y 5 unidades (A,B,C,D,D) suma `65000 + sale_price` de las dos unidades más baratas; un producto excluido y uno de otra categoría no cambian `q` ni su precio; escala desactivada → sin filas; un renglón con `bundleId` no cuenta para `q`; un no admin no puede llamar `save_category_price_scale`; `min_qty` repetidos, `price <= 0` o lista vacía fallan; cantidad decimal 0,5 + 2,5 del mismo producto en dos renglones suma como 3; `save_category_price_scale` con una segunda escala para la misma categoría edita la existente (no duplica).
- [ ] **Step 2: Crear tablas, RLS, `save_category_price_scale` y `price_category_scales`** en la migración. Algoritmo de `price_category_scales`: expandir renglones de producto directo con `with ordinality`, unir con productos y escalas activas (categoría activa, producto no excluido), calcular `q` por escala, elegir escalón, ordenar unidades por (`sale_price` desc, `product_id`, posición) y asignar pack/sobrantes por cantidad acumulada (un renglón puede quedar parte en pack y parte sobrante), repartir el total del pack proporcional con el último renglón absorbiendo el redondeo.
- [ ] **Step 3: Redefinir `create_sale_order_core(payload jsonb)`** en la misma migración con `create or replace`, copiando el cuerpo de `create_sale_order` de `20261103140000_catalog_categories_tiers_bundles.sql` (líneas 218–480) y cambiando solo la rama "Linea de producto": primero consultar `price_category_scales(payload -> 'items')` para el índice del renglón (usar `with ordinality` en el `for`); si hay fila aplicar la validación de Global Constraints y guardar `price_scale_id` y `price_scale_min_qty`; si no, el comportamiento actual con `resolve_product_price`. Mantener `revoke/grant` de `create_sale_order_core` como están en `20261103160000_costs_margins_payments.sql` (sin permiso para `authenticated`).
- [ ] **Step 4: Agregar verificaciones de venta completa:** una venta de 3 extractos distintos con precio unitario correcto crea renglones cuya suma de `line_total` es 65000 y total del pedido 65000; el stock baja de cada producto elegido; un no admin con precio unitario distinto falla; un admin con precio distinto guarda su precio; las ventas de combos y de productos sin escala siguen dando el mismo total que antes.
- [ ] **Step 5: Verificar** como en Task 1. Esperado: `PASS: N verificaciones OK`.
- [ ] **Step 6: Commit** `feat: escalas de precio por categoría en la base y en la venta`.

### Task 3: Cálculo espejo en TypeScript

**Files:**
- Create: `src/lib/category-scales.ts`
- Modify: `src/lib/domain.ts` (tipos nuevos al lado de `PriceTierRecord`)
- Test: `tests/category-scales.test.ts`

**Interfaces:**
- Produces en `domain.ts`: `type CategoryScaleTierRecord = { id: string; minQty: number; price: number; mode: "unit" | "pack" }` y `type CategoryScaleRecord = { id: string; categoryId: string; categoryName: string; isActive: boolean; excludedProductIds: string[]; tiers: CategoryScaleTierRecord[] }`.
- Produces en `category-scales.ts`: `type ScaledLine = { lineTotal: number; scaleId: string; tierMinQty: number }` y `priceCategoryScales(lines: PricedLineInput[], products: Pick<ProductRecord, "id" | "salePrice" | "category">[], scales: CategoryScaleRecord[]): Map<number, ScaledLine>` (clave = índice del renglón, 0-based; solo renglones afectados; `PricedLineInput` viene de `src/lib/pricing.ts`). El match de categoría es por `ProductRecord.category` contra `CategoryScaleRecord.categoryName`.

- [ ] **Step 1: Escribir `tests/category-scales.test.ts`** con los mismos casos y valores de Task 2 Step 1 (2 unidades → mapa vacío; 3 → suma 65000; 4 → 80000; 6 → 90000; pack con sobrantes; exclusión; otra categoría; escala inactiva; renglón con `bundleId` ignorado; decimales y mismo producto en dos renglones; `q` mayor al último escalón).
- [ ] **Step 2: Correr** `npx vitest run tests/category-scales.test.ts`. Esperado: FALLA (módulo inexistente).
- [ ] **Step 3: Implementar `priceCategoryScales`** siguiendo la regla de Global Constraints (misma asignación y mismo redondeo a centavos que el SQL; usar `roundMoney` de `pricing.ts`).
- [ ] **Step 4: Correr** `npx vitest run`. Esperado: todos pasan.
- [ ] **Step 5: Commit** `feat: cálculo de escalas por categoría en el cliente`.

### Task 4: Capa de datos y acciones

**Files:**
- Modify: `src/lib/cache.ts` (tag `categoryScales: "category-scales"`), `src/lib/database.types.ts` (tablas y funciones nuevas, columnas de `sales_order_items`), `src/lib/mappers.ts` (`mapCategoryScale`), `src/lib/queries.ts`, `src/lib/validators.ts`, `src/actions/catalog.ts`, `src/actions/products.ts` o `catalog.ts` para categorías
- Test: `tests/validators.test.ts`

**Interfaces:**
- Produces en `queries.ts`: `getCategoryScalesData(): Promise<CategoryScaleRecord[]>` (cacheada con el tag nuevo, igual que `getBundlesData`) y `getPromotionsPageData()` que devuelve `{ products, categories, bundles, scales, role }`. `getSalesPageData` (la que alimenta `sale-order-form`) pasa a incluir `categoryScales`. `getProductsPageData` deja de devolver `bundles`.
- Produces en `validators.ts`: `categoryScaleFormSchema` (campos de `save_category_price_scale`, con las validaciones de escalones y mensajes en español), `categoryScaleStatusSchema` (`{ id, isActive }`), `productCategoryFormSchema` (`{ id?, name, isActive }`).
- Produces en las acciones: `saveCategoryScaleAction(input: unknown): Promise<ActionResponse<CategoryScaleRecord>>`, `setCategoryScaleStatusAction(input: unknown): Promise<ActionResponse<CategoryScaleRecord>>`, `saveProductCategoryAction(input: unknown): Promise<ActionResponse<ProductCategoryRecord>>`. Siguen el patrón de `saveBundleAction` (parse → RPC → refrescar tags y `revalidatePaths("/productos", "/ventas", "/promociones")`).

- [ ] **Step 1: Escribir tests en `tests/validators.test.ts`:** `categoryScaleFormSchema` rechaza escalones vacíos, `minQty` repetido, `minQty <= 0`, `price <= 0`, `mode` inválido; acepta el ejemplo `{3, 65000, pack}, {4, 80000, pack}, {5, 15000, unit}` con `excludedProductIds` vacío; `productCategoryFormSchema` rechaza nombre de menos de 2 caracteres.
- [ ] **Step 2: Correr** `npx vitest run tests/validators.test.ts`. Esperado: FALLA.
- [ ] **Step 3: Implementar** schemas, tipos de base, mapper, queries (consulta con embebidos `product_categories(name)`, `category_price_scale_tiers(...)`, `category_price_scale_excluded_products(product_id)`) y las tres acciones.
- [ ] **Step 4: Verificar** `npx vitest run` y `npm run typecheck`. Esperado: sin errores.
- [ ] **Step 5: Commit** `feat: datos y acciones de escalas por categoría y categorías`.

### Task 5: La venta usa las escalas

**Files:**
- Modify: `src/components/forms/sale-order-form.tsx`, `src/components/app/sales-shell.tsx` (pasar `categoryScales`), `src/app/(app)/ventas/page.tsx` si hace falta

**Interfaces:**
- Consumes: `priceCategoryScales(...)` y `CategoryScaleRecord` de Task 3; `categoryScales` de `getSalesPageData` (Task 4).
- Produces: `LinePricing` gana `scaleMinQty: number | null` (escalón aplicado).

- [ ] **Step 1: En `getLinePricing`** llamar a `priceCategoryScales(items, products, categoryScales)`; para un renglón afectado, el subtotal es `lineTotal`, `unitPrice` = `lineTotal / cantidad` redondeado a centavos y `scaleMinQty` el escalón; un renglón con precio manual (admin) conserva su precio. El resto (combos, escalas por producto) no cambia.
- [ ] **Step 2: Mostrar en el renglón del carrito** una etiqueta "Promo · desde N" en el mismo estilo que la etiqueta "Combo ·" existente, y que el total del pedido use los subtotales calculados. El payload enviado sigue mandando `unitPrice` por renglón (el servidor lo valida con tolerancia).
- [ ] **Step 3: Verificar en el navegador** (`preview_start` con el dev server de `.claude/launch.json`; crear si no existe): con una escala de Extractos cargada (Task 6) agregar 3 extractos distintos y ver total 65000; 2 extractos y 1 sal: la sal a su precio; revisar la consola sin errores. `npm run typecheck && npm run lint && npx vitest run`. Esperado: sin errores.
- [ ] **Step 4: Commit** `feat: la venta aplica las escalas por categoría`.

### Task 6: Sección Promociones

**Files:**
- Create: `src/app/(app)/promociones/page.tsx`, `src/components/app/promotions-shell.tsx`, `src/components/app/category-scales-panel.tsx`, `src/components/forms/category-scale-form.tsx`
- Modify: `src/lib/constants.ts` (ítem `{ href: "/promociones", label: "Promociones", title: "Promociones y combos", icon: Tag }` en `APP_NAVIGATION` después de Productos), `src/components/app/products-shell.tsx` (quitar `BundlesPanel`, estado y props de `bundles`), `src/app/(app)/productos/page.tsx` si cambia la forma de los props
- Reusa sin cambios: `bundles-panel.tsx`, `bundle-form.tsx`

**Interfaces:**
- Consumes: `getPromotionsPageData()`, `saveCategoryScaleAction`, `setCategoryScaleStatusAction` (Task 4).
- Produces: `PromotionsShell` con dos paneles en este orden: "Escalas por categoría" (nuevo) y "Combos" (el `BundlesPanel` existente). Los tipos de promo se renderizan como paneles independientes en una lista en `promotions-shell.tsx`, para sumar otro tipo agregando un panel más.

- [ ] **Step 1: Leer** `node_modules/next/dist/docs/` sobre páginas y datos dinámicos y copiar el patrón de `src/app/(app)/productos/page.tsx` (`export const dynamic = "force-dynamic"`).
- [ ] **Step 2: `CategoryScalesPanel`** sigue el patrón de `bundles-panel.tsx`: tarjeta por escala (categoría, estado, lista de escalones "desde N → $precio total/por unidad", cantidad de excluidos), botones Editar y Activar/Desactivar, botón "Nueva escala" solo para admin; los no admin ven la lista sin botones.
- [ ] **Step 3: `CategoryScaleForm`** (react-hook-form + `categoryScaleFormSchema`, mismo estilo que `bundle-form.tsx`): selector de categoría (solo activas; sin categorías ya con escala al crear), lista de productos de la categoría elegida con casillas tildadas por defecto (destildar = excluir), tabla de escalones editable (desde, precio, selector "Precio total del pack" / "Precio por unidad") con agregar/quitar fila, aviso si un precio por unidad supera el `sale_price` de algún producto incluido.
- [ ] **Step 4: Mover Combos:** quitar `BundlesPanel` de `ProductsShell` y renderizarlo en `PromotionsShell`; ajustar `getProductsPageData` (Task 4) y el tipo `ProductsShellProps`. Agregar el ítem de navegación.
- [ ] **Step 5: Verificar en el navegador:** crear la escala de Extractos del ejemplo, excluir un producto, editar, desactivar y reactivar; los combos existentes se ven y se editan en Promociones y ya no aparecen en Productos; vista de celular (`resize_window` preset mobile) usable. `npm run typecheck && npm run lint && npx vitest run && npm run build`. Esperado: sin errores.
- [ ] **Step 6: Commit** `feat: sección Promociones con escalas por categoría y combos`.

### Task 7: Botón Categorías en Productos

**Files:**
- Create: `src/components/forms/product-category-form.tsx`
- Modify: `src/components/app/products-shell.tsx`

**Interfaces:**
- Consumes: `saveProductCategoryAction`, `productCategoryFormSchema` (Task 4); `categories: ProductCategoryRecord[]` que `ProductsShell` ya recibe.

- [ ] **Step 1: Botón "Categorías"** en el encabezado de `ProductsShell` (visible a todos; las acciones de edición solo para admin) que abre un `Modal` con la lista de categorías (nombre, estado, cantidad de productos), "Nueva categoría", editar nombre y activar/desactivar.
- [ ] **Step 2: Estado local de categorías** en el shell, actualizado con el resultado de la acción, siguiendo el patrón de `upsertProduct`; el selector de categoría de `ProductForm` usa esa lista (solo activas). Tras renombrar, refrescar los productos mostrados (usar `router.refresh()` o el patrón de sincronización con props que ya usa el shell).
- [ ] **Step 3: Verificar en el navegador:** crear "Categoria de prueba", renombrar "Hongos Secos" y ver que sus productos muestran el nombre nuevo; desactivar y confirmar que no aparece al crear un producto. `npm run typecheck && npm run lint && npx vitest run`. Esperado: sin errores.
- [ ] **Step 4: Commit** `feat: gestión de categorías desde Productos`.

### Task 8: Cierre

**Files:**
- Modify: `README.md` (lista de migraciones y mención de Promociones), `supabase/seed/seed.sql` solo si el seed arma categorías

- [ ] **Step 1: Agregar al README** las dos migraciones nuevas en el orden de aplicación y una línea sobre la sección Promociones.
- [ ] **Step 2: Corrida completa:** `npm run typecheck && npm run lint && npx vitest run && npm run build`. Esperado: sin errores.
- [ ] **Step 3: Pedir a Agustín** el OK para aplicar las migraciones a la base real (`mycotuc`) y correr `business_regressions.sql` ahí o en una rama de Supabase. No aplicar sin su respuesta.
- [ ] **Step 4: Commit** `docs: README con promociones y migraciones nuevas`.
