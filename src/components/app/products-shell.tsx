"use client";

import { useDeferredValue, useEffect, useState } from "react";
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
  onProductSaved,
}: {
  categories: ProductCategoryRecord[];
  onProductSaved: (product: ProductRecord) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo producto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo producto" description="Actualiza catalogo, precio y stock minimo.">
        <ProductForm product={null} categories={categories} onSuccess={(product) => { setOpen(false); onProductSaved(product); }} />
      </Modal>
    </>
  );
}

function EditProductModal({
  product,
  categories,
  onClose,
  onProductSaved,
}: {
  product: ProductRecord;
  categories: ProductCategoryRecord[];
  onClose: () => void;
  onProductSaved: (product: ProductRecord) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Editar producto" description="Actualiza catalogo, precio y stock minimo.">
      <ProductForm product={product} categories={categories} onSuccess={(updatedProduct) => { onProductSaved(updatedProduct); onClose(); }} />
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
    <Modal open onClose={onClose} title="Ajustar stock" description="Registra una correccion manual para mantener inventario trazable.">
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

  useEffect(() => {
    setProductRecords(sortProducts(products));
  }, [products]);

  useEffect(() => {
    setMovementRecords(sortMovements(movements));
  }, [movements]);

  useEffect(() => {
    setTierRecords(priceTiers);
  }, [priceTiers]);

  useEffect(() => {
    setBundleRecords(sortBundles(bundles));
  }, [bundles]);

  const tiersByProduct = groupTiersByProduct(tierRecords);

  const filteredProducts = productRecords.filter((product) => {
    const query = deferredSearch.toLowerCase();
    return product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
  });

  return (
    <div className="page-grid">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Productos</p>
            <h2 className="mt-2 text-3xl font-semibold">Catalogo de venta</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Administra precios, stock minimo y ajustes manuales de producto terminado.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 sm:min-w-[260px] sm:flex-1">
              <Search className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar producto..."
                aria-label="Buscar productos"
                className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <NewProductModal
              categories={categories}
              onProductSaved={(product) => {
                setProductRecords((current) => upsertProduct(current, product));
              }}
            />
          </div>
        </div>
      </Panel>

      {filteredProducts.length === 0 ? (
        <Panel>
          <EmptyState
            title={hasSearchQuery ? "No encontramos productos" : "No hay productos para mostrar"}
            description={
              hasSearchQuery
                ? "Prueba otro termino de busqueda o crea un producto nuevo."
                : "Crea tu primer producto o prueba otra busqueda."
            }
            icon={Package}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <Panel key={product.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#dce8db] text-[#15553e]">
                  <Package className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-2">
                  {product.currentStock <= product.minStock ? <Badge tone="danger">Stock bajo</Badge> : <Badge tone="success">OK</Badge>}
                  {!product.isActive ? <Badge>Inactivo</Badge> : null}
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-semibold">{product.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{product.category}</p>
              </div>

              <div className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-[#f7f5ef] p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Stock actual</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {product.currentStock} {product.unit}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Precio</p>
                  <p className="mt-2 text-2xl font-semibold text-[#15553e]">{formatCurrency(product.salePrice)}</p>
                </div>
                {isAdmin && product.avgCost !== null ? (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Costo promedio</p>
                      <p className="mt-2 text-lg font-semibold">{formatCurrency(product.avgCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Margen unitario</p>
                      <p className="mt-2 text-lg font-semibold">
                        {formatPercent(getMarginPercent(product.salePrice, product.avgCost))}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="rounded-[20px] border border-[var(--line)] bg-white/70 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Escalas de precio</p>
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

              <div className="mt-auto flex flex-col flex-wrap gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setSelectedProduct(product)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </Button>
                {isAdmin ? (
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setTiersProduct(product)}>
                    <Layers className="h-4 w-4" />
                    Escalas
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setAdjustmentProduct(product)}>
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
        description="Ultimos movimientos que afectaron el inventario de producto terminado."
        movements={movementRecords}
      />

      {selectedProduct ? (
        <EditProductModal
          product={selectedProduct}
          categories={categories}
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
