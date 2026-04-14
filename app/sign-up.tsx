import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import BlobBackground from '@/components/blob-background';
import { BG, ERROR, F, GLASS, GREEN, INPUT, T } from '@/constants/design';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSignUp() {
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error, needsConfirmation } = await signUp(email, password, name);
    setLoading(false);
    if (error) {
      setError(error);
    } else if (needsConfirmation) {
      setConfirming(true);
    }
  }

  if (confirming) {
    return (
      <SafeAreaView style={styles.container}>
        <BlobBackground />
        <View style={styles.confirmContainer}>
          <View style={styles.confirmIconWrapper}>
            <Text style={styles.confirmIcon}>✉️</Text>
          </View>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmSubtitle}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.confirmEmail}>{email}</Text>
          </Text>
          <TouchableOpacity style={[styles.primaryButton, styles.confirmButton]} onPress={() => router.replace('/')}>
            <Text style={styles.primaryButtonText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <BlobBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} disabled={loading}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join and start splitting bills instantly</Text>
          </View>

          {/* Glass form card */}
          <View style={styles.glassCard}>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Jane Doe"
                placeholderTextColor={T.placeholder}
                autoCapitalize="words"
                returnKeyType="next"
                editable={!loading}
                testID="name-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={T.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!loading}
                testID="email-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={T.placeholder}
                secureTextEntry
                returnKeyType="next"
                editable={!loading}
                testID="password-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your password"
                placeholderTextColor={T.placeholder}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                editable={!loading}
                testID="confirm-password-input"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleSignUp}
              activeOpacity={0.85}
              disabled={loading}
              testID="sign-up-button"
            >
              {loading
                ? <ActivityIndicator color={BG} />
                : <Text style={styles.primaryButtonText}>Create Account</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()} disabled={loading}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
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
    marginBottom: 28,
  },
  backArrow: {
    fontSize: 18,
    color: T.primary,
    lineHeight: 22,
    fontFamily: F.medium,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 30,
    fontFamily: F.bold,
    color: T.primary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: F.regular,
    color: T.secondary,
  },
  glassCard: {
    backgroundColor: GLASS.bg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: GLASS.border,
    padding: 24,
    gap: 16,
    marginBottom: 28,
  },
  errorBox: {
    backgroundColor: ERROR.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ERROR.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    color: ERROR.text,
    fontSize: 13,
    fontFamily: F.regular,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontFamily: F.medium,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: INPUT.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: INPUT.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: F.regular,
    color: T.primary,
  },
  primaryButton: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: BG,
    fontSize: 16,
    fontFamily: F.bold,
    letterSpacing: 0.4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontFamily: F.regular,
    color: 'rgba(255,255,255,0.45)',
  },
  linkText: {
    fontSize: 14,
    fontFamily: F.semiBold,
    color: GREEN,
  },
  // Confirmation screen
  confirmContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  confirmIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  confirmIcon: {
    fontSize: 36,
  },
  confirmTitle: {
    fontSize: 24,
    fontFamily: F.bold,
    color: T.primary,
    letterSpacing: -0.3,
  },
  confirmSubtitle: {
    fontSize: 15,
    fontFamily: F.regular,
    color: T.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  confirmEmail: {
    color: GREEN,
    fontFamily: F.semiBold,
  },
  confirmButton: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
});
