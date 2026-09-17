import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, ToastAndroid, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, Typography, Spacing, PAGE_GUTTER } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import packageJson from '../../package.json';
import { ScreenHeader, HeaderAction, Card, SectionHeader, Badge } from '../components/ui';
import { ArrowLeft, ChevronRight, GitBranch, ShieldCheck, Scale, SunMedium } from 'lucide-react-native';

type RootStackParamList = {
  About: undefined;
};
type NavigationProp = StackNavigationProp<RootStackParamList, 'About'>;

export function AboutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  // Refs, not state: every tap reads the true current count immediately —
  // no stale-closure race across rapid taps (setState in the old async
  // handler re-read the same tapCount and stalled the unlock).
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  const handleVersionTap = async () => {
    const now = Date.now();

    // Reset the streak if the previous tap was > 3s ago
    if (now - lastTapTimeRef.current > 3000) {
      tapCountRef.current = 0;
    }
    lastTapTimeRef.current = now;
    tapCountRef.current += 1;
    const newCount = tapCountRef.current;

    if (newCount >= 7) {
      tapCountRef.current = 0;
      const wasUnlocked = (await AsyncStorage.getItem('sg_dev_options_unlocked')) === 'true';
      const willUnlock = !wasUnlocked;
      await AsyncStorage.setItem('sg_dev_options_unlocked', willUnlock ? 'true' : 'false');
      const msg = willUnlock ? 'You are now a developer!' : 'Developer mode disabled.';
      if (Platform.OS === 'android') {
        ToastAndroid.show(msg, ToastAndroid.LONG);
      } else {
        Alert.alert(willUnlock ? 'Success' : 'Developer Mode', msg);
      }
      return;
    }

    if (newCount >= 3) {
      const steps = 7 - newCount;
      const msg = `You are now ${steps} step${steps > 1 ? 's' : ''} away from being a developer.`;
      if (Platform.OS === 'android') {
        ToastAndroid.show(msg, ToastAndroid.SHORT);
      }
    }
  };

  const links = [
    {
      label: 'GitHub Repository',
      icon: <GitBranch size={18} color={colors.textSecondary} strokeWidth={2} />,
      url: 'https://github.com/Crazyfre/SolarOS_PowerCut_Notifier',
    },
    {
      label: 'Privacy Policy',
      icon: <ShieldCheck size={18} color={colors.textSecondary} strokeWidth={2} />,
      url: 'https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/blob/master/PRIVACY.md',
    },
    {
      label: 'Licenses',
      icon: <Scale size={18} color={colors.textSecondary} strokeWidth={2} />,
      url: 'https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/blob/master/LICENSE',
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="About"
        left={
          <HeaderAction
            onPress={() => navigation.goBack()}
            icon={<ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />}
            accessibilityLabel="Go back"
          />
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <Card style={styles.identityCard}>
          <View style={styles.logoRow}>
            <SunMedium size={28} color={colors.brand} strokeWidth={2} />
            <Text style={[styles.appTitle, { color: colors.textPrimary }]}>SolarGuard</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={handleVersionTap} accessibilityLabel="App version">
            <Text style={[styles.appVersion, { color: colors.textSecondary }]}>
              Version {packageJson.version}
            </Text>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <Text style={[styles.description, { color: colors.textPrimary }]}>
            Independent companion application for SolarOS systems.
          </Text>

          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
            Not affiliated with or endorsed by SolarOS.
          </Text>

          <Text style={[styles.legalNotes, { color: colors.textDisabled }]}>
            This project is intended for educational and personal use. Users are responsible for ensuring that their use of SolarGuard complies with the terms applicable to their SolarOS accounts.
          </Text>
        </Card>

        {/* Links card */}
        <SectionHeader title="Resources" />
        <Card style={styles.linksCard}>
          {links.map((link, i) => (
            <React.Fragment key={link.label}>
              {i > 0 ? <View style={[styles.linkDivider, { backgroundColor: colors.divider }]} /> : null}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL(link.url).catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel={link.label}
              >
                {link.icon}
                <Text style={[styles.linkText, { color: colors.textPrimary }]}>{link.label}</Text>
                <ChevronRight size={16} color={colors.textDisabled} strokeWidth={2} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </Card>

        <View style={styles.footer}>
          <Badge label={`v${packageJson.version}`} tone="neutral" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: PAGE_GUTTER,
    paddingBottom: Spacing['4xl'],
  },
  identityCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  appTitle: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize['2xl'],
    letterSpacing: -0.5,
  },
  appVersion: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  divider: {
    width: '100%',
    height: 1,
    marginBottom: Spacing.lg,
  },
  description: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  disclaimer: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  legalNotes: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  linksCard: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 52,
  },
  linkText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    flex: 1,
  },
  linkDivider: {
    height: 1,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
});
