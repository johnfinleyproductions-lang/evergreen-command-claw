"use client";

// app/login/page.tsx
//
// Login gate for the Framestation. Rebuilt on shadcn primitives so it
// matches the rest of the app. Behavior is unchanged — POST /api/auth/login,
// push to "/" on success, surface "Invalid password" on failure.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Lock, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        // Don't clear loading — let the navigation finish.
        return;
      }

      setError("Invalid password");
    } catch {
      setError("Network error — is the server reachable?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Terminal className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Evergreen Command
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to continue to your Framestation.
            </p>
          </div>
        </div>

        <Card className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-8"
                  autoFocus
                  autoComplete="current-password"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div
                id="login-error"
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || password.length === 0}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Authenticating…
                </>
              ) : (
                "Unlock"
              )}
            </Button>
          </form>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground font-mono">
          Evergreen · local-first runtime
        </p>
      </div>
    </main>
  );
}
