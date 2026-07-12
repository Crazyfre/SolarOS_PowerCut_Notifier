import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View, StyleSheet, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';

import { AppContextProvider, useApp } from './src/context/AppContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { Colors, Typography, Spacing } from './src/theme';
import { LayoutDashboard, History, ChartColumn, SunMedium } from 'lucide-react-native';

// Import background task definition so it registers at module load
import './src/services/foregroundService';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ icon, focused }: { icon: React.ReactNode; focused: boolean }) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      {icon}
    </View>
  );
}

const tabNames = ['Dashboard', 'History', 'Analytics'];

const getActiveRouteName = (navState: any): string => {
  if (!navState) return 'Dashboard';
  const route = navState.routes[navState.index];
  if (route.state) {
    return getActiveRouteName(route.state);
  }
  return route.name;
};

const screenHeight = Dimensions.get('window').height;
const headerHeight = 90; // Ignore swipes in top 90px header
const footerHeight = 90; // Ignore swipes in bottom 90px tab bar

function MainTabs() {
  const navigation = useNavigation<any>();

  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onEnd((event) => {
      // Ignore top header and bottom footer
      if (event.y < headerHeight || event.y > screenHeight - footerHeight) {
        return;
      }

      const threshold = 60; // minimum translation to switch tabs
      if (event.translationX > threshold) {
        // Swipe right (finger moves left-to-right) -> Previous screen (idx - 1)
        const state = navigation.getState();
        const activeName = getActiveRouteName(state);
        const idx = tabNames.indexOf(activeName);
        if (idx > 0) {
          navigation.navigate('MainTabs', { screen: tabNames[idx - 1] });
        }
      } else if (event.translationX < -threshold) {
        // Swipe left (finger moves right-to-left) -> Next screen (idx + 1)
        const state = navigation.getState();
        const activeName = getActiveRouteName(state);
        const idx = tabNames.indexOf(activeName);
        if (idx !== -1 && idx < tabNames.length - 1) {
          navigation.navigate('MainTabs', { screen: tabNames[idx + 1] });
        }
      }
    });

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={{ flex: 1 }}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: Colors.amber,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarShowLabel: true,
            tabBarLabelStyle: styles.tabBarLabel,
            freezeOnBlur: true,
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  icon={<LayoutDashboard size={20} color={focused ? Colors.amber : Colors.textMuted} />}
                  focused={focused}
                />
              ),
              tabBarLabel: 'Dashboard',
            }}
          />
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  icon={<History size={20} color={focused ? Colors.amber : Colors.textMuted} />}
                  focused={focused}
                />
              ),
              tabBarLabel: 'History',
            }}
          />
          <Tab.Screen
            name="Analytics"
            component={AnalyticsScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  icon={<ChartColumn size={20} color={focused ? Colors.amber : Colors.textMuted} />}
                  focused={focused}
                />
              ),
              tabBarLabel: 'Analytics',
            }}
          />
        </Tab.Navigator>
      </View>
    </GestureDetector>
  );
}

function AppNavigator() {
  const { isLoggedIn, isAuthLoading, settings } = useApp();

  if (isAuthLoading) {
    return (
      <View style={styles.splashContainer}>
        <SunMedium size={72} color={Colors.amber} style={{ marginBottom: Spacing.base }} />
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
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'android' ? 'none' : 'default',
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContextProvider>
          <AppNavigator />
        </AppContextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
    paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
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
