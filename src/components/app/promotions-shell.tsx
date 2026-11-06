"use client";

import { useState } from "react";
import { BundlesPanel } from "@/components/app/bundles-panel";
import { CategoryScalesPanel } from "@/components/app/category-scales-panel";
import type {
  AppRole,
  BundleRecord,
  CategoryScaleRecord,
  ProductCategoryRecord,
  ProductRecord,
} from "@/lib/domain";

type PromotionsShellProps = {
  products: ProductRecord[];
  categories: ProductCategoryRecord[];
  bundles: BundleRecord[];
  scales: CategoryScaleRecord[];
  role: AppRole;
};

function sortBundles(list: BundleRecord[]) {
  return [...list].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

function upsertBundle(list: BundleRecord[], bundle: BundleRecord) {
  return sortBundles([bundle, ...list.filter((entry) => entry.id !== bundle.id)]);
}

function sortScales(list: CategoryScaleRecord[]) {
  return [...list].sort((left, right) => left.categoryName.localeCompare(right.categoryName, "es", { sensitivity: "base" }));
}

function upsertScale(list: CategoryScaleRecord[], scale: CategoryScaleRecord) {
  return sortScales([scale, ...list.filter((entry) => entry.id !== scale.id)]);
}

/**
 * Cada tipo de promocion es un panel independiente: para sumar otro tipo se agrega un panel mas
 * a esta lista (con su propio estado y sus propias acciones).
 */
export function PromotionsShell({ products, categories, bundles, scales, role }: PromotionsShellProps) {
  const isAdmin = role === "admin";
  const [bundleRecords, setBundleRecords] = useState(() => sortBundles(bundles));
  const [scaleRecords, setScaleRecords] = useState(() => sortScales(scales));
  const [syncedBundles, setSyncedBundles] = useState(bundles);
  const [syncedScales, setSyncedScales] = useState(scales);

  if (syncedBundles !== bundles) {
    setSyncedBundles(bundles);
    setBundleRecords(sortBundles(bundles));
  }

  if (syncedScales !== scales) {
    setSyncedScales(scales);
    setScaleRecords(sortScales(scales));
  }

  return (
    <div className="space-y-6">
      <CategoryScalesPanel
        scales={scaleRecords}
        categories={categories}
        products={products}
        isAdmin={isAdmin}
        onScaleSaved={(scale) => setScaleRecords((current) => upsertScale(current, scale))}
      />
      <BundlesPanel
        bundles={bundleRecords}
        products={products}
        isAdmin={isAdmin}
        onBundleSaved={(bundle) => setBundleRecords((current) => upsertBundle(current, bundle))}
      />
    </div>
  );
}
