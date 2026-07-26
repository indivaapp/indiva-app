import React, { useState, useEffect, useRef } from 'react';
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
import { updateStreakOnOpen } from './src/services/streakService';
import { navigationRef } from './src/navigation/navigationRef';

const { NavigationBar } = NativeModules;

function AppContent() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const mountTimeRef = useRef(Date.now());
  const [notificationCount, setNotificationCount] = useState(0);

  // Tema (açık/koyu) değişimi her ekranda anlık renk değişimiyle uygulanıyor —
  // her ekranı tek tek Animated renk interpolasyonuna çevirmek çok invaziv
  // olacağından, kök seviyede kısa bir "geçiş flaşı" ile ani rengi
  // yumuşatıyoruz: tema değişir değişmez yeni temanın rengiyle hafifçe
  // belirip hemen söner — sert kesme yerine yumuşak bir his verir.
  const themeFadeAnim = useRef(new Animated.Value(0)).current;
  const isFirstThemeRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstThemeRenderRef.current) { isFirstThemeRenderRef.current = false; return; }
    themeFadeAnim.setValue(0.35);
    Animated.timing(themeFadeAnim, { toValue: 0, duration: 240, useNativeDriver: true }).start();
  }, [isDark, themeFadeAnim]);

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
    Promise.all([loadVotesCache(), loadNotificationsCache()])
      .then(() => {
        // Günlük seri — açılışta bir kez güncelle (bugün ilkse puan ekler)
        updateStreakOnOpen().catch(() => {});
      })
      .finally(() => {
        setNotificationCount(getNotificationCount());
        // Splash'ı sabit bir sürede değil, gerçek yükleme bittiğinde kaldırıyoruz —
        // sadece marka animasyonunun göz kırpıp gitmemesi için kısa bir alt sınır
        // (MIN_SPLASH_MS) uyguluyoruz; yükleme daha uzun sürdüyse ek bekleme yok.
        const MIN_SPLASH_MS = 900;
        const elapsed = Date.now() - mountTimeRef.current;
        const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
        setTimeout(() => {
          Animated.timing(splashOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => setSplashVisible(false));
        }, remaining);
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
    <NavigationContainer ref={navigationRef} onReady={handlePendingNotification}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? Colors.gray900 : Colors.white}
      />
      <RootNavigator notificationCount={notificationCount} />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? Colors.gray900 : Colors.white, opacity: themeFadeAnim },
        ]}
      />
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
