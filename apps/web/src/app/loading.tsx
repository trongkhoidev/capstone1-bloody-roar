export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-1/3 animate-pulse rounded-lg bg-[hsl(var(--card))]" aria-hidden="true" />
      <div className="mt-6 h-64 animate-pulse rounded-xl bg-[hsl(var(--card))]" aria-hidden="true" />
    </main>
  );
}
