-- =============================================================================
-- Split It — RLS Policy Fix v2 (FORCE ROW SECURITY safe)
-- Run this entire script in Supabase Dashboard → SQL Editor
-- =============================================================================
-- Why the previous fix failed:
--   Supabase enables FORCE ROW SECURITY on tables, which means even a
--   SECURITY DEFINER function running as the postgres superuser is still
--   subject to RLS when it queries those tables. The function still triggered
--   the SELECT policy on session_participants, causing infinite recursion.
--
-- The only guaranteed fix:
--   Never query session_participants from within a session_participants policy.
--   Use only direct column checks or queries to OTHER tables (sessions).
--   The sessions SELECT policy must also never reference session_participants.
-- =============================================================================


-- ─── Step 1: Drop the broken helper function ─────────────────────────────────
DROP FUNCTION IF EXISTS public.is_session_participant(uuid) CASCADE;


-- ─── Step 2: Drop ALL existing policies (by name — catches everything) ───────
-- Uses dynamic SQL so we don't have to guess policy names.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('sessions', 'session_participants', 'item_claims', 'receipts')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped: % on %', r.policyname, r.tablename;
  END LOOP;
END $$;


-- ─── Step 3: sessions ────────────────────────────────────────────────────────

-- SELECT: any authenticated user can read any session.
--   Needed because:
--   (a) guests search by join code BEFORE they are participants
--   (b) Realtime must deliver status→'finished' updates to all participants
--   Sessions contain only join codes, statuses, and receipt IDs — not sensitive.
CREATE POLICY "sessions_select" ON sessions
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: host_id must match the caller
CREATE POLICY "sessions_insert" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (host_id = (SELECT auth.uid()));

-- UPDATE: only the host can change status
CREATE POLICY "sessions_update" ON sessions
  FOR UPDATE TO authenticated
  USING  (host_id = (SELECT auth.uid()))
  WITH CHECK (host_id = (SELECT auth.uid()));


-- ─── Step 4: session_participants ────────────────────────────────────────────

-- SELECT: any authenticated user can read participant lists.
--   Needed because:
--   (a) the lobby shows everyone who has joined — all participants must see this
--   (b) Realtime INSERT events must be delivered to all lobby members
--   (c) session_participants only stores display_name + user_id — not sensitive
--   Crucially: USING (true) means we NEVER query session_participants from
--   within this policy → zero recursion possible.
CREATE POLICY "session_participants_select" ON session_participants
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: you can only add yourself
CREATE POLICY "session_participants_insert" ON session_participants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- DELETE: you can only remove yourself
CREATE POLICY "session_participants_delete" ON session_participants
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ─── Step 5: item_claims ─────────────────────────────────────────────────────

-- SELECT: any authenticated user can read claims.
--   Needed because all participants must see each other's claims in real time.
--   Realtime DELETE events (unclaim) must also be delivered to all.
CREATE POLICY "item_claims_select" ON item_claims
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: you can only claim as yourself; session must be active
CREATE POLICY "item_claims_insert" ON item_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.sessions
      WHERE id = item_claims.session_id
        AND status = 'active'
    )
  );

-- DELETE: you can only remove your own claims
CREATE POLICY "item_claims_delete" ON item_claims
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ─── Step 6: receipts ────────────────────────────────────────────────────────
-- Guests need to read the receipt during the claim phase.
-- We check the sessions table (NOT session_participants) — no recursion.

CREATE POLICY "receipts_select" ON receipts
  FOR SELECT TO authenticated
  USING (
    -- Owner always reads their own receipts
    user_id = (SELECT auth.uid())
    -- Anyone can read a receipt that belongs to an active session
    OR EXISTS (
      SELECT 1 FROM public.sessions
      WHERE receipt_id = receipts.id
        AND status = 'active'
    )
  );

CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── Verify: run this SELECT after to confirm all policies look right ─────────
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('sessions', 'session_participants', 'item_claims', 'receipts')
ORDER BY tablename, cmd;
