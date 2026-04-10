export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          AI Configuration
        </h3>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <div className="space-y-1.5">
            <label className="text-sm text-text-muted">Embedding Provider</label>
            <select className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none">
              <option>Ollama (Local)</option>
              <option>OpenAI</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-text-muted">Embedding Model</label>
            <input
              type="text"
              defaultValue="nomic-embed-text"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-text-muted">Chat Model</label>
            <input
              type="text"
              defaultValue="qwen3.5:9b"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-text-muted">Ollama URL</label>
            <input
              type="text"
              defaultValue="http://192.168.4.240:11434"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Storage
        </h3>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">MinIO Endpoint</span>
            <span className="text-sm text-text font-mono">192.168.4.240:9000</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Bucket</span>
            <span className="text-sm text-text font-mono">evergreen-vault</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Database</span>
            <span className="text-sm text-text font-mono">PostgreSQL + pgvector</span>
          </div>
        </div>
      </section>
    </div>
  );
}
