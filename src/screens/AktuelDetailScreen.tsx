import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image,
  Modal, Dimensions, ActivityIndicator, Animated, PanResponder, Easing,
  Platform, NativeModules,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { fetchBrochuresByStore } from '../services/firebaseService';
import OptimizedImage from '../components/OptimizedImage';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';
import type { Brochure } from '../types';

type ListItem =
  | { type: 'brochure'; data: Brochure; index: number }
  | { type: 'footer' };

type Props = NativeStackScreenProps<RootStackParamList, 'AktuelDetail'>;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const BANNER_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

export default function AktuelDetailScreen({ route }: Props) {
  const { storeName } = route.params;
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();

  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [bannerFailed, setBannerFailed] = useState(false);

  // Lightbox swipe + pinch-zoom
  const lightboxSlide = useRef(new Animated.Value(0)).current;
  const zoomScale     = useRef(new Animated.Value(1)).current;
  const lightboxIndexRef  = useRef(lightboxIndex);
  const brochuresRef      = useRef(brochures);
  const thumbListRef      = useRef<any>(null);
  const changeLightboxRef = useRef<(idx: number, dir: 'next' | 'prev') => void>(() => {});
  const currentZoomRef    = useRef(1);   // mirrors zoomScale without addListener
  const pinchDistRef      = useRef(0);   // initial distance between 2 fingers
  const pinchScaleRef     = useRef(1);   // scale at pinch start
  lightboxIndexRef.current = lightboxIndex;
  brochuresRef.current     = brochures;

  const resetZoom = useCallback(() => {
    zoomScale.setValue(1);
    currentZoomRef.current = 1;
  }, [zoomScale]);

  const changeLightboxIndex = useCallback((newIndex: number, dir: 'next' | 'prev') => {
    resetZoom();
    Animated.timing(lightboxSlide, {
      toValue: dir === 'next' ? -SCREEN_W : SCREEN_W,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      lightboxSlide.setValue(dir === 'next' ? SCREEN_W : -SCREEN_W);
      setLightboxIndex(newIndex);
      Animated.timing(lightboxSlide, {
        toValue: 0,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [lightboxSlide, resetZoom]);

  changeLightboxRef.current = changeLightboxIndex;

  const lightboxPan = useRef(
    PanResponder.create({
      // ── 2 parmak: başlangıçta yakala (pinch) ─────────────────────────────────
      // onStart false bırakılırsa Android'de PanResponder hiç aktive olmaz.
      // Capture fazında 2 parmağı anında alıyoruz; navBtn gibi child'lar
      // gestureArea'nın DIŞINDA (Katman 2) olduğu için çakışma yok.
      onStartShouldSetPanResponder: evt =>
        evt.nativeEvent.touches.length >= 2,
      onStartShouldSetPanResponderCapture: evt =>
        evt.nativeEvent.touches.length >= 2,

      // ── Hareket fazında da kontrol et ─────────────────────────────────────────
      onMoveShouldSetPanResponder: (evt, gs) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        // 1 parmak yatay kaydırma (zoom 1 iken) — yatay fark yeterli
        if (currentZoomRef.current <= 1.05 && pinchDistRef.current === 0) {
          return Math.abs(gs.dx) > 6;
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: evt =>
        evt.nativeEvent.touches.length >= 2,

      // ── Grant: yeni gesture başlarken state sıfırla ───────────────────────────
      onPanResponderGrant: evt => {
        if (evt.nativeEvent.touches.length >= 2) {
          pinchDistRef.current = 0;
          pinchScaleRef.current = currentZoomRef.current;
        } else {
          lightboxSlide.stopAnimation();
        }
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          // ── Pinch zoom ─────────────────────────────────────────────────────────
          if (pinchDistRef.current === 0) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
            pinchScaleRef.current = currentZoomRef.current;
            lightboxSlide.setValue(0);
          }
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const next = Math.max(1, Math.min(4, pinchScaleRef.current * (dist / pinchDistRef.current)));
          zoomScale.setValue(next);
          currentZoomRef.current = next;
        } else if (pinchDistRef.current === 0 && currentZoomRef.current <= 1.05) {
          // ── 1 parmak kaydırma (yalnızca zoom = 1 iken) ────────────────────────
          lightboxSlide.setValue(gs.dx);
        }
      },

      onPanResponderRelease: (_, gs) => {
        const wasPinching = pinchDistRef.current > 0;
        pinchDistRef.current = 0;

        // Çok az zoom'da 1'e döndür
        if (currentZoomRef.current < 1.15) {
          Animated.spring(zoomScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
          currentZoomRef.current = 1;
        }

        if (!wasPinching) {
          // ── Geçiş kararı ───────────────────────────────────────────────────────
          const idx = lightboxIndexRef.current;
          const len = brochuresRef.current.length;
          const threshold = SCREEN_W * 0.25;
          if ((gs.dx < -threshold || (gs.dx < -30 && gs.vx < -0.5)) && idx < len - 1) {
            changeLightboxRef.current(idx + 1, 'next');
          } else if ((gs.dx > threshold || (gs.dx > 30 && gs.vx > 0.5)) && idx > 0) {
            changeLightboxRef.current(idx - 1, 'prev');
          } else {
            Animated.spring(lightboxSlide, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
          }
        } else {
          // Pinch bitti — slide sıfırla
          Animated.spring(lightboxSlide, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
        }
      },

      onPanResponderTerminate: () => {
        pinchDistRef.current = 0;
        Animated.spring(lightboxSlide, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
      },
    })
  ).current;

  // Scroll thumbnail strip to active item
  useEffect(() => {
    if (lightboxIndex >= 0 && thumbListRef.current) {
      try {
        thumbListRef.current.scrollToIndex({ index: lightboxIndex, animated: true, viewPosition: 0.5 });
      } catch {}
    }
  }, [lightboxIndex]);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;

  const setNavBarColor = useCallback((color: string, lightIcons: boolean) => {
    if (Platform.OS !== 'android') return;
    const { NavigationBar } = NativeModules;
    if (NavigationBar?.setColor) {
      NavigationBar.setColor(color, lightIcons);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setNavBarColor(isDark ? Colors.gray900 : Colors.gray50, !isDark);
    return () => setNavBarColor(isDark ? Colors.gray900 : Colors.gray50, !isDark);
  }, [isDark, setNavBarColor]));

  useEffect(() => {
    setIsLoading(true);
    setError('');
    fetchBrochuresByStore(storeName)
      .then(setBrochures)
      .catch(() => setError('Kataloglar yüklenirken hata oluştu.'))
      .finally(() => setIsLoading(false));
  }, [storeName]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: Colors.red500, fontSize: 14, textAlign: 'center', padding: 20 }}>{error}</Text>
        <TouchableOpacity
          onPress={() => {
            setError('');
            setIsLoading(true);
            fetchBrochuresByStore(storeName).then(setBrochures).catch(() => setError('Kataloglar yüklenirken hata oluştu.')).finally(() => setIsLoading(false));
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: Colors.orange, fontWeight: '700' }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (brochures.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
        <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 15 }}>
          Bu market için aktif katalog yok.
        </Text>
      </View>
    );
  }

  const listData: ListItem[] = [];
  brochures.forEach((item, i) => {
    listData.push({ type: 'brochure', data: item, index: i });
  });
  listData.push({ type: 'footer' });

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FlatList
        data={listData}
        keyExtractor={item =>
          item.type === 'brochure' ? item.data.id : '__footer__'
        }
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + bannerHeight + 16 },
        ]}
        renderItem={({ item }) => {
          if (item.type === 'footer') {
            // Footer — sadece alt boşluk, reklam yok
            return <View style={{ height: 16 }} />;
          }
          const { data, index } = item;
          return (
            <TouchableOpacity
              style={[styles.brochureCard, { backgroundColor: cardBg }]}
              activeOpacity={0.85}
              onPress={() => {
                lightboxSlide.setValue(0);
                setLightboxIndex(index);
              }}
            >
              <View style={styles.brochureImageContainer}>
                <OptimizedImage
                  src={data.imageUrl}
                  alt={data.title}
                  isDark={isDark}
                  containerStyle={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              </View>
              {data.validityDate ? (
                <View style={styles.brochureInfo}>
                  <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 11 }}>
                    📅 {data.validityDate}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />

      {/* Lightbox with swipe */}
      <Modal
        visible={lightboxIndex >= 0}
        transparent
        animationType="fade"
        onShow={() => setNavBarColor('#000000', false)}
        onDismiss={() => setNavBarColor(isDark ? Colors.gray900 : Colors.gray50, !isDark)}
      >
        <View style={styles.lightboxBg}>
          {lightboxIndex >= 0 && (
            <>
              {/* ── Katman 1: Tam ekran gesture + görsel alanı ── */}
              <View style={styles.lightboxGestureArea} {...lightboxPan.panHandlers}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { transform: [{ translateX: lightboxSlide }] },
                  ]}
                >
                  <Animated.Image
                    source={{ uri: brochures[lightboxIndex].imageUrl }}
                    style={[styles.lightboxImage, { transform: [{ scale: zoomScale }] }]}
                    resizeMode="contain"
                  />
                </Animated.View>
              </View>

              {/* ── Katman 2: UI kontrolleri — box-none ile gesture'ı bloklamaz ── */}
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                {/* Sayfa sayacı */}
                <View pointerEvents="none" style={styles.pageCounter}>
                  <Text style={styles.pageCounterText}>
                    {lightboxIndex + 1} / {brochures.length}
                  </Text>
                </View>

                {/* Nokta göstergeleri */}
                <View pointerEvents="none" style={styles.dotRow}>
                  {brochures.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        { backgroundColor: i === lightboxIndex ? Colors.orange : 'rgba(255,255,255,0.35)' },
                      ]}
                    />
                  ))}
                </View>

                {/* Önceki / sonraki butonları */}
                {lightboxIndex > 0 && (
                  <TouchableOpacity
                    style={[styles.navBtnLB, styles.navBtnLeft]}
                    onPress={() => changeLightboxIndex(lightboxIndex - 1, 'prev')}
                  >
                    <Text style={styles.navBtnText}>‹</Text>
                  </TouchableOpacity>
                )}
                {lightboxIndex < brochures.length - 1 && (
                  <TouchableOpacity
                    style={[styles.navBtnLB, styles.navBtnRight]}
                    onPress={() => changeLightboxIndex(lightboxIndex + 1, 'next')}
                  >
                    <Text style={styles.navBtnText}>›</Text>
                  </TouchableOpacity>
                )}

                {/* Kapat */}
                <TouchableOpacity
                  style={styles.closeBtnLB}
                  onPress={() => { setLightboxIndex(-1); resetZoom(); }}
                >
                  <Text style={{ color: Colors.white, fontSize: 18, fontWeight: '800' }}>✕</Text>
                </TouchableOpacity>

                {/* Geçerlilik tarihi */}
                {brochures[lightboxIndex].validityDate && (
                  <View pointerEvents="none" style={styles.validityBadge}>
                    <Text style={{ color: Colors.white, fontSize: 12 }}>📅 {brochures[lightboxIndex].validityDate}</Text>
                  </View>
                )}

                {/* Küçük resim şeridi */}
                <View style={styles.thumbBar}>
                  <FlatList
                    ref={thumbListRef}
                    data={brochures}
                    horizontal
                    keyExtractor={item => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
                    getItemLayout={(_, index) => ({ length: 52, offset: (52 + 8) * index + 12, index })}
                    renderItem={({ item, index }) => (
                      <TouchableOpacity
                        onPress={() => {
                          const dir = index > lightboxIndex ? 'next' : 'prev';
                          changeLightboxIndex(index, dir);
                        }}
                        style={[
                          styles.thumbItem,
                          {
                            borderColor: index === lightboxIndex ? Colors.orange : 'transparent',
                            opacity: index === lightboxIndex ? 1 : 0.4,
                          },
                        ]}
                      >
                        <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} />
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ── Anchored Banner — ekranın sabit altında, scroll etmez ── */}
      {/* lightboxIndex >= 0 iken gizle: transparent Modal üstünde görünür,
          bu accidental click riski = AdMob politika ihlali */}
      {!bannerFailed && lightboxIndex < 0 && (
        <View style={[styles.bannerContainer, { bottom: insets.bottom }]}>
          <BannerAd
            unitId={BANNER_UNIT_ID}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdLoaded={e => setBannerHeight(e.height)}
            onAdFailedToLoad={() => setBannerFailed(true)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContainer: { padding: 12, gap: 12 },
  brochureCard: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  brochureImageContainer: { aspectRatio: 3 / 4, width: '100%', backgroundColor: Colors.gray100 },
  brochureInfo: { paddingHorizontal: 12, paddingVertical: 8 },
  lightboxBg: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Tam ekran gesture katmanı — thumbBar hariç tüm alanı kapsar
  lightboxGestureArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 90, // thumbBar yüksekliği
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_H - 90,
  },
  dotRow: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pageCounter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pageCounterText: { color: Colors.white, fontWeight: '600', fontSize: 13 },
  navBtnLB: {
    position: 'absolute',
    top: '50%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 24,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnLeft: { left: 8 },
  navBtnRight: { right: 8 },
  navBtnText: { color: Colors.white, fontSize: 28, fontWeight: '300', marginTop: -3 },
  closeBtnLB: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validityBadge: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  thumbBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
  },
  thumbItem: {
    width: 44,
    height: 66,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
  },
  thumbImage: { width: '100%', height: '100%' },
  bannerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
