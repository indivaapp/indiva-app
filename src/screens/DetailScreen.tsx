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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InterstitialAd, BannerAd, BannerAdSize, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { getDiscountById, fetchSimilarDiscounts } from '../services/firebaseService';
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

const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-3675503435035155/8261572668';

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

const MREC_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

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
  const [isLoading, setIsLoading] = useState(!routeDiscount);
  const [error, setError] = useState('');
  const [votes, setVotes] = useState<Votes>(getVotes());
  const [userVoted, setUserVoted] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [expireCountdown, setExpireCountdown] = useState('');
  const [viewCount, setViewCount] = useState<number | null>(null);

  // Animasyon değerleri
  const slideX      = useRef(new Animated.Value(0)).current;
  const inSlideX    = useRef(new Animated.Value(0)).current;
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

  const bg = isDark ? Colors.gray900 : Colors.gray100;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

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
    if (!interstitial.loaded) interstitial.load();
    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => {
      setTimeout(() => { try { interstitial.load(); } catch {} }, 3000);
    });
    return () => unsubError();
  }, []);

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

  useEffect(() => {
    if (discount?.id && discount?.category) {
      fetchSimilarDiscounts(discount.category, discount.id).then(setSimilarDiscounts);
    }
  }, [discount?.id, discount?.category]);

  // Expire countdown
  useEffect(() => {
    if (!id) return;
    const currentVotes = getVotes();
    if (!isDiscountExpired(id, currentVotes)) return;
    setExpireTimer(id);
    const tick = () => {
      const expireAt = getExpireAt(id);
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
  }, [id, votes]);

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

  // navigation.replace yerine in-place geçiş — remount yok, kesintisiz animasyon
  const doSlide = useCallback((dir: 'prev' | 'next') => {
    if (!routeList) return;
    const targetIndex = dir === 'next' ? localIndex + 1 : localIndex - 1;
    if (targetIndex < 0 || targetIndex >= routeList.length) return;
    const target = routeList[targetIndex];

    inSlideX.setValue(dir === 'next' ? SCREEN_W : -SCREEN_W);
    setIncomingDiscount(target);

    Animated.parallel([
      Animated.timing(slideX, {
        toValue: dir === 'next' ? -SCREEN_W : SCREEN_W,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(inSlideX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setLocalDiscount(target);
      setLocalIndex(targetIndex);
      setIncomingDiscount(null);
      slideX.setValue(0);
      inSlideX.setValue(0);
      titleAnim.setValue(0);
      priceAnim.setValue(0);
      Animated.stagger(110, [
        Animated.timing(titleAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(priceAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  }, [routeList, localIndex, slideX, inSlideX, titleAnim, priceAnim]);

  const navigateToDiscount = doSlide;
  doSlideRef.current = doSlide;

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
          Animated.spring(slideX, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
          Animated.spring(inSlideX, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        setIncomingDiscount(null);
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

  const handleGoToDiscount = async () => {
    if (isAd) { if (d.link) Linking.openURL(d.link); return; }
    if (!isExpired && d.link) {
      const raw = await AsyncStorage.getItem('firsataGitCount');
      const count = parseInt(raw || '0') + 1;
      await AsyncStorage.setItem('firsataGitCount', String(count));
      if (count % 3 === 0) {
        const link = d.link;
        if (interstitial.loaded) {
          const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
            unsubClosed();
            Linking.openURL(link);
            interstitial.load();
          });
          interstitial.show().catch(() => {
            unsubClosed();
            Linking.openURL(link);
          });
          return;
        }
        // Yüklü değilse bir sonraki 3'lü için sıfırla ve yüklemeyi başlat
        await AsyncStorage.setItem('firsataGitCount', '0');
        try { interstitial.load(); } catch {}
      }
      {
        Linking.openURL(d.link);
      }
    }
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
        {/* Sabit üst bar — scroll edilmez */}
        <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: bg }]} />

        <ScrollView
          style={[styles.container, { backgroundColor: bg }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
        <View style={{ padding: 12, gap: 10 }}>
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
                <Text style={styles.discountBadgeText}>🔥 %{discountPercentage}{isHotDeal ? ' DEV' : ''} İNDİRİM</Text>
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
              transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}>
            <View style={styles.titleRowTop}>
              <View style={[styles.catBadge, { backgroundColor: isDark ? Colors.orange + '33' : Colors.orange + '22' }]}>
                <Text style={[styles.catBadgeText, { color: Colors.orange }]}>{d.category}</Text>
              </View>
              <Text style={[styles.brandText, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>{d.brand}</Text>
            </View>
            <Text style={[styles.discountTitle, { color: textColor }]}>{d.title}</Text>
            {viewCount !== null && (
              <Text style={[styles.viewCountText, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                👁 Bugün {viewCount.toLocaleString('tr-TR')} kişi inceledi
              </Text>
            )}
            {isLowestPrice && !isAd && (
              <View style={styles.lowestPriceBadge}>
                <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '800' }}>👑 EN UYGUN FİYAT</Text>
              </View>
            )}
          </Animated.View>

          {/* Banner reklam — başlık ile fiyat kartı arasında */}
          <BannerAd
            unitId={BANNER_AD_UNIT_ID}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />

          {/* Price card */}
          {(d.newPrice > 0 || d.oldPrice > 0) && (
            <Animated.View style={[
              styles.card,
              styles.priceCard,
              {
                backgroundColor: isDark ? '#1a1a2e' : '#fff7f0',
                opacity: priceAnim,
                transform: [{ translateY: priceAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
              },
            ]}>
              <View style={styles.priceTopRow}>
                <Text style={[styles.sadesceLabel, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>SADECE</Text>
                {discountPercentage > 0 && (
                  <View style={styles.percentBadge}>
                    <Text style={styles.percentBadgeText}>-%{discountPercentage}</Text>
                  </View>
                )}
              </View>
              <View style={styles.priceRow}>
                <View style={styles.mainPriceRow}>
                  <Text style={[styles.mainPrice, { color: Colors.orange }]}>{d.newPrice}</Text>
                  <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                </View>
                {d.oldPrice > 0 && (
                  <View style={styles.oldPriceCol}>
                    <Text style={[styles.oldPrice, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                      {d.oldPrice} TL
                    </Text>
                    {savings > 0 && (
                      <Text style={[styles.savingsText, { color: isDark ? Colors.green400 : Colors.green500 }]}>
                        {savings} TL ucuz
                      </Text>
                    )}
                  </View>
                )}
              </View>
              {savings > 0 && (
                <View style={styles.cebindeCard}>
                  <View>
                    <Text style={styles.cebindeLabel}>Cebinde Kalan</Text>
                    <Text style={styles.cebindeAmount}>{savings} TL</Text>
                  </View>
                  <Text style={{ fontSize: 28 }}>💰</Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Favorite + Share */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: isFavorite ? Colors.red500 : (isDark ? Colors.gray700 : Colors.gray200) }]}
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
              style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}
            >
              <Text style={{ fontSize: 16 }}>💬</Text>
              <Text style={[styles.actionBtnText, { color: isDark ? Colors.gray300 : Colors.gray600 }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {/* Discount code */}
          {d.discountCode && (
            <View style={[styles.card, { backgroundColor: cardBg }]}>
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
            <View style={[styles.card, { backgroundColor: cardBg }]}>
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

          {/* INDIVA watermark */}
          <View style={styles.watermark}>
            <View style={[styles.divLine, { backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
            <Text style={[styles.watermarkText, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>İNDİVA</Text>
            <View style={[styles.divLine, { backgroundColor: isDark ? Colors.gray700 : Colors.gray300 }]} />
          </View>

          {/* Native banner reklam alanı */}
          <View style={styles.mrecWrapper}>
            <BannerAd
              unitId={MREC_AD_UNIT_ID}
              size={BannerAdSize.MEDIUM_RECTANGLE}
              requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            />
          </View>

          {/* Similar discounts */}
          {similarDiscounts.length > 0 && (
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
            </View>
          )}
        </View>
        </ScrollView>
      </Animated.View>

      {/* Incoming discount overlay — slides in during swipe transition */}
      {incomingDiscount && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: bg, transform: [{ translateX: inSlideX }] },
          ]}
          pointerEvents="none"
        >
          <View style={{ paddingTop: insets.top + 50, padding: 12, gap: 10 }}>
            {/* Hero image preview */}
            <View style={styles.heroContainer}>
              <Image
                source={{ uri: incomingDiscount.imageUrl }}
                style={StyleSheet.absoluteFill}
                blurRadius={20}
              />
              <OptimizedImage
                src={incomingDiscount.imageUrl}
                alt={incomingDiscount.title}
                containerStyle={styles.heroInner}
                resizeMode="contain"
              />
            </View>

            {/* Title preview */}
            <View style={[styles.card, { backgroundColor: isDark ? '#1e2c3a' : '#f5f8ff' }]}>
              <Text style={[styles.discountTitle, { color: textColor }]} numberOfLines={2}>
                {incomingDiscount.title}
              </Text>
            </View>

            {/* Price preview */}
            {incomingDiscount.newPrice > 0 && (
              <View style={[styles.card, styles.priceCard, { backgroundColor: isDark ? '#1a1a2e' : '#fff7f0' }]}>
                <View style={styles.mainPriceRow}>
                  <Text style={[styles.mainPrice, { color: Colors.orange }]}>{incomingDiscount.newPrice}</Text>
                  <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                </View>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Lightbox modal */}
      <Modal visible={lightboxVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxVisible(false)}
        >
          <Image
            source={{ uri: d.imageUrl }}
            style={styles.lightboxImage}
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxVisible(false)}>
            <Text style={{ color: Colors.white, fontSize: 18, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: { padding: 4 },
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
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
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
  priceTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sadesceLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  percentBadge: { backgroundColor: Colors.red500, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  percentBadgeText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  mainPriceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  mainPrice: { fontSize: 60, fontWeight: '900', lineHeight: 68 },
  priceUnit: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  oldPriceCol: { alignItems: 'flex-end', gap: 4, marginBottom: 12 },
  oldPrice: { textDecorationLine: 'line-through', fontSize: 16, fontWeight: '600' },
  savingsText: { fontSize: 14, fontWeight: '700' },
  cebindeCard: {
    backgroundColor: Colors.green500,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cebindeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  cebindeAmount: { color: Colors.white, fontSize: 24, fontWeight: '900', marginTop: 2 },
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
  mrecWrapper: { alignItems: 'center', marginVertical: 4 },
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
