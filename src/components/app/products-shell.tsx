"use client";

import { useDeferredValue, useState } from "react";
import { Edit3, Layers, Package, Plus, Search, Settings2 } from "lucide-react";
import { BundlesPanel } from "@/components/app/bundles-panel";
import { StockHistoryPanel } from "@/components/app/stock-history-panel";
import { PriceTiersForm } from "@/components/forms/price-tiers-form";
import { ProductForm } from "@/components/forms/product-form";
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type {
  AppRole,
  BundleRecord,
  InventoryMovementRecord,
  PriceTierRecord,
  ProductCategoryRecord,
  ProductRecord,
} from "@/lib/domain";
import { useQuickCreate } from "@/lib/hooks/use-quick-create";
import { formatPercent, getMarginPercent } from "@/lib/finance";
import { formatQuantity, groupTiersByProduct } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

type ProductsShellProps = {
  products: ProductRecord[];
  movements: InventoryMovementRecord[];
  categories: ProductCategoryRecord[];
  priceTiers: PriceTierRecord[];
  bundles: BundleRecord[];
  role: AppRole;
};

function sortBundles(list: BundleRecord[]) {
  return [...list].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

function upsertBundle(list: BundleRecord[], bundle: BundleRecord) {
  return sortBundles([bundle, ...list.filter((entry) => entry.id !== bundle.id)]);
}

function sortProducts(list: ProductRecord[]) {
  return [...list].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

/** Las acciones no devuelven el costo promedio: se conserva el que llego del servidor. */
function upsertProduct(list: ProductRecord[], product: ProductRecord) {
  const previous = list.find((entry) => entry.id === product.id);
  const merged = { ...product, avgCost: product.avgCost ?? previous?.avgCost ?? null };

  return sortProducts([merged, ...list.filter((entry) => entry.id !== product.id)]);
}

function sortMovements(list: InventoryMovementRecord[]) {
  return [...list].sort((left, right) => {
    const movementDateComparison = right.movementDate.localeCompare(left.movementDate);

    if (movementDateComparison !== 0) {
      return movementDateComparison;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function mergeMovements(
  list: InventoryMovementRecord[],
  nextMovements: InventoryMovementRecord[],
  limit: number,
) {
  return sortMovements([
    ...nextMovements,
    ...list.filter((entry) => !nextMovements.some((movement) => movement.id === entry.id)),
  ]).slice(0, limit);
}

function NewProductModal({
  categories,
  isAdmin,
  onProductSaved,
}: {
  categories: ProductCategoryRecord[];
  isAdmin: boolean;
  onProductSaved: (product: ProductRecord) => void;
}) {
  const [open, setOpen] = useQuickCreate("producto");

  return (
    <>
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />
        Nuevo producto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo producto" description="Actualizá catálogo, precio y stock mínimo.">
        <ProductForm product={null} categories={categories} isAdmin={isAdmin} onSuccess={(product) => { setOpen(false); onProductSaved(product); }} />
      </Modal>
    </>
  );
}

function EditProductModal({
  product,
  categories,
  isAdmin,
  onClose,
  onProductSaved,
}: {
  product: ProductRecord;
  categories: ProductCategoryRecord[];
  isAdmin: boolean;
  onClose: () => void;
  onProductSaved: (product: ProductRecord) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Editar producto" description="Actualizá catálogo, precio y stock mínimo.">
      <ProductForm product={product} categories={categories} isAdmin={isAdmin} onSuccess={(updatedProduct) => { onProductSaved(updatedProduct); onClose(); }} />
    </Modal>
  );
}

function PriceTiersModal({
  product,
  tiers,
  onClose,
  onTiersSaved,
}: {
  product: ProductRecord;
  tiers: PriceTierRecord[];
  onClose: () => void;
  onTiersSaved: (tiers: PriceTierRecord[]) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Escalas de precio" description={`Precios por cantidad para ${product.name}.`}>
      <PriceTiersForm
        product={product}
        tiers={tiers}
        onSuccess={(savedTiers) => {
          onTiersSaved(savedTiers);
          onClose();
        }}
      />
    </Modal>
  );
}

function AdjustStockModal({
  product,
  onClose,
  onAdjustmentApplied,
}: {
  product: ProductRecord;
  onClose: () => void;
  onAdjustmentApplied: (result: {
    movement: InventoryMovementRecord;
    product: ProductRecord | null;
  }) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Ajustar stock" description="Registrá una corrección manual para mantener el inventario trazable.">
      <StockAdjustmentForm
        entityType="product"
        entityId={product.id}
        entityLabel={product.name}
        onSuccess={(result) => {
          onAdjustmentApplied(result);
          onClose();
        }}
      />
    </Modal>
  );
}

export function ProductsShell({
  products,
  movements,
  categories,
  priceTiers,
  bundles,
  role,
}: ProductsShellProps) {
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [productRecords, setProductRecords] = useState(() => sortProducts(products));
  const [movementRecords, setMovementRecords] = useState(() => sortMovements(movements));
  const [tierRecords, setTierRecords] = useState(priceTiers);
  const [bundleRecords, setBundleRecords] = useState(() => sortBundles(bundles));
  const [tiersProduct, setTiersProduct] = useState<ProductRecord | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [adjustmentProduct, setAdjustmentProduct] = useState<ProductRecord | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasSearchQuery = deferredSearch.trim().length > 0;
  const movementHistoryLimit = Math.max(movements.length, 12);

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedProducts, setSyncedProducts] = useState(products);
  if (syncedProducts !== products) {
    setSyncedProducts(products);
    setProductRecords(sortProducts(products));
  }

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedMovements, setSyncedMovements] = useState(movements);
  if (syncedMovements !== movements) {
    setSyncedMovements(movements);
    setMovementRecords(sortMovements(movements));
  }

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedPriceTiers, setSyncedPriceTiers] = useState(priceTiers);
  if (syncedPriceTiers !== priceTiers) {
    setSyncedPriceTiers(priceTiers);
    setTierRecords(priceTiers);
  }

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedBundles, setSyncedBundles] = useState(bundles);
  if (syncedBundles !== bundles) {
    setSyncedBundles(bundles);
    setBundleRecords(sortBundles(bundles));
  }

  const tiersByProduct = groupTiersByProduct(tierRecords);

  const filteredProducts = productRecords.filter((product) => {
    const query = deferredSearch.toLowerCase();
    return product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
  });

  return (
    <div className="page-grid">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar productos"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
          />
        </label>
        <NewProductModal
          categories={categories}
          isAdmin={isAdmin}
          onProductSaved={(product) => {
            setProductRecords((current) => upsertProduct(current, product));
          }}
        />
      </div>

      {filteredProducts.length === 0 ? (
        <Panel>
          <EmptyState
            title={hasSearchQuery ? "No encontramos productos" : "No hay productos para mostrar"}
            description={
              hasSearchQuery
                ? "Probá con otro término de búsqueda o creá un producto nuevo."
                : "Creá tu primer producto o probá otra búsqueda."
            }
            icon={Package}
          />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <Panel key={product.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] bg-[var(--moss-soft)] text-[var(--moss)]">
                  <Package className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-2">
                  {product.currentStock <= product.minStock ? <Badge tone="danger">Stock bajo</Badge> : <Badge tone="success">OK</Badge>}
                  {!product.isActive ? <Badge>Inactivo</Badge> : null}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold">{product.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{product.category}</p>
              </div>

              <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5 grid-cols-2">
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Stock actual</p>
                  <p className="mt-1 text-xl font-semibold">
                    {product.currentStock} {product.unit}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Precio</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--moss)]">{formatCurrency(product.salePrice)}</p>
                </div>
                {isAdmin && product.avgCost !== null ? (
                  <>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--muted)]">Costo promedio</p>
                      <p className="mt-1 text-lg font-semibold">
                        {product.avgCost > 0 ? formatCurrency(product.avgCost) : <span className="text-[var(--amber-ink)]">Sin costo</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--muted)]">Margen unitario</p>
                      <p className="mt-1 text-lg font-semibold">
                        {product.avgCost > 0 ? formatPercent(getMarginPercent(product.salePrice, product.avgCost)) : "—"}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-sm">
                <p className="text-[13px] font-medium text-[var(--muted)]">Escalas de precio</p>
                {(tiersByProduct.get(product.id) ?? []).length === 0 ? (
                  <p className="mt-1 text-[var(--muted)]">Sin escalas: siempre precio base.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {(tiersByProduct.get(product.id) ?? []).map((tier) => (
                      <li key={tier.id}>
                        Desde {formatQuantity(tier.minQty)} {product.unit}:{" "}
                        <span className="font-semibold">{formatCurrency(tier.unitPrice)}</span> c/u
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {product.notes ? <p className="text-sm text-[var(--muted)]">{product.notes}</p> : null}

              <div className="mt-auto flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="flex-1 whitespace-nowrap" onClick={() => setSelectedProduct(product)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </Button>
                {isAdmin ? (
                  <Button type="button" variant="ghost" className="flex-1 whitespace-nowrap" onClick={() => setTiersProduct(product)}>
                    <Layers className="h-4 w-4" />
                    Escalas
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button type="button" variant="ghost" className="flex-1 whitespace-nowrap" onClick={() => setAdjustmentProduct(product)}>
                    <Settings2 className="h-4 w-4" />
                    Ajustar stock
                  </Button>
                ) : null}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <BundlesPanel
        bundles={bundleRecords}
        products={productRecords}
        isAdmin={isAdmin}
        onBundleSaved={(bundle) => {
          setBundleRecords((current) => upsertBundle(current, bundle));
        }}
      />

      <StockHistoryPanel
        title="Historial de stock de productos"
        description="Últimos movimientos que afectaron el inventario de producto terminado."
        movements={movementRecords}
      />

      {selectedProduct ? (
        <EditProductModal
          product={selectedProduct}
          categories={categories}
          isAdmin={isAdmin}
          onClose={() => setSelectedProduct(null)}
          onProductSaved={(product) => {
            setProductRecords((current) => upsertProduct(current, product));
          }}
        />
      ) : null}
      {isAdmin && tiersProduct ? (
        <PriceTiersModal
          product={tiersProduct}
          tiers={tiersByProduct.get(tiersProduct.id) ?? []}
          onClose={() => setTiersProduct(null)}
          onTiersSaved={(savedTiers) => {
            const productId = tiersProduct.id;
            setTierRecords((current) => [
              ...current.filter((tier) => tier.productId !== productId),
              ...savedTiers,
            ]);
          }}
        />
      ) : null}
      {adjustmentProduct ? (
        <AdjustStockModal
          product={adjustmentProduct}
          onClose={() => setAdjustmentProduct(null)}
          onAdjustmentApplied={(result) => {
            if (result.product) {
              setProductRecords((current) => upsertProduct(current, result.product!));
            }
            setMovementRecords((current) =>
              mergeMovements(current, [result.movement], movementHistoryLimit),
            );
          }}
        />
      ) : null}
    </div>
  );
}
