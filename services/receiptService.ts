import { supabase } from '@/lib/supabase';
import { ReceiptJSON } from './geminiService';

// Run this SQL in your Supabase dashboard to create the receipts table:
//
// create table receipts (
//   id uuid default gen_random_uuid() primary key,
//   user_id uuid references auth.users(id) not null,
//   merchant_name text,
//   address text,
//   date_time text,
//   subtotal numeric,
//   tax numeric,
//   tip numeric,
//   total numeric,
//   items jsonb,
//   created_at timestamptz default now()
// );
//
// alter table receipts enable row level security;
// create policy "Users can insert their own receipts"
//   on receipts for insert with check (auth.uid() = user_id);
// create policy "Users can view their own receipts"
//   on receipts for select using (auth.uid() = user_id);

export async function saveReceipt(
  data: ReceiptJSON,
  userId: string
): Promise<{ id: string | null; error: string | null }> {
  const { data: inserted, error } = await supabase.from('receipts').insert({
    user_id: userId,
    merchant_name: data.merchantName,
    address: data.address,
    date_time: data.dateTime,
    subtotal: data.subtotal,
    tax: data.tax,
    tip: data.tip,
    total: data.total,
    items: data.items,
  }).select('id').single();
  if (error) console.error('[receiptService] Supabase error:', error);
  return { id: inserted?.id ?? null, error: error?.message ?? null };
}
