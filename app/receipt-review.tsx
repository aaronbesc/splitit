import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { ReceiptJSON } from '../services/geminiService';
import { saveReceipt } from '../services/receiptService';
import { createSession } from '@/services/sessionService';

const BRAND = '#5B6AF4';

type EditableItem = {
  name: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

type EditableReceipt = {
  merchantName: string;
  address: string;
  dateTime: string;
  items: EditableItem[];
  subtotal: string;
  taxPercent: string;
  tipPercent: string;
  total: string;
  warnings: string[];
};

function toEditable(data: ReceiptJSON): EditableReceipt {
  const subtotal = data.subtotal ?? 0;
  const tax = data.tax ?? 0;
  const tip = data.tip ?? 0;
  const taxPercent = subtotal > 0 ? ((tax / subtotal) * 100).toFixed(2) : '';
  const tipPercent = subtotal > 0 ? ((tip / subtotal) * 100).toFixed(2) : '';

  return {
    merchantName: data.merchantName ?? '',
    address: data.address ?? '',
    dateTime: data.dateTime ?? '',
    items: data.items.map(item => ({
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
      lineTotal: item.lineTotal != null ? String(item.lineTotal) : '',
    })),
    subtotal: subtotal > 0 ? String(subtotal) : '',
    taxPercent,
    tipPercent,
    total: data.total != null ? String(data.total) : '',
    warnings: data.warnings,
  };
}

export default function ReceiptReviewScreen() {
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }
  const { data: rawData } = useLocalSearchParams<{ data: string }>();

  const parsed: ReceiptJSON = rawData ? JSON.parse(rawData) : null;
  const [form, setForm] = useState<EditableReceipt>(() =>
    parsed ? toEditable(parsed) : {
      merchantName: '', address: '', dateTime: '', items: [],
      subtotal: '', taxPercent: '', tipPercent: '', total: '', warnings: [],
    }
  );
  const [isSaving, setIsSaving] = useState(false);

  const setField = (field: keyof Omit<EditableReceipt, 'items' | 'warnings'>, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const setItemField = (index: number, field: keyof EditableItem, value: string) =>
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));

  const addItem = () =>
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { name: '', quantity: '1', unitPrice: '', lineTotal: '' }],
    }));

  const removeItem = (index: number) =>
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'You must be signed in to save a receipt.');
      return;
    }
    setIsSaving(true);
    try {
      const subtotal = parseFloat(form.subtotal) || 0;
      const taxAmt = parseFloat(((parseFloat(form.taxPercent) || 0) / 100 * subtotal).toFixed(2));
      const tipAmt = parseFloat(((parseFloat(form.tipPercent) || 0) / 100 * subtotal).toFixed(2));

      const receipt: ReceiptJSON = {
        merchantName: form.merchantName || null,
        address: form.address || null,
        serverName: null,
        dateTime: form.dateTime || null,
        subtotal: subtotal > 0 ? subtotal : null,
        tax: taxAmt > 0 ? taxAmt : null,
        tip: tipAmt > 0 ? tipAmt : null,
        total: parseFloat(form.total) > 0 ? parseFloat(form.total) : null,
        items: form.items.map(item => ({
          name: item.name,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : null,
          lineTotal: item.lineTotal ? parseFloat(item.lineTotal) : null,
        })),
        warnings: [],
      };

      console.log('[handleSave] saving for user:', user.id);
      console.log('[handleSave] payload:', JSON.stringify(receipt, null, 2));

      const { id: receiptId, error } = await saveReceipt(receipt, user.id);

      console.log('[handleSave] result error:', error);

      if (error) {
        Alert.alert('Save Failed', error);
      } else {
        Alert.alert('Receipt Saved', 'What would you like to do?', [
          { text: 'Done', style: 'cancel', onPress: () => router.back() },
          { text: 'Start Split Session', onPress: () => handleStartSession(receiptId!) },
        ]);
      }
    } catch (err) {
      console.error('[handleSave] unexpected error:', err);
      Alert.alert('Error', String(err));
    } finally {
      setIsSaving(false);
    }
  };

  async function handleStartSession(receiptId: string) {
    const displayName = user!.user_metadata?.full_name ?? user!.email?.split('@')[0] ?? 'Host';
    const { session, error } = await createSession(receiptId, user!.id, displayName);
    if (error || !session) { Alert.alert('Error', error ?? 'Could not create session.'); return; }
    router.replace({ pathname: '/session-lobby', params: { sessionId: session.id, isHost: 'true' } });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Scan</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Receipt</Text>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageSubtitle}>
            Correct any mistakes from the scan before saving.
          </Text>

          {/* Warnings */}
          {form.warnings.length > 0 && (
            <View style={styles.warningBox}>
              {form.warnings.map((w, i) => (
                <Text key={i} style={styles.warningText}>⚠ {w}</Text>
              ))}
            </View>
          )}

          {/* ── Restaurant Info ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Restaurant Info</Text>

            <Text style={styles.label}>Restaurant Name</Text>
            <TextInput
              style={styles.input}
              value={form.merchantName}
              onChangeText={v => setField('merchantName', v)}
              placeholder="e.g. Joe's Crab Shack"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={form.address}
              onChangeText={v => setField('address', v)}
              placeholder="Street address"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Date / Time</Text>
            <TextInput
              style={styles.input}
              value={form.dateTime}
              onChangeText={v => setField('dateTime', v)}
              placeholder="e.g. 2025-06-15 7:30 PM"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* ── Items ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Items</Text>

            {form.items.map((item, index) => (
              <View key={index} style={styles.itemCard}>
                {/* Item name row */}
                <View style={styles.itemNameRow}>
                  <TextInput
                    style={[styles.input, styles.itemNameInput]}
                    value={item.name}
                    onChangeText={v => setItemField(index, 'name', v)}
                    placeholder="Item name"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(index)}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Qty / Unit price / Line total */}
                <View style={styles.itemMetaRow}>
                  <View style={styles.itemMetaCell}>
                    <Text style={styles.labelSm}>Qty</Text>
                    <TextInput
                      style={[styles.input, styles.inputSm]}
                      value={item.quantity}
                      onChangeText={v => setItemField(index, 'quantity', v)}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={styles.itemMetaCell}>
                    <Text style={styles.labelSm}>Unit ($)</Text>
                    <TextInput
                      style={[styles.input, styles.inputSm]}
                      value={item.unitPrice}
                      onChangeText={v => setItemField(index, 'unitPrice', v)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                  <View style={styles.itemMetaCell}>
                    <Text style={styles.labelSm}>Total ($)</Text>
                    <TextInput
                      style={[styles.input, styles.inputSm]}
                      value={item.lineTotal}
                      onChangeText={v => setItemField(index, 'lineTotal', v)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.7}>
              <Text style={styles.addItemText}>+ Add Item</Text>
            </TouchableOpacity>
          </View>

          {/* ── Totals ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Totals</Text>

            {[
              { label: 'Subtotal ($)', field: 'subtotal' as const },
              { label: 'Tax (%)', field: 'taxPercent' as const },
              { label: 'Tip (%)', field: 'tipPercent' as const },
              { label: 'Total ($)', field: 'total' as const },
            ].map(({ label, field }) => (
              <View key={field} style={styles.totalRow}>
                <Text style={[styles.label, styles.totalLabel]}>{label}</Text>
                <TextInput
                  style={[styles.input, styles.totalInput]}
                  value={form[field]}
                  onChangeText={v => setField(field, v)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  textAlign="right"
                />
              </View>
            ))}
          </View>

          {/* ── Actions ── */}
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.saveBtnText}>Save to Database</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Discard & Go Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 60,
  },
  backArrow: {
    fontSize: 28,
    color: BRAND,
    lineHeight: 30,
    fontWeight: '300',
  },
  backText: {
    fontSize: 16,
    color: BRAND,
    fontWeight: '500',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    minWidth: 60,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Content
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },

  // Warnings
  warningBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    gap: 4,
  },
  warningText: {
    color: '#92400E',
    fontSize: 13,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },

  // Fields
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 5,
    marginTop: 10,
  },
  labelSm: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  inputSm: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },

  // Items
  itemCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemNameInput: {
    flex: 1,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  itemMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  itemMetaCell: {
    flex: 1,
  },
  addItemBtn: {
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BRAND,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addItemText: {
    color: BRAND,
    fontWeight: '600',
    fontSize: 14,
  },

  // Totals
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  totalLabel: {
    flex: 1,
    marginTop: 0,
    marginBottom: 0,
  },
  totalInput: {
    flex: 1,
  },

  // Buttons
  saveBtn: {
    backgroundColor: BRAND,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
  },
});
