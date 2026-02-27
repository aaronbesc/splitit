import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: 'index',
};

// Handles redirecting between auth screens and main app based on session state
function RootLayoutNav() {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Auth screens are the root sign-in (/) and sign-up (/sign-up).
    // usePathname is used instead of useSegments because the root index route
    // produces an empty segments array (segments[0] === undefined), not 'index'.
    const onAuthScreen = pathname === '/' || pathname === '/sign-up';
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="receipt-review" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootLayoutNav />
        <StatusBar style="dark" />
      </ThemeProvider>
    </AuthProvider>
  );
}
