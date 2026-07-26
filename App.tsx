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
import MobileAds, { AdsConsent, AdsConsentStatus } from 'react-native-google-mobile-ads';
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

// ─── Ads Context ─────────────────────────────────────────────────────────────
// ready          : MobileAds.initialize() tamamlandı, reklam isteği atılabilir.
// nonPersonalized: UMP onay durumuna göre; true → kişiselleştirilmemiş reklam.
interface AdsContextValue { ready: boolean; nonPersonalized: boolean; }
export const AdsReadyContext = createContext<AdsContextValue>({ ready: false, nonPersonalized: true });
export function useAdsReady(): boolean        { return useContext(AdsReadyContext).ready; }
export function useNonPersonalized(): boolean { return useContext(AdsReadyContext).nonPersonalized; }

// ─── UMP (Kullanıcı Onay) yardımcısı ─────────────────────────────────────────
// AB/AEA kullanıcıları için GDPR onay formunu gösterir, sonucu döner.
// true  → kişiselleştirilmemiş reklam (onay verilmedi veya hata)
// false → kişiselleştirilmiş reklam (onay verildi veya bölge dışı)
async function resolveConsent(): Promise<boolean> {
  try {
    const info = await AdsConsent.requestInfoUpdate();
    if (info.isConsentFormAvailable && info.status === AdsConsentStatus.REQUIRED) {
      await AdsConsent.showForm();
    }
    const final = await AdsConsent.getConsentInfo();
    // NOT_REQUIRED: AB dışı kullanıcı → kişiselleştirilmiş gösterebilirsin
    // OBTAINED    : onay verildi      → kişiselleştirilmiş gösterebilirsin
    return final.status !== AdsConsentStatus.NOT_REQUIRED &&
           final.status !== AdsConsentStatus.OBTAINED;
  } catch {
    return true; // Güvenli varsayılan: onay yoksa kişiselleştirilmemiş
  }
}

function AppContent() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [notificationCount, setNotificationCount] = useState(0);
  const [adsContext, setAdsContext] = useState<{ ready: boolean; nonPersonalized: boolean }>({ ready: false, nonPersonalized: true });

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

  // NOT: App Open reklamı tamamen kaldırıldı (bkz. git geçmişi — AppOpenAd,
  // lastAppOpenRef, splashVisibleRef, ilgili iki useEffect). AdMob'un tekrar
  // eden "Değiştirilmiş reklam davranışı" reddi için şüpheli yüzeyleri elemek
  // amacıyla, düşük reklam hacmi (haftada ~133 istek) göz önüne alınarak
  // kaldırıldı — literatürde bu format şeffaflık/sıralama sorunlarıyla en sık
  // ilişkilendirilen tür. Tekrar eklemek gerekirse commit geçmişinden bakılabilir.

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
    // Hash almak için: adb logcat | grep "Use RequestConfiguration"
    // Çıkan satırdaki hex string'i listeye ekle.
    // __DEV__ koşulu: sadece geliştirme build'inde test cihazı tanımlanır,
    // release APK'da gerçek reklamlar gösterilir.
    const TEST_DEVICE_HASHES: string[] = __DEV__
      ? ['EMULATOR', '03731AD40F3E5BDD714AD4BDB10BE0F4']
      : [];

    // 1. UMP onay akışı (GDPR/CCPA) → 2. SDK init → 3. Uygulama yükle
    resolveConsent()
      .then(nonPersonalized =>
        MobileAds()
          .setRequestConfiguration({ testDeviceIdentifiers: TEST_DEVICE_HASHES })
          .then(() => MobileAds().initialize())
          .then(() => {
            // initialize() garantili tamamlandıktan sonra işaretle.
            // Reklam bileşenleri bu flag'i bekler — race condition'ı engeller.
            setAdsContext({ ready: true, nonPersonalized });
            return Promise.all([loadVotesCache(), loadNotificationsCache()]);
          }),
      )
      .then(() => {
        // Günlük seri — açılışta bir kez güncelle (bugün ilkse puan ekler)
        updateStreakOnOpen().catch(() => {});
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
    <AdsReadyContext.Provider value={adsContext}>
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
