"use client";

import { useDeferredValue, useState } from "react";
import { Edit3, Package, Plus, Search, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { StockHistoryPanel } from "@/components/app/stock-history-panel";
import { ProductForm } from "@/components/forms/product-form";
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { InventoryMovementRecord, ProductRecord } from "@/lib/domain";
import { formatCurrency } from "@/lib/utils";

type ProductsShellProps = {
  products: ProductRecord[];
  movements: InventoryMovementRecord[];
};

function NewProductModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo producto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo producto" description="Actualiza catalogo, precio y stock minimo.">
        <ProductForm product={null} onSuccess={() => { setOpen(false); router.refresh(); }} />
      </Modal>
    </>
  );
}

function EditProductModal({ product, onClose }: { product: ProductRecord; onClose: () => void }) {
  const router = useRouter();

  return (
    <Modal open onClose={onClose} title="Editar producto" description="Actualiza catalogo, precio y stock minimo.">
      <ProductForm product={product} onSuccess={() => { onClose(); router.refresh(); }} />
    </Modal>
  );
}

function AdjustStockModal({ product, onClose }: { product: ProductRecord; onClose: () => void }) {
  const router = useRouter();

  return (
    <Modal open onClose={onClose} title="Ajustar stock" description="Registra una correccion manual para mantener inventario trazable.">
      <StockAdjustmentForm entityType="product" entityId={product.id} entityLabel={product.name} onSuccess={() => { onClose(); router.refresh(); }} />
    </Modal>
  );
}

export function ProductsShell({ products, movements }: ProductsShellProps) {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [adjustmentProduct, setAdjustmentProduct] = useState<ProductRecord | null>(null);
  const deferredSearch = useDeferredValue(search);

  const filteredProducts = products.filter((product) => {
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
                className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <NewProductModal />
          </div>
        </div>
      </Panel>

      {filteredProducts.length === 0 ? (
        <Panel>
          <EmptyState
            title="No hay productos para mostrar"
            description="Crea tu primer producto o prueba otra busqueda."
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
              </div>

              {product.notes ? <p className="text-sm text-[var(--muted)]">{product.notes}</p> : null}

              <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setSelectedProduct(product)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </Button>
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setAdjustmentProduct(product)}>
                  <Settings2 className="h-4 w-4" />
                  Ajustar stock
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <StockHistoryPanel
        title="Historial de stock de productos"
        description="Ultimos movimientos que afectaron el inventario de producto terminado."
        movements={movements}
      />

      {selectedProduct ? <EditProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
      {adjustmentProduct ? <AdjustStockModal product={adjustmentProduct} onClose={() => setAdjustmentProduct(null)} /> : null}
    </div>
  );
}
