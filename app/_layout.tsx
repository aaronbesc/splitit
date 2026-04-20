import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';

export const unstable_settings = {
  anchor: 'index',
};

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = pathname === '/' || pathname === '/sign-up' || pathname === '/forgot-password';
    if (session && onAuthScreen) {
      router.replace('/(tabs)');
    } else if (!session && !onAuthScreen) {
      router.replace('/');
    }
  }, [session, loading, pathname, router]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="receipt-review" options={{ headerShown: false }} />
      <Stack.Screen name="session-lobby" options={{ headerShown: false }} />
      <Stack.Screen name="session-claim" options={{ headerShown: false }} />
      <Stack.Screen name="session-summary" options={{ headerShown: false }} />
      <Stack.Screen name="join/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="debts" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  return (
    <AuthProvider>
      <ThemeProvider value={DarkTheme}>
        <RootLayoutNav />
        <StatusBar style="light" />
      </ThemeProvider>
    </AuthProvider>
  );
}
