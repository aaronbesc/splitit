import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemClaim, ReceiptForSession, SessionParticipant } from '@/services/sessionService';

const BRAND = '#5B6AF4';

type SummaryPayload = {
  sessionId: string;
  myUserId: string;
  participants: SessionParticipant[];
  receipt: ReceiptForSession;
  claims: ItemClaim[];
};

type ClaimedItemRow = {
  name: string;
  lineTotal: number;
  myShare: number;
  claimantCount: number;
};

type Summary = {
  myClaimedItems: ClaimedItemRow[];
  myUnclaimedShare: number;
  myItemSubtotal: number;
  myTax: number;
  myTip: number;
  myTotal: number;
};

function computeSummary(
  myUserId: string,
  participants: SessionParticipant[],
  receipt: ReceiptForSession,
  claims: ItemClaim[]
): Summary {
  const claimMap = new Map<number, Set<string>>(); // itemIndex → Set<userId>
  for (const c of claims) {
    if (!claimMap.has(c.item_index)) claimMap.set(c.item_index, new Set());
    claimMap.get(c.item_index)!.add(c.user_id);
  }

  let myItemSubtotal = 0;
  const myClaimedItems: ClaimedItemRow[] = [];
  let myUnclaimedShare = 0;

  receipt.items.forEach((item, index) => {
    const lineTotal = item.lineTotal ?? 0;
    const claimants = claimMap.get(index);
    if (!claimants || claimants.size === 0) {
      // Unclaimed: split evenly among all participants
      const share = participants.length > 0 ? lineTotal / participants.length : lineTotal;
      myUnclaimedShare += share;
      myItemSubtotal += share;
    } else if (claimants.has(myUserId)) {
      const myShare = lineTotal / claimants.size;
      myClaimedItems.push({ name: item.name, lineTotal, myShare, claimantCount: claimants.size });
      myItemSubtotal += myShare;
    }
  });

  const subtotal = receipt.subtotal ?? 0;
  const proportion =
    subtotal > 0 ? myItemSubtotal / subtotal : participants.length > 0 ? 1 / participants.length : 1;
  const myTax = (receipt.tax ?? 0) * proportion;
  const myTip = (receipt.tip ?? 0) * proportion;

  return {
    myClaimedItems,
    myUnclaimedShare,
    myItemSubtotal,
    myTax,
    myTip,
    myTotal: myItemSubtotal + myTax + myTip,
  };
}

export default function SessionSummaryScreen() {
  const { payload: rawPayload } = useLocalSearchParams<{ payload: string }>();

  const parsed: SummaryPayload = JSON.parse(rawPayload ?? '{}');
  const { myUserId, participants, receipt, claims } = parsed;

  const summary = receipt
    ? computeSummary(myUserId, participants ?? [], receipt, claims ?? [])
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Total</Text>
        <Text style={styles.headerSub}>{receipt?.merchant_name ?? 'Receipt'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {summary ? (
          <>
            {/* Claimed items */}
            {summary.myClaimedItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Items</Text>
                {summary.myClaimedItems.map((item, i) => (
                  <View key={i} style={styles.lineRow}>
                    <View style={styles.lineLeft}>
                      <Text style={styles.lineName}>{item.name}</Text>
                      {item.claimantCount > 1 && (
                        <Text style={styles.lineSub}>
                          ${item.lineTotal.toFixed(2)} ÷ {item.claimantCount}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.lineAmount}>${item.myShare.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Unclaimed share */}
            {summary.myUnclaimedShare > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Shared (unclaimed items)</Text>
                <View style={styles.lineRow}>
                  <Text style={styles.lineName}>Your share of unclaimed items</Text>
                  <Text style={styles.lineAmount}>${summary.myUnclaimedShare.toFixed(2)}</Text>
                </View>
              </View>
            )}

            {/* Tax & Tip */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fees (proportional)</Text>
              <View style={styles.lineRow}>
                <Text style={styles.lineName}>Tax</Text>
                <Text style={styles.lineAmount}>${summary.myTax.toFixed(2)}</Text>
              </View>
              <View style={styles.lineRow}>
                <Text style={styles.lineName}>Tip</Text>
                <Text style={styles.lineAmount}>${summary.myTip.toFixed(2)}</Text>
              </View>
            </View>

            {/* Grand total */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>You owe</Text>
              <Text style={styles.totalAmount}>${summary.myTotal.toFixed(2)}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.errorText}>Could not compute summary.</Text>
        )}

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.85}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  headerSub: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    gap: 12,
  },
  lineLeft: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  lineSub: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  lineAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  totalCard: {
    backgroundColor: BRAND,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  totalLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    marginBottom: 6,
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  doneBtn: {
    backgroundColor: '#F2F2F7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  errorText: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 40,
  },
});
