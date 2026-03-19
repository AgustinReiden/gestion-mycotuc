import { ReceiptText } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { PurchaseRecord } from "@/lib/domain";
import { formatCurrency, formatDate } from "@/lib/utils";

type PurchaseHistoryPanelProps = {
  purchases: PurchaseRecord[];
};

export function PurchaseHistoryPanel({ purchases }: PurchaseHistoryPanelProps) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7e7c6] text-[#8c5b17]">
          <ReceiptText className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-2xl font-semibold">Ultimas compras</h3>
          <p className="text-sm text-[var(--muted)]">Historial reciente de reposiciones cargadas en el sistema.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {purchases.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
            Todavia no hay compras registradas.
          </div>
        ) : (
          purchases.map((purchase) => (
            <div key={purchase.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">{purchase.supplierName ?? "Proveedor sin nombre"}</p>
                  <p className="text-sm text-[var(--muted)]">{formatDate(purchase.purchaseDate)}</p>
                  {purchase.notes ? <p className="mt-1 text-sm text-[var(--muted)]">{purchase.notes}</p> : null}
                </div>
                <p className="text-lg font-semibold text-[#15553e]">{formatCurrency(purchase.totalAmount)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
