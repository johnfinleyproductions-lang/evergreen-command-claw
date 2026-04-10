export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface text-text">
      <div className="max-w-xl space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Evergreen Command
        </h1>
        <p className="text-sm text-text-muted">
          Local AI task runner. Phase 2: schema swap in progress. Task UI
          coming in Phase 4.
        </p>
        <p className="text-xs text-text-dim">
          Nemotron-3-Super-120B-A12B &middot; Framestation
        </p>
      </div>
    </main>
  );
}
