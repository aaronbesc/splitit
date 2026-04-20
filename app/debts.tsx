import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import {
  Debt,
  getDebtsIOwe,
  getDebtsOwedToMe,
  resolveDebt,
} from '@/services/debtsService';
import { BG, ERROR, F, GLASS, GREEN, T, WARN } from '@/constants/design';

type TabKey = 'owed' | 'incoming';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildVenmoUrl(username: string, amount: number, note: string): string {
  const clean = username.replace(/^@/, '').trim();
  return `https://venmo.com/${encodeURIComponent(clean)}?txn=pay&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}`;
}

export default function DebtsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TabKey>(
    params.tab === 'incoming' ? 'incoming' : 'owed'
  );

  const [iOwe, setIOwe] = useState<Debt[]>([]);
  const [owedToMe, setOwedToMe] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [a, b] = await Promise.all([
      getDebtsIOwe(user.id),
      getDebtsOwedToMe(user.id),
    ]);
    setIOwe(a.debts);
    setOwedToMe(b.debts);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePay(debt: Debt) {
    if (!debt.creditor_venmo) {
      Alert.alert(
        'No Venmo username',
        `${debt.creditor_name} hasn’t added a Venmo username yet.`
      );
      return;
    }
    const note = `${debt.merchant_name ?? 'Split It'} – my share`;
    const url = buildVenmoUrl(debt.creditor_venmo, debt.amount, note);
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert('Cannot open Venmo', 'Venmo may not be installed.');
      return;
    }
    Linking.openURL(url);
  }

  async function handleResolve(debt: Debt) {
    Alert.alert(
      'Mark as paid?',
      `Confirm that ${debt.debtor_name} has paid you $${debt.amount.toFixed(2)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          style: 'default',
          onPress: async () => {
            setResolvingId(debt.id);
            const { error } = await resolveDebt(debt.id);
            setResolvingId(null);
            if (error) {
              Alert.alert('Could not update', error);
              return;
            }
            setOwedToMe((prev) => prev.filter((d) => d.id !== debt.id));
          },
        },
      ]
    );
  }

  const list = tab === 'owed' ? iOwe : owedToMe;
  const total = list.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Debts</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'owed' && styles.tabActive]}
          onPress={() => setTab('owed')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'owed' && styles.tabTextActive]}>
            You owe
          </Text>
          {iOwe.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{iOwe.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'incoming' && styles.tabActive]}
          onPress={() => setTab('incoming')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'incoming' && styles.tabTextActive]}>
            Owed to you
          </Text>
          {owedToMe.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{owedToMe.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Total */}
      {list.length > 0 && (
        <View style={styles.totalBar}>
          <Text style={styles.totalBarLabel}>
            {tab === 'owed' ? 'Total you owe' : 'Total owed to you'}
          </Text>
          <Text
            style={[
              styles.totalBarAmount,
              { color: tab === 'owed' ? WARN.text : GREEN },
            ]}
          >
            ${total.toFixed(2)}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 40 }} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySub}>
              {tab === 'owed'
                ? 'You don’t owe anyone right now.'
                : 'Nobody owes you right now.'}
            </Text>
          </View>
        ) : (
          list.map((d) => {
            const counterpartyName =
              tab === 'owed' ? d.creditor_name : d.debtor_name;
            return (
              <View key={d.id} style={styles.debtCard}>
                <View style={styles.debtRow}>
                  <View style={styles.debtLeft}>
                    <Text style={styles.debtName}>{counterpartyName}</Text>
                    <Text style={styles.debtMeta}>
                      {d.merchant_name ?? 'Receipt'} · {fmtDate(d.created_at)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.debtAmount,
                      { color: tab === 'owed' ? WARN.text : GREEN },
                    ]}
                  >
                    ${Number(d.amount).toFixed(2)}
                  </Text>
                </View>

                {tab === 'owed' ? (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.venmoBtn,
                      !d.creditor_venmo && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handlePay(d)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.venmoBtnText}>
                      {d.creditor_venmo ? 'Pay via Venmo' : 'No Venmo set'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.resolveBtn,
                      resolvingId === d.id && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleResolve(d)}
                    disabled={resolvingId === d.id}
                    activeOpacity={0.85}
                  >
                    {resolvingId === d.id ? (
                      <ActivityIndicator color={BG} size="small" />
                    ) : (
                      <Text style={styles.resolveBtnText}>Mark as paid</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.border,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: T.primary, fontFamily: F.medium, lineHeight: 22 },
  headerTitle: { fontSize: 18, fontFamily: F.bold, color: T.primary },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: GLASS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: GLASS.bgStrong,
  },
  tabText: {
    fontSize: 13,
    fontFamily: F.semiBold,
    color: T.muted,
  },
  tabTextActive: {
    color: T.primary,
  },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: F.bold,
    color: BG,
  },

  totalBar: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: GLASS.bgStrong,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS.border,
  },
  totalBarLabel: {
    fontSize: 12,
    fontFamily: F.semiBold,
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  totalBarAmount: {
    fontSize: 18,
    fontFamily: F.bold,
  },

  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 10,
  },
  debtCard: {
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  debtLeft: { flex: 1, gap: 2 },
  debtName: {
    fontSize: 16,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  debtMeta: {
    fontSize: 12,
    fontFamily: F.regular,
    color: T.muted,
  },
  debtAmount: {
    fontSize: 18,
    fontFamily: F.bold,
  },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  venmoBtn: {
    backgroundColor: '#3D95CE',
  },
  venmoBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },
  resolveBtn: {
    backgroundColor: GREEN,
  },
  resolveBtnText: {
    color: BG,
    fontSize: 14,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: F.regular,
    color: T.muted,
    textAlign: 'center',
  },
});
