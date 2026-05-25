import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { StatusBar, StyleSheet, NativeModules, Platform, Animated, Alert } from 'react-native';

// Global JS hata yakalayıcı — uygulamanın sessizce kapanmasını önler
const prevHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal && __DEV__) {
    // Sadece geliştirme modunda detay göster
    Alert.alert(
      'Uygulama Hatası (DEV)',
      `${error.name}: ${error.message}\n\n${error.stack?.slice(0, 400)}`,
      [{ text: 'Tamam' }],
    );
  }
  prevHandler?.(error, isFatal);
});
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { Colors } from './src/constants/colors';
import RootNavigator from './src/navigation';
import SplashScreen from './src/components/SplashScreen';
import MobileAds, { TestIds } from 'react-native-google-mobile-ads';
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

// ─── Ads Ready Context ────────────────────────────────────────────────────────
// NativeAdCard ve diğer reklam bileşenleri bu context'i okur.
// initialize() tamamlanmadan önce reklam isteği atılmasını engeller.
export const AdsReadyContext = createContext(false);
export function useAdsReady() { return useContext(AdsReadyContext); }

function AppContent() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [notificationCount, setNotificationCount] = useState(0);
  const [adsReady, setAdsReady] = useState(false);

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
    // Hash almak için: adb logcat | grep "Use RequestConfiguration"
    // Çıkan satırdaki hex string'i TEST_DEVICE_HASH'a ekle
    // TEST BUILD: cihaz hash'i her zaman dahil — release'de de test reklamları gelir.
    // Üretim sürümünde __DEV__ koşuluna geri döndürülecek.
    const TEST_DEVICE_HASHES: string[] = ['EMULATOR', '03731AD40F3E5BDD714AD4BDB10BE0F4'];
    MobileAds()
      .setRequestConfiguration({ testDeviceIdentifiers: TEST_DEVICE_HASHES })
      .then(() => MobileAds().initialize())
      .then(() => {
        // initialize() garantili tamamlandıktan sonra işaretle.
        // Reklam bileşenleri bu flag'i bekler — race condition'ı engeller.
        setAdsReady(true);
        return Promise.all([loadVotesCache(), loadNotificationsCache()]);
      })
      .finally(() => {
        setNotificationCount(getNotificationCount());
        setTimeout(() => {
          Animated.timing(splashOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => setSplashVisible(false));
        }, 1400);
      });

    // Push notifications — hata olursa uygulama çökmemeli
    setupPushNotifications().catch(err => {
      if (__DEV__) console.warn('[PushNotification] setup failed:', err);
    });
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
    <AdsReadyContext.Provider value={adsReady}>
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
    </AdsReadyContext.Provider>
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
