export const CACHE_TAGS = {
  contacts: "contacts",
  expenses: "expenses",
  inventoryProduct: "inventory-product",
  inventorySupply: "inventory-supply",
  lookups: "lookups",
  production: "production",
  products: "products",
  profile: "profile",
  purchases: "purchases",
  sales: "sales",
  supplies: "supplies",
} as const;

export function dedupeTags(...tags: Array<string | null | undefined | false>) {
  return [...new Set(tags.filter(Boolean) as string[])];
}
