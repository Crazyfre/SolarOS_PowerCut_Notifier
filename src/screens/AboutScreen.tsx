import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import packageJson from '../../package.json';

type RootStackParamList = {
  About: undefined;
};
type NavigationProp = StackNavigationProp<RootStackParamList, 'About'>;

export function AboutScreen() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>About</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Content Card */}
        <View style={styles.card}>
          <Text style={styles.appTitle}>SolarGuard</Text>
          <Text style={styles.appVersion}>Version {packageJson.version}</Text>

          <View style={styles.divider} />

          <Text style={styles.description}>
            Independent companion application for SolarOS systems.
          </Text>

          <Text style={styles.disclaimer}>
            Not affiliated with or endorsed by SolarOS.
          </Text>

          <Text style={styles.legalNotes}>
            This project is intended for educational and personal use. Users are responsible for ensuring that their use of SolarGuard complies with the terms applicable to their SolarOS accounts.
          </Text>
        </View>

        {/* Links Card */}
        <View style={styles.linksCard}>
          <TouchableOpacity 
            style={styles.linkRow} 
            onPress={() => Linking.openURL('https://github.com/Crazyfre/SolarOS_PowerCut_Notifier').catch(() => {})}
          >
            <Text style={styles.linkText}>GitHub Repository</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity 
            style={styles.linkRow} 
            onPress={() => Linking.openURL('https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/blob/master/PRIVACY.md').catch(() => {})}
          >
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity 
            style={styles.linkRow} 
            onPress={() => Linking.openURL('https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/blob/master/LICENSE').catch(() => {})}
          >
            <Text style={styles.linkText}>Licenses</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  backButton: {
    padding: Spacing.xs,
  },
  backButtonText: {
    fontSize: 24,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.bold,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  appTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['3xl'],
    color: Colors.amberLight,
    marginBottom: Spacing.xs,
  },
  appVersion: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.divider,
    marginBottom: Spacing.lg,
  },
  description: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  disclaimer: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  legalNotes: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  linksCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  linkText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  linkArrow: {
    fontSize: Typography.fontSize.base,
    color: Colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
  },
});
