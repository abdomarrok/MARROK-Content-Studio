-- ==============================================================================
-- MARROK Content Studio — Neon PostgreSQL Authoritative Schema Verification
-- READ-ONLY verification script. Executes zero mutations.
-- Safe to run via psql or Neon Console.
-- Never prints credentials, session secrets, password hashes, or deck content.
-- ==============================================================================

\set ON_ERROR_STOP on

SELECT '=== 1. SERVER & CONNECTION INFO ===' AS section;
SELECT 
  current_database() AS database_name,
  current_user AS connected_user,
  version() AS postgres_version;

SELECT '=== 2. TABLE EXISTENCE & SCHEMA VERIFICATION ===' AS section;
SELECT 
  table_name,
  CASE WHEN table_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END AS status
FROM (
  VALUES 
    ('saved_posts'),
    ('deleted_post_tombstones'),
    ('inbox_triage_decisions'),
    ('publish_outbox'),
    ('auth_revoked_sessions'),
    ('auth_login_attempts')
) AS expected(table_name)
LEFT JOIN information_schema.tables 
  ON information_schema.tables.table_name = expected.table_name
  AND information_schema.tables.table_schema = 'public'
ORDER BY expected.table_name;

SELECT '=== 3. PRIMARY KEY CONSTRAINTS ===' AS section;
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'saved_posts',
    'deleted_post_tombstones',
    'inbox_triage_decisions',
    'publish_outbox',
    'auth_revoked_sessions',
    'auth_login_attempts'
  )
ORDER BY tc.table_name;

SELECT '=== 4. CRITICAL INDEXES ===' AS section;
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'saved_posts',
    'deleted_post_tombstones',
    'inbox_triage_decisions',
    'publish_outbox',
    'auth_revoked_sessions',
    'auth_login_attempts'
  )
ORDER BY tablename, indexname;

SELECT '=== 5. RECORD COUNTS & DATA INTEGRITY METRICS ===' AS section;
SELECT
  'saved_posts' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT id) AS distinct_ids,
  COUNT(*) - COUNT(DISTINCT id) AS duplicate_id_count,
  COUNT(*) FILTER (WHERE post_status = 'posted') AS posted_count,
  COUNT(*) FILTER (WHERE post_status = 'scheduled') AS scheduled_count,
  COUNT(*) FILTER (WHERE post_status = 'validated') AS validated_count,
  MAX(updated_at) AS latest_updated_at
FROM saved_posts;

SELECT
  'deleted_post_tombstones' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT id) AS distinct_ids,
  COUNT(*) - COUNT(DISTINCT id) AS duplicate_id_count,
  MAX(deleted_at) AS latest_deleted_at
FROM deleted_post_tombstones;

SELECT
  'inbox_triage_decisions' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT id) AS distinct_ids,
  COUNT(*) FILTER (WHERE action = 'draft') AS draft_action_count,
  COUNT(*) FILTER (WHERE action = 'skip') AS skip_action_count,
  COUNT(*) FILTER (WHERE action = 'snooze') AS snooze_action_count,
  MAX(created_at) AS latest_decision_at
FROM inbox_triage_decisions;

SELECT
  'publish_outbox' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT id) AS distinct_ids,
  COUNT(*) FILTER (WHERE state = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE state = 'dispatching') AS active_dispatching_count,
  COUNT(*) FILTER (WHERE state = 'completed') AS completed_count,
  COUNT(*) FILTER (WHERE state = 'dead_letter') AS dead_letter_count,
  COUNT(*) FILTER (WHERE state = 'outcome_unknown') AS quarantined_count,
  MAX(updated_at) AS latest_outbox_update
FROM publish_outbox;

SELECT
  'auth_revoked_sessions' AS table_name,
  COUNT(*) AS total_revoked_tokens,
  COUNT(*) FILTER (WHERE expires_at > NOW()) AS active_revocations,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expired_revocations_pending_sweep
FROM auth_revoked_sessions;

SELECT
  'auth_login_attempts' AS table_name,
  COUNT(*) AS total_tracked_entities,
  COUNT(*) FILTER (WHERE locked_until > NOW()) AS active_account_lockouts
FROM auth_login_attempts;

SELECT '=== 6. SANITY CHECKS (ZERO EXPECTED VIOLATIONS) ===' AS section;
-- Check 1: No active dispatching posts with duplicate active entries
SELECT 
  'active_dispatching_duplicates' AS check_name,
  COUNT(*) AS violation_count
FROM (
  SELECT post_id, COUNT(*) 
  FROM publish_outbox 
  WHERE state = 'dispatching' 
  GROUP BY post_id 
  HAVING COUNT(*) > 1
) sub;

-- Check 2: Tombstoned posts that still linger in saved_posts
SELECT
  'tombstoned_lingering_in_saved_posts' AS check_name,
  COUNT(*) AS lingering_count
FROM saved_posts sp
JOIN deleted_post_tombstones dt ON sp.id = dt.id;

-- Check 3: Saved posts missing essential JSONB deck
SELECT
  'posts_missing_deck_jsonb' AS check_name,
  COUNT(*) AS invalid_deck_count
FROM saved_posts
WHERE deck IS NULL;

SELECT '=== VERIFICATION COMPLETE ===' AS status;
