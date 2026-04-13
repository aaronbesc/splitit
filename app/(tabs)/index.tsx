import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
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
import { extractReceiptWithGemini } from '../../services/geminiService';
import { performOCR } from '../../services/ocrService';
import { BG, F, GLASS, GREEN, INPUT, T } from '@/constants/design';

export default function ScannerScreen() {
  const { user, signOut } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

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
    const { error: joinError } = await joinSession(session.id, user!.id, displayName);
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
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        image,
        [{ resize: { width: 800 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      const rawText = await performOCR(manipulatedImage.uri);
      if (!rawText) {
        Alert.alert('OCR Failed', 'No text returned. Check your terminal logs.');
        return;
      }
      const structuredData = await extractReceiptWithGemini(rawText);
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
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
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

      {isProcessing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Scanning receipt…</Text>
        </View>
      ) : (
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
      )}
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
  signOutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.22)',
  },
  signOutText: {
    fontSize: 13,
    fontFamily: F.semiBold,
    color: '#FC8181',
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
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: F.medium,
    color: T.secondary,
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
