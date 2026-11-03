"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { QuickCreateKey } from "@/lib/constants";

const noopSubscribe = () => () => {};

/**
 * Estado de apertura de un formulario "nuevo" que también se abre desde el botón Cargar,
 * que navega a la pantalla con `?nuevo=<key>`. Al cerrar se limpia el parámetro.
 */
export function useQuickCreate(key: QuickCreateKey) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [localOpen, setLocalOpen] = useState(false);
  // Solo después de hidratar: el servidor renderiza el formulario cerrado.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const requested = hydrated && params.get("nuevo") === key;
  const open = localOpen || requested;

  const setOpen = useCallback(
    (next: boolean) => {
      setLocalOpen(next);

      if (!next && requested) {
        router.replace(pathname, { scroll: false });
      }
    },
    [pathname, requested, router],
  );

  return [open, setOpen] as const;
}
