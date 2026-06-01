import { TestIds } from 'react-native-google-mobile-ads';

// ─── Reklam birimi ID'leri (tek merkez) ──────────────────────────────────────
// USE_TEST_ADS: AdMob hesabı askıdayken / geliştirirken Google TEST reklamlarıyla
// akışı doğrulamak için. Test reklamları hesap durumundan bağımsız çalışır.
//
// ⚠️ Play Store'a / canlıya çıkmadan önce MUTLAKA false olmalı!
const USE_TEST_ADS = false;

const useTest = __DEV__ || USE_TEST_ADS;

// ─── Reklam yüzeyi bayrağı (AdMob onay süreci) ───────────────────────────────
// false iken SADECE anasayfa akış native reklamı + interstitial + app-open gösterilir.
// Aktüel, ürün detayı (yatay), benzer fırsatlar, favoriler ve profil native
// yerleşimleri GEÇİCİ kapatılır. AdMob onayı alındıktan sonra true yapıp geri açarız.
export const EXTRA_AD_PLACEMENTS = false;

export const AD_UNITS = {
  // ── Şu an uygulamada AKTİF kullanılan birimler ──
  native:            useTest ? TestIds.NATIVE        : 'ca-app-pub-3675503435035155/8909740660',
  rewarded:          useTest ? TestIds.REWARDED      : 'ca-app-pub-3675503435035155/8795579926',
  appOpen:           useTest ? TestIds.APP_OPEN      : 'ca-app-pub-3675503435035155/5332430335',
  // Story geçişlerinde tam ekran reklam (Google Interstitial — davranışı Google yönetir)
  interstitialStory: useTest ? TestIds.INTERSTITIAL : 'ca-app-pub-3675503435035155/3718760482',

  // ── Tanımlı ama henüz UI'a bağlanmamış birimler (AdMob onayı sonrası) ──
  // Banner: ileride sabit alt/üst banner için hazır.
  banner:            useTest ? TestIds.BANNER        : 'ca-app-pub-3675503435035155/8261572668',
  // Kısa Interstitial: PLAN (onay sonrası) → form gönderimi BAŞARILI olunca göster
  //   (AffiliateForm = indirim paylaş, AdvertiseForm = işbirliği). Yazma bittikten
  //   SONRA, gönderimi engellemeden. Rewarded ZORUNLU yapılmaz (opt-in olmalı).
  shortInterstitial: useTest ? TestIds.INTERSTITIAL : 'ca-app-pub-3675503435035155/1880723761',
};
