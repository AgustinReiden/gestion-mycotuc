import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Panel className="flex max-w-md flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-[var(--amber-soft)] text-[var(--amber-ink)]">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold">Página no encontrada</h2>
        <p className="mt-3 text-[var(--muted)]">
          La ruta a la que intentás acceder no existe o fue movida.
        </p>
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </Panel>
    </div>
  );
}
