import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  BackHandler,
  Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { tsToMs } from '../utils/time';
import type { RootStackParamList } from '../navigation';
import type { Story } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'StoryDetail'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const AUTO_ADVANCE_MS = 8000;
const SWIPE_THRESHOLD = 60;
const DISMISS_THRESHOLD = 100;
const UP_SWIPE_THRESHOLD = 80;
const LONG_PRESS_DELAY = 150;


function timeAgo(timestamp: any): string {
  try {
    const ms = tsToMs(timestamp);
    if (!ms) return '';
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
  } catch {
    return '';
  }
}

// Lightweight haptic — uses Vibration as a fallback since
// react-native-haptic-feedback isn't installed. Short pulses feel like
// a tap on Android; on iOS this routes through the taptic engine.
const haptic = (ms: number = 10) => {
  try { Vibration.vibrate(ms); } catch {}
};

export default function StoryDetailScreen({ route }: Props) {
  const { stories, initialIndex } = route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(
    initialIndex >= 0 && initialIndex < stories.length ? initialIndex : 0,
  );
  const [imageLoading, setImageLoading] = useState(true);
  const [backdropReady, setBackdropReady] = useState(false);
  const [copied, setCopied] = useState(false);
  // Gelen (incoming) panel her zaman DOM'da kalıyor — sadece hedef story
  // değişiyor. Kaydırma/otomatik geçişte önceki story'nin görseli, yenisi
  // yüklenene kadar donuk kalıp aniden değişiyordu ("flaş" şikayeti) çünkü bu
  // katmanda hiç yükleme koruması yoktu. incomingLoaded, hedef değiştiğinde
  // sıfırlanıp gerçek onLoad'a kadar görseli gizli tutar.
  const [incomingLoaded, setIncomingLoaded] = useState(false);

  // transitionStoryIndex: incoming story panel index during a slide transition (null = idle)
  const [transitionStoryIndex, setTransitionStoryIndex] = useState<number | null>(null);

  const story: Story = stories[currentIndex] ?? stories[0];

  // incomingPanelStory: the story shown in the always-mounted incoming panel.
  // During a transition = the target story.
  // While idle = NEXT story (pre-renders its blur off-screen so the right-swipe
  //   gesture finds the image already computed — zero flash on the common case).
  //   For left-swipe the image changes while the panel is off-screen (invisible).
  // IMPORTANT: panel must never conditionally unmount — native driver flashes on first mount.
  const incomingPanelStory: Story =
    transitionStoryIndex !== null
      ? stories[transitionStoryIndex]
      : (stories[currentIndex + 1] ?? story);

  // Hedef değişince (ör. kullanıcı hızlıca birkaç story ilerlerken idle
  // preview sürekli günceleniyor) yükleme durumunu sıfırla — bkz. incomingLoaded.
  useEffect(() => {
    setIncomingLoaded(false);
  }, [incomingPanelStory.productImage]);

  // ── Animation values ────────────────────────────────────────────
  // progressAnims drive scaleX (0→1) on the progress fill, anchored left
  // via transformOrigin — native driver gives buttery-smooth bars.
  const progressAnims = useRef(stories.map(() => new Animated.Value(0))).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const slideScale = useRef(new Animated.Value(1)).current;
  // Overlay (header + CTA) opacity — fades to 0 on long-press hold.
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  // Incoming story panel: starts off-screen (±SCREEN_W), animates to 0 during slide.
  const incomingSlideX = useRef(new Animated.Value(SCREEN_W)).current;
  // Chevron bounce for "swipe up" hint above CTA button.
  const chevronBounce = useRef(new Animated.Value(0)).current;
  // Fade opacity for swipe-up hint — 1 on story start, fades to 0 after 3s.
  const swipeHintOpacity = useRef(new Animated.Value(1)).current;
  const swipeHintFadeRef = useRef<Animated.CompositeAnimation | null>(null);

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  // Chevron bounce loop — subtle hint to swipe up
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronBounce, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(chevronBounce, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [chevronBounce]);

  // Reset swipe-up hint visibility on each story, fade out after 1 second
  useEffect(() => {
    const hasLink = !!(stories[currentIndex]?.affiliateLink || stories[currentIndex]?.link || stories[currentIndex]?.productLink || stories[currentIndex]?.url);
    if (!hasLink) return;
    if (swipeHintFadeRef.current) swipeHintFadeRef.current.stop();
    swipeHintOpacity.setValue(1);
    const timer = setTimeout(() => {
      swipeHintFadeRef.current = Animated.timing(swipeHintOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      });
      swipeHintFadeRef.current.start();
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── Mutable refs (safe for panResponder & callbacks) ─────────────
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const isSwipingRef = useRef(false);
  const isLongPressingRef = useRef(false);
  const pressStartTimeRef = useRef(0);

  // These refs let the panResponder always call the latest version of each function
  const currentIndexRef = useRef(currentIndex);
  const goToRef = useRef<(n: number, d: 'next' | 'prev') => void>(() => {});
  const resumeRef = useRef<() => void>(() => {});

  // NOT: Story interstitial reklami tamamen kaldirildi (bkz. git gecmisi).
  // AdMob "Degistirilmis reklam davranisi" ihlalini tekrar tekrar reddetti;
  // bu format (tam ekran + PanResponder'in kapladigi ayni dokunma bolgesinden
  // tetiklenmesi) en riskli yuzeydi. Once native+rewarded ile onay alip,
  // ayri bir surumde tek basina geri eklemek daha guvenli.
  const advanceForwardRef = useRef<(fromIndex: number) => void>(() => {});

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  // Reset copy feedback + backdrop state when navigating to a different story
  useEffect(() => {
    setCopied(false);
    setBackdropReady(false);
  }, [currentIndex]);

  // ── Transition guard refs ────────────────────────────────────────
  // isTransitioningRef prevents double-fire during animated transitions.
  const isTransitioningRef = useRef(false);
  // Which incoming story index and direction are active during a gesture or goTo.
  const transitionStoryIndexRef = useRef<number | null>(null);
  const transitionDirRef = useRef<'next' | 'prev'>('next');
  // Stable ref to setTransitionStoryIndex so PanResponder (created once) can call it.
  const setTransitionRef = useRef(setTransitionStoryIndex);
  // Set true when a transition animation finishes. The currentIndex useEffect
  // detects this and resets animated positions AFTER React has committed the
  // new story — guaranteeing the slide view renders from cache before the
  // incoming panel disappears. Eliminates the "old story flash".
  const postTransitionRef = useRef(false);

  // Tracks whether the current story's image has loaded. When false we
  // hold the progress timer so users never miss content on slow networks.
  const imageReadyRef = useRef(false);
  const pendingStartRef = useRef(false);

  // ── İleri geçiş ──────────────────────────────────────────────────
  // Hem otomatik (timer) hem manuel (dokunma) ileri geçişler buradan geçer.
  const advanceForward = useCallback((fromIndex: number) => {
    goToRef.current(fromIndex + 1, 'next');
  }, []);
  advanceForwardRef.current = advanceForward;

  // ── Progress control ────────────────────────────────────────────
  const startProgress = useCallback((storyIndex: number, remainingMs = AUTO_ADVANCE_MS) => {
    isPausedRef.current = false;
    elapsedRef.current = 0;
    startTimeRef.current = Date.now();
    progressAnims[storyIndex].setValue(0);

    // Wait for the image — startProgress will be re-called once onLoad fires.
    if (!imageReadyRef.current) {
      pendingStartRef.current = true;
      return;
    }
    pendingStartRef.current = false;

    animRef.current = Animated.timing(progressAnims[storyIndex], {
      toValue: 1,
      duration: remainingMs,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (!finished) return;
      advanceForwardRef.current(storyIndex);
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

    if (!imageReadyRef.current) {
      pendingStartRef.current = true;
      return;
    }

    animRef.current = Animated.timing(progressAnims[idx], {
      toValue: 1,
      duration: remaining,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (!finished) return;
      advanceForwardRef.current(idx);
    });
  }, [progressAnims]);

  // ── Navigation between stories ──────────────────────────────────
  const goTo = useCallback((nextIndex: number, direction: 'next' | 'prev') => {
    if (nextIndex < 0 || nextIndex >= stories.length) {
      animateDismissRef.current();
      return;
    }
    // Block double-fire while a transition is already running.
    if (isTransitioningRef.current) return;

    animRef.current?.stop();
    bgOpacity.setValue(1);
    if (timerRef.current) clearTimeout(timerRef.current);
    isPausedRef.current = false;
    isSwipingRef.current = false;
    haptic(8);

    // Reset current panel to neutral, position incoming panel off-screen.
    slideX.setValue(0);
    slideY.setValue(0);
    slideScale.setValue(1);
    const startPos = direction === 'next' ? SCREEN_W : -SCREEN_W;
    incomingSlideX.setValue(startPos);

    // Mark transition active synchronously so PanResponder guard fires immediately.
    isTransitioningRef.current = true;
    transitionStoryIndexRef.current = nextIndex;
    transitionDirRef.current = direction;
    setTransitionStoryIndex(nextIndex);

    animRef.current = Animated.parallel([
      Animated.timing(slideX, {
        toValue: direction === 'next' ? -SCREEN_W : SCREEN_W,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(incomingSlideX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animRef.current.start(({ finished }) => {
      isTransitioningRef.current = false;
      transitionStoryIndexRef.current = null;
      if (!finished) {
        // Animation was interrupted — clean up immediately
        setTransitionStoryIndex(null);
        slideX.setValue(0);
        incomingSlideX.setValue(SCREEN_W);
        return;
      }
      // Panel stays at x=0 covering the screen. Positions are reset in the
      // currentIndex useEffect, after React commits the new story to DOM.
      // NOT: setImageLoading(false) burada ARTIK zorlanmıyor — gerçek görsel
      // henüz yüklenmemişken shimmer'ı erken gizleyip "önceki görüntü donuk
      // kalıp sonra flaşla değişiyor" hissine yol açıyordu. Artık ana katmanın
      // onLoadStart/onLoad döngüsü (aşağıda) gerçek durumu yönetiyor; incoming
      // panel zaten kendi incomingLoaded state'iyle (yukarıda) korunuyor.
      imageReadyRef.current = true;
      pendingStartRef.current = false;
      postTransitionRef.current = true;
      setCurrentIndex(nextIndex);
    });
  }, [incomingSlideX, slideScale, slideX, slideY, stories.length]);

  // Keep callback refs up-to-date every render
  useEffect(() => { goToRef.current = goTo; }, [goTo]);
  useEffect(() => { resumeRef.current = resumeProgress; }, [resumeProgress]);

  // ── Mark story as viewed ────────────────────────────────────────
  // Her story değişiminde hemen AsyncStorage'a yaz.
  // Sadece unmount'ta yazmak, HomeScreen'in useFocusEffect'i ile
  // race condition oluşturuyordu: geri dönüşte AsyncStorage henüz
  // güncellenmemiş olduğu için halka ilk görüntülemede kaybolmuyordu.
  const viewedQueueRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const storyId = stories[currentIndex]?.id;
    if (!storyId || viewedQueueRef.current.has(storyId)) return;
    viewedQueueRef.current.add(storyId);
    // Hemen yaz — useFocusEffect race condition'ını önle
    AsyncStorage.getItem('indiva_viewed_influencer_stories')
      .then(v => {
        const existing: string[] = v ? JSON.parse(v) : [];
        if (existing.includes(storyId)) return null;
        return AsyncStorage.setItem(
          'indiva_viewed_influencer_stories',
          JSON.stringify([...existing, storyId]),
        );
      })
      .catch(() => {});
  }, [currentIndex, stories]);

  // Unmount'ta sadece ref'i temizle — yazma işlemi zaten yapıldı.
  useEffect(() => {
    return () => { viewedQueueRef.current.clear(); };
  }, []);

  // ── Start / restart progress when story changes ─────────────────
  useEffect(() => {
    // If we just finished a slide transition, reset animated values HERE —
    // after React committed the new currentIndex — so the new story image
    // renders from cache before the incoming panel disappears (no old-story flash).
    if (postTransitionRef.current) {
      postTransitionRef.current = false;
      slideX.setValue(0);
      incomingSlideX.setValue(SCREEN_W);
      setTransitionRef.current(null);
    }
    startProgress(currentIndex);
    return () => {
      animRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  // startProgress is stable (progressAnims never changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── Preload neighbour story images ──────────────────────────────
  // Warming the next/prev URIs in the native image cache means swipes
  // and auto-advances render instantly instead of waiting on the network.
  useEffect(() => {
    // 2'şer story ileri/geri — hızlı art arda kaydırmalarda (kullanıcı bir
    // sonrakini beklemeden hemen tekrar kaydırırsa) tampon bıraksın diye
    // sadece bitişik komşu değil, bir sonrakini de önceden ısıtıyoruz.
    const uris = [
      stories[currentIndex + 1]?.productImage,
      stories[currentIndex + 2]?.productImage,
      stories[currentIndex - 1]?.productImage,
      stories[currentIndex - 2]?.productImage,
    ].filter((u): u is string => !!u);
    uris.forEach(u => { Image.prefetch(u).catch(() => {}); });
  }, [currentIndex, stories]);

  // ── Tap zone gesture handlers ───────────────────────────────────
  // On long-press we both pause progress AND fade the overlay UI
  // (progress bars + CTA + close button) so the user can study the image.
  const handlePressIn = useCallback(() => {
    pressStartTimeRef.current = Date.now();
    longPressTimerRef.current = setTimeout(() => {
      isLongPressingRef.current = true;
      pauseProgress();
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }, LONG_PRESS_DELAY);
  }, [overlayOpacity, pauseProgress]);

  const handlePressOut = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressingRef.current = false;
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    resumeProgress();
  }, [overlayOpacity, resumeProgress]);

  // ── Animated dismiss helper (used by back button + back hardware) ──
  // Translates content down while shrinking and fading the background —
  // gives a "tossed away" feel closer to Instagram's dismissal.
  const animateDismiss = useCallback(() => {
    animRef.current?.stop();
    if (timerRef.current) clearTimeout(timerRef.current);
    haptic(12);
    // Scale'i hemen 1'e sıfırla — slide + fade yeterli, ek scale gereksiz kalabalık yaratır
    slideScale.setValue(1);
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: SCREEN_H,
        duration: 160,
        easing: Easing.in(Easing.cubic), // ivmelenen çıkış — "fırlatılmış" hissi
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => navigation.goBack());
  }, [bgOpacity, navigation, slideScale, slideY]);

  const animateDismissRef = useRef(animateDismiss);
  useEffect(() => { animateDismissRef.current = animateDismiss; }, [animateDismiss]);

  // PanResponder ve tüm callback'ler bir kez oluşturulduğu için story.link'i
  // stale closure'dan korumak üzere ref tutuyoruz. Her story değişiminde güncellenir.
  // link | productLink | url alanlarından hangisi doluysa onu kullan.
  const resolveStoryLink = (s: Story): string | undefined =>
    s.affiliateLink || s.link || s.productLink || s.url || undefined;

  const storyLinkRef = useRef<string | undefined>(resolveStoryLink(story));
  useEffect(() => { storyLinkRef.current = resolveStoryLink(story); }, [story]);

  // ── Hardware back button → animated dismiss ────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateDismissRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  // ── PanResponder (swipe + pull-down) ───────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Claim responder for horizontal swipe OR downward pull — capture
      // phase so we steal the gesture from child TouchableOpacity tap zones.
      // Block entirely while a cube transition is playing.
      onMoveShouldSetPanResponder: (_, g) => {
        if (isTransitioningRef.current) return false;
        const isHorizontal = Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy);
        const isVertical = Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx);
        return isHorizontal || isVertical;
      },
      onMoveShouldSetPanResponderCapture: (_, g) => {
        if (isTransitioningRef.current) return false;
        const isHorizontal = Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy);
        const isVertical = Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx);
        return isHorizontal || isVertical;
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
          // Pull-down: translate vertically + fade bg
          slideY.setValue(g.dy);
          bgOpacity.setValue(Math.max(0.25, 1 - g.dy / 300));
        } else if (g.dy < 0 && Math.abs(g.dy) > Math.abs(g.dx) && storyLinkRef.current) {
          // Pull-up: hint user is about to open the product link.
          slideY.setValue(g.dy);
          bgOpacity.setValue(Math.max(0.4, 1 + g.dy / 500));
        } else {
          // Horizontal swipe — two-panel adjacency (no black gap)
          const swipeDir = g.dx < 0 ? 'next' : 'prev';
          const idx = currentIndexRef.current;
          const incomingIdx = swipeDir === 'next' ? idx + 1 : idx - 1;
          if (incomingIdx >= 0 && incomingIdx < stories.length) {
            if (transitionStoryIndexRef.current !== incomingIdx) {
              transitionStoryIndexRef.current = incomingIdx;
              transitionDirRef.current = swipeDir;
              setTransitionRef.current(incomingIdx);
            }
            slideX.setValue(g.dx);
            // Incoming panel is a sibling in screen space; position it adjacent to current
            incomingSlideX.setValue(swipeDir === 'next' ? SCREEN_W + g.dx : -SCREEN_W + g.dx);
          } else {
            // At edge of story list — rubber-band with no incoming panel
            if (transitionStoryIndexRef.current !== null) {
              transitionStoryIndexRef.current = null;
              incomingSlideX.setValue(SCREEN_W);
              setTransitionRef.current(null);
            }
            slideX.setValue(g.dx * 0.2);
          }
        }
      },
      onPanResponderRelease: (_, g) => {
        isSwipingRef.current = false;
        const idx = currentIndexRef.current;

        // A short but fast downward flick should also dismiss.
        const isDownwardGesture = g.dy > 0 && g.dy > Math.abs(g.dx);
        const shouldDismiss =
          isDownwardGesture && (g.dy > DISMISS_THRESHOLD || g.vy > 0.6);

        // Upward swipe → open product link (Instagram-style "swipe up").
        const isUpwardGesture = g.dy < 0 && Math.abs(g.dy) > Math.abs(g.dx);
        const shouldOpenLink =
          isUpwardGesture && storyLinkRef.current &&
          (Math.abs(g.dy) > UP_SWIPE_THRESHOLD || g.vy < -0.6);

        if (shouldDismiss) {
          animateDismissRef.current();

        } else if (shouldOpenLink) {
          animateGoToProductRef.current();

        } else if (
          (g.dx < -SWIPE_THRESHOLD || g.vx < -0.5) &&
          Math.abs(g.dx) > Math.abs(g.dy)
        ) {
          slideY.setValue(0);
          bgOpacity.setValue(1);
          slideScale.setValue(1);
          const nextIdx = idx + 1;
          if (nextIdx < stories.length && transitionStoryIndexRef.current === nextIdx) {
            // Complete the gesture already in progress — continue from current position
            isTransitioningRef.current = true;
            Animated.parallel([
              Animated.timing(slideX, { toValue: -SCREEN_W, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(incomingSlideX, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start(({ finished }) => {
              isTransitioningRef.current = false;
              transitionStoryIndexRef.current = null;
              if (!finished) {
                setTransitionRef.current(null);
                slideX.setValue(0);
                incomingSlideX.setValue(SCREEN_W);
                return;
              }
              imageReadyRef.current = true;
              pendingStartRef.current = false;
              setImageLoading(false);
              postTransitionRef.current = true;
              setCurrentIndex(nextIdx);
            });
          } else {
            goToRef.current(nextIdx, 'next');
          }

        } else if (
          (g.dx > SWIPE_THRESHOLD || g.vx > 0.5) &&
          Math.abs(g.dx) > Math.abs(g.dy)
        ) {
          slideY.setValue(0);
          bgOpacity.setValue(1);
          slideScale.setValue(1);
          const prevIdx = idx - 1;
          if (prevIdx >= 0 && transitionStoryIndexRef.current === prevIdx) {
            // Complete the gesture already in progress — continue from current position
            isTransitioningRef.current = true;
            Animated.parallel([
              Animated.timing(slideX, { toValue: SCREEN_W, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(incomingSlideX, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]).start(({ finished }) => {
              isTransitioningRef.current = false;
              transitionStoryIndexRef.current = null;
              if (!finished) {
                setTransitionRef.current(null);
                slideX.setValue(0);
                incomingSlideX.setValue(SCREEN_W);
                return;
              }
              imageReadyRef.current = true;
              pendingStartRef.current = false;
              setImageLoading(false);
              postTransitionRef.current = true;
              setCurrentIndex(prevIdx);
            });
          } else {
            goToRef.current(prevIdx, 'prev');
          }

        } else {
          // Snap back and resume
          const snapIncomingPos = transitionDirRef.current === 'next' ? SCREEN_W : -SCREEN_W;
          bgOpacity.setValue(1);
          slideScale.setValue(1); // dismiss'te scale kullanılmıyor ama reset ihtiyatla yapılır
          Animated.parallel([
            Animated.spring(slideX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(slideY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
            Animated.spring(incomingSlideX, { toValue: snapIncomingPos, friction: 8, tension: 60, useNativeDriver: true }),
          ]).start(({ finished }) => {
            if (finished && transitionStoryIndexRef.current !== null) {
              transitionStoryIndexRef.current = null;
              incomingSlideX.setValue(SCREEN_W);
              setTransitionRef.current(null);
            }
          });
          resumeRef.current();
        }
      },
      onPanResponderTerminate: () => {
        isSwipingRef.current = false;
        isTransitioningRef.current = false;
        if (transitionStoryIndexRef.current !== null) {
          transitionStoryIndexRef.current = null;
          incomingSlideX.setValue(SCREEN_W);
          setTransitionRef.current(null);
        }
        bgOpacity.setValue(1);
        slideScale.setValue(1);
        Animated.parallel([
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(slideY, { toValue: 0, useNativeDriver: true }),
        ]).start();
        resumeRef.current();
      },
    }),
  ).current;

  const openProductLink = useCallback(async () => {
    const link = storyLinkRef.current;
    if (!link) return;
    try {
      await Linking.openURL(link);
    } catch {
      Alert.alert('Hata', 'Bağlantı açılırken bir sorun oluştu.');
    }
  // storyLinkRef is a stable ref — no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slide-up exit animation — content rises off-screen, then link opens.
  const animateGoToProduct = useCallback(() => {
    const link = storyLinkRef.current;
    if (!link) {
      // No link → snap back
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
      return;
    }
    haptic(12);
    animRef.current?.stop();
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -SCREEN_H * 0.55,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(() => {
      openProductLink();
      // Reset after a beat so screen looks fresh if user comes back
      setTimeout(() => {
        slideY.setValue(0);
        bgOpacity.setValue(1);
      }, 400);
    });
  // storyLinkRef is a stable ref — no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgOpacity, openProductLink, slideY]);

  const animateGoToProductRef = useRef(animateGoToProduct);
  useEffect(() => { animateGoToProductRef.current = animateGoToProduct; }, [animateGoToProduct]);

  const handleGoToProduct = () => animateGoToProduct();

  const handleCopyCoupon = () => {
    if (!story.discountCode) return;
    Clipboard.setString(story.discountCode);
    setCopied(true);
    haptic(18);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <Animated.View style={[styles.container, { opacity: bgOpacity }]}>
      {/* Blurred backdrop — always fixed; fills the gap when content slides   */}
      {/* down during dismiss instead of showing the black container background */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Dark placeholder — görünür blur hazır olana kadar siyah yerine */}
        {!backdropReady && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#181818' }]} />
        )}
        <Image
          source={{ uri: story.productImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={14}
          onLoad={() => setBackdropReady(true)}
        />
      </View>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
      />
      <Animated.View
        style={[
          styles.slide,
          {
            transform: [
              { translateX: slideX },
              { translateY: slideY },
              { scale: slideScale },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* ══ LAYER 1: Blurred backdrop (current story, cover+blur) ═══════ */}
        <Image
          source={{ uri: story.productImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={14}
        />
        {/* Semi-transparent scrim so the blurred bg doesn't compete with the main image */}
        <View pointerEvents="none" style={styles.blurScrim} />

        {/* ══ LAYER 2: Main image (contain, events handled here) ══════════ */}
        <Image
          source={{ uri: story.productImage }}
          style={{ position: 'absolute', width: SCREEN_W, height: SCREEN_H }}
          resizeMode="contain"
          onLoadStart={() => {
            imageReadyRef.current = false;
            if (isTransitioningRef.current) return;
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
            loadingTimerRef.current = setTimeout(() => setImageLoading(true), 120);
          }}
          onLoad={() => {
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
            imageReadyRef.current = true;
            setImageLoading(false);
            if (pendingStartRef.current && !isTransitioningRef.current) {
              pendingStartRef.current = false;
              startProgress(currentIndexRef.current);
            }
          }}
          onError={() => {
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
            imageReadyRef.current = true;
            setImageLoading(false);
            if (pendingStartRef.current && !isTransitioningRef.current) {
              pendingStartRef.current = false;
              startProgress(currentIndexRef.current);
            }
          }}
        />
        {imageLoading && transitionStoryIndex === null && (
          <Animated.View pointerEvents="none" style={[styles.loadingOverlay, { opacity: shimmerAnim }]} />
        )}

        {/* ── Tap zones (left = prev, right = next; long-press = pause) ── */}
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.tapLeft}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={() => { if (Date.now() - pressStartTimeRef.current < LONG_PRESS_DELAY) goTo(currentIndex - 1, 'prev'); }}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={() => { if (Date.now() - pressStartTimeRef.current < LONG_PRESS_DELAY) advanceForward(currentIndex); }}
            activeOpacity={1}
          />
        </View>

        {/* ── Bottom content: brand + title + optional CTA ── */}
        <Animated.View
          style={[
            styles.bottomCard,
            { paddingBottom: insets.bottom + 16, opacity: overlayOpacity },
          ]}
        >
          {story.brand ? (
            <Text style={styles.brandLabel}>{story.brand.toUpperCase()}</Text>
          ) : null}
          {story.title ? (
            <Text style={styles.storyTitle} numberOfLines={2}>{story.title}</Text>
          ) : null}
          {/* Swipe-up hint chevron */}
          {resolveStoryLink(story) ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.swipeUpHint,
                {
                  opacity: swipeHintOpacity,
                  transform: [{
                    translateY: chevronBounce.interpolate({
                      inputRange: [0, 1],
                      outputRange: [4, -6],
                    }),
                  }],
                },
              ]}
            >
              <View style={styles.swipeUpButton}>
                <Text style={styles.swipeUpChevron}>⌃</Text>
                <Text style={styles.swipeUpText}>Yukarı kaydır</Text>
              </View>
            </Animated.View>
          ) : null}

          {/* ── CTA butonu + kupon overlay ── */}
          <View style={styles.ctaWrapper}>
            {/* Kupon — CTA butonunun sağ üstüne yerleşmiş küçük kart */}
            {story.discountCode ? (
              <TouchableOpacity
                onPress={handleCopyCoupon}
                activeOpacity={0.82}
                style={styles.couponTicket}
              >
                <View style={styles.couponLeft}>
                  <Text style={styles.couponLabel}>🎟  KUPON</Text>
                  <Text style={styles.couponCode} numberOfLines={1}>
                    {story.discountCode}
                  </Text>
                </View>
                <View style={styles.couponSep} />
                <View style={styles.couponRight}>
                  {copied ? (
                    <>
                      <Text style={styles.couponCopyIcon}>✓</Text>
                      <Text style={[styles.couponCopyText, { color: '#4ade80' }]}>Kopyalandı!</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.couponCopyIcon}>📋</Text>
                      <Text style={styles.couponCopyText}>Kopyala</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            ) : null}

            {/* İNDİRİME GİT — eski yerinde tam genişlik */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleGoToProduct}
              activeOpacity={0.88}
            >
              <Text style={styles.ctaText}>🛍️ İndirime Git</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>

      {/* ══ TOP BAR: outside slide View — unaffected by horizontal swipe ══ */}
      {/* Only slideY is applied so the bar dismisses naturally with the      */}
      {/* pull-down gesture. zIndex keeps it above the incoming panel.        */}
      <Animated.View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            opacity: overlayOpacity,
            transform: [{ translateY: slideY }],
            zIndex: 30,
          },
        ]}
      >
        <View style={styles.progressRow}>
          {(() => {
            const MAX_BARS = 12;
            const count = Math.min(stories.length, MAX_BARS);
            return Array.from({ length: count }, (_, i) => {
              const barStart = Math.floor(i * stories.length / count);
              const barEnd = Math.floor((i + 1) * stories.length / count);
              const isCompleted = currentIndex >= barEnd;
              const isCurrent = currentIndex >= barStart && currentIndex < barEnd;
              const scaleX = isCompleted ? 1 : isCurrent ? progressAnims[currentIndex] : 0;
              return (
                <View key={i} style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      { transform: [{ scaleX }] },
                      // Aktif (o anki) story → ilerleyen çubuk turuncu; diğerleri beyaz
                      isCurrent && { backgroundColor: Colors.orange },
                    ]}
                  />
                </View>
              );
            });
          })()}
        </View>
        <Text style={styles.timeAgoText}>{timeAgo(story.createdAt)}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={animateDismiss}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ══ INCOMING PANEL: ALWAYS mounted (never conditional) ═══════════ */}
      {/* Conditional mount causes a 1-frame flash with useNativeDriver.     */}
      {/* When idle: panel lives off-screen at SCREEN_W — invisible.         */}
      {/* When transitioning: slides in adjacent to current story.           */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: incomingSlideX }] },
        ]}
      >
        <Image
          source={{ uri: incomingPanelStory.productImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={14}
        />
        <View style={styles.blurScrim} />
        {/* Gerçek onLoad'a kadar opak arka plan — altındaki (bir önceki
            hedefin) donmuş görseli göstermek yerine düz koyu zemin gösterir. */}
        {!incomingLoaded && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#181818' }]} />
        )}
        <Image
          source={{ uri: incomingPanelStory.productImage }}
          style={[StyleSheet.absoluteFill, { opacity: incomingLoaded ? 1 : 0 }]}
          resizeMode="contain"
          onLoad={() => setIncomingLoaded(true)}
        />
      </Animated.View>

      {/* Story interstitial reklamı Google tarafından tam ekran sunulur —
          burada görsel bileşen yok; advanceForward içinde .show() ile gösterilir. */}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181818', // fallback; covered by story images during transitions
    overflow: 'hidden',
  },
  // Semi-transparent darkening layer over the blurred backdrop.
  // Keeps the blurred bg from competing with the main image.
  blurScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  slide: {
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
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 2,
    // Anchor scaleX to the left edge so 0→1 fills left-to-right.
    transformOrigin: 'left center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Eskiden yarı saydamdı (rgba(0,0,0,0.3)) — altındaki eski/donuk görsel
    // hafifçe kararmış halde görünmeye devam ediyordu. Opak yapıldı ki
    // yükleme sırasında önceki görsel tamamen gizlensin.
    backgroundColor: '#181818',
    zIndex: 2,
  },
  counterText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 4,
    minWidth: 30,
    textAlign: 'right',
  },
  timeAgoText: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 11,
    fontWeight: '600',
    paddingTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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

  // ── Tap zones ──────────────────────────────────────────────────
  tapZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  brandLabel: {
    color: Colors.orangeLight,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  swipeUpHint: {
    alignItems: 'center',
    marginBottom: 8,
  },
  swipeUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.orange,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 6,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  swipeUpChevron: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  swipeUpText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // ── CTA wrapper: kupon sağ üstte, buton altta ────────────────
  ctaWrapper: {
    gap: 0,
  },
  // ── Coupon ticket — CTA butonunun sağ üstüne hizalı küçük kart
  couponTicket: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-end',          // sağa yasla
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 6,
    overflow: 'hidden',
  },
  couponLeft: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    justifyContent: 'center',
  },
  couponLabel: {
    color: Colors.orangeLight,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  couponCode: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  couponSep: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  couponRight: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  couponCopyIcon: {
    fontSize: 13,
    color: Colors.white,
  },
  couponCopyText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── İNDİRİME GİT — tam genişlik, eski yerinde ────────────────
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
