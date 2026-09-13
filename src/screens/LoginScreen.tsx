import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme, Typography, Spacing, PAGE_GUTTER } from '../theme';
import { loginWithPassword } from '../api/auth';
import { fetchStations } from '../api/solar';
import { useApp } from '../context/AppContext';
import { requestNotificationPermissions } from '../services/notifications';
import { Button, Input, Sheet, SheetRowProps, Badge } from '../components/ui';
import {
  SunMedium,
  TriangleAlert,
  Zap,
  Lock,
  Battery,
  ChartColumn,
  Bell,
  House,
  Building2,
  Check,
} from 'lucide-react-native';

interface Station {
  id: string;
  name: string;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { login } = useApp();
  const { colors } = useTheme();

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
      setLoadingStep('Authenticating…');
      const tokens = await loginWithPassword(email.trim(), password);

      setLoadingStep('Finding your station…');
      const stations = await fetchStations(tokens.access_token);

      if (stations.length === 0) {
        setError(
          'No stations found on your account. ' +
          'Make sure your SolarOS account has a registered system.'
        );
        setIsLoading(false);
        return;
      }

      if (stations.length === 1) {
        await completeLogin(tokens, stations[0].id);
      } else {
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

  const stationIcon = (name: string) => {
    if (name.includes('Home')) return <House size={20} color={colors.brand} strokeWidth={2} />;
    if (name.includes('Office')) return <Building2 size={20} color={colors.brand} strokeWidth={2} />;
    return <Zap size={20} color={colors.brand} strokeWidth={2} />;
  };

  const sheetRows: SheetRowProps[] = pendingStations.map((s) => ({
    title: s.name,
    subtitle: `ID: ${s.id}`,
    icon: stationIcon(s.name),
    onPress: () => {
      if (pendingTokens) completeLogin(pendingTokens, s.id);
    },
  }));

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
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
              <View style={[styles.logoGlow, { backgroundColor: 'rgba(245,166,35,0.14)' }]} />
              <SunMedium size={64} color={colors.brand} strokeWidth={1.8} />
            </View>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>SolarGuard</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              Solar Power Cut Detection & Monitoring
            </Text>
          </View>

          {/* Login Card */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface1, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Connect to SolarOS</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Sign in with your SolarOS account credentials
            </Text>

            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              accessibilityLabel="Email address input"
              testID="email-input"
              style={{ marginBottom: Spacing.base }}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              accessibilityLabel="Password input"
              testID="password-input"
            />

            {/* Error */}
            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.dangerFill, borderColor: colors.dangerBorder },
                ]}
              >
                <TriangleAlert size={16} color={colors.dangerText} strokeWidth={2} />
                <Text style={[styles.errorText, { color: colors.dangerText }]}>{error}</Text>
              </View>
            ) : null}

            {/* Connect button */}
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.brand} size="small" />
                <Text style={[styles.loadingStep, { color: colors.textSecondary }]}>{loadingStep}</Text>
              </View>
            ) : (
              <Button
                label="Connect"
                onPress={handleLogin}
                icon={<Zap size={16} color={colors.textInverse} strokeWidth={2} />}
                full
                accessibilityLabel="Connect to SolarOS"
                testID="login-button"
              />
            )}

            <View style={styles.securityRow}>
              <Lock size={11} color={colors.textDisabled} strokeWidth={2} />
              <Text style={[styles.securityNote, { color: colors.textDisabled }]}>
                Password is SHA-256 hashed before transmission and never stored.
              </Text>
            </View>
          </View>

          {/* Feature pills */}
          <View style={styles.features}>
            {[
              { text: 'Outage Alerts', icon: <TriangleAlert size={13} color={colors.brandBright} strokeWidth={2} /> },
              { text: 'Battery Monitor', icon: <Battery size={13} color={colors.brandBright} strokeWidth={2} /> },
              { text: 'Usage Insights', icon: <ChartColumn size={13} color={colors.brandBright} strokeWidth={2} /> },
              { text: 'Instant Push', icon: <Bell size={13} color={colors.brandBright} strokeWidth={2} /> },
            ].map((f) => (
              <View
                key={f.text}
                style={[
                  styles.featurePill,
                  { backgroundColor: colors.glassFill, borderColor: colors.border },
                ]}
              >
                {f.icon}
                <Text style={[styles.featurePillText, { color: colors.textSecondary }]}>{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Station picker sheet */}
      {showPicker && pendingTokens ? (
        <Sheet
          visible={showPicker}
          title="Select Your Station"
          subtitle="Multiple stations found on your account"
          onClose={() => {
            setShowPicker(false);
            setPendingTokens(null);
            setPendingStations([]);
          }}
          rows={sheetRows}
        />
      ) : null}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: PAGE_GUTTER,
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
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: 48,
  },
  appName: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize['4xl'],
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.xl,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize.xl,
    marginBottom: Spacing.xs,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    marginBottom: Spacing.xl,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    flex: 1,
    lineHeight: 17,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    marginTop: Spacing.md,
  },
  loadingStep: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.md,
  },
  securityNote: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing['2xl'],
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  featurePillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
  },
});
