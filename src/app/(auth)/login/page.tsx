import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getLoginNotice(reason: string | string[] | undefined) {
  if (reason === "session-expired") {
    return "Tu sesión expiró. Volvé a iniciar sesión para seguir usando la app.";
  }

  if (reason === "profile-missing") {
    return "No pudimos recuperar tu perfil. Iniciá sesión de nuevo para reintentar.";
  }

  if (reason === "signed-out") {
    return "Cerraste sesión correctamente.";
  }

  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const notice = getLoginNotice((await searchParams).reason);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex rounded-full bg-[var(--moss-soft)] px-3 py-1 text-sm font-semibold text-[var(--moss)]">
              Mycotuc Gestión
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-[var(--foreground)]">
              Tu operación completa en un solo tablero.
            </h1>
            <p className="mt-4 text-lg leading-8 text-[var(--muted)]">
              Controlá ventas, gastos, producción, inventario y contactos desde una app pensada para
              el ritmo real de tu emprendimiento de hongos adaptógenos.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Ventas", "Pedidos multi-ítem y estados de cobro."],
              ["Producción", "Lotes simples con consumo y rendimiento."],
              ["Inventario", "Stock centralizado por movimientos auditables."],
            ].map(([title, copy]) => (
              <article key={title} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8 lg:p-10">
          <div className="mb-6">
            <p className="text-[13px] font-medium text-[var(--muted)]">Acceso</p>
            <h2 className="mt-1 text-3xl font-semibold">Iniciar sesión</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Usá una cuenta creada manualmente en Supabase Auth para entrar al panel interno.
            </p>
          </div>
          <LoginForm notice={notice} />
        </section>
      </div>
    </main>
  );
}
