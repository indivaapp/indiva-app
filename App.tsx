import React, { useState, useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
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
} from './src/services/pushNotificationService';

function AppContent() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [showSplash, setShowSplash] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    // Load caches, then hide splash
    Promise.all([loadVotesCache(), loadNotificationsCache()]).finally(() => {
      setNotificationCount(getNotificationCount());
      setTimeout(() => setShowSplash(false), 1400);
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
    <NavigationContainer>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? Colors.gray900 : Colors.white}
      />
      {showSplash ? (
        <SplashScreen />
      ) : (
        <RootNavigator notificationCount={notificationCount} />
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
