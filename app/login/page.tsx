"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      setError("Invalid password");
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Leaf className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-xl font-semibold">Evergreen Vault</h1>
          <p className="text-sm text-text-muted">
            Enter your password to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-text-dim outline-none focus:border-accent/50"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-black hover:bg-accent-dim transition-colors disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Unlock Vault"}
          </button>
        </form>
      </div>
    </div>
  );
}
