import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import OptimizedImage from '../components/OptimizedImage';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';
import type { InfluencerStory } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'InfluencerStoryDetail'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const AUTO_ADVANCE_MS = 8000;
const SWIPE_THRESHOLD = 60;
const DISMISS_THRESHOLD = 100;
const AD_EVERY_N = 5;
const LONG_PRESS_DELAY = 150;

const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-3675503435035155/8261572668';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

// Simulates a gradient using stacked semi-transparent views
const TOP_ALPHAS = [0.72, 0.55, 0.38, 0.22, 0.10, 0.0];
const BOTTOM_ALPHAS = [0.0, 0.10, 0.22, 0.40, 0.58, 0.72, 0.82];

function AvatarCircle({ uri, name }: { uri: string; name: string }) {
  const [err, setErr] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase();
  if (err || !uri) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarFallbackText}>{initial}</Text>
      </View>
    );
  }
  return (
    <OptimizedImage
      src={uri}
      containerStyle={styles.avatarImageContainer}
      resizeMode="cover"
    />
  );
}

export default function InfluencerStoryDetailScreen({ route }: Props) {
  const { stories, initialIndex } = route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { effectiveTheme } = useTheme();

  const [currentIndex, setCurrentIndex] = useState(
    initialIndex >= 0 && initialIndex < stories.length ? initialIndex : 0,
  );

  const story: InfluencerStory = stories[currentIndex] ?? stories[0];

  // ── Animation values ────────────────────────────────────────────
  const progressAnims = useRef(stories.map(() => new Animated.Value(0))).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(1)).current;

  // ── Mutable refs (safe for panResponder & callbacks) ─────────────
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const isSwipingRef = useRef(false);

  // These refs let the panResponder always call the latest version of each function
  const currentIndexRef = useRef(currentIndex);
  const goToRef = useRef<(n: number, d: 'next' | 'prev') => void>(() => {});
  const resumeRef = useRef<() => void>(() => {});

  // ── Interstitial ────────────────────────────────────────────────
  const navCountRef = useRef(0);
  const adReadyRef = useRef(false);
  const pendingNavRef = useRef<{ nextIndex: number; direction: 'next' | 'prev' } | null>(null);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  useEffect(() => {
    interstitial.load();
    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      adReadyRef.current = true;
    });
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      adReadyRef.current = false;
      interstitial.load();
      const pending = pendingNavRef.current;
      pendingNavRef.current = null;
      if (pending) goToRef.current(pending.nextIndex, pending.direction);
    });
    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => {
      adReadyRef.current = false;
      interstitial.load();
    });
    return () => { unsubLoaded(); unsubClosed(); unsubError(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Progress control ────────────────────────────────────────────
  const startProgress = useCallback((storyIndex: number, remainingMs = AUTO_ADVANCE_MS) => {
    isPausedRef.current = false;
    elapsedRef.current = 0;
    startTimeRef.current = Date.now();
    progressAnims[storyIndex].setValue(0);

    animRef.current = Animated.timing(progressAnims[storyIndex], {
      toValue: 1,
      duration: remainingMs,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goToRef.current(storyIndex + 1, 'next');
    });
  }, [progressAnims]);

  const pauseProgress = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    elapsedRef.current += Date.now() - startTimeRef.current;
    animRef.current?.stop();
  }, []);

  const resumeProgress = useCallback(() => {
    // Guard: don't resume if not paused, or if a swipe gesture is still active
    if (!isPausedRef.current || isSwipingRef.current) return;
    isPausedRef.current = false;
    startTimeRef.current = Date.now();
    const remaining = Math.max(300, AUTO_ADVANCE_MS - elapsedRef.current);
    const idx = currentIndexRef.current;

    animRef.current = Animated.timing(progressAnims[idx], {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goToRef.current(idx + 1, 'next');
    });
  }, [progressAnims]);

  // ── Navigation between stories ──────────────────────────────────
  const goTo = useCallback((nextIndex: number, direction: 'next' | 'prev') => {
    if (nextIndex < 0 || nextIndex >= stories.length) {
      navigation.goBack();
      return;
    }
    animRef.current?.stop();
    if (timerRef.current) clearTimeout(timerRef.current);
    isPausedRef.current = false;
    isSwipingRef.current = false;

    navCountRef.current += 1;
    if (navCountRef.current % AD_EVERY_N === 0 && adReadyRef.current) {
      pendingNavRef.current = { nextIndex, direction };
      interstitial.show();
      return;
    }

    const outX = direction === 'next' ? -SCREEN_W * 0.3 : SCREEN_W * 0.3;
    const inStart = direction === 'next' ? SCREEN_W * 0.3 : -SCREEN_W * 0.3;

    Animated.timing(slideX, { toValue: outX, duration: 200, useNativeDriver: true }).start(() => {
      setCurrentIndex(nextIndex);
      slideX.setValue(inStart);
      Animated.spring(slideX, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }).start();
    });
  }, [navigation, slideX, stories.length]);

  // Keep callback refs up-to-date every render
  useEffect(() => { goToRef.current = goTo; }, [goTo]);
  useEffect(() => { resumeRef.current = resumeProgress; }, [resumeProgress]);

  // ── Mark story as viewed ────────────────────────────────────────
  useEffect(() => {
    const storyId = stories[currentIndex]?.id;
    if (!storyId) return;
    AsyncStorage.getItem('indiva_viewed_influencer_stories')
      .then(v => {
        const ids: string[] = v ? JSON.parse(v) : [];
        if (!ids.includes(storyId)) {
          AsyncStorage.setItem(
            'indiva_viewed_influencer_stories',
            JSON.stringify([...ids, storyId]),
          );
        }
      })
      .catch(() => {});
  }, [currentIndex, stories]);

  // ── Start / restart progress when story changes ─────────────────
  useEffect(() => {
    startProgress(currentIndex);
    return () => {
      animRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  // startProgress is stable (progressAnims never changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── Tap zone gesture handlers ───────────────────────────────────
  const handlePressIn = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      pauseProgress();
    }, LONG_PRESS_DELAY);
  }, [pauseProgress]);

  const handlePressOut = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    resumeProgress();
  }, [resumeProgress]);

  // ── PanResponder (swipe + pull-down) ───────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Claim responder for horizontal swipe OR downward pull
      onMoveShouldSetPanResponder: (_, g) => {
        const isHorizontal = Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy);
        const isDown = g.dy > 15 && g.dy > Math.abs(g.dx);
        return isHorizontal || isDown;
      },
      onPanResponderGrant: () => {
        isSwipingRef.current = true;
        // Cancel the long-press pause timer — user is swiping, not holding
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        // Pause progress while gesture is active
        if (!isPausedRef.current) {
          isPausedRef.current = true;
          elapsedRef.current += Date.now() - startTimeRef.current;
          animRef.current?.stop();
        }
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0 && g.dy > Math.abs(g.dx)) {
          // Pull-down: translate vertically and fade
          slideY.setValue(g.dy);
          bgOpacity.setValue(Math.max(0.25, 1 - g.dy / 350));
        } else {
          // Horizontal swipe: parallax feel
          slideX.setValue(g.dx * 0.4);
        }
      },
      onPanResponderRelease: (_, g) => {
        isSwipingRef.current = false;
        const idx = currentIndexRef.current;

        if (g.dy > DISMISS_THRESHOLD && g.dy > Math.abs(g.dx)) {
          // Dismiss: fly off-screen
          Animated.parallel([
            Animated.timing(slideY, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }),
            Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => navigation.goBack());

        } else if (g.dx < -SWIPE_THRESHOLD && Math.abs(g.dx) > Math.abs(g.dy)) {
          slideY.setValue(0);
          bgOpacity.setValue(1);
          goToRef.current(idx + 1, 'next');

        } else if (g.dx > SWIPE_THRESHOLD && Math.abs(g.dx) > Math.abs(g.dy)) {
          slideY.setValue(0);
          bgOpacity.setValue(1);
          goToRef.current(idx - 1, 'prev');

        } else {
          // Snap back and resume
          Animated.parallel([
            Animated.spring(slideX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(slideY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
            Animated.spring(bgOpacity, { toValue: 1, useNativeDriver: true }),
          ]).start();
          resumeRef.current();
        }
      },
      onPanResponderTerminate: () => {
        isSwipingRef.current = false;
        Animated.parallel([
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(slideY, { toValue: 0, useNativeDriver: true }),
          Animated.spring(bgOpacity, { toValue: 1, useNativeDriver: true }),
        ]).start();
        resumeRef.current();
      },
    }),
  ).current;

  const handleGoToProduct = async () => {
    try {
      const supported = await Linking.canOpenURL(story.affiliateLink);
      if (supported) {
        await Linking.openURL(story.affiliateLink);
      } else {
        Alert.alert('Hata', 'Bu bağlantı açılamıyor.');
      }
    } catch {
      Alert.alert('Hata', 'Bağlantı açılırken bir sorun oluştu.');
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: bgOpacity }]}>
      <Animated.View
        style={[styles.slide, { transform: [{ translateX: slideX }, { translateY: slideY }] }]}
        {...panResponder.panHandlers}
      >
        {/* Full-screen product image with built-in loading skeleton */}
        <OptimizedImage
          src={story.productImage}
          containerStyle={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* Top gradient overlay (darkest at top → transparent) */}
        <View pointerEvents="none" style={styles.topGradient}>
          {TOP_ALPHAS.map((alpha, i) => (
            <View key={i} style={[styles.gradientBand, { backgroundColor: `rgba(0,0,0,${alpha})` }]} />
          ))}
        </View>

        {/* Bottom gradient overlay (transparent → darkest at bottom) */}
        <View pointerEvents="none" style={styles.bottomGradient}>
          {BOTTOM_ALPHAS.map((alpha, i) => (
            <View key={i} style={[styles.gradientBand, { backgroundColor: `rgba(0,0,0,${alpha})` }]} />
          ))}
        </View>

        {/* ── Top bar: progress bars + counter + close ── */}
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <View style={styles.progressRow}>
            {stories.map((_, i) => (
              <View key={i} style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        i < currentIndex
                          ? '100%'
                          : i === currentIndex
                          ? progressAnims[i].interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            })
                          : '0%',
                    },
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Story counter */}
          <Text style={styles.counterText}>{currentIndex + 1}/{stories.length}</Text>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ── Influencer info ── */}
        <View style={[styles.influencerRow, { top: insets.top + 50 }]}>
          <View style={styles.avatarRing}>
            <AvatarCircle uri={story.influencerAvatar} name={story.influencerName} />
          </View>
          <View style={styles.influencerInfo}>
            <Text style={styles.influencerName}>{story.influencerName}</Text>
            <Text style={styles.influencerHandle}>{story.influencerHandle}</Text>
          </View>
          <View style={styles.recommendBadge}>
            <Text style={styles.recommendText}>Tavsiye etti ✨</Text>
          </View>
        </View>

        {/* ── Tap zones (left = prev, right = next; long-press = pause) ── */}
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.tapLeft}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={() => goTo(currentIndex - 1, 'prev')}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={() => goTo(currentIndex + 1, 'next')}
            activeOpacity={1}
          />
        </View>

        {/* ── Bottom product card ── */}
        <View style={[styles.bottomCard, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.categoryText}>{story.category}</Text>
          <Text style={styles.brandText}>{story.productBrand}</Text>
          <Text style={styles.productTitle} numberOfLines={2}>
            {story.productTitle}
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleGoToProduct}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaText}>İndirime Git 🛍️</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray900,
    overflow: 'hidden',
  },
  slide: {
    flex: 1,
  },

  // ── Gradient overlays ──────────────────────────────────────────
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 320,
    zIndex: 1,
  },
  gradientBand: {
    flex: 1,
  },

  // ── Top bar ────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
    zIndex: 10,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.white,
    borderRadius: 2,
  },
  counterText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 4,
    minWidth: 30,
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Influencer info ────────────────────────────────────────────
  influencerRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  avatarRing: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    borderWidth: 2.5,
    borderColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    // Orange glow
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 6,
    elevation: 5,
  },
  avatarImageContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  influencerInfo: { flex: 1 },
  influencerName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  influencerHandle: {
    color: Colors.orangeLight,
    fontSize: 12,
    fontWeight: '600',
  },
  recommendBadge: {
    backgroundColor: 'rgba(249,115,22,0.85)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  recommendText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Tap zones ──────────────────────────────────────────────────
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: { flex: 4 },
  tapRight: { flex: 6 },

  // ── Bottom product card ────────────────────────────────────────
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 24,
    zIndex: 10,
  },
  categoryText: {
    color: Colors.orangeLight,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  brandText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  productTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ctaButton: {
    backgroundColor: Colors.orange,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
});
