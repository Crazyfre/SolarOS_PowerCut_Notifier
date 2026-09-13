import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View, StyleSheet, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { useFonts } from 'expo-font';

import { AppContextProvider, useApp } from './src/context/AppContext';
import { ThemeProvider, useTheme, FontResources, Typography } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { LayoutDashboard, History, ChartColumn, SunMedium } from 'lucide-react-native';

// Import background task definitions so they register at module load
import './src/services/foregroundService';
// Headless geofence ENTER/EXIT + remote background-fetch poll task definitions
import './src/services/geofenceTasks';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

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
  const { colors } = useTheme();

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
        const state = navigation.getState();
        const activeName = getActiveRouteName(state);
        const idx = tabNames.indexOf(activeName);
        if (idx > 0) {
          navigation.navigate('MainTabs', { screen: tabNames[idx - 1] });
        }
      } else if (event.translationX < -threshold) {
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
            tabBarStyle: [styles.tabBar, { backgroundColor: colors.background, borderTopColor: colors.divider }],
            tabBarActiveTintColor: colors.brand,
            tabBarInactiveTintColor: colors.textDisabled,
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
                <View style={styles.tabIconWrap}>
                  {focused && <View style={[styles.tabIndicator, { backgroundColor: colors.brand }]} />}
                  <LayoutDashboard size={20} color={focused ? colors.brand : colors.textDisabled} />
                </View>
              ),
              tabBarLabel: 'Dashboard',
            }}
          />
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <View style={styles.tabIconWrap}>
                  {focused && <View style={[styles.tabIndicator, { backgroundColor: colors.brand }]} />}
                  <History size={20} color={focused ? colors.brand : colors.textDisabled} />
                </View>
              ),
              tabBarLabel: 'History',
            }}
          />
          <Tab.Screen
            name="Analytics"
            component={AnalyticsScreen}
            options={{
              tabBarIcon: ({ focused }) => (
                <View style={styles.tabIconWrap}>
                  {focused && <View style={[styles.tabIndicator, { backgroundColor: colors.brand }]} />}
                  <ChartColumn size={20} color={focused ? colors.brand : colors.textDisabled} />
                </View>
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
  const { isLoggedIn, isAuthLoading } = useApp();
  const { colors } = useTheme();

  if (isAuthLoading) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: colors.background }]}>
        <SunMedium size={72} color={colors.brand} style={{ marginBottom: 16 }} />
        <Text style={[styles.splashTitle, { color: colors.textPrimary }]}>SolarGuard</Text>
        <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.brand,
          background: colors.background,
          card: colors.surface1,
          text: colors.textPrimary,
          border: colors.divider,
          notification: colors.danger,
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
  // Fonts gate the whole tree — no silent system-font fallbacks
  const [fontsLoaded] = useFonts(FontResources);

  if (!fontsLoaded) {
    return (
      <View style={styles.splashContainer}>
        <SunMedium size={72} color="#F5A623" style={{ marginBottom: 16 }} />
        <Text style={styles.splashTitle}>SolarGuard</Text>
        <ActivityIndicator color="#F5A623" size="large" style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContextProvider>
          <ThemeProvider>
            <AppNavigator />
          </ThemeProvider>
        </AppContextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0B0F1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    fontFamily: 'Grotesk-Bold',
    fontSize: 36,
    color: '#F2F5FA',
    letterSpacing: -1,
  },
  tabBar: {
    borderTopWidth: 1,
    paddingTop: 8,
    height: 60,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  tabBarLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    marginTop: 2,
  },
  tabIconWrap: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Instrument-panel indicator bar over the active tab
  tabIndicator: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 2.5,
    borderRadius: 2,
  },
});
