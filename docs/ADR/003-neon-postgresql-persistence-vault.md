# ADR 003: Neon Serverless PostgreSQL Persistence Vault

## Status
Accepted

## Date
2026-11-09

## Context
MARROK Content Studio creates bilingual carousels, 1-slide infographic posters, and motion reels. Previously, posts were persisted using local JSON files (`data/saved-posts.json`), browser IndexedDB, and ephemeral `/tmp` storage on Vercel Serverless Functions.

This architecture presented three major limitations in production:
1. **Serverless Ephemeral Storage Resets**: On platforms like Vercel, serverless container restarts clear `/tmp`, triggering re-seeding and reconciliation loops that produced duplicate starter draft copies (e.g., 20+ copies of the starter draft).
2. **Lack of Cross-Device Synchronization**: Posts created on a desktop computer were siloed to that local browser/disk and were not visible on mobile devices or other team members' browsers.
3. **Publishing Status Desynchronization**: Buffer/Zernio post IDs, scheduled times, and Cloudinary staging URLs could desynchronize if browser sessions closed mid-dispatch.

## Decision
We adopted **Neon Serverless PostgreSQL** via connection pooler (`DATABASE_URL`) as the primary persistent data store for the MARROK Content Vault:
1. **Storage Schema & JSONB**: Searchable metadata (`id`, `title`, `category`, `post_status`, `title_signature`, `creator_handle`, `slide_count`, `qa_passed`, `scheduled_for`, `publish_targets`, `hosted_slide_urls`, `cloudinary_public_ids`, `buffer_post_ids`, `zernio_post_ids`) are stored in indexed relational columns, while the complete slide deck is stored in a `JSONB` column. This preserves 100% of rich slide typography, diagrams, archetypes, and layout overrides without rigid schema migration friction.
2. **Atomic Upsert (`ON CONFLICT (id) DO UPDATE`)**: Guarantees database-level idempotency and prevents duplicate drafts from ever multiplying across instances.
3. **Hands-Off Automatic Table & Seed Migration**: On server boot, `initPostgresSchema` creates the table and indexes if they do not exist. If the table is empty (`count === 0`), it automatically imports existing seed posts from `data/saved-posts.json` and `bundledSavedPosts.ts`.
4. **Three-Tier Non-Breaking Fallback**:
   - Tier 1: Neon Serverless PostgreSQL (`neon-postgres`)
   - Tier 2: Vercel KV / Upstash Redis (`cloud-kv`)
   - Tier 3: Local Disk / Vercel `/tmp` (`local-disk` / `vercel-tmp`) + Browser IndexedDB Vault
   If network connectivity drops or the database URL is unconfigured, the app falls back seamlessly without 5xx errors or UI interruption.

## Consequences

### Positive
- True real-time cross-device synchronization between desktop, mobile, and serverless environments.
- Duplicate starter drafts bug completely eliminated at the database level.
- Published and scheduled post metadata (Buffer IDs, Zernio IDs, Cloudinary asset IDs) is durably tracked.
- Zero downtime when offline thanks to the automatic fallback cascade.
- Zero manual migration scripts required for new deployments.

### Negative / Trade-Offs
- Requires a PostgreSQL connection string (`DATABASE_URL`) for cloud persistence.
- Adds `pg` and `@types/pg` runtime dependencies.
