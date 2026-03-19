import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Panel className="flex max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fcf0d9] text-[#b77f28] mb-6">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-semibold">Página no encontrada</h2>
        <p className="mt-3 text-[var(--muted)]">
          La ruta a la que intentas acceder no existe o fue movida.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </Panel>
    </div>
  );
}
