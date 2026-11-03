import { ReceiptText, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { PurchaseRecord } from "@/lib/domain";
import { formatCurrency, formatDate } from "@/lib/utils";

type PurchaseHistoryPanelProps = {
  purchases: PurchaseRecord[];
  onReversePurchase?: (purchase: PurchaseRecord) => void;
};

export function PurchaseHistoryPanel({ purchases, onReversePurchase }: PurchaseHistoryPanelProps) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--amber-soft)] text-[var(--amber-ink)]">
          <ReceiptText className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Últimas compras</h3>
          <p className="text-sm text-[var(--muted)]">Reposiciones cargadas recientemente.</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {purchases.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)]">
            Todavía no hay compras registradas.
          </div>
        ) : (
          purchases.map((purchase) => (
            <div key={purchase.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{purchase.supplierName ?? "Proveedor sin nombre"}</p>
                    {purchase.isVoided ? <Badge tone="danger">Anulada</Badge> : null}
                  </div>
                  <p className="text-sm text-[var(--muted)]">{formatDate(purchase.purchaseDate)}</p>
                  {purchase.notes ? <p className="mt-1 text-sm text-[var(--muted)]">{purchase.notes}</p> : null}
                </div>
                <div className="flex flex-row items-center justify-between gap-2 md:flex-col md:items-end">
                  <p className="text-lg font-semibold text-[var(--moss)]">
                    {formatCurrency(purchase.totalAmount)}
                  </p>
                  {onReversePurchase ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-[var(--danger)]"
                      disabled={purchase.isVoided}
                      onClick={() => onReversePurchase(purchase)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Anular
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
