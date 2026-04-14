-- Phase 5.4.2 — business profiles.
--
-- A profile is a reusable block of context (think CLAUDE.md) that can be
-- attached to every run automatically. Dropping a file into /profiles in the
-- UI creates a row here; flipping one to active causes POST /api/runs to
-- prepend its `content` to the user prompt under a ## Context header.
--
-- Invariant: at most one active profile at any time. Enforced with a
-- partial unique index rather than a CHECK + trigger so activation is a
-- simple two-statement transaction (deactivate all, activate target).

CREATE TABLE IF NOT EXISTS "profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "content" text NOT NULL DEFAULT '',
    "is_active" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- At most one active profile, enforced by a partial unique index on a
-- constant expression filtered to active rows only.
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_single_active_idx"
    ON "profiles" ((1))
    WHERE "is_active" = true;

-- Casual lookup by name doesn't need an index (expected cardinality: <50)
-- but a case-insensitive unique would be user-hostile here since people
-- might want "Acme (old)" and "Acme" side-by-side. Deliberately skipped.
