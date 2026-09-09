-- Payment-gating columns — the `paid` / `paypal_order_id` gate that every
-- later migration builds on.
--
-- RECOVERED, not new. This exact SQL already existed in the repository —
-- verbatim, as an inline block at the bottom of supabase/schema.sql under
-- "Historical migrations below" — but had never been given its own
-- versioned file. `schema_migrations` on the live project
-- (ravfwnqfxngphncuyyxo) records this as version 20260901114121, name
-- `payment_gating`, applied before auth_ownership and payment_integrity.
-- This file gives that already-applied change a real, versioned home
-- instead of leaving it as unversioned prose. No application change: the
-- columns already exist live with exactly this shape (verified via
-- information_schema — `paid boolean not null default false`,
-- `paypal_order_id text`, nullable, no default).
--
-- Confidence: HIGH — sourced directly from schema.sql's own historical
-- block, cross-checked against live column definitions.

alter table invites add column if not exists paid boolean not null default false;
alter table invites add column if not exists paypal_order_id text;
