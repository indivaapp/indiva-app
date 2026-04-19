import React, { useState, useEffect, useRef } from 'react';
import { StatusBar, StyleSheet, NativeModules, Platform, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { Colors } from './src/constants/colors';
import RootNavigator from './src/navigation';
import SplashScreen from './src/components/SplashScreen';
import {
  loadVotesCache,
} from './src/services/voteService';
import {
  loadNotificationsCache,
  notificationEmitter,
  NOTIFICATIONS_CHANGED_EVENT,
  getNotificationCount,
} from './src/services/notificationService';
import {
  setupPushNotifications,
  onMessageListener,
  handlePendingNotification,
} from './src/services/pushNotificationService';
import { navigationRef } from './src/navigation/navigationRef';

const { NavigationBar } = NativeModules;

function AppContent() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [notificationCount, setNotificationCount] = useState(0);

  // Sync Android system navigation bar color with app theme
  useEffect(() => {
    if (Platform.OS === 'android' && NavigationBar) {
      NavigationBar.setColor(
        isDark ? Colors.gray900 : Colors.gray50,
        !isDark, // lightIcons = dark icons on light bg
      );
    }
  }, [isDark]);

  useEffect(() => {
    // Load caches, then hide splash
    Promise.all([loadVotesCache(), loadNotificationsCache()]).finally(() => {
      setNotificationCount(getNotificationCount());
      setTimeout(() => {
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setSplashVisible(false));
      }, 1400);
    });

    // Push notifications
    setupPushNotifications();
    const unsubFCM = onMessageListener(() => {
      setNotificationCount(getNotificationCount());
    });

    // Listen for notification changes
    const onChanged = () => setNotificationCount(getNotificationCount());
    notificationEmitter.on(NOTIFICATIONS_CHANGED_EVENT, onChanged);

    return () => {
      unsubFCM();
      notificationEmitter.off(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NavigationContainer ref={navigationRef} onReady={handlePendingNotification}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? Colors.gray900 : Colors.white}
      />
      <RootNavigator notificationCount={notificationCount} />
      {splashVisible && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]}>
          <SplashScreen />
        </Animated.View>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
