import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image,
  Modal, Dimensions, ActivityIndicator, Animated, Easing,
  Platform, NativeModules,
} from 'react-native';
import {
  GestureHandlerRootView, PinchGestureHandler, PanGestureHandler, State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchBrochuresByStore } from '../services/firebaseService';
import OptimizedImage from '../components/OptimizedImage';
import NativeAdCard from '../components/NativeAdCard';
import { EXTRA_AD_PLACEMENTS } from '../constants/adUnits';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';
import type { Brochure } from '../types';

type ListItem =
  | { type: 'brochure'; data: Brochure; index: number }
  | { type: 'ad'; adKey: string }
  | { type: 'footer' };

type Props = NativeStackScreenProps<RootStackParamList, 'AktuelDetail'>;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function AktuelDetailScreen({ route }: Props) {
  const { storeName } = route.params;
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();

  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  // Lightbox geçiş animasyonu (next/prev slide)
  const lightboxSlide = useRef(new Animated.Value(0)).current;
  // Pinch-zoom + pan — native-driven (react-native-gesture-handler + Animated)
  const baseScale  = useRef(new Animated.Value(1)).current;  // sabitlenmiş zoom
  const pinchScale = useRef(new Animated.Value(1)).current;  // canlı pinch
  const scale      = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const transX     = useRef(new Animated.Value(0)).current;
  const transY     = useRef(new Animated.Value(0)).current;
  const lastScale  = useRef(1);
  const lastTrans  = useRef({ x: 0, y: 0 });
  const pinchRef   = useRef<any>(null);
  const panRef     = useRef<any>(null);

  const lightboxIndexRef  = useRef(lightboxIndex);
  const brochuresRef      = useRef(brochures);
  const thumbListRef      = useRef<any>(null);
  const changeLightboxRef = useRef<(idx: number, dir: 'next' | 'prev') => void>(() => {});
  lightboxIndexRef.current = lightboxIndex;
  brochuresRef.current     = brochures;

  const resetZoom = useCallback(() => {
    lastScale.current = 1;
    lastTrans.current = { x: 0, y: 0 };
    baseScale.setValue(1);
    pinchScale.setValue(1);
    transX.setOffset(0); transX.setValue(0);
    transY.setOffset(0); transY.setValue(0);
  }, [baseScale, pinchScale, transX, transY]);

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

  // ── Pinch (zoom) — native-driven ─────────────────────────────────────────────
  const onPinchEvent = useRef(
    Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true })
  ).current;

  const onPinchStateChange = useCallback((e: any) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      let next = lastScale.current * e.nativeEvent.scale;
      next = Math.max(1, Math.min(4, next)); // 1x–4x sınırı
      lastScale.current = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      if (next <= 1.02) {
        // Tam uzaklaştı → sıfırla ve görseli ortala
        lastScale.current = 1;
        baseScale.setValue(1);
        lastTrans.current = { x: 0, y: 0 };
        transX.setOffset(0); transY.setOffset(0);
        Animated.parallel([
          Animated.spring(transX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(transY, { toValue: 0, useNativeDriver: true }),
        ]).start();
      }
    }
  }, [baseScale, pinchScale, transX, transY]);

  // ── Pan — zoom'luyken görseli kaydır, zoom yokken sayfa geçişi ────────────────
  const onPanEvent = useRef(
    Animated.event(
      [{ nativeEvent: { translationX: transX, translationY: transY } }],
      { useNativeDriver: true }
    )
  ).current;

  const onPanStateChange = useCallback((e: any) => {
    const { state, oldState, translationX, translationY } = e.nativeEvent;

    if (state === State.BEGAN) {
      // Gesture başında offset'i sabitlenmiş konuma al (üstüne canlı hareket eklenir)
      transX.setOffset(lastTrans.current.x); transX.setValue(0);
      transY.setOffset(lastTrans.current.y); transY.setValue(0);
      return;
    }

    if (oldState === State.ACTIVE) {
      if (lastScale.current > 1) {
        // Zoom'lu → kaydırmayı görsel sınırları içinde sabitle
        const maxX = (SCREEN_W * (lastScale.current - 1)) / 2;
        const maxY = (SCREEN_H * (lastScale.current - 1)) / 2;
        const nx = Math.max(-maxX, Math.min(maxX, lastTrans.current.x + translationX));
        const ny = Math.max(-maxY, Math.min(maxY, lastTrans.current.y + translationY));
        lastTrans.current = { x: nx, y: ny };
        transX.setOffset(nx); transX.setValue(0);
        transY.setOffset(ny); transY.setValue(0);
      } else {
        // Zoom yok → görseli ortala; yatay swipe yeterse sayfa geçişi yap
        transX.setOffset(0); transY.setOffset(0);
        lastTrans.current = { x: 0, y: 0 };
        const idx = lightboxIndexRef.current;
        const len = brochuresRef.current.length;
        const threshold = SCREEN_W * 0.22;
        if (translationX < -threshold && idx < len - 1) {
          transX.setValue(0); transY.setValue(0);
          changeLightboxRef.current(idx + 1, 'next');
        } else if (translationX > threshold && idx > 0) {
          transX.setValue(0); transY.setValue(0);
          changeLightboxRef.current(idx - 1, 'prev');
        } else {
          // Eşik altı → görseli yumuşakça ortaya geri getir
          Animated.parallel([
            Animated.spring(transX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(transY, { toValue: 0, useNativeDriver: true }),
          ]).start();
        }
      }
    }
  }, [transX, transY]);

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

  // Lightbox'ı kapat — ✕ butonu ve donanım geri tuşu (onRequestClose) ortak kullanır.
  // Nav bar rengini de geri alır (Android'de Modal onDismiss tetiklenmez).
  const closeLightbox = useCallback(() => {
    setLightboxIndex(-1);
    resetZoom();
    setNavBarColor(isDark ? Colors.gray900 : Colors.gray50, !isDark);
  }, [resetZoom, setNavBarColor, isDark]);

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
  let adCount = 0;
  brochures.forEach((item, i) => {
    listData.push({ type: 'brochure', data: item, index: i });
    // Her 4 broşürde bir tam genişlik native reklam — AdMob onayına kadar KAPALI
    if (EXTRA_AD_PLACEMENTS && (i + 1) % 4 === 0) {
      listData.push({ type: 'ad', adKey: `aktuel-${storeName}-ad-${adCount}` });
      adCount++;
    }
  });
  listData.push({ type: 'footer' });

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FlatList
        data={listData}
        keyExtractor={item =>
          item.type === 'brochure' ? item.data.id
          : item.type === 'ad' ? item.adKey
          : '__footer__'
        }
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + 16 },
        ]}
        renderItem={({ item }) => {
          if (item.type === 'footer') {
            return <View style={{ height: 16 }} />;
          }
          if (item.type === 'ad') {
            // Akış içi tam genişlik native reklam (havuz cache'li)
            return <NativeAdCard cacheKey={item.adKey} />;
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
        onRequestClose={closeLightbox}
        onDismiss={() => setNavBarColor(isDark ? Colors.gray900 : Colors.gray50, !isDark)}
      >
        <GestureHandlerRootView style={styles.lightboxBg}>
          {lightboxIndex >= 0 && (
            <>
              {/* ── Katman 1: Pinch-zoom + pan + swipe görsel alanı ── */}
              <PinchGestureHandler
                ref={pinchRef}
                simultaneousHandlers={panRef}
                onGestureEvent={onPinchEvent}
                onHandlerStateChange={onPinchStateChange}
              >
                <Animated.View style={StyleSheet.absoluteFill}>
                  <PanGestureHandler
                    ref={panRef}
                    simultaneousHandlers={pinchRef}
                    avgTouches
                    minPointers={1}
                    maxPointers={2}
                    onGestureEvent={onPanEvent}
                    onHandlerStateChange={onPanStateChange}
                  >
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        { transform: [{ translateX: lightboxSlide }] },
                      ]}
                    >
                      <Animated.Image
                        source={{ uri: brochures[lightboxIndex].imageUrl }}
                        style={[
                          styles.lightboxImage,
                          { transform: [{ translateX: transX }, { translateY: transY }, { scale }] },
                        ]}
                        resizeMode="contain"
                      />
                    </Animated.View>
                  </PanGestureHandler>
                </Animated.View>
              </PinchGestureHandler>

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
                  onPress={closeLightbox}
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
        </GestureHandlerRootView>
      </Modal>

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
});
