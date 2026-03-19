"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Leaf, LogOut, Menu, X } from "lucide-react";
import { useState, useTransition } from "react";
import { signOutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { APP_NAVIGATION } from "@/lib/constants";
import type { ProfileSummary } from "@/lib/domain";
import { cn, formatMonthLabel } from "@/lib/utils";

type AppShellProps = {
  profile: ProfileSummary;
  children: React.ReactNode;
};

function getPageMeta(pathname: string) {
  return APP_NAVIGATION.find((item) => pathname === item.href)?.title ?? "Operacion Mycotuc";
}

export function AppShell({ profile, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const closeMobile = () => setMobileOpen(false);

  const handleSignOut = () => {
    startTransition(async () => {
      await signOutAction();
    });
  };

  return (
    <div className="min-h-screen bg-transparent text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1720px] gap-4 px-3 py-3 md:px-5">
        <aside
          className={cn(
            "fixed inset-y-3 left-3 z-50 flex w-[290px] flex-col rounded-[30px] border border-white/10 bg-gradient-to-b from-[#123925] via-[#0f2d1f] to-[#091b12] p-4 text-white shadow-[0_24px_60px_rgba(9,27,18,0.34)] transition md:static md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-[120%]",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f8d62] shadow-[0_10px_30px_rgba(30,118,76,0.35)]">
                <Leaf className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xl font-semibold">MYCOTUC</p>
                <p className="text-sm text-[#a9c7b5]">Sistema de gestion</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-full p-2 text-[#a9c7b5] transition hover:bg-white/10 md:hidden"
              onClick={closeMobile}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="mt-8 space-y-2">
            {APP_NAVIGATION.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active
                      ? "bg-[#2f8d62] text-white shadow-[0_16px_40px_rgba(30,118,76,0.35)]"
                      : "text-[#bfd5c7] hover:bg-white/8 hover:text-white",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[24px] border border-white/10 bg-white/8 p-4">
            <p className="text-sm text-[#bfd5c7]">Conectado como</p>
            <p className="mt-1 text-lg font-semibold">{profile.fullName ?? "Equipo Mycotuc"}</p>
            <p className="text-sm text-[#9fb7a9]">{profile.email ?? "Sin email"}</p>
            <Button
              type="button"
              variant="secondary"
              busy={pending}
              className="mt-4 w-full border-white/10 bg-white/10 text-white hover:bg-white/18"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </Button>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[#122116]/55 md:hidden"
            onClick={closeMobile}
          />
        ) : null}

        <div className="flex min-h-[calc(100vh-1.5rem)] w-full flex-1 flex-col md:pl-0">
          <header className="glass-panel shadow-soft sticky top-3 z-30 mb-4 flex items-center justify-between rounded-[30px] border border-white/70 px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-full p-2 text-[var(--foreground)] transition hover:bg-white/80 md:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold">{getPageMeta(pathname)}</h1>
                <p className="text-sm text-[var(--muted)] capitalize">{formatMonthLabel()}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm text-[var(--muted)] md:block">
                Operacion del mes en ARS
              </div>
              <button
                type="button"
                className="relative rounded-full border border-[var(--line)] bg-white/70 p-3 text-[var(--foreground)] transition hover:bg-white"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#d4634f]" />
              </button>
            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
