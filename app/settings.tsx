import { useState } from 'react';
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
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { BG, ERROR, F, GLASS, GREEN, INPUT, T, WARN } from '@/constants/design';

function initialsOf(name: string | undefined, email: string | undefined) {
  const source = (name && name.trim()) || (email ?? '');
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return letters.toUpperCase() || '?';
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? '';
  const email = user?.email ?? '';
  const isVerified = !!user?.email_confirmed_at;
  const initialVenmo = (user?.user_metadata?.venmo_username as string | undefined) ?? '';

  const [venmo, setVenmo] = useState(initialVenmo);
  const [savingVenmo, setSavingVenmo] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [resending, setResending] = useState(false);

  const venmoDirty = venmo.trim() !== initialVenmo.trim();

  async function handleSaveVenmo() {
    const cleaned = venmo.trim().replace(/^@/, '');
    setSavingVenmo(true);
    const { error } = await supabase.auth.updateUser({
      data: { venmo_username: cleaned },
    });
    setSavingVenmo(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setVenmo(cleaned);
    Alert.alert('Saved', 'Your Venmo username has been updated.');
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords don’t match', 'Check both fields and try again.');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      Alert.alert('Could not update password', error.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password updated', 'Your password has been changed.');
  }

  async function handleResendVerification() {
    if (!email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    Alert.alert('Email sent', `We sent a verification link to ${email}.`);
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile summary */}
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(fullName, email)}</Text>
            </View>
            <Text style={styles.profileName}>{fullName || email.split('@')[0]}</Text>
            <Text style={styles.profileEmail}>{email}</Text>
          </View>

          {/* Email verification */}
          <Text style={styles.sectionLabel}>Email</Text>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Verification status</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{email}</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  isVerified ? styles.badgeOk : styles.badgeWarn,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: isVerified ? GREEN : WARN.text },
                  ]}
                >
                  {isVerified ? 'Verified' : 'Not verified'}
                </Text>
              </View>
            </View>
            {!isVerified && (
              <TouchableOpacity
                style={[styles.secondaryButton, resending && { opacity: 0.6 }]}
                onPress={handleResendVerification}
                disabled={resending}
                activeOpacity={0.85}
              >
                {resending ? (
                  <ActivityIndicator color={T.primary} size="small" />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Resend verification email
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Venmo */}
          <Text style={styles.sectionLabel}>Payments</Text>
          <View style={styles.card}>
            <Text style={styles.rowTitle}>Venmo username</Text>
            <Text style={styles.helperText}>
              Used so friends can pay you back for their items.
            </Text>
            <View style={styles.venmoInputWrap}>
              <Text style={styles.venmoAt}>@</Text>
              <TextInput
                style={styles.venmoInput}
                value={venmo}
                onChangeText={(v) => setVenmo(v.replace(/^@/, ''))}
                placeholder="your-venmo"
                placeholderTextColor={T.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!venmoDirty || savingVenmo) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSaveVenmo}
              disabled={!venmoDirty || savingVenmo}
              activeOpacity={0.85}
            >
              {savingVenmo ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={styles.primaryButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Password */}
          <Text style={styles.sectionLabel}>Security</Text>
          <View style={styles.card}>
            <Text style={styles.rowTitle}>Change password</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={T.placeholder}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm new password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor={T.placeholder}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (savingPassword || !newPassword || !confirmPassword) &&
                  styles.primaryButtonDisabled,
              ]}
              onPress={handleChangePassword}
              disabled={savingPassword || !newPassword || !confirmPassword}
              activeOpacity={0.85}
            >
              {savingPassword ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={styles.primaryButtonText}>Update password</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Sign out */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.85}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  backArrow: {
    fontSize: 18,
    color: T.primary,
    fontFamily: F.medium,
    lineHeight: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: F.bold,
    color: T.primary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 12,
  },

  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
    borderRadius: 20,
    marginBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 26,
    fontFamily: F.bold,
    color: BG,
    letterSpacing: 0.5,
  },
  profileName: {
    fontSize: 18,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: F.regular,
    color: T.muted,
    marginTop: 2,
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: F.semiBold,
    color: T.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.border,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: F.semiBold,
    color: T.primary,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: F.regular,
    color: T.muted,
    marginTop: 2,
  },
  helperText: {
    fontSize: 13,
    fontFamily: F.regular,
    color: T.secondary,
    marginTop: -4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: 'rgba(0,232,150,0.12)',
    borderColor: 'rgba(0,232,150,0.35)',
  },
  badgeWarn: {
    backgroundColor: WARN.bg,
    borderColor: WARN.border,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: F.semiBold,
    letterSpacing: 0.3,
  },

  inputGroup: { gap: 6 },
  label: {
    fontSize: 11,
    fontFamily: F.medium,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: INPUT.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: INPUT.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: F.regular,
    color: T.primary,
  },
  venmoInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: INPUT.border,
    paddingHorizontal: 14,
  },
  venmoAt: {
    fontSize: 16,
    fontFamily: F.semiBold,
    color: T.muted,
    marginRight: 4,
  },
  venmoInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: F.regular,
    color: T.primary,
  },

  primaryButton: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: BG,
    fontSize: 15,
    fontFamily: F.bold,
    letterSpacing: 0.3,
  },
  secondaryButton: {
    backgroundColor: GLASS.bgStrong,
    borderWidth: 1,
    borderColor: GLASS.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: T.primary,
    fontSize: 14,
    fontFamily: F.semiBold,
  },

  signOutButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: ERROR.bg,
    borderWidth: 1,
    borderColor: ERROR.border,
  },
  signOutText: {
    color: ERROR.text,
    fontSize: 15,
    fontFamily: F.semiBold,
    letterSpacing: 0.3,
  },
});
