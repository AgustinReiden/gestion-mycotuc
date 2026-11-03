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
  { value: "pending", label: "A cobrar" },
  { value: "partial", label: "Parcial" },
  { value: "paid", label: "Cobrada" },
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
  { href: "/dashboard", label: "Inicio", title: "Resumen del mes", icon: Home },
  { href: "/ventas", label: "Ventas", title: "Ventas y cobros", icon: ShoppingCart },
  { href: "/gastos", label: "Gastos", title: "Gastos", icon: Wallet },
  { href: "/productos", label: "Productos", title: "Productos y stock", icon: Package },
  { href: "/insumos", label: "Insumos", title: "Insumos y compras", icon: Archive },
  { href: "/produccion", label: "Producción", title: "Lotes de producción", icon: Sprout },
  { href: "/contactos", label: "Contactos", title: "Clientes y proveedores", icon: ClipboardList },
  { href: "/reportes", label: "Reportes", title: "Reportes", icon: BarChart3 },
];

/** Accesos de la barra inferior en el celular (el resto va en "Más"). */
export const MOBILE_TABS = ["/dashboard", "/ventas", "/productos"] as const;

export type QuickCreateKey = "venta" | "gasto" | "compra" | "lote" | "contacto" | "producto";

/** Lo que se puede cargar desde el botón "Cargar": abre el formulario en su pantalla. */
export const QUICK_CREATE: { key: QuickCreateKey; href: string; label: string; detail: string; icon: LucideIcon }[] = [
  { key: "venta", href: "/ventas", label: "Venta", detail: "Descuenta stock y registra el cobro", icon: ShoppingCart },
  { key: "gasto", href: "/gastos", label: "Gasto", detail: "Servicios, envíos, sueldos", icon: Wallet },
  { key: "compra", href: "/insumos", label: "Compra de insumos", detail: "Suma stock de insumos", icon: Archive },
  { key: "lote", href: "/produccion", label: "Lote de producción", detail: "Insumos que entran, productos que salen", icon: Sprout },
  { key: "contacto", href: "/contactos", label: "Contacto", detail: "Cliente o proveedor", icon: ClipboardList },
  { key: "producto", href: "/productos", label: "Producto", detail: "Extracto, sal u hongo fresco", icon: Package },
];
