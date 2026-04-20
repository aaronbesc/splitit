import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { findSessionByCode, joinSession } from '@/services/sessionService';
import { getDebtsIOwe, getDebtsOwedToMe } from '@/services/debtsService';
import { extractReceiptWithGemini } from '../../services/geminiService';
import ReceiptLoadingOverlay from '@/components/receipt-loading';
import { BG, ERROR, F, GLASS, GREEN, INPUT, T, WARN } from '@/constants/design';

export default function ScannerScreen() {
  const { user } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const [iOweTotal, setIOweTotal] = useState(0);
  const [iOweCount, setIOweCount] = useState(0);
  const [owedToMeTotal, setOwedToMeTotal] = useState(0);
  const [owedToMeCount, setOwedToMeCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      (async () => {
        const [a, b] = await Promise.all([
          getDebtsIOwe(user.id),
          getDebtsOwedToMe(user.id),
        ]);
        if (cancelled) return;
        setIOweTotal(a.debts.reduce((s, d) => s + Number(d.amount), 0));
        setIOweCount(a.debts.length);
        setOwedToMeTotal(b.debts.reduce((s, d) => s + Number(d.amount), 0));
        setOwedToMeCount(b.debts.length);
      })();
      return () => { cancelled = true; };
    }, [user])
  );

  const avatarInitials = (() => {
    const name = (user?.user_metadata?.full_name as string | undefined) ?? '';
    const source = name.trim() || user?.email || '';
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  })();

  async function handleJoinByCode() {
    if (joinCode.trim().length !== 6) {
      Alert.alert('Invalid Code', 'Enter a 6-character code.');
      return;
    }
    setIsJoining(true);
    const { session, error } = await findSessionByCode(joinCode);
    if (error || !session) {
      Alert.alert('Not Found', error ?? 'Session not found.');
      setIsJoining(false);
      return;
    }
    const displayName =
      user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Guest';
    const venmo = (user?.user_metadata?.venmo_username as string | undefined) ?? null;
    const { error: joinError } = await joinSession(session.id, user!.id, displayName, venmo);
    setIsJoining(false);
    if (joinError) {
      Alert.alert('Join Failed', joinError);
      return;
    }
    router.push({ pathname: '/session-lobby', params: { sessionId: session.id, isHost: 'false' } });
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const handleProcessReceipt = async () => {
    if (!image) return;
    setIsProcessing(true);
    try {
      // Higher resolution + quality: Gemini reads pixels directly, so sharpness matters.
      // base64:true gets the encoded data in one step — no separate file read needed.
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        image,
        [{ resize: { width: 1200 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulatedImage.base64) {
        Alert.alert('Processing Failed', 'Could not read image data.');
        return;
      }

      const structuredData = await extractReceiptWithGemini(manipulatedImage.base64);
      router.push({
        pathname: '/receipt-review',
        params: { data: JSON.stringify(structuredData) },
      });
    } catch (error) {
      console.error('Pipeline Error:', error);
      Alert.alert('Error', 'An error occurred during image processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Scan Receipt</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.avatarBtn}
          activeOpacity={0.8}
          accessibilityLabel="Open settings"
        >
          <Text style={styles.avatarBtnText}>{avatarInitials}</Text>
          {!user?.user_metadata?.venmo_username && <View style={styles.avatarDot} />}
        </TouchableOpacity>
      </View>

      {/* Debt summary cards */}
      <View style={styles.debtCardsRow}>
        <TouchableOpacity
          style={styles.debtCard}
          onPress={() => router.push({ pathname: '/debts', params: { tab: 'owed' } })}
          activeOpacity={0.85}
        >
          <Text style={styles.debtCardLabel}>You owe</Text>
          <Text style={[styles.debtCardAmount, { color: iOweTotal > 0 ? WARN.text : T.muted }]}>
            ${iOweTotal.toFixed(2)}
          </Text>
          <Text style={styles.debtCardMeta}>
            {iOweCount === 0 ? 'All clear' : `${iOweCount} ${iOweCount === 1 ? 'person' : 'people'}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.debtCard}
          onPress={() => router.push({ pathname: '/debts', params: { tab: 'incoming' } })}
          activeOpacity={0.85}
        >
          <Text style={styles.debtCardLabel}>They owe you</Text>
          <Text style={[styles.debtCardAmount, { color: owedToMeTotal > 0 ? GREEN : T.muted }]}>
            ${owedToMeTotal.toFixed(2)}
          </Text>
          <Text style={styles.debtCardMeta}>
            {owedToMeCount === 0 ? 'All clear' : `${owedToMeCount} ${owedToMeCount === 1 ? 'person' : 'people'}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Preview area */}
      <View style={styles.previewArea}>
        {image ? (
          <Image source={{ uri: image }} style={styles.preview} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.previewIcon}>📄</Text>
            <Text style={styles.previewPlaceholderText}>No image selected</Text>
            <Text style={styles.previewPlaceholderSub}>Take a photo or choose from gallery</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonGroup}>
        <View style={styles.cameraRow}>
          <TouchableOpacity style={styles.halfBtn} onPress={takePhoto} activeOpacity={0.85}>
            <Text style={styles.halfBtnIcon}>📷</Text>
            <Text style={styles.halfBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.halfBtn} onPress={pickImage} activeOpacity={0.85}>
            <Text style={styles.halfBtnIcon}>🖼</Text>
            <Text style={styles.halfBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <>
            <TouchableOpacity
              style={styles.processBtn}
              onPress={handleProcessReceipt}
              activeOpacity={0.85}
            >
              <Text style={styles.processBtnText}>Process Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setImage(null)} activeOpacity={0.7}>
              <Text style={styles.clearText}>Clear image</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Join a Session */}
        {!showJoinInput ? (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => setShowJoinInput(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.joinBtnText}>Join a Session</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.joinInputGroup}>
            <TextInput
              style={styles.joinInput}
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase())}
              placeholder="Enter 6-char code"
              placeholderTextColor={T.placeholder}
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />
            <View style={styles.joinActions}>
              <TouchableOpacity
                style={styles.joinCancelBtn}
                onPress={() => { setShowJoinInput(false); setJoinCode(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.joinCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.joinConfirmBtn, isJoining && { opacity: 0.6 }]}
                onPress={handleJoinByCode}
                disabled={isJoining}
                activeOpacity={0.85}
              >
                {isJoining
                  ? <ActivityIndicator color={BG} size="small" />
                  : <Text style={styles.joinConfirmText}>Join</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Full-screen loading overlay — covers everything while OCR + Gemini run */}
      {isProcessing && <ReceiptLoadingOverlay />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.border,
  },
  title: {
    fontSize: 24,
    fontFamily: F.bold,
    color: T.primary,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarBtnText: {
    color: BG,
    fontSize: 14,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },
  avatarDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ERROR.text,
    borderWidth: 2,
    borderColor: BG,
  },
  debtCardsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  debtCard: {
    flex: 1,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  debtCardLabel: {
    fontSize: 11,
    fontFamily: F.semiBold,
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  debtCardAmount: {
    fontSize: 22,
    fontFamily: F.bold,
    letterSpacing: -0.3,
  },
  debtCardMeta: {
    fontSize: 11,
    fontFamily: F.medium,
    color: T.muted,
  },
  previewArea: {
    flex: 1,
    margin: 20,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GLASS.border,
    backgroundColor: GLASS.bg,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  previewPlaceholderText: {
    fontSize: 16,
    fontFamily: F.semiBold,
    color: T.muted,
  },
  previewPlaceholderSub: {
    fontSize: 13,
    fontFamily: F.regular,
    color: 'rgba(255,255,255,0.22)',
  },
  buttonGroup: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
    alignItems: 'center',
  },
  cameraRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  halfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
  },
  halfBtnIcon: {
    fontSize: 18,
  },
  halfBtnText: {
    color: T.primary,
    fontSize: 15,
    fontFamily: F.semiBold,
  },
  processBtn: {
    backgroundColor: GREEN,
    paddingVertical: 15,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  processBtnText: {
    color: BG,
    fontSize: 16,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },
  clearText: {
    fontSize: 13,
    fontFamily: F.medium,
    color: T.muted,
  },
  joinBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: GLASS.border,
    alignItems: 'center',
    backgroundColor: GLASS.bg,
  },
  joinBtnText: {
    color: T.secondary,
    fontSize: 15,
    fontFamily: F.semiBold,
  },
  joinInputGroup: {
    width: '100%',
    gap: 10,
  },
  joinInput: {
    backgroundColor: INPUT.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: INPUT.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontFamily: F.bold,
    color: GREEN,
    textAlign: 'center',
    letterSpacing: 6,
    width: '100%',
  },
  joinActions: {
    flexDirection: 'row',
    gap: 10,
  },
  joinCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: 'center',
    backgroundColor: GLASS.bg,
  },
  joinCancelText: {
    fontSize: 15,
    fontFamily: F.medium,
    color: T.muted,
  },
  joinConfirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  joinConfirmText: {
    fontSize: 15,
    fontFamily: F.bold,
    color: BG,
    letterSpacing: 0.3,
  },
});
