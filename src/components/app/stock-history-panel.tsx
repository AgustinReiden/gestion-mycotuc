import { ArrowDownCircle, ArrowUpCircle, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import type { InventoryMovementRecord } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

type StockHistoryPanelProps = {
  title: string;
  description: string;
  movements: InventoryMovementRecord[];
};

function getMovementTone(movementType: InventoryMovementRecord["movementType"]) {
  if (movementType === "purchase_in" || movementType === "production_in") {
    return "success";
  }

  if (movementType === "sale_out" || movementType === "production_out") {
    return "warning";
  }

  return "neutral";
}

function getMovementLabel(movementType: InventoryMovementRecord["movementType"]) {
  switch (movementType) {
    case "purchase_in":
      return "Compra";
    case "sale_out":
      return "Venta";
    case "production_in":
      return "Produccion +";
    case "production_out":
      return "Produccion -";
    default:
      return "Ajuste";
  }
}

export function StockHistoryPanel({ title, description, movements }: StockHistoryPanelProps) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dce7ef] text-[#235b72]">
          <PackageSearch className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-2xl font-semibold">{title}</h3>
          <p className="text-sm text-[var(--muted)]">{description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {movements.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
            Todavia no hay movimientos registrados.
          </div>
        ) : (
          movements.map((movement) => (
            <div key={movement.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4f1e8] text-[#617166]">
                    {movement.quantity >= 0 ? (
                      <ArrowUpCircle className="h-5 w-5" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold">{movement.entityName}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {formatDate(movement.movementDate, "dd MMM yyyy HH:mm")} / {movement.createdByName ?? "Sistema"}
                    </p>
                    {movement.notes ? (
                      <p className="mt-1 text-sm text-[var(--muted)]">{movement.notes}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 text-left md:items-end md:text-right">
                  <Badge tone={getMovementTone(movement.movementType)}>
                    {getMovementLabel(movement.movementType)}
                  </Badge>
                  <p className="text-lg font-semibold">
                    {movement.quantity > 0 ? "+" : ""}
                    {movement.quantity} {movement.entityUnit ?? ""}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
