import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null))
  .nullable()
  .optional();

const optionalNonnegativeNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().nonnegative("El valor no puede ser negativo.").nullable().optional(),
);

const optionalAmount = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().positive("El monto cobrado debe ser mayor a cero.").optional(),
);

function validatePaymentFields(
  data: {
    paymentStatus: "pending" | "partial" | "paid";
    paymentMethod?: string | null;
    paidAt?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.paymentStatus === "pending" && (data.paymentMethod || data.paidAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["paymentStatus"],
      message: "Una venta pendiente no debe tener método ni fecha de cobro.",
    });
  }

  if (data.paymentStatus !== "pending" && (!data.paymentMethod || !data.paidAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["paymentMethod"],
      message: "Las ventas cobradas o parciales requieren método y fecha de cobro.",
    });
  }
}

export const loginSchema = z.object({
  email: z.email("Ingresá un email válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
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
  category: z.string().trim().min(1, "Seleccioná una categoría."),
  unit: z.string().trim().min(1, "La unidad es obligatoria."),
  salePrice: z.coerce.number().nonnegative("El precio no puede ser negativo."),
  minStock: z.coerce.number().nonnegative("El stock mínimo no puede ser negativo."),
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const supplyFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  unit: z.string().trim().min(1, "La unidad es obligatoria."),
  minStock: z.coerce.number().nonnegative("El stock mínimo no puede ser negativo."),
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

/** Costo unitario opcional del ajuste: vacio = sin costo (no toca el costo promedio). */
const optionalUnitCost = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().positive("El costo unitario debe ser mayor a cero.").optional(),
);

export const stockAdjustmentSchema = z
  .object({
    entityType: z.enum(["product", "supply"]),
    entityId: z.string().uuid(),
    quantity: z.coerce.number().refine((value) => value !== 0, "La variación no puede ser 0."),
    unitCost: optionalUnitCost,
    notes: z.string().trim().min(3, "El motivo del ajuste es obligatorio."),
    movementDate: z.string().min(1, "La fecha es obligatoria."),
  })
  .superRefine((data, ctx) => {
    if (data.unitCost !== undefined && data.quantity < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unitCost"],
        message: "El costo unitario solo se informa en ajustes positivos.",
      });
    }
  });

/** Correccion manual del costo promedio (solo admin, con motivo). */
export const averageCostCorrectionSchema = z.object({
  entityType: z.enum(["product", "supply"]),
  entityId: z.string().uuid(),
  avgCost: z.coerce.number().nonnegative("El costo promedio no puede ser negativo."),
  reason: z.string().trim().min(3, "El motivo de la corrección es obligatorio."),
});

export const expenseFormSchema = z.object({
  concept: z.string().trim().min(2, "El concepto es obligatorio."),
  expenseDate: z.string().min(1, "La fecha es obligatoria."),
  categoryId: z.string().uuid("Seleccioná una categoría."),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
  notes: optionalTrimmedString,
});

const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .nullish()
  .transform((value) => value || undefined);

const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().positive("El precio unitario debe ser mayor a cero.").optional(),
);

export const saleItemSchema = z
  .object({
    productId: optionalUuid,
    bundleId: optionalUuid,
    quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
    unitPrice: optionalPositiveNumber,
  })
  .superRefine((data, ctx) => {
    if (!data.productId && !data.bundleId) {
      ctx.addIssue({
        code: "custom",
        path: ["productId"],
        message: "Seleccioná un producto o un combo.",
      });
    }

    if (data.productId && data.bundleId) {
      ctx.addIssue({
        code: "custom",
        path: ["productId"],
        message: "Cada línea es un producto o un combo, no ambos.",
      });
    }
  });

export const priceTierSchema = z.object({
  minQty: z.coerce.number().positive("La cantidad mínima debe ser mayor a cero."),
  unitPrice: z.coerce.number().positive("El precio unitario debe ser mayor a cero."),
});

export const priceTiersFormSchema = z
  .object({
    productId: z.string().uuid("Seleccioná un producto."),
    tiers: z.array(priceTierSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<number>();

    data.tiers.forEach((tier, index) => {
      if (seen.has(tier.minQty)) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", index, "minQty"],
          message: "No puede haber dos escalas con la misma cantidad mínima.",
        });
      }

      seen.add(tier.minQty);
    });
  })
  .transform((data) => ({
    ...data,
    tiers: [...data.tiers].sort((left, right) => left.minQty - right.minQty),
  }));

export const bundleItemSchema = z.object({
  productId: z.string().uuid("Seleccioná un producto."),
  quantity: z.coerce.number().min(1, "La cantidad debe ser al menos 1."),
});

export const bundleFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "El nombre del combo es obligatorio."),
    salePrice: z.coerce.number().positive("El precio del combo debe ser mayor a cero."),
    notes: optionalTrimmedString,
    isActive: z.boolean().default(true),
    items: z.array(bundleItemSchema).min(1, "El combo debe tener al menos un producto."),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "productId"],
          message: "No repitas productos dentro del combo.",
        });
      }

      seen.add(item.productId);
    });
  });

export const bundleStatusSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export const saleOrderFormSchema = z
  .object({
    customerMode: z.enum(["existing", "inline", "anonymous"]).default("inline"),
    contactId: z.string().uuid().nullish(),
    customerName: optionalTrimmedString,
    customerPhone: optionalTrimmedString,
    customerEmail: optionalTrimmedString,
    saleDate: z.string().min(1, "La fecha es obligatoria."),
    channelId: z.string().uuid("Seleccioná un canal."),
    paymentStatus: z.enum(["pending", "partial", "paid"]),
    paymentMethod: optionalTrimmedString,
    paidAt: optionalTrimmedString,
    amountPaid: optionalAmount,
    notes: optionalTrimmedString,
    items: z.array(saleItemSchema).min(1, "Agregá al menos un ítem."),
  })
  .superRefine((data, ctx) => {
    validatePaymentFields(data, ctx);

    if (data.paymentStatus === "partial" && data.amountPaid === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amountPaid"],
        message: "Ingresá el monto cobrado de la venta parcial.",
      });
    }

    if (data.customerMode === "existing" && !data.contactId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Seleccioná un cliente sugerido o ingresa uno nuevo.",
      });
    }

    if (data.customerMode !== "anonymous" && (!data.customerName || data.customerName.length < 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Ingresá el nombre del cliente.",
      });
    }
  });

export const purchaseItemSchema = z.object({
  supplyId: z.string().uuid("Seleccioná un insumo."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
  unitCost: z.coerce.number().positive("El costo unitario debe ser mayor a cero."),
});

export const purchaseFormSchema = z.object({
  supplierId: z.string().uuid("Seleccioná un proveedor."),
  purchaseDate: z.string().min(1, "La fecha es obligatoria."),
  notes: optionalTrimmedString,
  items: z.array(purchaseItemSchema).min(1, "Agregá al menos un ítem."),
});

export const productionInputSchema = z.object({
  supplyId: z.string().uuid("Seleccioná un insumo."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
});

export const productionOutputSchema = z.object({
  productId: z.string().uuid("Seleccioná un producto."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
});

export const productionBatchFormSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid("Seleccioná un producto."),
  status: z.enum(["draft", "active", "completed", "cancelled"]),
  startedAt: z.string().min(1, "La fecha de inicio es obligatoria."),
  completedAt: optionalTrimmedString,
  expectedQty: optionalNonnegativeNumber,
  actualQty: optionalNonnegativeNumber,
  notes: optionalTrimmedString,
  inputs: z.array(productionInputSchema).default([]),
  outputs: z.array(productionOutputSchema).default([]),
}).superRefine((data, ctx) => {
  if (data.status !== "completed") {
    return;
  }

  if (!data.completedAt) {
    ctx.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Un lote completado requiere fecha de cierre.",
    });
  }

  if (data.inputs.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["inputs"],
      message: "No podés completar un lote sin insumos consumidos.",
    });
  }

  if (data.outputs.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["outputs"],
      message: "No podés completar un lote sin salidas registradas.",
    });
  }

  if (!data.outputs.some((output) => output.productId === data.productId)) {
    ctx.addIssue({
      code: "custom",
      path: ["outputs"],
      message: "La salida del lote debe incluir el producto objetivo.",
    });
  }
});

export const paymentStatusUpdateSchema = z
  .object({
    saleOrderId: z.string().uuid(),
    paymentStatus: z.enum(["pending", "partial", "paid"]),
    paymentMethod: optionalTrimmedString,
    paidAt: optionalTrimmedString,
    amount: optionalAmount,
  })
  .superRefine((data, ctx) => {
    validatePaymentFields(data, ctx);

    if (data.paymentStatus === "partial" && data.amount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Ingresá el monto del cobro parcial.",
      });
    }
  });

export const reversalSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "El motivo de la anulación es obligatorio."),
});
