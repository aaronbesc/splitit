-- =============================================================================
-- Split It — Complete RLS Policy Fix
-- Run this entire script in Supabase Dashboard → SQL Editor
-- =============================================================================
-- Root cause: session_participants SELECT policies that query session_participants
-- themselves cause infinite recursion. Fix: use a SECURITY DEFINER helper
-- function that bypasses RLS for the participant check.
-- =============================================================================


-- ─── Step 1: Helper function (bypasses RLS — no recursion) ───────────────────
-- Called inside RLS policies to check if the current user is a participant
-- in a given session. SECURITY DEFINER runs as the function owner, skipping
-- the RLS check that would otherwise recurse.

CREATE OR REPLACE FUNCTION public.is_session_participant(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_participants
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
  );
$$;


-- ─── Step 2: sessions ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sessions_insert"                       ON sessions;
DROP POLICY IF EXISTS "sessions_select"                       ON sessions;
DROP POLICY IF EXISTS "sessions_update"                       ON sessions;
-- Drop any legacy names that may exist:
DROP POLICY IF EXISTS "Users can create sessions"             ON sessions;
DROP POLICY IF EXISTS "Users can view sessions"               ON sessions;
DROP POLICY IF EXISTS "Host can update session status"        ON sessions;
DROP POLICY IF EXISTS "Enable read access for all users"      ON sessions;

-- Any authenticated user can create a session (host_id must be themselves)
CREATE POLICY "sessions_insert" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

-- Three groups can read a session:
--   1. The host (always)
--   2. Existing participants
--   3. Any authenticated user looking up a non-finished session to join
--      (they already need the 6-char code — this doesn't leak private data)
CREATE POLICY "sessions_select" ON sessions
  FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR public.is_session_participant(id)
    OR status IN ('lobby', 'active')
  );

-- Only the host can change session status
CREATE POLICY "sessions_update" ON sessions
  FOR UPDATE TO authenticated
  USING  (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());


-- ─── Step 3: session_participants ────────────────────────────────────────────

DROP POLICY IF EXISTS "session_participants_select"                    ON session_participants;
DROP POLICY IF EXISTS "session_participants_insert"                    ON session_participants;
DROP POLICY IF EXISTS "session_participants_delete"                    ON session_participants;
-- Drop any legacy names:
DROP POLICY IF EXISTS "Users can join sessions"                        ON session_participants;
DROP POLICY IF EXISTS "Users can view session participants"            ON session_participants;
DROP POLICY IF EXISTS "Participants can view other participants"       ON session_participants;
DROP POLICY IF EXISTS "Enable read access for all users"               ON session_participants;
DROP POLICY IF EXISTS "Enable insert for authenticated users only"     ON session_participants;

-- Read: only participants of a session can see who else is in it.
-- Uses is_session_participant (SECURITY DEFINER) → no recursion.
CREATE POLICY "session_participants_select" ON session_participants
  FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id));

-- Insert: authenticated users can add themselves (join).
-- Also covers the host being inserted during createSession.
CREATE POLICY "session_participants_insert" ON session_participants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Delete: users can remove themselves (leave / cleanup).
CREATE POLICY "session_participants_delete" ON session_participants
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ─── Step 4: item_claims ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "item_claims_select"                             ON item_claims;
DROP POLICY IF EXISTS "item_claims_insert"                             ON item_claims;
DROP POLICY IF EXISTS "item_claims_delete"                             ON item_claims;
-- Drop any legacy names:
DROP POLICY IF EXISTS "Users can claim items"                          ON item_claims;
DROP POLICY IF EXISTS "Users can view claims"                          ON item_claims;
DROP POLICY IF EXISTS "Users can unclaim items"                        ON item_claims;
DROP POLICY IF EXISTS "Enable read access for all users"               ON item_claims;

-- Participants can see all claims in their session
CREATE POLICY "item_claims_select" ON item_claims
  FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id));

-- Participants can claim items in sessions they're in (must be themselves)
CREATE POLICY "item_claims_insert" ON item_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_session_participant(session_id)
  );

-- Users can only delete their own claims
CREATE POLICY "item_claims_delete" ON item_claims
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ─── Step 5: receipts ────────────────────────────────────────────────────────
-- Guests need to read the receipt during the claim phase.
-- The original policy only allowed the owner — add a second SELECT policy
-- for session participants.

DROP POLICY IF EXISTS "receipts_select_participants"                   ON receipts;
-- Keep existing owner policies in place; just add the participant policy:

CREATE POLICY "receipts_select_participants" ON receipts
  FOR SELECT TO authenticated
  USING (
    -- Original: owner can always read their receipt
    user_id = auth.uid()
    -- New: anyone who is a participant in a session that uses this receipt
    OR EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.receipt_id = receipts.id
        AND public.is_session_participant(s.id)
    )
  );

-- Note: if you already have a "Users can view their own receipts" policy that
-- only checks (auth.uid() = user_id), you can either drop it and rely solely
-- on this new combined policy, or leave both — Supabase uses OR between policies.


-- ─── Verification ─────────────────────────────────────────────────────────────
-- After running, confirm with:
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('sessions','session_participants','item_claims','receipts')
--   ORDER BY tablename, policyname;
