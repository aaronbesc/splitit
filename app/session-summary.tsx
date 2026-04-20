import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemClaim, ReceiptForSession, SessionParticipant } from '@/services/sessionService';
import { BG, F, GLASS, GREEN, T, WARN } from '@/constants/design';

type SummaryPayload = {
  sessionId: string;
  myUserId: string;
  participants: SessionParticipant[];
  receipt: ReceiptForSession;
  claims: ItemClaim[];
  paidByUserId?: string | null;
};

function buildVenmoUrl(username: string, amount: number, note: string): string {
  const cleanUsername = username.replace(/^@/, '').trim();
  const amt = amount.toFixed(2);
  return `https://venmo.com/${encodeURIComponent(cleanUsername)}?txn=pay&amount=${amt}&note=${encodeURIComponent(note)}`;
}

type ClaimedItemRow = {
  name: string;
  lineTotal: number;
  myShare: number;
  myUnits: number;
  totalQty: number;
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
  // Group claims by item index
  const claimsByItem = new Map<number, { userId: string; units: number }[]>();
  for (const c of claims) {
    const units = c.units ?? 1;
    if (units <= 0) continue;
    if (!claimsByItem.has(c.item_index)) claimsByItem.set(c.item_index, []);
    claimsByItem.get(c.item_index)!.push({ userId: c.user_id, units });
  }

  let myItemSubtotal = 0;
  const myClaimedItems: ClaimedItemRow[] = [];
  let myUnclaimedShare = 0;

  receipt.items.forEach((item, index) => {
    const lineTotal = item.lineTotal ?? 0;
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    const perUnit = qty > 0 ? lineTotal / qty : lineTotal;
    const itemClaims = claimsByItem.get(index) ?? [];
    const totalClaimedUnits = itemClaims.reduce((s, c) => s + c.units, 0);
    const myUnits = itemClaims
      .filter((c) => c.userId === myUserId)
      .reduce((s, c) => s + c.units, 0);

    // Fully unclaimed item: split across everyone
    if (totalClaimedUnits <= 0) {
      const share = participants.length > 0 ? lineTotal / participants.length : lineTotal;
      myUnclaimedShare += share;
      myItemSubtotal += share;
      return;
    }

    // My claimed portion
    if (myUnits > 0) {
      const myShare = myUnits * perUnit;
      myClaimedItems.push({
        name: item.name,
        lineTotal,
        myShare,
        myUnits,
        totalQty: qty,
      });
      myItemSubtotal += myShare;
    }

    // Partially unclaimed remainder: split across everyone
    const remainingUnits = Math.max(0, qty - totalClaimedUnits);
    if (remainingUnits > 0 && participants.length > 0) {
      const remainderCost = remainingUnits * perUnit;
      const myPortion = remainderCost / participants.length;
      myUnclaimedShare += myPortion;
      myItemSubtotal += myPortion;
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
  const { myUserId, participants, receipt, claims, paidByUserId } = parsed;

  const summary = receipt
    ? computeSummary(myUserId, participants ?? [], receipt, claims ?? [])
    : null;

  const payer = (participants ?? []).find((p) => p.user_id === paidByUserId) ?? null;
  const iAmPayer = !!payer && payer.user_id === myUserId;

  async function handlePayViaVenmo() {
    if (!payer || !summary) return;
    if (!payer.venmo_username) {
      Alert.alert(
        'No Venmo username',
        `${payer.display_name} hasn’t added a Venmo username yet.`
      );
      return;
    }
    const note = `${receipt?.merchant_name ?? 'Split It'} – my share`;
    const url = buildVenmoUrl(payer.venmo_username, summary.myTotal, note);
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Cannot open Venmo', 'Venmo may not be installed on this device.');
      return;
    }
    Linking.openURL(url);
  }

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
                      <Text style={styles.lineSub}>
                        {item.myUnits === item.totalQty
                          ? `all ${item.totalQty}`
                          : `${item.myUnits} of ${item.totalQty}`}
                        {' · '}${item.lineTotal.toFixed(2)} total
                      </Text>
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
              <Text style={styles.totalLabel}>
                {iAmPayer ? 'You paid' : 'You owe'}
              </Text>
              <Text style={styles.totalAmount}>${summary.myTotal.toFixed(2)}</Text>
            </View>

            {/* Payment action */}
            {payer && iAmPayer && payer.venmo_username && (
              <View style={styles.payerBanner}>
                <Text style={styles.payerBannerTitle}>You paid the bill</Text>
                <Text style={styles.payerBannerSub}>
                  Friends will send you their share via Venmo @{payer.venmo_username}.
                </Text>
              </View>
            )}

            {payer && iAmPayer && !payer.venmo_username && (
              <TouchableOpacity
                style={styles.nudgeBanner}
                onPress={() => router.push('/settings')}
                activeOpacity={0.85}
              >
                <Text style={styles.nudgeTitle}>Add your Venmo to get paid</Text>
                <Text style={styles.nudgeSub}>
                  Friends can’t send you their share until you add a Venmo username. Tap to add it now.
                </Text>
              </TouchableOpacity>
            )}

            {payer && !iAmPayer && summary.myTotal > 0 && (
              payer.venmo_username ? (
                <TouchableOpacity
                  style={styles.venmoBtn}
                  onPress={handlePayViaVenmo}
                  activeOpacity={0.85}
                >
                  <Text style={styles.venmoBtnTitle}>
                    Pay {payer.display_name} ${summary.myTotal.toFixed(2)}
                  </Text>
                  <Text style={styles.venmoBtnSub}>via Venmo</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.venmoWarn}>
                  <Text style={styles.venmoWarnTitle}>
                    Pay {payer.display_name} ${summary.myTotal.toFixed(2)}
                  </Text>
                  <Text style={styles.venmoWarnSub}>
                    {payer.display_name} hasn’t added a Venmo username.
                  </Text>
                </View>
              )
            )}
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
    backgroundColor: BG,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: F.bold,
    color: T.primary,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 14,
    fontFamily: F.regular,
    color: T.muted,
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
    fontSize: 11,
    fontFamily: F.semiBold,
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.borderDim,
    gap: 12,
  },
  lineLeft: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    fontSize: 15,
    fontFamily: F.medium,
    color: T.primary,
  },
  lineSub: {
    fontSize: 12,
    fontFamily: F.regular,
    color: T.muted,
  },
  lineAmount: {
    fontSize: 15,
    fontFamily: F.semiBold,
    color: T.secondary,
  },
  totalCard: {
    backgroundColor: GREEN,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: F.semiBold,
    color: 'rgba(5,5,5,0.6)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  totalAmount: {
    fontSize: 52,
    fontFamily: F.bold,
    color: BG,
    letterSpacing: -1,
  },
  doneBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
  },
  doneBtnText: {
    fontSize: 16,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  errorText: {
    fontSize: 15,
    fontFamily: F.regular,
    color: T.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  payerBanner: {
    backgroundColor: 'rgba(0,232,150,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,232,150,0.30)',
    padding: 16,
    marginBottom: 16,
  },
  payerBannerTitle: {
    fontSize: 15,
    fontFamily: F.bold,
    color: GREEN,
    marginBottom: 4,
  },
  payerBannerSub: {
    fontSize: 13,
    fontFamily: F.regular,
    color: T.secondary,
    lineHeight: 18,
  },
  venmoBtn: {
    backgroundColor: '#3D95CE',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3D95CE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  venmoBtnTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },
  venmoBtnSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: F.medium,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  nudgeBanner: {
    backgroundColor: WARN.bg,
    borderWidth: 1,
    borderColor: WARN.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  nudgeTitle: {
    fontSize: 15,
    fontFamily: F.bold,
    color: WARN.text,
    marginBottom: 4,
  },
  nudgeSub: {
    fontSize: 13,
    fontFamily: F.regular,
    color: T.secondary,
    lineHeight: 18,
  },
  venmoWarn: {
    backgroundColor: WARN.bg,
    borderWidth: 1,
    borderColor: WARN.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  venmoWarnTitle: {
    color: T.primary,
    fontSize: 15,
    fontFamily: F.bold,
    marginBottom: 4,
  },
  venmoWarnSub: {
    color: WARN.text,
    fontSize: 13,
    fontFamily: F.regular,
    textAlign: 'center',
  },
});
