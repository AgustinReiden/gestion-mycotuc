function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={`glass-panel shadow-soft rounded-[28px] border border-white/70 p-5 ${className ?? ""}`}>
      <div className="space-y-4">
        <div className="skeleton-block h-4 w-28" />
        <div className="skeleton-block h-10 w-44" />
        <div className="skeleton-block h-4 w-full" />
        <div className="skeleton-block h-4 w-5/6" />
      </div>
    </div>
  );
}

export default function AppLoading() {
  return (
    <div className="page-grid" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando datos de la pantalla.</span>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonPanel key={index} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    </div>
  );
}
