export function TaskSkeleton() {
  return (
    <div className="min-h-[275px] animate-pulse rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-hidden="true">
      <div className="flex justify-between"><div className="h-6 w-28 rounded-full bg-[hsl(var(--muted))]" /><div className="h-4 w-20 rounded bg-[hsl(var(--muted))]" /></div>
      <div className="mt-6 h-6 w-4/5 rounded bg-[hsl(var(--muted))]" />
      <div className="mt-3 h-4 w-full rounded bg-[hsl(var(--muted))]" />
      <div className="mt-2 h-4 w-3/4 rounded bg-[hsl(var(--muted))]" />
      <div className="mt-6 flex gap-2"><div className="h-6 w-16 rounded bg-[hsl(var(--muted))]" /><div className="h-6 w-20 rounded bg-[hsl(var(--muted))]" /></div>
      <div className="mt-8 border-t border-[hsl(var(--border))] pt-4"><div className="h-7 w-32 rounded bg-[hsl(var(--muted))]" /><div className="mt-4 h-7 w-full rounded bg-[hsl(var(--muted))]" /></div>
    </div>
  );
}
