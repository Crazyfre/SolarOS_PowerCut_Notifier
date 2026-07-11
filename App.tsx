import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppContextProvider, useApp } from './src/context/AppContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { Colors, Typography, Spacing } from './src/theme';

// Import background task definition so it registers at module load
import './src/services/backgroundFetch';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      <Text style={[tabStyles.icon, focused && tabStyles.iconActive]}>{icon}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.amber,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="⚡" focused={focused} />,
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} />,
          tabBarLabel: 'History',
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
          tabBarLabel: 'Analytics',
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { isLoggedIn, isAuthLoading, settings } = useApp();

  if (isAuthLoading) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashIcon}>☀️</Text>
        <Text style={styles.splashTitle}>SolarGuard</Text>
        <ActivityIndicator
          color={Colors.amber}
          size="large"
          style={{ marginTop: Spacing.lg }}
        />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  const isAmoled = settings?.amoledTheme ?? false;

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: Colors.amber,
          background: isAmoled ? '#000000' : Colors.background,
          card: isAmoled ? '#000000' : Colors.surface,
          text: Colors.textPrimary,
          border: Colors.divider,
          notification: Colors.danger,
        },
        fonts: {
          regular: { fontFamily: Typography.fontFamily.regular, fontWeight: 'normal' },
          medium: { fontFamily: Typography.fontFamily.medium, fontWeight: '500' },
          bold: { fontFamily: Typography.fontFamily.bold, fontWeight: '700' },
          heavy: { fontFamily: Typography.fontFamily.bold, fontWeight: '900' },
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContextProvider>
        <AppNavigator />
      </AppContextProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIcon: {
    fontSize: 72,
    marginBottom: Spacing.base,
  },
  splashTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['4xl'],
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.divider,
    borderTopWidth: 1,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    height: 60,
  },
  tabBarLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    marginTop: 2,
  },
});

const tabStyles = StyleSheet.create({
  iconWrap: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.amberGlow,
  },
  icon: {
    fontSize: 20,
  },
  iconActive: {
    // Active icons appear brighter via the container glow
  },
});
