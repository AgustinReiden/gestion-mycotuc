import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null))
  .nullable()
  .optional();

export const loginSchema = z.object({
  email: z.email("Ingresa un email valido."),
  password: z.string().min(6, "La contrasena debe tener al menos 6 caracteres."),
});

export const contactFormSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["client", "supplier"]),
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  phone: optionalTrimmedString,
  email: optionalTrimmedString,
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const productFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  category: z.string().trim().min(2, "La categoria es obligatoria."),
  unit: z.string().trim().min(1, "La unidad es obligatoria."),
  salePrice: z.coerce.number().nonnegative("El precio no puede ser negativo."),
  minStock: z.coerce.number().nonnegative("El stock minimo no puede ser negativo."),
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const supplyFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  unit: z.string().trim().min(1, "La unidad es obligatoria."),
  minStock: z.coerce.number().nonnegative("El stock minimo no puede ser negativo."),
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const stockAdjustmentSchema = z.object({
  entityType: z.enum(["product", "supply"]),
  entityId: z.string().uuid(),
  quantity: z.coerce.number().refine((value) => value !== 0, "La variacion no puede ser 0."),
  notes: optionalTrimmedString,
  movementDate: z.string().min(1, "La fecha es obligatoria."),
});

export const expenseFormSchema = z.object({
  concept: z.string().trim().min(2, "El concepto es obligatorio."),
  expenseDate: z.string().min(1, "La fecha es obligatoria."),
  categoryId: z.string().uuid("Selecciona una categoria."),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
  notes: optionalTrimmedString,
});

export const saleItemSchema = z.object({
  productId: z.string().uuid("Selecciona un producto."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
  unitPrice: z.coerce.number().nonnegative("El precio unitario es obligatorio."),
});

export const saleOrderFormSchema = z
  .object({
    customerMode: z.enum(["existing", "inline", "anonymous"]).default("inline"),
    contactId: z.string().uuid().nullish(),
    customerName: optionalTrimmedString,
    customerPhone: optionalTrimmedString,
    customerEmail: optionalTrimmedString,
    saleDate: z.string().min(1, "La fecha es obligatoria."),
    channelId: z.string().uuid("Selecciona un canal."),
    paymentStatus: z.enum(["pending", "partial", "paid"]),
    paymentMethod: optionalTrimmedString,
    paidAt: optionalTrimmedString,
    notes: optionalTrimmedString,
    items: z.array(saleItemSchema).min(1, "Agrega al menos un item."),
  })
  .superRefine((data, ctx) => {
    if (data.customerMode === "existing" && !data.contactId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Selecciona un cliente sugerido o ingresa uno nuevo.",
      });
    }

    if (data.customerMode !== "anonymous" && (!data.customerName || data.customerName.length < 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Ingresa el nombre del cliente.",
      });
    }
  });

export const purchaseItemSchema = z.object({
  supplyId: z.string().uuid("Selecciona un insumo."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
  unitCost: z.coerce.number().nonnegative("El costo unitario es obligatorio."),
});

export const purchaseFormSchema = z.object({
  supplierId: z.string().uuid("Selecciona un proveedor."),
  purchaseDate: z.string().min(1, "La fecha es obligatoria."),
  notes: optionalTrimmedString,
  items: z.array(purchaseItemSchema).min(1, "Agrega al menos un item."),
});

export const productionInputSchema = z.object({
  supplyId: z.string().uuid("Selecciona un insumo."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
});

export const productionOutputSchema = z.object({
  productId: z.string().uuid("Selecciona un producto."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
});

export const productionBatchFormSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid("Selecciona un producto."),
  status: z.enum(["draft", "active", "completed", "cancelled"]),
  startedAt: z.string().min(1, "La fecha de inicio es obligatoria."),
  completedAt: optionalTrimmedString,
  expectedQty: z.coerce.number().nullable().optional(),
  actualQty: z.coerce.number().nullable().optional(),
  notes: optionalTrimmedString,
  inputs: z.array(productionInputSchema).default([]),
  outputs: z.array(productionOutputSchema).default([]),
});

export const paymentStatusUpdateSchema = z.object({
  saleOrderId: z.string().uuid(),
  paymentStatus: z.enum(["pending", "partial", "paid"]),
  paymentMethod: optionalTrimmedString,
  paidAt: optionalTrimmedString,
});
