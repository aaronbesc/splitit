import { supabase } from '@/lib/supabase';

export type SessionStatus = 'lobby' | 'active' | 'finished';

export type Session = {
  id: string;
  receipt_id: string;
  host_id: string;
  join_code: string;
  status: SessionStatus;
  created_at: string;
};

export type SessionParticipant = {
  id: string;
  session_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
};

export type ItemClaim = {
  id: string;
  session_id: string;
  item_index: number;
  user_id: string;
  claimed_at: string;
};

export type ReceiptForSession = {
  items: { name: string; quantity: number | null; unitPrice: number | null; lineTotal: number | null }[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  merchant_name: string | null;
};

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omits O, 0, 1, I
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createSession(
  receiptId: string,
  hostId: string,
  hostName: string
): Promise<{ session: Session | null; error: string | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const joinCode = generateJoinCode();
    const { data: session, error } = await supabase
      .from('sessions')
      .insert({ receipt_id: receiptId, host_id: hostId, join_code: joinCode })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && attempt < 2) continue; // unique violation on join_code, retry
      return { session: null, error: error.message };
    }

    const { error: participantError } = await supabase
      .from('session_participants')
      .insert({ session_id: session.id, user_id: hostId, display_name: hostName });

    if (participantError) return { session: null, error: participantError.message };

    return { session: session as Session, error: null };
  }
  return { session: null, error: 'Failed to generate a unique join code.' };
}

export async function findSessionByCode(
  code: string
): Promise<{ session: Session | null; error: string | null }> {
  const { data, error } = await supabase
    .from('sessions')
    .select()
    .eq('join_code', code.toUpperCase())
    .neq('status', 'finished')
    .maybeSingle();

  if (error) return { session: null, error: error.message };
  if (!data) return { session: null, error: 'No active session found with that code.' };
  return { session: data as Session, error: null };
}

export async function getSession(
  sessionId: string
): Promise<{ session: Session | null; error: string | null }> {
  const { data, error } = await supabase
    .from('sessions')
    .select()
    .eq('id', sessionId)
    .single();

  if (error) return { session: null, error: error.message };
  return { session: data as Session, error: null };
}

export async function joinSession(
  sessionId: string,
  userId: string,
  displayName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('session_participants')
    .upsert({ session_id: sessionId, user_id: userId, display_name: displayName }, { onConflict: 'session_id,user_id' });

  return { error: error?.message ?? null };
}

export async function getParticipants(
  sessionId: string
): Promise<{ participants: SessionParticipant[]; error: string | null }> {
  const { data, error } = await supabase
    .from('session_participants')
    .select()
    .eq('session_id', sessionId)
    .order('joined_at');

  if (error) return { participants: [], error: error.message };
  return { participants: (data ?? []) as SessionParticipant[], error: null };
}

export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('sessions')
    .update({ status })
    .eq('id', sessionId);

  return { error: error?.message ?? null };
}

export async function getItemClaims(
  sessionId: string
): Promise<{ claims: ItemClaim[]; error: string | null }> {
  const { data, error } = await supabase
    .from('item_claims')
    .select()
    .eq('session_id', sessionId);

  if (error) return { claims: [], error: error.message };
  return { claims: (data ?? []) as ItemClaim[], error: null };
}

export async function claimItem(
  sessionId: string,
  itemIndex: number,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('item_claims')
    .upsert({ session_id: sessionId, item_index: itemIndex, user_id: userId }, { onConflict: 'session_id,item_index,user_id' });

  return { error: error?.message ?? null };
}

export async function unclaimItem(
  sessionId: string,
  itemIndex: number,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('item_claims')
    .delete()
    .eq('session_id', sessionId)
    .eq('item_index', itemIndex)
    .eq('user_id', userId);

  return { error: error?.message ?? null };
}

export async function getReceiptForSession(
  receiptId: string
): Promise<{ receipt: ReceiptForSession | null; error: string | null }> {
  const { data, error } = await supabase
    .from('receipts')
    .select('items, subtotal, tax, tip, total, merchant_name')
    .eq('id', receiptId)
    .single();

  if (error) return { receipt: null, error: error.message };
  return { receipt: data as ReceiptForSession, error: null };
}
