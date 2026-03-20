import {
  Archive,
  BarChart3,
  ClipboardList,
  Home,
  Package,
  ShoppingCart,
  Sprout,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const DEFAULT_CHANNELS = [
  "WhatsApp",
  "Instagram",
  "Tienda Online",
  "Farmacia",
  "Feria",
  "Gimnasio",
  "Terapeuta",
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Insumos",
  "Servicios",
  "Packaging",
  "Alquiler",
  "Sueldos",
  "Transporte",
  "Marketing",
  "Otros",
] as const;

export const PAYMENT_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "partial", label: "Parcial" },
  { value: "paid", label: "Pagado" },
] as const;

export const BATCH_STATUSES = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "En proceso" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

export const CONTACT_TYPES = [
  { value: "client", label: "Cliente" },
  { value: "supplier", label: "Proveedor" },
] as const;

export const ANONYMOUS_CUSTOMER_NAME = "Cliente N/A";

export const ENTITY_TYPES = [
  { value: "product", label: "Producto" },
  { value: "supply", label: "Insumo" },
] as const;

export type NavItem = {
  href: string;
  label: string;
  title: string;
  icon: LucideIcon;
};

export const APP_NAVIGATION: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", title: "Resumen operativo", icon: Home },
  { href: "/ventas", label: "Ventas", title: "Gestion de ventas", icon: ShoppingCart },
  { href: "/gastos", label: "Gastos", title: "Control de gastos", icon: Wallet },
  { href: "/productos", label: "Productos", title: "Inventario de productos", icon: Package },
  { href: "/insumos", label: "Insumos", title: "Stock de insumos", icon: Archive },
  { href: "/produccion", label: "Produccion", title: "Lotes y rendimiento", icon: Sprout },
  { href: "/contactos", label: "Contactos", title: "Clientes y proveedores", icon: ClipboardList },
  { href: "/reportes", label: "Reportes", title: "Analisis y metricas", icon: BarChart3 },
];
