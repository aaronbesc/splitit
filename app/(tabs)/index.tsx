import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
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
import { router } from 'expo-router';

import { useAuth } from '@/context/auth';
import { extractReceiptWithGemini } from '../../services/geminiService';
import { performOCR } from '../../services/ocrService';
import { findSessionByCode, joinSession } from '@/services/sessionService';

const BRAND = '#5B6AF4';

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
        [{ resize: { width: 1080 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
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
      <View style={styles.header}>
        <Text style={styles.title}>Scan Receipt</Text>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.previewArea}>
        {image ? (
          <Image source={{ uri: image }} style={styles.preview} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.previewPlaceholderText}>No image selected</Text>
            <Text style={styles.previewPlaceholderSub}>Take a photo or choose from gallery</Text>
          </View>
        )}
      </View>

      {isProcessing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={styles.loadingText}>Scanning receipt…</Text>
        </View>
      ) : (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.button} onPress={takePhoto} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={pickImage} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Gallery</Text>
          </TouchableOpacity>

          {image && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.processBtn]}
                onPress={handleProcessReceipt}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>Process Receipt</Text>
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
                placeholderTextColor="#9CA3AF"
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
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  signOutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  previewArea: {
    flex: 1,
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  previewPlaceholderSub: {
    fontSize: 13,
    color: '#D1D5DB',
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  buttonGroup: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
    alignItems: 'center',
  },
  button: {
    backgroundColor: BRAND,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  processBtn: {
    backgroundColor: '#16A34A',
    shadowColor: '#16A34A',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  clearText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  joinBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BRAND,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  joinBtnText: {
    color: BRAND,
    fontSize: 16,
    fontWeight: '600',
  },
  joinInputGroup: {
    width: '100%',
    gap: 10,
  },
  joinInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: 4,
    width: '100%',
  },
  joinActions: {
    flexDirection: 'row',
    gap: 10,
  },
  joinCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  joinCancelText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  joinConfirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND,
    alignItems: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  joinConfirmText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
