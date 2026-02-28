import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  claimItem,
  getItemClaims,
  getParticipants,
  getReceiptForSession,
  getSession,
  unclaimItem,
  updateSessionStatus,
} from '@/services/sessionService';

const BRAND = '#5B6AF4';

export default function SessionClaimScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [receipt, setReceipt] = useState<ReceiptForSession | null>(null);
  const [claims, setClaims] = useState<ItemClaim[]>([]);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Keep a ref so Realtime callbacks can snapshot current state
  const claimsRef = useRef<ItemClaim[]>([]);
  const participantsRef = useRef<SessionParticipant[]>([]);
  claimsRef.current = claims;
  participantsRef.current = participants;

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

    // Subscribe to claim inserts
    const claimsInsertChannel = supabase
      .channel(`session-claims-insert-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'item_claims',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newClaim = payload.new as ItemClaim;
          setClaims((prev) => {
            if (prev.some((c) => c.id === newClaim.id)) return prev;
            return [...prev, newClaim];
          });
        }
      )
      .subscribe();

    // Subscribe to claim deletes
    const claimsDeleteChannel = supabase
      .channel(`session-claims-delete-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'item_claims',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const removed = payload.old as ItemClaim;
          setClaims((prev) => prev.filter((c) => c.id !== removed.id));
        }
      )
      .subscribe();

    // Subscribe to session status changes
    const sessionChannel = supabase
      .channel(`session-claim-status-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as Session;
          setSession(updated);
          if (updated.status === 'finished') {
            // Snapshot current state for summary
            const currentClaims = claimsRef.current;
            const currentParticipants = participantsRef.current;
            router.replace({
              pathname: '/session-summary',
              params: {
                payload: JSON.stringify({
                  sessionId,
                  myUserId: user!.id,
                  participants: currentParticipants,
                  receipt: receipt,
                  claims: currentClaims,
                }),
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(claimsInsertChannel);
      supabase.removeChannel(claimsDeleteChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, user]);

  // Re-subscribe when receipt loads (needed for the 'finished' handler closure)
  // The receipt ref keeps the value fresh
  const receiptRef = useRef<ReceiptForSession | null>(null);
  receiptRef.current = receipt;

  async function handleToggleClaim(itemIndex: number) {
    if (!user || !sessionId) return;
    const mine = claims.find((c) => c.item_index === itemIndex && c.user_id === user.id);
    if (mine) {
      await unclaimItem(sessionId, itemIndex, user.id);
    } else {
      await claimItem(sessionId, itemIndex, user.id);
    }
    // Realtime updates state for everyone
  }

  async function handleFinish() {
    if (!sessionId) return;
    setIsFinishing(true);
    const { error } = await updateSessionStatus(sessionId, 'finished');
    if (error) {
      Alert.alert('Error', error);
      setIsFinishing(false);
    }
    // Navigation handled by Realtime listener
  }

  function getClaimantsForItem(itemIndex: number): string[] {
    const claimantIds = claims
      .filter((c) => c.item_index === itemIndex)
      .map((c) => c.user_id);
    return claimantIds.map((uid) => {
      const participant = participants.find((p) => p.user_id === uid);
      return participant?.display_name ?? 'Someone';
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={BRAND} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const isHost = session?.host_id === user?.id;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {receipt?.merchant_name ?? 'Claim Your Items'}
        </Text>
        <Text style={styles.headerSub}>Tap items you ordered</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {(receipt?.items ?? []).map((item, index) => {
          const claimants = getClaimantsForItem(index);
          const isMine = claims.some((c) => c.item_index === index && c.user_id === user?.id);
          const lineTotal = item.lineTotal ?? 0;
          const splitAmount = claimants.length > 0 ? lineTotal / claimants.length : lineTotal;

          return (
            <TouchableOpacity
              key={index}
              style={[styles.itemCard, isMine && styles.itemCardClaimed]}
              onPress={() => handleToggleClaim(index)}
              activeOpacity={0.75}
            >
              <View style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {claimants.length > 0 && (
                    <Text style={styles.claimants}>
                      {claimants.join(', ')}
                      {claimants.length > 1 ? ` (÷${claimants.length})` : ''}
                    </Text>
                  )}
                </View>
                <View style={styles.itemPriceCol}>
                  <Text style={styles.itemLineTotal}>${lineTotal.toFixed(2)}</Text>
                  {claimants.length > 1 && (
                    <Text style={styles.itemSplitPrice}>${splitAmount.toFixed(2)} ea</Text>
                  )}
                </View>
              </View>
              {isMine && (
                <View style={styles.claimedBadge}>
                  <Text style={styles.claimedBadgeText}>Claimed</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Totals summary row */}
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

        {isHost && (
          <TouchableOpacity
            style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]}
            onPress={handleFinish}
            disabled={isFinishing}
            activeOpacity={0.85}
          >
            {isFinishing
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.finishBtnText}>Finish & See Totals</Text>
            }
          </TouchableOpacity>
        )}

        {!isHost && (
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={BRAND} />
            <Text style={styles.waitingText}>Waiting for host to finish…</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  headerSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  itemCardClaimed: {
    borderColor: BRAND,
    backgroundColor: '#EEF2FF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  claimants: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemPriceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemLineTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  itemSplitPrice: {
    fontSize: 12,
    color: BRAND,
    fontWeight: '600',
  },
  claimedBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: BRAND,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  claimedBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  totalsCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    marginTop: 6,
    gap: 8,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalsValue: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  totalsRowTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalsTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  totalsTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  finishBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  finishBtnDisabled: {
    opacity: 0.6,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  waitingText: {
    fontSize: 15,
    color: '#6B7280',
  },
});
