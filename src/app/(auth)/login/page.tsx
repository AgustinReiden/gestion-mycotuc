import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,138,96,0.24),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(216,155,57,0.16),transparent_24%)]" />
      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="glass-panel shadow-soft hidden rounded-[34px] border border-white/70 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="max-w-xl">
            <p className="inline-flex rounded-full bg-[#dce8db] px-3 py-1 text-sm font-semibold text-[#15553e]">
              Mycotuc Gestion
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-tight text-[var(--foreground)]">
              Tu operacion completa en un solo tablero.
            </h1>
            <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
              Controla ventas, gastos, produccion, inventario y contactos desde una app pensada para
              el ritmo real de tu emprendimiento de hongos adaptogenos.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Ventas", "Pedidos multi-item y estados de cobro."],
              ["Produccion", "Lotes simples con consumo y rendimiento."],
              ["Inventario", "Stock centralizado por movimientos auditables."],
            ].map(([title, copy]) => (
              <article key={title} className="rounded-[26px] border border-white/70 bg-white/80 p-5">
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-panel shadow-soft rounded-[34px] border border-white/70 p-6 sm:p-8 lg:p-10">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#55755e]">Acceso</p>
            <h2 className="mt-3 text-4xl font-semibold">Iniciar sesion</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Usa una cuenta creada manualmente en Supabase Auth para entrar al panel interno.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
