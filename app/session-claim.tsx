import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import {
  ItemClaim,
  ReceiptForSession,
  Session,
  SessionParticipant,
  getItemClaims,
  getParticipants,
  getReceiptForSession,
  getSession,
  setClaimUnits,
  setSessionPayer,
  updateSessionStatus,
} from '@/services/sessionService';
import { insertDebts, NewDebt } from '@/services/debtsService';
import { computeUserTotal } from '@/services/splitCalc';
import { BG, F, GLASS, GREEN, T } from '@/constants/design';

function fmtUnits(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
  return n.toFixed(1);
}

export default function SessionClaimScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [receipt, setReceipt] = useState<ReceiptForSession | null>(null);
  const [claims, setClaims] = useState<ItemClaim[]>([]);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [loading, setLoading] = useState(true);

  const claimsRef = useRef<ItemClaim[]>([]);
  const participantsRef = useRef<SessionParticipant[]>([]);
  const receiptRef = useRef<ReceiptForSession | null>(null);
  claimsRef.current = claims;
  participantsRef.current = participants;
  receiptRef.current = receipt;

  useEffect(() => {
    if (!sessionId || !user) return;

    async function init() {
      const sessionRes = await getSession(sessionId);
      if (!sessionRes.session) { setLoading(false); return; }
      setSession(sessionRes.session);

      const [receiptRes, claimsRes, participantsRes] = await Promise.all([
        getReceiptForSession(sessionRes.session.receipt_id),
        getItemClaims(sessionId),
        getParticipants(sessionId),
      ]);

      if (receiptRes.receipt) setReceipt(receiptRes.receipt);
      setClaims(claimsRes.claims);
      setParticipants(participantsRes.participants);
      setLoading(false);
    }

    init();

    const claimsChannel = supabase
      .channel(`session-claims-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'item_claims', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setClaims((prev) => {
            if (payload.eventType === 'DELETE') {
              const d = payload.old as ItemClaim;
              return prev.filter(
                (x) => !(x.item_index === d.item_index && x.user_id === d.user_id)
              );
            }
            const c = payload.new as ItemClaim;
            const without = prev.filter(
              (x) => !(x.item_index === c.item_index && x.user_id === c.user_id)
            );
            return [...without, c];
          });
        }
      ).subscribe();

    const sessionChannel = supabase
      .channel(`session-claim-status-${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const updated = payload.new as Session;
          setSession(updated);
          if (updated.status === 'finished') {
            router.replace({
              pathname: '/session-summary',
              params: {
                payload: JSON.stringify({
                  sessionId,
                  myUserId: user!.id,
                  participants: participantsRef.current,
                  receipt: receiptRef.current,
                  claims: claimsRef.current,
                  paidByUserId: updated.paid_by_user_id,
                }),
              },
            });
          }
        }
      ).subscribe();

    return () => {
      supabase.removeChannel(claimsChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, user]);

  function getItemQty(index: number): number {
    const raw = receipt?.items?.[index]?.quantity;
    if (raw == null || raw <= 0) return 1;
    return raw;
  }

  function getMyUnits(index: number): number {
    const mine = claims.find((c) => c.item_index === index && c.user_id === user?.id);
    return mine?.units ?? 0;
  }

  function getTotalClaimedUnits(index: number): number {
    return claims
      .filter((c) => c.item_index === index)
      .reduce((s, c) => s + (c.units ?? 1), 0);
  }

  async function applyUnits(itemIndex: number, newUnits: number) {
    if (!user || !sessionId) return;
    const qty = getItemQty(itemIndex);
    const othersUnits = getTotalClaimedUnits(itemIndex) - getMyUnits(itemIndex);
    const maxMine = Math.max(0, qty - othersUnits);
    const clamped = Math.max(0, Math.min(newUnits, maxMine));
    const rounded = Math.round(clamped * 2) / 2; // snap to 0.5

    const prevClaims = claimsRef.current;

    // Optimistic: key by (item_index, user_id), not by id
    setClaims((prev) => {
      const without = prev.filter(
        (c) => !(c.item_index === itemIndex && c.user_id === user.id)
      );
      if (rounded <= 0) return without;
      return [
        ...without,
        {
          id: `optimistic-${itemIndex}-${user.id}`,
          session_id: sessionId,
          item_index: itemIndex,
          user_id: user.id,
          units: rounded,
          claimed_at: new Date().toISOString(),
        },
      ];
    });

    const { error } = await setClaimUnits(sessionId, itemIndex, user.id, rounded);
    if (error) {
      setClaims(prevClaims); // revert on failure
      Alert.alert('Could not update', error);
    }
  }

  function openKeypad(index: number) {
    setDraft(getMyUnits(index));
    setEditingIndex(index);
  }

  function closeKeypad() {
    setEditingIndex(null);
  }

  async function saveKeypad() {
    if (editingIndex === null) return;
    const idx = editingIndex;
    const value = draft;
    setEditingIndex(null);
    await applyUnits(idx, value);
  }

  async function handleFinish() {
    if (!sessionId || !receipt) return;
    if (!session?.paid_by_user_id) {
      Alert.alert('Pick who paid', 'Select who paid the bill before finishing.');
      return;
    }
    setIsFinishing(true);

    // Build debt rows: one per non-payer with a non-zero total
    const payer = participants.find((p) => p.user_id === session.paid_by_user_id);
    if (!payer) {
      setIsFinishing(false);
      Alert.alert('Error', 'Could not find the payer in participants.');
      return;
    }

    const debts: NewDebt[] = participants
      .filter((p) => p.user_id !== payer.user_id)
      .map((p) => {
        const total = computeUserTotal(p.user_id, participants, receipt, claims);
        return {
          session_id: sessionId,
          debtor_id: p.user_id,
          creditor_id: payer.user_id,
          amount: Math.round(total * 100) / 100,
          debtor_name: p.display_name,
          creditor_name: payer.display_name,
          creditor_venmo: payer.venmo_username,
          merchant_name: receipt.merchant_name,
        };
      })
      .filter((d) => d.amount > 0);

    const { error: debtsError } = await insertDebts(debts);
    if (debtsError) {
      setIsFinishing(false);
      Alert.alert('Could not record debts', debtsError);
      return;
    }

    const { error } = await updateSessionStatus(sessionId, 'finished');
    if (error) {
      Alert.alert('Error', error);
      setIsFinishing(false);
    }
  }

  async function handleSelectPayer(payerId: string) {
    if (!sessionId || !session) return;
    const next = session.paid_by_user_id === payerId ? null : payerId;
    // Optimistic
    setSession({ ...session, paid_by_user_id: next });
    const { error } = await setSessionPayer(sessionId, next);
    if (error) {
      setSession(session);
      Alert.alert('Could not update', error);
    }
  }

  function getClaimSummary(itemIndex: number) {
    return claims
      .filter((c) => c.item_index === itemIndex && (c.units ?? 0) > 0)
      .map((c) => {
        const isMe = c.user_id === user?.id;
        const name = isMe
          ? 'You'
          : participants.find((p) => p.user_id === c.user_id)?.display_name ?? 'Someone';
        return { name, units: c.units ?? 0, isMe };
      })
      .sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const isHost = session?.host_id === user?.id;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {receipt?.merchant_name ?? 'Claim Your Items'}
        </Text>
        <Text style={styles.headerSub}>Tap an item to claim your portion</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {(receipt?.items ?? []).map((item, index) => {
          const qty = getItemQty(index);
          const myUnits = getMyUnits(index);
          const totalClaimed = getTotalClaimedUnits(index);
          const remaining = Math.max(0, qty - totalClaimed);
          const lineTotal = item.lineTotal ?? 0;
          const perUnit = qty > 0 ? lineTotal / qty : lineTotal;
          const myCost = myUnits * perUnit;
          const isMine = myUnits > 0;
          const summary = getClaimSummary(index);

          return (
            <TouchableOpacity
              key={index}
              style={[styles.itemCard, isMine && styles.itemCardClaimed]}
              onPress={() => openKeypad(index)}
              activeOpacity={0.85}
            >
              <View style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, isMine && styles.itemNameClaimed]}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    ×{fmtUnits(qty)} · ${perUnit.toFixed(2)} ea
                  </Text>
                </View>
                <View style={styles.itemPriceCol}>
                  <Text style={[styles.itemLineTotal, isMine && styles.itemLineTotalClaimed]}>
                    ${lineTotal.toFixed(2)}
                  </Text>
                  {isMine && (
                    <Text style={styles.itemMyCost}>you: ${myCost.toFixed(2)}</Text>
                  )}
                </View>
              </View>

              {(summary.length > 0 || remaining > 0) && (
                <View style={styles.chipsRow}>
                  {summary.map((s, i) => (
                    <View key={i} style={[styles.chip, s.isMe && styles.chipMine]}>
                      <Text style={[styles.chipText, s.isMe && styles.chipTextMine]}>
                        {s.name}: {fmtUnits(s.units)}
                      </Text>
                    </View>
                  ))}
                  {remaining > 0 && (
                    <View style={styles.chipRemaining}>
                      <Text style={styles.chipRemainingText}>
                        {fmtUnits(remaining)} left
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Totals */}
        {receipt && (
          <View style={styles.totalsCard}>
            {receipt.subtotal != null && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.totalsValue}>${receipt.subtotal.toFixed(2)}</Text>
              </View>
            )}
            {receipt.tax != null && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>${receipt.tax.toFixed(2)}</Text>
              </View>
            )}
            {receipt.tip != null && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tip</Text>
                <Text style={styles.totalsValue}>${receipt.tip.toFixed(2)}</Text>
              </View>
            )}
            {receipt.total != null && (
              <View style={[styles.totalsRow, styles.totalsRowTotal]}>
                <Text style={styles.totalsTotalLabel}>Total</Text>
                <Text style={styles.totalsTotalValue}>${receipt.total.toFixed(2)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Who paid the bill */}
        <View style={styles.payerCard}>
          <Text style={styles.payerLabel}>Who paid the bill?</Text>
          {isHost ? (
            <View style={styles.payerChipsRow}>
              {participants.map((p) => {
                const selected = session?.paid_by_user_id === p.user_id;
                return (
                  <TouchableOpacity
                    key={p.user_id}
                    style={[styles.payerChip, selected && styles.payerChipSelected]}
                    onPress={() => handleSelectPayer(p.user_id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.payerChipText, selected && styles.payerChipTextSelected]}>
                      {p.user_id === user?.id ? 'Me' : p.display_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.payerReadonly}>
              {(() => {
                const payer = participants.find((p) => p.user_id === session?.paid_by_user_id);
                if (!payer) return 'Host hasn’t selected yet…';
                return payer.user_id === user?.id ? 'You paid' : `${payer.display_name} paid`;
              })()}
            </Text>
          )}
        </View>

        {isHost && (
          <TouchableOpacity
            style={[
              styles.finishBtn,
              (isFinishing || !session?.paid_by_user_id) && styles.finishBtnDisabled,
            ]}
            onPress={handleFinish}
            disabled={isFinishing || !session?.paid_by_user_id}
            activeOpacity={0.85}
          >
            {isFinishing
              ? <ActivityIndicator color={BG} />
              : <Text style={styles.finishBtnText}>Finish & See Totals</Text>
            }
          </TouchableOpacity>
        )}

        {!isHost && (
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={styles.waitingText}>Waiting for host to finish…</Text>
          </View>
        )}
      </ScrollView>

      {/* Quantity keypad bottom sheet */}
      {editingIndex !== null && (() => {
        const item = receipt?.items?.[editingIndex];
        if (!item) return null;
        const qty = getItemQty(editingIndex);
        const myUnits = getMyUnits(editingIndex);
        const othersUnits = getTotalClaimedUnits(editingIndex) - myUnits;
        const maxMine = Math.max(0, qty - othersUnits);
        const lineTotal = item.lineTotal ?? 0;
        const perUnit = qty > 0 ? lineTotal / qty : lineTotal;
        const cost = draft * perUnit;

        const clamp = (v: number) => Math.max(0, Math.min(v, maxMine));
        const whole = Math.floor(draft);
        const half = Math.abs((draft % 1) - 0.5) < 1e-6;

        const onDigit = (d: number) => {
          const newWhole = whole === 0 ? d : whole * 10 + d;
          setDraft(clamp(newWhole + (half ? 0.5 : 0)));
        };
        const onHalf = () => setDraft(clamp(whole + (half ? 0 : 0.5)));
        const onBack = () => {
          if (half) setDraft(whole);
          else setDraft(Math.floor(whole / 10));
        };

        return (
          <Modal
            transparent
            animationType="slide"
            visible
            onRequestClose={closeKeypad}
          >
            <Pressable style={styles.sheetBackdrop} onPress={closeKeypad}>
              <Pressable style={styles.sheet} onPress={() => {}}>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{item.name}</Text>
                    <Text style={styles.sheetSubtitle}>
                      ×{fmtUnits(qty)} · ${perUnit.toFixed(2)} each
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeKeypad} style={styles.sheetClose}>
                    <Text style={styles.sheetCloseX}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.sheetDisplay}>
                  <Text style={styles.sheetAmount}>{fmtUnits(draft)}</Text>
                  <Text style={styles.sheetCost}>= ${cost.toFixed(2)}</Text>
                  <Text style={styles.sheetContext}>
                    Others claimed: {fmtUnits(othersUnits)} · Available: {fmtUnits(maxMine)}
                  </Text>
                </View>

                <View style={styles.presetsRow}>
                  <PresetBtn label="None" onPress={() => setDraft(0)} selected={draft === 0} />
                  <PresetBtn
                    label="½"
                    onPress={() => setDraft(clamp(0.5))}
                    selected={draft === 0.5}
                    disabled={maxMine < 0.5}
                  />
                  <PresetBtn
                    label="All"
                    onPress={() => setDraft(maxMine)}
                    selected={draft === maxMine && maxMine > 0}
                    disabled={maxMine === 0}
                  />
                </View>

                <View style={styles.keypad}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <KeypadKey key={d} label={String(d)} onPress={() => onDigit(d)} />
                  ))}
                  <KeypadKey label="½" onPress={onHalf} accent />
                  <KeypadKey label="0" onPress={() => onDigit(0)} />
                  <KeypadKey label="⌫" onPress={onBack} accent />
                </View>

                <TouchableOpacity
                  style={styles.sheetSave}
                  onPress={saveKeypad}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sheetSaveText}>
                    {draft === 0 ? 'Clear claim' : `Save · $${cost.toFixed(2)}`}
                  </Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
}

function PresetBtn({
  label,
  onPress,
  selected,
  disabled,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.preset,
        selected && styles.presetSelected,
        disabled && styles.presetDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.presetText,
          selected && styles.presetTextSelected,
          disabled && styles.presetTextDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function KeypadKey({
  label,
  onPress,
  accent,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.key, accent && styles.keyAccent]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.keyText, accent && styles.keyTextAccent]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.border,
  },
  headerTitle: { fontSize: 20, fontFamily: F.bold, color: T.primary },
  headerSub: { fontSize: 13, fontFamily: F.regular, color: T.muted, marginTop: 2 },
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  itemCard: {
    backgroundColor: GLASS.bg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: GLASS.border,
    gap: 10,
  },
  itemCardClaimed: {
    borderColor: GREEN,
    backgroundColor: 'rgba(0,232,150,0.07)',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontSize: 15, fontFamily: F.semiBold, color: T.primary },
  itemNameClaimed: { color: GREEN },
  itemMeta: { fontSize: 12, fontFamily: F.regular, color: T.muted },
  itemPriceCol: { alignItems: 'flex-end', gap: 2 },
  itemLineTotal: { fontSize: 15, fontFamily: F.bold, color: T.primary },
  itemLineTotalClaimed: { color: GREEN },
  itemMyCost: { fontSize: 12, fontFamily: F.semiBold, color: GREEN },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
  },
  chipMine: {
    backgroundColor: 'rgba(0,232,150,0.15)',
    borderColor: 'rgba(0,232,150,0.4)',
  },
  chipText: {
    fontSize: 11,
    fontFamily: F.semiBold,
    color: T.secondary,
  },
  chipTextMine: { color: GREEN },
  chipRemaining: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chipRemainingText: {
    fontSize: 11,
    fontFamily: F.medium,
    color: T.muted,
  },

  // ── Bottom-sheet keypad ────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0E0E10',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: GLASS.border,
    gap: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: F.bold,
    color: T.primary,
  },
  sheetSubtitle: {
    fontSize: 12,
    fontFamily: F.regular,
    color: T.muted,
    marginTop: 2,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GLASS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseX: {
    fontSize: 14,
    color: T.secondary,
    fontFamily: F.bold,
  },
  sheetDisplay: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  sheetAmount: {
    fontSize: 56,
    fontFamily: F.bold,
    color: T.primary,
    letterSpacing: -1,
    lineHeight: 62,
  },
  sheetCost: {
    fontSize: 16,
    fontFamily: F.semiBold,
    color: GREEN,
  },
  sheetContext: {
    fontSize: 12,
    fontFamily: F.regular,
    color: T.muted,
    marginTop: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  preset: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: 'center',
  },
  presetSelected: {
    backgroundColor: 'rgba(0,232,150,0.16)',
    borderColor: GREEN,
  },
  presetDisabled: { opacity: 0.35 },
  presetText: {
    fontSize: 14,
    fontFamily: F.semiBold,
    color: T.primary,
    letterSpacing: 0.3,
  },
  presetTextSelected: { color: GREEN },
  presetTextDisabled: { color: T.muted },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  key: {
    width: '32%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: 'center',
  },
  keyAccent: {
    backgroundColor: GLASS.bgStrong,
  },
  keyText: {
    fontSize: 22,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  keyTextAccent: {
    color: GREEN,
  },
  sheetSave: {
    backgroundColor: GREEN,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  sheetSaveText: {
    color: BG,
    fontSize: 16,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },

  totalsCard: {
    backgroundColor: GLASS.bgStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS.border,
    padding: 16,
    marginTop: 6,
    gap: 8,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsLabel: { fontSize: 14, fontFamily: F.regular, color: T.muted },
  totalsValue: { fontSize: 14, fontFamily: F.medium, color: T.secondary },
  totalsRowTotal: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: GLASS.border,
  },
  totalsTotalLabel: { fontSize: 16, fontFamily: F.bold, color: T.primary },
  totalsTotalValue: { fontSize: 16, fontFamily: F.bold, color: GREEN },

  finishBtn: {
    backgroundColor: GREEN,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  finishBtnDisabled: { opacity: 0.6 },
  finishBtnText: {
    color: BG,
    fontSize: 16,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  waitingText: { fontSize: 15, fontFamily: F.regular, color: T.muted },

  payerCard: {
    marginTop: 6,
    padding: 16,
    borderRadius: 14,
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
    gap: 10,
  },
  payerLabel: {
    fontSize: 11,
    fontFamily: F.semiBold,
    color: T.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  payerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
  },
  payerChipSelected: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  payerChipText: {
    fontSize: 13,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  payerChipTextSelected: {
    color: BG,
  },
  payerReadonly: {
    fontSize: 14,
    fontFamily: F.medium,
    color: T.secondary,
  },
});
