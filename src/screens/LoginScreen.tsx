import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { loginWithPassword } from '../api/auth';
import { fetchStations } from '../api/solar';
import { useApp } from '../context/AppContext';
import { requestNotificationPermissions } from '../services/notifications';
import { registerBackgroundFetch } from '../services/backgroundFetch';

interface Station {
  id: string;
  name: string;
}

// ─── Station Picker Modal ─────────────────────────────────────────────────────

function StationPickerModal({
  stations,
  onSelect,
  onCancel,
}: {
  stations: Station[];
  onSelect: (station: Station) => void;
  onCancel: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.sheet}>
          <Text style={pickerStyles.title}>Select Your Station</Text>
          <Text style={pickerStyles.subtitle}>
            Multiple stations found on your account
          </Text>
          <FlatList
            data={stations}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={pickerStyles.stationItem}
                onPress={() => onSelect(item)}
                accessibilityLabel={`Select station ${item.name}`}
              >
                <Text style={pickerStyles.stationName}>{item.name}</Text>
                <Text style={pickerStyles.stationId}>ID: {item.id}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={pickerStyles.separator} />}
          />
          <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onCancel}>
            <Text style={pickerStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { login } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Station picker state
  const [pendingStations, setPendingStations] = useState<Station[]>([]);
  const [pendingTokens, setPendingTokens] = useState<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // ─── Complete login after station is selected ────────────────────────────

  const completeLogin = async (
    tokens: NonNullable<typeof pendingTokens>,
    stationId: string
  ) => {
    setShowPicker(false);
    setLoadingStep('Setting up…');

    await requestNotificationPermissions();
    await registerBackgroundFetch();
    await login(tokens, stationId, email.trim());
  };

  // ─── Main login handler ──────────────────────────────────────────────────

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Authenticate
      setLoadingStep('Authenticating…');
      const tokens = await loginWithPassword(email.trim(), password);

      // Step 2: Discover stations via confirmed endpoint
      setLoadingStep('Finding your station…');
      const stations = await fetchStations();

      if (stations.length === 0) {
        setError(
          'No stations found on your account. ' +
          'Make sure your SolarOS account has a registered system.'
        );
        setIsLoading(false);
        return;
      }

      if (stations.length === 1) {
        // Only one station — proceed automatically
        await completeLogin(tokens, stations[0].id);
      } else {
        // Multiple stations — show picker
        setPendingTokens(tokens);
        setPendingStations(stations);
        setIsLoading(false);
        setShowPicker(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.toLowerCase().includes('password')) {
        setError('Incorrect email or password.');
      } else if (msg.includes('Network') || msg.includes('ECONNREFUSED')) {
        setError('Network error. Check your internet connection.');
      } else if (msg === 'AUTH_REQUIRED') {
        setError('Session expired. Please try again.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Header */}
          <View style={styles.heroSection}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoIcon}>☀️</Text>
              <View style={styles.logoGlow} />
            </View>
            <Text style={styles.appName}>SolarGuard</Text>
            <Text style={styles.tagline}>Solar Power Cut Detection & Monitoring</Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connect to SolarOS</Text>
            <Text style={styles.cardSubtitle}>
              Sign in with your SolarOS account credentials
            </Text>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                accessibilityLabel="Email address input"
                testID="email-input"
              />
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                accessibilityLabel="Password input"
                testID="password-input"
              />
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            {/* Connect button */}
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
              accessibilityLabel="Connect to SolarOS"
              testID="login-button"
            >
              {isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={Colors.textInverse} size="small" />
                  <Text style={[styles.buttonText, { marginLeft: Spacing.sm }]}>
                    {loadingStep}
                  </Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Connect ⚡</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.securityNote}>
              🔒 Your password is SHA-256 hashed before transmission and never stored.
            </Text>
          </View>

          {/* Feature pills */}
          <View style={styles.features}>
            {[
              '⚡ Outage Alerts',
              '🔋 Battery Monitor',
              '📊 Usage Insights',
              '🔔 Instant Push',
            ].map((f) => (
              <View key={f} style={styles.featurePill}>
                <Text style={styles.featurePillText}>{f}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Station picker modal */}
      {showPicker && pendingTokens && (
        <StationPickerModal
          stations={pendingStations}
          onSelect={(station) => completeLogin(pendingTokens, station.id)}
          onCancel={() => {
            setShowPicker(false);
            setPendingTokens(null);
            setPendingStations([]);
          }}
        />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.glassBorder,
    padding: Spacing['2xl'],
    paddingBottom: Spacing['3xl'],
    maxHeight: '60%',
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  stationItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  stationName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  stationId: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  cancelBtn: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  cancelText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['3xl'],
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  logoContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  logoIcon: {
    fontSize: 72,
  },
  logoGlow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: Colors.amberGlow,
    borderRadius: 999,
    zIndex: -1,
  },
  appName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['4xl'],
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing['2xl'],
    ...Shadows.card,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.base,
  },
  inputLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  errorBox: {
    backgroundColor: Colors.dangerGlow,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.dangerLight,
  },
  button: {
    backgroundColor: Colors.amber,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
    ...Shadows.amber,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
  securityNote: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing['2xl'],
  },
  featurePill: {
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  featurePillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
