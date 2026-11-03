"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { signOutAction } from "@/actions/auth";
import { ActionNotice } from "@/components/forms/action-notice";
import { APP_NAVIGATION, MOBILE_TABS, QUICK_CREATE } from "@/lib/constants";
import type { ProfileSummary } from "@/lib/domain";
import { cn, formatMonthLabel } from "@/lib/utils";

type AppShellProps = {
  profile: ProfileSummary;
  children: React.ReactNode;
};

type SheetKind = "create" | "more" | null;

function getPageTitle(pathname: string) {
  return APP_NAVIGATION.find((item) => pathname === item.href)?.title ?? "Mycotuc";
}

function initials(name: string | null, email: string | null) {
  const source = (name ?? email ?? "M").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "M").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight", className)}>
      mycotuc<span className="text-[var(--amber)]">.</span>
    </span>
  );
}

function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] md:hidden">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-[rgba(30,25,21,0.45)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[22px] bg-[var(--surface)] px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--line-strong)]" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AppShell({ profile, children }: AppShellProps) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [signOutFeedback, setSignOutFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const roleLabel = profile.role === "admin" ? "Administrador" : "Operador";
  const tabs = APP_NAVIGATION.filter((item) => (MOBILE_TABS as readonly string[]).includes(item.href));
  const moreItems = APP_NAVIGATION.filter((item) => !(MOBILE_TABS as readonly string[]).includes(item.href));
  const moreActive = moreItems.some((item) => item.href === pathname);
  const closeSheet = () => setSheet(null);

  const handleSignOut = () => {
    setSignOutFeedback(null);
    startTransition(async () => {
      const result = await signOutAction();

      if (!result?.success) {
        setSignOutFeedback(result?.error ?? result?.message ?? "No se pudo cerrar la sesión.");
      }
    });
  };

  const userCard = (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-sm font-bold text-white">
        {initials(profile.fullName, profile.email)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{profile.fullName ?? profile.email ?? "Equipo Mycotuc"}</p>
        <p className="truncate text-[13px] text-[var(--muted)]">{roleLabel}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh text-[var(--foreground)] md:flex">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-3 py-5 md:flex">
        <Link href="/dashboard" className="px-3">
          <Wordmark />
        </Link>
        <nav className="mt-6 grid gap-0.5" aria-label="Secciones">
          {APP_NAVIGATION.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium transition-colors",
                  active
                    ? "bg-[var(--foreground)] text-white"
                    : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-3 border-t border-[var(--line)] px-2 pt-4">
          {userCard}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={pending}
            className="flex min-h-10 items-center gap-2 rounded-[10px] px-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {pending ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3 px-4 md:h-16 md:px-8">
            <div className="flex min-w-0 items-baseline gap-3">
              <Link href="/dashboard" className="md:hidden" aria-label="Inicio">
                <Wordmark className="text-lg" />
              </Link>
              <h1 className="hidden truncate text-2xl font-semibold md:block">{getPageTitle(pathname)}</h1>
            </div>
            <p className="text-sm capitalize text-[var(--muted)]">{formatMonthLabel()}</p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-4 pb-[calc(var(--bar-height)+2rem+env(safe-area-inset-bottom,0px))] md:px-8 md:pt-6 md:pb-10">
          <h1 className="mb-3 text-[22px] font-semibold md:hidden">{getPageTitle(pathname)}</h1>
          {signOutFeedback ? (
            <div className="mb-4">
              <ActionNotice tone="error" message={signOutFeedback} />
            </div>
          ) : null}
          {children}
        </main>
      </div>

      {/* Celular: barra inferior con el botón Cargar al centro */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
      >
        <div className="mx-auto grid h-[var(--bar-height)] max-w-lg grid-cols-5 items-stretch px-1">
          {tabs.slice(0, 2).map((item) => (
            <TabLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname === item.href} />
          ))}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setSheet("create")}
              aria-haspopup="dialog"
              className="flex h-12 w-full max-w-[76px] flex-col items-center justify-center gap-0.5 rounded-[14px] bg-[var(--foreground)] text-white active:scale-95"
            >
              <Plus className="h-5 w-5" strokeWidth={2.6} />
              <span className="text-[11px] font-semibold leading-none">Cargar</span>
            </button>
          </div>
          {tabs.slice(2).map((item) => (
            <TabLink key={item.href} href={item.href} label={item.label === "Productos" ? "Stock" : item.label} icon={item.icon} active={pathname === item.href} />
          ))}
          <button
            type="button"
            onClick={() => setSheet("more")}
            aria-haspopup="dialog"
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold",
              moreActive ? "text-[var(--foreground)]" : "text-[var(--muted)]",
            )}
          >
            <Menu className="h-[22px] w-[22px]" strokeWidth={moreActive ? 2.4 : 2} />
            Más
          </button>
        </div>
      </nav>

      <BottomSheet open={sheet === "create"} title="¿Qué querés cargar?" onClose={closeSheet}>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_CREATE.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.key}
                href={`${entry.href}?nuevo=${entry.key}`}
                scroll={false}
                onClick={closeSheet}
                className={cn(
                  "flex min-h-[88px] flex-col justify-between gap-2 rounded-[14px] border p-3 active:scale-[0.98]",
                  index === 0
                    ? "col-span-2 min-h-[72px] flex-row items-center border-transparent bg-[var(--amber)] text-[var(--foreground)]"
                    : "border-[var(--line)] bg-[var(--surface-2)]",
                )}
              >
                <Icon className={cn("h-6 w-6", index === 0 && "order-last h-7 w-7")} />
                <span>
                  <span className={cn("block font-semibold", index === 0 ? "text-lg" : "text-[15px]")}>{entry.label}</span>
                  <span className={cn("block text-[13px] leading-snug", index === 0 ? "text-[#4a2c05]" : "text-[var(--muted)]")}>
                    {entry.detail}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "more"} title="Más secciones" onClose={closeSheet}>
        <nav className="grid gap-1" aria-label="Más secciones">
          {moreItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSheet}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-base font-medium",
                  active ? "bg-[var(--foreground)] text-white" : "hover:bg-[var(--surface-2)]",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4">
          {userCard}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={pending}
            className="flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-[var(--line-strong)] text-[15px] font-semibold disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {pending ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (typeof APP_NAVIGATION)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold",
        active ? "text-[var(--foreground)]" : "text-[var(--muted)]",
      )}
    >
      {active ? <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-[var(--amber)]" aria-hidden /> : null}
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
  );
}
