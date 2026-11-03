function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 ${className ?? ""}`}>
      <div className="space-y-3">
        <div className="skeleton-block h-4 w-28" />
        <div className="skeleton-block h-8 w-40" />
        <div className="skeleton-block h-4 w-full" />
      </div>
    </div>
  );
}

export default function AppLoading() {
  return (
    <div className="page-grid" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando datos de la pantalla.</span>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonPanel key={index} />
        ))}
      </div>
      <SkeletonPanel className="h-64" />
    </div>
  );
}
