"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error caught by Global Error Boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Panel className="flex max-w-md flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold">Algo salió mal</h2>
        <p className="mt-3 text-[var(--muted)]">
          Ocurrió un error inesperado. Intentá de nuevo.
        </p>
        <Button size="lg" onClick={() => reset()} className="mt-6 w-full sm:w-auto">
          Intentar de nuevo
        </Button>
      </Panel>
    </div>
  );
}
