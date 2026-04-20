import { supabase } from '@/lib/supabase';

export type DebtStatus = 'pending' | 'resolved';

export type Debt = {
  id: string;
  session_id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  status: DebtStatus;
  debtor_name: string;
  creditor_name: string;
  creditor_venmo: string | null;
  merchant_name: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type NewDebt = Omit<Debt, 'id' | 'status' | 'created_at' | 'resolved_at'>;

export async function insertDebts(
  rows: NewDebt[]
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase
    .from('debts')
    .upsert(rows, { onConflict: 'session_id,debtor_id', ignoreDuplicates: true });
  return { error: error?.message ?? null };
}

export async function getDebtsIOwe(
  userId: string,
  status: DebtStatus = 'pending'
): Promise<{ debts: Debt[]; error: string | null }> {
  const { data, error } = await supabase
    .from('debts')
    .select()
    .eq('debtor_id', userId)
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) return { debts: [], error: error.message };
  return { debts: (data ?? []) as Debt[], error: null };
}

export async function getDebtsOwedToMe(
  userId: string,
  status: DebtStatus = 'pending'
): Promise<{ debts: Debt[]; error: string | null }> {
  const { data, error } = await supabase
    .from('debts')
    .select()
    .eq('creditor_id', userId)
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) return { debts: [], error: error.message };
  return { debts: (data ?? []) as Debt[], error: null };
}

export async function resolveDebt(
  debtId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('debts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', debtId);
  return { error: error?.message ?? null };
}
