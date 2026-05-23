import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  Image,
  Animated,
  PanResponder,
  Easing,
  BackHandler,
  Platform,
  NativeModules,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import NativeAdCard from '../components/NativeAdCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { getDiscountById, fetchDiscountsByCategory, fetchDiscountsByCategoryCached } from '../services/firebaseService';
import {
  getVotes, isDiscountExpired, addVote, Votes,
  hasUserVoted, getUserVoteType, setExpireTimer, getExpireAt,
} from '../services/voteService';
import OptimizedImage from '../components/OptimizedImage';
import DiscountCard from '../components/DiscountCard';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';
import type { Discount } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;
const { width: SCREEN_W } = Dimensions.get('window');

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

const getFavoriteIds = async (): Promise<string[]> => {
  try {
    const v = await AsyncStorage.getItem('favoriteDiscounts');
    return v ? JSON.parse(v) : [];
  } catch { return []; }
};

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getFakeViewCount(discountId: string, discountPct: number, firstViewedAt: number, localViews: number): number {
  const hash = simpleHash(discountId);
  const hash2 = simpleHash(discountId + 'dur');
  const scale = 0.5 + Math.max(0, Math.min(discountPct, 100)) / 100 * 0.5;
  const baseTarget = Math.round((200 + (hash % 1801)) * scale);
  const durationMs = (4 + (hash2 % 5)) * 3600000;
  const startValue = Math.round(baseTarget * 0.15);
  const progress = Math.min((Date.now() - firstViewedAt) / durationMs, 1);
  return Math.floor(startValue + (baseTarget - startValue) * progress) + localViews;
}

function timeAgoStr(createdAt: any): string {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function'
    ? createdAt.toMillis()
    : createdAt.seconds ? createdAt.seconds * 1000 : 0;
  if (!ms) return '';
  const diff = Math.floor((Date.now() - ms) / 60000);
  if (diff < 1) return 'Az önce';
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function DetailScreen({ route }: Props) {
  const { id, discount: routeDiscount, discountList: routeList, direction } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [discount, setDiscount] = useState<Discount | null>(routeDiscount ?? null);
  const [similarDiscounts, setSimilarDiscounts] = useState<Discount[]>([]);
  const [similarLastVisible, setSimilarLastVisible] = useState<any>(null);
  const [similarHasMore, setSimilarHasMore] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const similarLoadingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(!routeDiscount);
  const [error, setError] = useState('');
  const [votes, setVotes] = useState<Votes>(getVotes());
  const [userVoted, setUserVoted] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [expireCountdown, setExpireCountdown] = useState('');

  useEffect(() => {
    if (!lightboxVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setLightboxVisible(false);
      lbZoom.setValue(1);
      lbZoomRef.current = 1;
      return true;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxVisible]);
  const [viewCount, setViewCount] = useState<number | null>(null);

  // Animasyon değerleri
  const slideX      = useRef(new Animated.Value(0)).current;
  const inSlideX    = useRef(new Animated.Value(SCREEN_W)).current;
  const lbZoom      = useRef(new Animated.Value(1)).current;
  const lbZoomRef   = useRef(1);
  const lbPinchDist = useRef(0);
  const lbPinchScale= useRef(1);

  const lbPinchPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderMove: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t.length === 2) {
          if (lbPinchDist.current === 0) {
            const dx = t[0].pageX - t[1].pageX;
            const dy = t[0].pageY - t[1].pageY;
            lbPinchDist.current = Math.sqrt(dx * dx + dy * dy);
            lbPinchScale.current = lbZoomRef.current;
          }
          const dx = t[0].pageX - t[1].pageX;
          const dy = t[0].pageY - t[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const next = Math.max(1, Math.min(4, lbPinchScale.current * (dist / lbPinchDist.current)));
          lbZoom.setValue(next);
          lbZoomRef.current = next;
        }
      },
      onPanResponderRelease: () => {
        lbPinchDist.current = 0;
        if (lbZoomRef.current < 1.15) {
          Animated.spring(lbZoom, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
          lbZoomRef.current = 1;
        }
      },
      onPanResponderTerminate: () => { lbPinchDist.current = 0; },
    })
  ).current;
  const heartScale  = useRef(new Animated.Value(1)).current;
  const titleAnim   = useRef(new Animated.Value(0)).current;
  const priceAnim   = useRef(new Animated.Value(0)).current;

  // Yerel navigasyon state'i — navigation.replace yerine in-place geçiş
  const [localDiscount, setLocalDiscount] = useState<Discount | null>(routeDiscount ?? null);
  const [incomingDiscount, setIncomingDiscount] = useState<Discount | null>(null);
  const [localIndex, setLocalIndex] = useState(
    routeList ? routeList.findIndex((d: Discount) => d.id === id) : -1
  );

  const currentDiscountIdForView = localDiscount?.id ?? id;
  const currentIndex = localIndex;
  const hasPrev = currentIndex > 0;
  const hasNext = routeList !== null && routeList !== undefined && currentIndex >= 0 && currentIndex < (routeList?.length ?? 0) - 1;

  // Refs so PanResponder callbacks always see the latest values (avoids stale closures)
  const localIndexRef = useRef(localIndex);
  const doSlideRef = useRef<(dir: 'prev' | 'next') => void>(() => {});
  const setIncomingRef = useRef(setIncomingDiscount);
  const routeListRef = useRef(routeList);
  localIndexRef.current = localIndex;
  setIncomingRef.current = setIncomingDiscount;
  routeListRef.current = routeList;

  // Transition guard — prevents overlapping animations
  const isTransitioningRef = useRef(false);
  // postTransitionRef: set true in animation callback; positions reset in useEffect
  // AFTER React commits the new localIndex (same pattern as InfluencerStoryDetailScreen).
  // Eliminates the race where slideX.setValue(0) fires before React renders new content.
  const postTransitionRef = useRef(false);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'android') {
      const { NavigationBar } = NativeModules;
      NavigationBar?.setColor?.(isDark ? Colors.gray900 : Colors.gray50, !isDark);
    }
  }, [isDark]));
  const voteCardBg   = isDark ? Colors.gray800 : '#f0fdf4'; // soft green
  const codeCardBg   = isDark ? Colors.gray800 : '#fffbeb'; // soft amber
  const actionBtnBg  = isDark ? Colors.gray800 : '#f8faff'; // soft blue-white

  // Giriş animasyonu: yön bilgisine göre sağdan/soldan kayar gelir
  useEffect(() => {
    if (direction === 'next') {
      slideX.setValue(SCREEN_W * 0.28);
    } else if (direction === 'prev') {
      slideX.setValue(-SCREEN_W * 0.28);
    } else {
      return;
    }
    Animated.spring(slideX, {
      toValue: 0,
      friction: 9,
      tension: 80,
      useNativeDriver: true,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Başlık ve fiyat kartı giriş animasyonu
  useEffect(() => {
    if (!discount) return;
    titleAnim.setValue(0);
    priceAnim.setValue(0);
    Animated.stagger(110, [
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(priceAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount?.id]);

  // Load interstitial ad — hata olursa 3 saniye sonra tekrar dene
  useEffect(() => {
    getFavoriteIds().then(setFavorites);
    setVotes(getVotes());
    setUserVoted(hasUserVoted(id));
    // Ziyaret sayacını artır — katkı puanlarında "İnceleme" sayısına yansır
    AsyncStorage.getItem('detailVisitCount').then(val => {
      const count = val ? parseInt(val, 10) : 0;
      AsyncStorage.setItem('detailVisitCount', String(count + 1));
    });
  }, [id]);

  // Slide ile geçilen indirim değişince oy durumunu güncelle
  useEffect(() => {
    if (!localDiscount?.id) return;
    setUserVoted(hasUserVoted(localDiscount.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDiscount?.id]);

  useEffect(() => {
    if (!routeDiscount) {
      setIsLoading(true);
      getDiscountById(id)
        .then(d => {
          if (d) { setDiscount(d); setLocalDiscount(d); }
          else setError('İndirim detayı bulunamadı.');
        })
        .catch(() => setError('Yüklenirken hata oluştu.'))
        .finally(() => setIsLoading(false));
    }
  }, [id, routeDiscount]);

  // Slide sonrası localDiscount değişince benzer ürünleri de yenile
  const displayedCategory = localDiscount?.category ?? discount?.category;

  useEffect(() => {
    if (!currentDiscountIdForView || !displayedCategory) return;
    const targetId = currentDiscountIdForView;
    const targetCat = displayedCategory;
    setSimilarDiscounts([]);
    setSimilarLastVisible(null);
    setSimilarHasMore(false);
    setSimilarLoading(true);
    similarLoadingRef.current = true;
    fetchDiscountsByCategoryCached(targetCat, null).then(({ discounts, lastVisible, hasMore }) => {
      const filtered = discounts.filter(d => d.id !== targetId);
      setSimilarDiscounts(filtered);
      setSimilarLastVisible(lastVisible);
      setSimilarHasMore(hasMore);
    }).finally(() => {
      setSimilarLoading(false);
      similarLoadingRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiscountIdForView, displayedCategory]);

  // Expire countdown — slide sonrası currentDiscountIdForView değişince güncellenir
  useEffect(() => {
    const dId = currentDiscountIdForView;
    if (!dId) return;
    const currentVotes = getVotes();
    if (!isDiscountExpired(dId, currentVotes)) { setExpireCountdown(''); return; }
    setExpireTimer(dId);
    const tick = () => {
      const expireAt = getExpireAt(dId);
      if (!expireAt) return;
      const rem = expireAt - Date.now();
      if (rem <= 0) { setExpireCountdown('00:00'); return; }
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setExpireCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiscountIdForView, votes]);

  // Fake view count: deterministic target, grows linearly 4-8 hours from first visit
  useEffect(() => {
    const discountId = currentDiscountIdForView;
    if (!discountId) return;
    const currentD = localDiscount ?? discount;
    const pct = currentD && currentD.oldPrice > 0 && currentD.newPrice > 0
      ? Math.round(((currentD.oldPrice - currentD.newPrice) / currentD.oldPrice) * 100)
      : 0;
    let intervalId: ReturnType<typeof setInterval>;
    const init = async () => {
      const firstViewKey = `firstViewed_${discountId}`;
      let firstViewedAt = Date.now();
      try {
        const stored = await AsyncStorage.getItem(firstViewKey);
        if (stored) { firstViewedAt = parseInt(stored, 10); }
        else { await AsyncStorage.setItem(firstViewKey, String(firstViewedAt)); }
      } catch {}
      let localViews = 1;
      const lvKey = `localViews_${discountId}`;
      try {
        const stored = await AsyncStorage.getItem(lvKey);
        localViews = stored ? parseInt(stored, 10) + 1 : 1;
        await AsyncStorage.setItem(lvKey, String(localViews));
      } catch {}
      const update = () => setViewCount(getFakeViewCount(discountId, pct, firstViewedAt, localViews));
      update();
      intervalId = setInterval(update, 30000);
    };
    init();
    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiscountIdForView]);

  // postTransitionRef useEffect: positions reset AFTER React commits new localIndex —
  // prevents the 1-frame flash of old content when slideX.setValue(0) fires before render.
  useEffect(() => {
    if (postTransitionRef.current) {
      postTransitionRef.current = false;
      slideX.setValue(0);
      inSlideX.setValue(SCREEN_W);
      setIncomingDiscount(null);
      titleAnim.setValue(1);
      priceAnim.setValue(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localIndex]);

  const doSlide = useCallback((dir: 'prev' | 'next') => {
    const list = routeListRef.current;
    if (!list) return;
    // Guard: block re-entry while transition is running
    if (isTransitioningRef.current) return;

    // Always read index from ref — closure value may be stale on rapid swipes
    const currentIdx = localIndexRef.current;
    const targetIndex = dir === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const target = list[targetIndex];

    slideX.stopAnimation();
    inSlideX.stopAnimation();

    // Incoming panel already positioned by gesture; just ensure correct content
    setIncomingRef.current(prev => (prev?.id === target.id ? prev : target));

    isTransitioningRef.current = true;

    // Safety fallback: if animation callback never fires, recover after 900ms
    const safetyTimer = setTimeout(() => {
      isTransitioningRef.current = false;
      slideX.setValue(0);
      inSlideX.setValue(SCREEN_W);
      setIncomingDiscount(null);
    }, 900);

    // Same easing on both panels → zero gap throughout transition (no background flash)
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: dir === 'next' ? -SCREEN_W : SCREEN_W,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(inSlideX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      clearTimeout(safetyTimer);
      isTransitioningRef.current = false;
      if (!finished) {
        // Interrupted — reset immediately, don't commit state change
        slideX.setValue(0);
        inSlideX.setValue(SCREEN_W);
        setIncomingDiscount(null);
        return;
      }
      // Positions reset in localIndex useEffect, AFTER React commits the new discount
      postTransitionRef.current = true;
      setLocalDiscount(target);
      setLocalIndex(targetIndex);
    });
  // routeListRef/localIndexRef/setIncomingRef are stable refs — no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideX, inSlideX]);

  const navigateToDiscount = doSlide;
  doSlideRef.current = doSlide;

  const loadMoreSimilar = useCallback(() => {
    if (similarLoadingRef.current || !similarHasMore || !displayedCategory) return;
    const catSnap = displayedCategory;
    const idSnap = currentDiscountIdForView;
    similarLoadingRef.current = true;
    setSimilarLoading(true);
    fetchDiscountsByCategory(catSnap, similarLastVisible).then(({ discounts, lastVisible, hasMore }) => {
      const filtered = discounts.filter(d => d.id !== idSnap);
      setSimilarDiscounts(prev => {
        const existingIds = new Set(prev.map(x => x.id));
        return [...prev, ...filtered.filter(d => !existingIds.has(d.id))];
      });
      setSimilarLastVisible(lastVisible);
      setSimilarHasMore(hasMore);
    }).finally(() => {
      setSimilarLoading(false);
      similarLoadingRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [similarHasMore, similarLastVisible, displayedCategory, currentDiscountIdForView]);

  // Yatay kaydırma ile ilanlar arası geçiş
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 2 && Math.abs(gs.dx) > 12,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderMove: (_, gs) => {
        const idx = localIndexRef.current;
        const list = routeListRef.current;
        const hasN = list != null && idx < (list.length - 1);
        const hasP = idx > 0;
        if (gs.dx < 0 && hasN) {
          // Show incoming preview if not already set
          const nextItem = list![idx + 1];
          setIncomingRef.current(prev => prev?.id === nextItem.id ? prev : nextItem);
          slideX.setValue(gs.dx * 0.7);
          inSlideX.setValue(SCREEN_W + gs.dx * 0.7);
        } else if (gs.dx > 0 && hasP) {
          const prevItem = list![idx - 1];
          setIncomingRef.current(prev => prev?.id === prevItem.id ? prev : prevItem);
          slideX.setValue(gs.dx * 0.7);
          inSlideX.setValue(-SCREEN_W + gs.dx * 0.7);
        }
      },
      onPanResponderRelease: (_, gs) => {
        const idx = localIndexRef.current;
        const list = routeListRef.current;
        const threshold = SCREEN_W * 0.25;
        const hasN = list != null && idx < (list.length - 1);
        const hasP = idx > 0;
        if ((gs.dx < -threshold || (gs.dx < -40 && gs.vx < -0.5)) && hasN) {
          doSlideRef.current('next');
        } else if ((gs.dx > threshold || (gs.dx > 40 && gs.vx > 0.5)) && hasP) {
          doSlideRef.current('prev');
        } else {
          setIncomingDiscount(null);
          inSlideX.setValue(SCREEN_W);
          Animated.spring(slideX, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        setIncomingDiscount(null);
        inSlideX.setValue(SCREEN_W);
        Animated.spring(slideX, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    );
  }
  if (error || !discount) {
    return (
      <View style={[styles.center, { backgroundColor: bg, paddingTop: insets.top }]}>
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600 }}>{error || 'İndirim bulunamadı.'}</Text>
      </View>
    );
  }

  // d = currently displayed discount (updates on swipe, unlike `discount` which is only the initially loaded one)
  const d = localDiscount ?? discount!;

  const isExpired = isDiscountExpired(d.id, votes);
  const isAd = d.isAd === true;
  const isFavorite = favorites.includes(d.id);
  const discountPercentage =
    d.oldPrice > 0 && d.newPrice > 0
      ? Math.round(((d.oldPrice - d.newPrice) / d.oldPrice) * 100)
      : 0;
  const savings = d.oldPrice > d.newPrice ? Math.round(d.oldPrice - d.newPrice) : 0;
  const isHotDeal = discountPercentage >= 30;
  const isLowestPrice = discountPercentage >= 50;
  const voteData = votes[d.id] || { active: 0, expired: 0 };
  const totalVotes = voteData.active + voteData.expired;
  const activeRatio = totalVotes > 0 ? voteData.active / totalVotes : 0;
  const expiredRatio = totalVotes > 0 ? voteData.expired / totalVotes : 0;
  const userVoteType = getUserVoteType(d.id);

  const handleShare = async () => {
    const shareUrl = d.link || `https://indiva.app/detay/${d.id}`;
    const text = `🔥 İNDİVA'da ${discountPercentage > 0 ? `%${discountPercentage} indirimli ` : ''}fırsat!\n${d.title}\n${shareUrl}`;
    const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      Linking.openURL(waUrl);
    } else {
      try { await Share.share({ message: text, title: d.title }); } catch {}
    }
  };

  const handleToggleFavorite = async () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.45, friction: 3, tension: 200, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
    ]).start();
    const next = isFavorite
      ? favorites.filter(f => f !== d.id)
      : [...favorites, d.id];
    setFavorites(next);
    await AsyncStorage.setItem('favoriteDiscounts', JSON.stringify(next));
  };

  const handleGoToDiscount = () => {
    if (isAd) { if (d.link) Linking.openURL(d.link); return; }
    if (!isExpired && d.link) Linking.openURL(d.link);
  };

  const handleVote = async (voteType: 'active' | 'expired') => {
    if (userVoted) return;
    await addVote(d.id, voteType);
    const newVotes = getVotes();
    setVotes(newVotes);
    setUserVoted(true);
    if (isDiscountExpired(d.id, newVotes)) {
      setExpireTimer(d.id);
    }
  };

  const handleCopyCode = () => {
    if (!d.discountCode) return;
    Clipboard.setString(d.discountCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Animated.View
        style={[styles.swipeWrapper, { backgroundColor: bg, transform: [{ translateX: slideX }] }]}
        {...panResponder.panHandlers}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: bg }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={300}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 500) {
              loadMoreSimilar();
            }
          }}
        >
        <View style={{ padding: 12, paddingTop: insets.top + 8, gap: 10 }}>
          {/* Hero image */}
          <TouchableOpacity
            style={styles.heroContainer}
            onPress={() => setLightboxVisible(true)}
            activeOpacity={0.9}
          >
            {/* Blur bg */}
            <Image
              source={{ uri: d.imageUrl }}
              style={StyleSheet.absoluteFill}
              blurRadius={20}
            />
            <OptimizedImage
              src={d.imageUrl}
              alt={d.title}
              containerStyle={styles.heroInner}
              resizeMode="contain"
            />

            {/* Discount badge */}
            {!isAd && discountPercentage > 0 && (
              <View style={[styles.discountBadge, { backgroundColor: isHotDeal ? Colors.red500 : Colors.orange }]}>
                <Text style={styles.discountBadgeText}>{isHotDeal ? '🔥 ' : ''}%{discountPercentage} İNDİRİM</Text>
              </View>
            )}
            {isAd && (
              <View style={[styles.discountBadge, { backgroundColor: Colors.yellow400 }]}>
                <Text style={[styles.discountBadgeText, { color: Colors.yellow900 }]}>{d.adBadge || 'REKLAM'}</Text>
              </View>
            )}

            {/* Time badge */}
            {timeAgoStr(d.createdAt) && (
              <View style={styles.timeBadgeHero}>
                <Text style={styles.timeBadgeHeroText}>⏱ {timeAgoStr(d.createdAt)} yakalandı</Text>
              </View>
            )}

            {/* Tap hint */}
            <View style={styles.imageHint}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Büyütmek için dokun</Text>
            </View>
          </TouchableOpacity>

          {/* Expired warning */}
          {isExpired && !isAd && (
            <View style={[styles.warningBox, { backgroundColor: isDark ? '#1f0a0a' : Colors.red50 }]}>
              <Text style={{ color: isDark ? Colors.red300 : Colors.red700, fontWeight: '600' }}>
                ⚠️ Bu indirim sona ermiş olabilir!
              </Text>
            </View>
          )}

          {/* Title card */}
          <Animated.View style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1e2c3a' : '#f5f8ff',
              opacity: titleAnim,
              transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
            },
          ]}>
            <View style={styles.titleRowTop}>
              <View style={[styles.catBadge, { backgroundColor: isDark ? Colors.orange + '33' : Colors.orange + '22' }]}>
                <Text style={[styles.catBadgeText, { color: Colors.orange }]}>{d.category}</Text>
              </View>
              <Text style={[styles.brandText, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>{d.brand}</Text>
            </View>
            <Text style={[styles.discountTitle, { color: textColor }]}>{d.title}</Text>
            {/* Her zaman render — async viewCount gelince layout şişmesini önler */}
            <Text style={[styles.viewCountText, { color: isDark ? Colors.gray500 : Colors.gray400, opacity: viewCount !== null ? 1 : 0 }]}>
              {viewCount !== null ? `👁 Bugün ${viewCount.toLocaleString('tr-TR')} kişi inceledi` : '👁'}
            </Text>
            {isLowestPrice && !isAd && (
              <View style={styles.lowestPriceBadge}>
                <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '800' }}>👑 EN UYGUN FİYAT</Text>
              </View>
            )}
          </Animated.View>

          {/* Price card */}
          {(d.newPrice > 0 || d.oldPrice > 0) && (
            <Animated.View style={[
              styles.card,
              styles.priceCard,
              {
                backgroundColor: isDark ? '#1a1a2e' : '#fff7f0',
                borderTopColor: Colors.orange,
                opacity: priceAnim,
                transform: [{ translateY: priceAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
              },
            ]}>
              {/* Başlık satırı */}
              <View style={styles.priceHeaderRow}>
                <Text style={[styles.priceHeaderLabel, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                  GÜNCEL FİYAT
                </Text>
                {discountPercentage > 0 && (
                  <View style={[styles.pricePctBadge, { backgroundColor: isHotDeal ? Colors.red500 : Colors.orange }]}>
                    <Text style={styles.pricePctText}>{isHotDeal ? '🔥 ' : ''}%{discountPercentage} İndirim</Text>
                  </View>
                )}
              </View>

              {/* Ana fiyat alanı */}
              <View style={styles.priceMainRow}>
                <View style={styles.newPriceGroup}>
                  <Text style={[styles.mainPrice, { color: Colors.orange }]}>
                    {d.newPrice.toLocaleString('tr-TR')}
                  </Text>
                  <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                </View>
                {d.oldPrice > 0 && (
                  <View style={styles.oldPriceGroup}>
                    <Text style={[styles.oldPriceSmallLabel, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>
                      Önceki fiyat
                    </Text>
                    <Text style={[styles.oldPrice, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                      {d.oldPrice.toLocaleString('tr-TR')} TL
                    </Text>
                    {savings > 0 && (
                      <View style={[
                        styles.savingsPill,
                        {
                          backgroundColor: isDark ? '#052e16' : '#f0fdf4',
                          borderColor: isDark ? Colors.green500 + '40' : Colors.green500 + '60',
                        },
                      ]}>
                        <Text style={[styles.savingsPillText, { color: isDark ? Colors.green400 : Colors.green500 }]}>
                          💚 {savings.toLocaleString('tr-TR')} TL tasarruf
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Alt çizgi + dipnot */}
              <View style={[styles.priceDivider, { backgroundColor: isDark ? Colors.gray700 : Colors.orange + '25' }]} />
              <Text style={[styles.priceFooterNote, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>
                ⏱ Fiyat değişkenlik gösterebilir{timeAgoStr(d.createdAt) ? ` · ${timeAgoStr(d.createdAt)} eklendi` : ''}
              </Text>
            </Animated.View>
          )}

          {/* Banner reklam — PanResponder'dan izole edilmiş wrapper içinde */}
          <View
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
          >
            <BannerAd
              unitId={BANNER_AD_UNIT_ID}
              size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
              requestOptions={{ requestNonPersonalizedAdsOnly: true }}
              onAdFailedToLoad={() => {/* sessizce geç — UI kırılmasın */}}
            />
          </View>

          {/* Favorite + Share */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={[styles.actionBtn, { backgroundColor: actionBtnBg, borderColor: isFavorite ? Colors.red500 : (isDark ? Colors.gray700 : Colors.gray200) }]}
            >
              <Animated.Text style={{ fontSize: 16, transform: [{ scale: heartScale }] }}>
                {isFavorite ? '❤️' : '🤍'}
              </Animated.Text>
              <Text style={[styles.actionBtnText, { color: isFavorite ? Colors.red500 : (isDark ? Colors.gray300 : Colors.gray600) }]}>
                {isFavorite ? 'Favorilendi' : 'Favorile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={[styles.actionBtn, { backgroundColor: actionBtnBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}
            >
              <Text style={{ fontSize: 16 }}>💬</Text>
              <Text style={[styles.actionBtnText, { color: isDark ? Colors.gray300 : Colors.gray600 }]}>WhatsApp'ta Paylaş</Text>
            </TouchableOpacity>
          </View>

          {/* Discount code */}
          {d.discountCode && (
            <View style={[styles.card, { backgroundColor: codeCardBg }]}>
              <Text style={{ color: Colors.gray400, fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
                🎁 Fırsatı yakalamak için kodu kullan
              </Text>
              <TouchableOpacity
                onPress={handleCopyCode}
                style={[
                  styles.codeBorder,
                  { borderColor: copied ? Colors.green500 : Colors.orange, backgroundColor: copied ? '#f0fdf4' : 'transparent' },
                ]}
              >
                <Text style={[styles.codeText, { color: copied ? Colors.green500 : Colors.orange }]}>
                  {copied ? '✓ Kopyalandı!' : d.discountCode}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* CTA Button */}
          <TouchableOpacity
            onPress={handleGoToDiscount}
            disabled={isExpired && !isAd}
            style={[
              styles.ctaBtn,
              {
                backgroundColor: isAd
                  ? Colors.yellow400
                  : isExpired
                  ? isDark ? Colors.gray700 : Colors.gray300
                  : Colors.orange,
              },
            ]}
          >
            <Text style={[styles.ctaBtnText, { color: isAd ? Colors.yellow900 : isExpired ? Colors.gray500 : Colors.white }]}>
              {isAd ? '🛒 İndirime Git' : isExpired ? '⛔ İndirim Tükendi' : '🛒 FIRSATA GİT →'}
            </Text>
          </TouchableOpacity>

          {/* Voting section */}
          {!isAd && (
            <View style={[styles.card, { backgroundColor: voteCardBg }]}>
              {isExpired ? (
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: Colors.red500, fontWeight: '800', fontSize: 14 }}>⚠️ Topluluk bu indirim bitti dedi!</Text>
                  {expireCountdown && expireCountdown !== '00:00' && (
                    <Text style={{ color: Colors.gray400, fontSize: 13 }}>
                      Bu ilan <Text style={{ color: Colors.orange, fontWeight: '700' }}>{expireCountdown}</Text> sonra kaldırılacak
                    </Text>
                  )}
                  {renderVoteBars(activeRatio, expiredRatio, isDark)}
                </View>
              ) : !userVoted ? (
                <View style={{ gap: 10 }}>
                  <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                    📊 Bu indirim hâlâ devam ediyor mu?
                  </Text>
                  <View style={styles.voteButtons}>
                    <TouchableOpacity onPress={() => handleVote('active')} style={[styles.voteBtn, { backgroundColor: isDark ? '#052e16' : '#f0fdf4', borderColor: Colors.green500 }]}>
                      <Text style={{ color: Colors.green500, fontWeight: '700' }}>✅ Devam Ediyor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleVote('expired')} style={[styles.voteBtn, { backgroundColor: isDark ? '#1f0a0a' : Colors.red50, borderColor: Colors.red500 }]}>
                      <Text style={{ color: Colors.red500, fontWeight: '700' }}>❌ Bitti</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: Colors.gray400, fontSize: 12, fontWeight: '600' }}>📊 Topluluk Oyları</Text>
                    <Text style={{ color: userVoteType === 'active' ? Colors.green500 : Colors.red500, fontSize: 12, fontWeight: '700' }}>
                      {userVoteType === 'active' ? '✅ Oyunuz: Devam Ediyor' : '❌ Oyunuz: Bitti'}
                    </Text>
                  </View>
                  {renderVoteBars(activeRatio, expiredRatio, isDark)}
                </View>
              )}
              <Text style={[styles.voteFooter, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>
                🤖 Oylar algoritmamız tarafından değerlendiriliyor. Çoğunluk "bitti" dediğinde ilan otomatik kaldırılır.
              </Text>
            </View>
          )}

          {/* Native reklam — İNDİVA watermark üstünde */}
          <NativeAdCard style={{ alignSelf: 'stretch' }} />

          {/* INDIVA watermark */}
          <View style={styles.watermark}>
            <View style={[styles.divLine, { backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
            <Text style={[styles.watermarkText, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>İNDİVA</Text>
            <View style={[styles.divLine, { backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
          </View>

          {/* Similar discounts */}
          {(similarDiscounts.length > 0 || similarLoading) && (
            <View>
              <Text style={[styles.similarTitle, { color: isDark ? Colors.gray200 : Colors.gray700 }]}>🛍️ Benzer Fırsatlar</Text>
              <View style={styles.similarGrid}>
                {similarDiscounts.map(item => (
                  <View key={item.id} style={styles.similarCard}>
                    <DiscountCard
                      discount={item}
                      isFavorite={favorites.includes(item.id)}
                      onToggleFavorite={() => {
                        const next = favorites.includes(item.id)
                          ? favorites.filter(f => f !== item.id)
                          : [...favorites, item.id];
                        setFavorites(next);
                        AsyncStorage.setItem('favoriteDiscounts', JSON.stringify(next));
                      }}
                      isExpired={isDiscountExpired(item.id, votes)}
                      discountList={similarDiscounts}
                    />
                  </View>
                ))}
              </View>
              {similarLoading && (
                <ActivityIndicator
                  size="small"
                  color={Colors.orange}
                  style={{ marginTop: 12, marginBottom: 4 }}
                />
              )}
            </View>
          )}
        </View>
        </ScrollView>
      </Animated.View>

      {/* Incoming discount overlay — always mounted to avoid 1-frame flash on conditional mount with useNativeDriver */}
      {(() => {
        const inc = incomingDiscount ?? d;
        return (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: bg, transform: [{ translateX: inSlideX }] },
            ]}
            pointerEvents="none"
          >
            <View style={{ padding: 12, paddingTop: insets.top + 8, gap: 10 }}>
              {/* Hero image preview */}
              <View style={styles.heroContainer}>
                <Image
                  source={{ uri: inc.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  blurRadius={20}
                />
                <OptimizedImage
                  src={inc.imageUrl}
                  alt={inc.title}
                  containerStyle={styles.heroInner}
                  resizeMode="contain"
                />
              </View>

              {/* Title preview */}
              <View style={[styles.card, { backgroundColor: isDark ? '#1e2c3a' : '#f5f8ff' }]}>
                <View style={styles.titleRowTop}>
                  <View style={[styles.catBadge, { backgroundColor: isDark ? Colors.orange + '33' : Colors.orange + '22' }]}>
                    <Text style={[styles.catBadgeText, { color: Colors.orange }]}>{inc.category}</Text>
                  </View>
                  <Text style={[styles.brandText, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>{inc.brand}</Text>
                </View>
                <Text style={[styles.discountTitle, { color: textColor }]} numberOfLines={2}>
                  {inc.title}
                </Text>
                <Text style={[styles.viewCountText, { opacity: 0 }]}>👁</Text>
              </View>

              {/* Price preview */}
              {inc.newPrice > 0 && (
                <View style={[styles.card, styles.priceCard, { backgroundColor: isDark ? '#1a1a2e' : '#fff7f0', borderTopColor: Colors.orange }]}>
                  <View style={styles.priceHeaderRow}>
                    <Text style={[styles.priceHeaderLabel, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>GÜNCEL FİYAT</Text>
                  </View>
                  <View style={styles.priceMainRow}>
                    <View style={styles.newPriceGroup}>
                      <Text style={[styles.mainPrice, { color: Colors.orange }]}>{inc.newPrice.toLocaleString('tr-TR')}</Text>
                      <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                    </View>
                    {inc.oldPrice > 0 && (
                      <View style={styles.oldPriceGroup}>
                        <Text style={[styles.oldPriceSmallLabel, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>Önceki fiyat</Text>
                        <Text style={[styles.oldPrice, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                          {inc.oldPrice.toLocaleString('tr-TR')} TL
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </Animated.View>
        );
      })()}

      {/* Lightbox modal */}
      <Modal
        visible={lightboxVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setLightboxVisible(false);
          lbZoom.setValue(1);
          lbZoomRef.current = 1;
        }}
        onShow={() => { if (Platform.OS === 'android') NativeModules.NavigationBar?.setColor?.('#000000', false); }}
        onDismiss={() => {
          lbZoom.setValue(1); lbZoomRef.current = 1;
          if (Platform.OS === 'android') NativeModules.NavigationBar?.setColor?.(isDark ? Colors.gray900 : Colors.gray50, !isDark);
        }}
      >
        <View style={styles.lightboxOverlay} {...lbPinchPan.panHandlers}>
          <Animated.Image
            source={{ uri: d.imageUrl }}
            style={[styles.lightboxImage, { transform: [{ scale: lbZoom }] }]}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => { setLightboxVisible(false); lbZoom.setValue(1); lbZoomRef.current = 1; }}
          >
            <Text style={{ color: Colors.white, fontSize: 18, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

function renderVoteBars(activeRatio: number, expiredRatio: number, isDark: boolean) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.voteBarRow}>
        <Text style={{ width: 20 }}>✅</Text>
        <View style={[styles.voteBarTrack, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 }]}>
          <View style={[styles.voteBarFill, { width: `${activeRatio * 100}%`, backgroundColor: Colors.green500 }]} />
        </View>
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700' }}>
          %{Math.round(activeRatio * 100)}
        </Text>
      </View>
      <View style={styles.voteBarRow}>
        <Text style={{ width: 20 }}>❌</Text>
        <View style={[styles.voteBarTrack, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 }]}>
          <View style={[styles.voteBarFill, { width: `${expiredRatio * 100}%`, backgroundColor: Colors.red500 }]} />
        </View>
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700' }}>
          %{Math.round(expiredRatio * 100)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeWrapper: { flex: 1, overflow: 'hidden' },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroContainer: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.gray900,
    position: 'relative',
  },
  heroInner: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  discountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  discountBadgeText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  timeBadgeHero: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timeBadgeHeroText: { color: Colors.white, fontSize: 11, fontWeight: '500' },
  imageHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },
  warningBox: {
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.red500,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    gap: 8,
  },
  priceCard: {
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
    gap: 10,
    borderTopWidth: 3,
  },
  titleRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  catBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  brandText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  discountTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  lowestPriceBadge: {
    alignSelf: 'center',
    backgroundColor: Colors.amber300,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  priceHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceHeaderLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  pricePctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pricePctText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  priceMainRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  newPriceGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  mainPrice: { fontSize: 60, fontWeight: '900', lineHeight: 68 },
  priceUnit: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  oldPriceGroup: { alignItems: 'flex-end', gap: 4, marginBottom: 10 },
  oldPriceSmallLabel: { fontSize: 10, fontWeight: '600' },
  oldPrice: { textDecorationLine: 'line-through', fontSize: 15, fontWeight: '600' },
  savingsPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    alignSelf: 'flex-end',
  },
  savingsPillText: { fontSize: 11, fontWeight: '700' },
  priceDivider: { height: 1 },
  priceFooterNote: { fontSize: 11, textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  actionBtnText: { fontWeight: '700', fontSize: 14 },
  codeBorder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  codeText: { fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  ctaBtnText: { fontSize: 17, fontWeight: '900' },
  voteButtons: { flexDirection: 'row', gap: 10 },
  voteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  voteBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voteBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  voteBarFill: { height: '100%', borderRadius: 4 },
  voteFooter: { fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 8 },
  watermark: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
divLine: { flex: 1, height: 1 },
  watermarkText: { fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  similarTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  similarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  similarCard: { width: (SCREEN_W - 40) / 2 },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_W * 1.2,
  },
  viewCountText: { fontSize: 12, fontWeight: '600' },
  lightboxClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
