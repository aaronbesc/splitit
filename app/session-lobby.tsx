import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-native-qrcode-svg';
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
  Session,
  SessionParticipant,
  getParticipants,
  getSession,
  updateSessionStatus,
} from '@/services/sessionService';

const BRAND = '#5B6AF4';

export default function SessionLobbyScreen() {
  const { sessionId, isHost } = useLocalSearchParams<{ sessionId: string; isHost: string }>();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [loading, setLoading] = useState(true);

  const participantsRef = useRef<SessionParticipant[]>([]);
  participantsRef.current = participants;

  useEffect(() => {
    if (!sessionId) return;

    Promise.all([getSession(sessionId), getParticipants(sessionId)]).then(
      ([sessionRes, participantsRes]) => {
        if (sessionRes.session) setSession(sessionRes.session);
        if (participantsRes.participants) setParticipants(participantsRes.participants);
        setLoading(false);
      }
    );

    // Subscribe to new participants joining
    const participantsChannel = supabase
      .channel(`session-lobby-participants-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newParticipant = payload.new as SessionParticipant;
          setParticipants((prev) => {
            if (prev.some((p) => p.user_id === newParticipant.user_id)) return prev;
            return [...prev, newParticipant];
          });
        }
      )
      .subscribe();

    // Subscribe to session status changes
    const sessionChannel = supabase
      .channel(`session-lobby-status-${sessionId}`)
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
          if (updated.status === 'active') {
            router.replace({ pathname: '/session-claim', params: { sessionId } });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId]);

  async function handleStartSplitting() {
    if (!sessionId) return;
    setIsStarting(true);
    const { error } = await updateSessionStatus(sessionId, 'active');
    if (error) {
      Alert.alert('Error', error);
      setIsStarting(false);
    }
    // Navigation handled by Realtime listener
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={BRAND} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split Session</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Join Code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Share this code</Text>
          <Text style={styles.codeValue}>{session?.join_code ?? '------'}</Text>
          <Text style={styles.codeHint}>Others can enter this code on the home screen to join</Text>
        </View>

        {/* QR Code */}
        {sessionId && (
          <View style={styles.qrContainer}>
            <QRCode
              value={`splitit://join/${sessionId}`}
              size={200}
              color="#1C1C1E"
              backgroundColor="#FFFFFF"
            />
          </View>
        )}

        {/* Participants */}
        <View style={styles.participantsSection}>
          <Text style={styles.participantsTitle}>
            {participants.length} {participants.length === 1 ? 'person' : 'people'} in lobby
          </Text>
          <View style={styles.chipRow}>
            {participants.map((p) => (
              <View key={p.user_id} style={styles.chip}>
                <Text style={styles.chipText}>{p.display_name}</Text>
              </View>
            ))}
          </View>
        </View>

        {isHost === 'true' && (
          <TouchableOpacity
            style={[styles.startBtn, isStarting && styles.startBtnDisabled]}
            onPress={handleStartSplitting}
            disabled={isStarting}
            activeOpacity={0.85}
          >
            {isStarting
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.startBtnText}>Start Splitting</Text>
            }
          </TouchableOpacity>
        )}

        {isHost !== 'true' && (
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={BRAND} />
            <Text style={styles.waitingText}>Waiting for host to start…</Text>
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
  content: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  codeCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  codeValue: {
    fontSize: 42,
    fontWeight: '800',
    color: BRAND,
    letterSpacing: 6,
    marginBottom: 10,
  },
  codeHint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  qrContainer: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  participantsSection: {
    width: '100%',
    marginBottom: 32,
  },
  participantsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 14,
    color: BRAND,
    fontWeight: '600',
  },
  startBtn: {
    backgroundColor: BRAND,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnDisabled: {
    opacity: 0.6,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waitingText: {
    fontSize: 15,
    color: '#6B7280',
  },
});
