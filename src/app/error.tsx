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
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#faebe8] text-[#a54b3d] mb-6">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-semibold">Algo salió mal</h2>
        <p className="mt-3 text-[var(--muted)]">
          Ocurrió un error inesperado. Por favor, intenta de nuevo.
        </p>
        <Button
          onClick={() => reset()}
          className="mt-8"
        >
          Intentar de nuevo
        </Button>
      </Panel>
    </div>
  );
}
