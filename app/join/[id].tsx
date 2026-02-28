import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { joinSession } from '@/services/sessionService';

const BRAND = '#5B6AF4';

export default function JoinSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.replace('/');
      return;
    }
    if (!id) {
      router.replace('/(tabs)');
      return;
    }

    const displayName =
      user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Guest';

    joinSession(id, user.id, displayName).then(({ error }) => {
      if (error) {
        Alert.alert('Join Failed', error);
        router.replace('/(tabs)');
        return;
      }
      router.replace({ pathname: '/session-lobby', params: { sessionId: id, isHost: 'false' } });
    });
  }, [id, user]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={styles.text}>Joining session…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
});
