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
  InteractionManager,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { incrementVisitCount } from '../services/contributionService';
import Clipboard from '@react-native-clipboard/clipboard';
import { getDiscountById, fetchDiscountsByCategory, fetchDiscountsByCategoryCached, fetchDiscountVotes, invalidateDiscountVotes } from '../services/firebaseService';
import {
  isDiscountExpired, addVote,
  hasUserVoted, getUserVoteType, setExpireTimer, getExpireAt,
} from '../services/voteService';
import OptimizedImage from '../components/OptimizedImage';
import DiscountCard from '../components/DiscountCard';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { haptic } from '../utils/haptics';
import { timeAgoFromTs } from '../utils/time';
import type { RootStackParamList } from '../navigation';
import type { Discount } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;
const { width: SCREEN_W } = Dimensions.get('window');

const getFavoriteIds = async (): Promise<string[]> => {
  try {
    const v = await AsyncStorage.getItem('favoriteDiscounts');
    return v ? JSON.parse(v) : [];
  } catch { return []; }
};


// Firestore Timestamp'in yanı sıra AsyncStorage cache'inden (JSON round-trip)
// veya ISO string olarak gelen createdAt değerlerini de doğru işler (bkz. utils/time.ts).
const timeAgoStr = timeAgoFromTs;

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
  const [userVoted, setUserVoted] = useState(false);
  const [voteCalculating, setVoteCalculating] = useState(false); // "hesaplanıyor" animasyon fazı
  const [myVoteType, setMyVoteType] = useState<'active' | 'expired' | null>(null);
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
  const voteCalcAnim   = useRef(new Animated.Value(0)).current;  // hesaplanıyor pulse
  const voteRevealAnim = useRef(new Animated.Value(1)).current;  // sonuç reveal (varsayılan 1 = görünür)
  const voteCalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const incomingDiscountRef = useRef<Discount | null>(null);
  localIndexRef.current = localIndex;
  setIncomingRef.current = setIncomingDiscount;
  routeListRef.current = routeList;
  incomingDiscountRef.current = incomingDiscount;

  // Transition guard — prevents overlapping animations
  const isTransitioningRef = useRef(false);
  const postTransitionRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray700;

  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'android') {
      const { NavigationBar } = NativeModules;
      NavigationBar?.setColor?.(isDark ? Colors.gray900 : Colors.gray50, !isDark);
    }
  }, [isDark]));
  const voteCardBg   = isDark ? Colors.gray800 : '#f0fdf4'; // soft green
  const codeCardBg   = isDark ? Colors.gray800 : '#fffbeb'; // soft amber
  const actionBtnBg  = isDark ? Colors.gray800 : Colors.white;

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
    setUserVoted(hasUserVoted(id));
    // Ziyaret sayacını artır — katkı puanlarında "İnceleme" sayısına yansır
    // (serileştirilmiş yardımcı → ardışık geçişlerde yarış durumu yok)
    incrementVisitCount();
  }, [id]);

  // Slide ile geçilen indirim değişince oy durumunu güncelle + oy animasyon durumunu sıfırla
  useEffect(() => {
    if (!localDiscount?.id) return;
    setUserVoted(hasUserVoted(localDiscount.id));
    setMyVoteType(null);
    setVoteCalculating(false);
    if (voteCalcTimerRef.current) { clearTimeout(voteCalcTimerRef.current); voteCalcTimerRef.current = null; }
    voteCalcAnim.stopAnimation();
    voteRevealAnim.setValue(1); // yeni ilanda (zaten oy verilmişse) sonuç doğrudan görünür
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDiscount?.id]);

  // Unmount'ta oy "hesaplanıyor" zamanlayıcısını temizle
  useEffect(() => () => {
    if (voteCalcTimerRef.current) clearTimeout(voteCalcTimerRef.current);
  }, []);

  const loadDiscount = useCallback(() => {
    setIsLoading(true);
    setError('');
    getDiscountById(id)
      .then(d => {
        if (d) { setDiscount(d); setLocalDiscount(d); }
        else setError('İndirim detayı bulunamadı.');
      })
      .catch(() => setError('Yüklenirken hata oluştu.'))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!routeDiscount) loadDiscount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, routeDiscount]);

  // Görüntülenen ilanın GÜNCEL topluluk oy sayılarını Firestore'dan tazele.
  // Feed cache'i oy sayılarını içermediği için ekrana her girişte/odakta okunur
  // → "geri gelince %0 görünüyor" sorununu çözer.
  useFocusEffect(useCallback(() => {
    const targetId = currentDiscountIdForView;
    if (!targetId) return;
    fetchDiscountVotes(targetId).then(v => {
      if (!v) return;
      const apply = (disc: Discount | null): Discount | null =>
        disc && disc.id === targetId
          ? { ...disc, activeVotes: v.activeVotes, expiredVotes: v.expiredVotes }
          : disc;
      setDiscount(prev => apply(prev));
      setLocalDiscount(prev => apply(prev));
    });
  }, [currentDiscountIdForView]));

  // Slide sonrası localDiscount değişince benzer ürünleri de yenile
  const displayedCategory = localDiscount?.category ?? discount?.category;

  useEffect(() => {
    if (!currentDiscountIdForView || !displayedCategory) return;
    const targetId = currentDiscountIdForView;
    const targetCat = displayedCategory;

    // Mevcut listeyi hemen filtrele — geçiş sırasında flash olmaz ([] ile silme yok)
    setSimilarDiscounts(prev => prev.filter(d => d.id !== targetId));
    setSimilarLastVisible(null);
    setSimilarHasMore(false);
    similarLoadingRef.current = true;
    setSimilarLoading(true);

    // Benzer ürün fetch'ini geçiş animasyonu bitene kadar ertele → açılış/slide akıcı kalır
    const task = InteractionManager.runAfterInteractions(() => {
      // Cache'den çek (session/persistent cache varsa çok kısa sürede döner)
      fetchDiscountsByCategoryCached(targetCat, null)
        .then(({ discounts, lastVisible, hasMore }) => {
          setSimilarDiscounts(discounts.filter(d => d.id !== targetId));
          setSimilarLastVisible(lastVisible);
          setSimilarHasMore(hasMore);
        })
        .catch(() => {})
        .finally(() => {
          similarLoadingRef.current = false;
          setSimilarLoading(false);
        });
    });
    return () => task.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiscountIdForView, displayedCategory]);

  // Expire countdown — slide sonrası currentDiscountIdForView değişince güncellenir
  useEffect(() => {
    const disc = localDiscount ?? discount;
    if (!disc) return;
    const dId = disc.id;
    if (!isDiscountExpired(disc)) { setExpireCountdown(''); return; }
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
  }, [currentDiscountIdForView, localDiscount?.activeVotes, localDiscount?.expiredVotes, discount?.activeVotes, discount?.expiredVotes]);

  // Bir sonraki/önceki üründe kaydırma sırasında görsel yüklenmesini beklememek
  // için (kullanıcı şikayeti: "kasarak geçiyor... önceki görüntü flaş ile
  // gösteriyor") komşu ürünlerin görselini önceden RN'in native cache'ine
  // indiriyoruz. Kaydırma jesti başladığında (hatta çoğu zaman kullanıcı daha
  // dokunmadan, ürün değişir değişmez) görsel zaten hazır oluyor.
  useEffect(() => {
    const list = routeList;
    if (!list || localIndex < 0) return;
    const next = list[localIndex + 1];
    const prev = list[localIndex - 1];
    if (next?.imageUrl) Image.prefetch(next.imageUrl).catch(() => {});
    if (prev?.imageUrl) Image.prefetch(prev.imageUrl).catch(() => {});
  }, [routeList, localIndex]);

  // postTransitionRef useEffect: positions reset AFTER React commits new localIndex —
  // prevents the 1-frame flash of old content when slideX.setValue(0) fires before render.
  useEffect(() => {
    if (postTransitionRef.current) {
      postTransitionRef.current = false;
      slideX.setValue(0);
      inSlideX.setValue(SCREEN_W);
      titleAnim.setValue(1);
      priceAnim.setValue(1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      // Geçiş tamamlandı — içeriği temizle. Bir sonraki gesture başladığında
      // incomingDiscountRef.current null olacak, inSlideX content commit olmadan hareket etmeyecek.
      setIncomingDiscount(null);
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

    // İçerik gesture sırasında commit olmamışsa inSlideX'i doğru tarafa konumlandır.
    // (Hızlı swipe'larda ref guard, inSlideX'i hareket ettirmemiş olabilir.)
    if (incomingDiscountRef.current?.id !== target.id) {
      inSlideX.setValue(dir === 'next' ? SCREEN_W : -SCREEN_W);
    }

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
    fetchDiscountsByCategory(catSnap, similarLastVisible)
      .then(({ discounts, lastVisible, hasMore }) => {
        const filtered = discounts.filter(d => d.id !== idSnap);
        setSimilarDiscounts(prev => {
          const existingIds = new Set(prev.map(x => x.id));
          return [...prev, ...filtered.filter(d => !existingIds.has(d.id))];
        });
        setSimilarLastVisible(lastVisible);
        setSimilarHasMore(hasMore);
      })
      .catch(() => {
        // Sessizce yoksay — benzer ürünler isteğe bağlı
      })
      .finally(() => {
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
          const nextItem = list![idx + 1];
          setIncomingRef.current(prev => prev?.id === nextItem.id ? prev : nextItem);
          slideX.setValue(gs.dx * 0.7);
          // inSlideX'i ancak doğru içerik commit olduktan sonra hareket ettir.
          // commit olmadan hareket ederse önceki ürünün içeriği 1 frame görünür (flash).
          if (incomingDiscountRef.current?.id === nextItem.id) {
            inSlideX.setValue(SCREEN_W + gs.dx * 0.7);
          }
        } else if (gs.dx > 0 && hasP) {
          const prevItem = list![idx - 1];
          setIncomingRef.current(prev => prev?.id === prevItem.id ? prev : prevItem);
          slideX.setValue(gs.dx * 0.7);
          if (incomingDiscountRef.current?.id === prevItem.id) {
            inSlideX.setValue(-SCREEN_W + gs.dx * 0.7);
          }
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
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray500 }}>{error || 'İndirim bulunamadı.'}</Text>
        {!routeDiscount && (
          <TouchableOpacity
            onPress={loadDiscount}
            style={{ marginTop: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Tekrar dene"
          >
            <Text style={{ color: Colors.orange, fontWeight: '700' }}>Tekrar Dene</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // d = currently displayed discount (updates on swipe, unlike `discount` which is only the initially loaded one)
  const d = localDiscount ?? discount!;

  const isExpired = isDiscountExpired(d);
  // timeAgoStr 3 kez kullanılıyordu — bir kez hesapla
  const timeAgoText: string = timeAgoStr(d.createdAt);
  const isAd = d.isAd === true;
  const isFavorite = favorites.includes(d.id);
  const discountPercentage =
    d.oldPrice > 0 && d.newPrice > 0
      ? Math.round(((d.oldPrice - d.newPrice) / d.oldPrice) * 100)
      : 0;
  const savings = d.oldPrice > d.newPrice ? Math.round(d.oldPrice - d.newPrice) : 0;
  const isHotDeal = discountPercentage >= 30;
  const isLowestPrice = discountPercentage >= 50;
  const voteData = { active: d.activeVotes ?? 0, expired: d.expiredVotes ?? 0 };
  const totalVotes = voteData.active + voteData.expired;
  const activeRatio = totalVotes > 0 ? voteData.active / totalVotes : 0;
  const expiredRatio = totalVotes > 0 ? voteData.expired / totalVotes : 0;
  const userVoteType = getUserVoteType(d.id);

  const handleShare = async () => {
    haptic();
    const shareUrl = d.link || `https://indiva.app/detay/${d.id}`;
    const text = `🔥 İNDİVA'da ${discountPercentage > 0 ? `%${discountPercentage} indirimli ` : ''}fırsat!\n${d.title}\n${shareUrl}`;
    const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(waUrl).catch(() => {});
    } else {
      try { await Share.share({ message: text, title: d.title }); } catch {}
    }
  };

  const handleToggleFavorite = async () => {
    haptic();
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
    try {
      if (isAd) {
        if (d.link) { await Linking.openURL(d.link); }
        return;
      }
      if (!isExpired && d.link) { await Linking.openURL(d.link); }
    } catch {
      Alert.alert('Hata', 'Bağlantı açılamadı. Tarayıcınızı kontrol edin.');
    }
  };

  const handleVote = async (voteType: 'active' | 'expired') => {
    if (userVoted || voteCalculating) return;
    haptic();

    // Oyu hemen kaydet + "hesaplanıyor" fazına gir (oranlar bu fazda gizlenir → flicker yok)
    setMyVoteType(voteType);
    setUserVoted(true);
    setVoteCalculating(true);
    voteCalcAnim.setValue(0);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(voteCalcAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(voteCalcAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulse.start();

    const finish = () => { pulse.stop(); };

    const ok = await addVote(d.id, voteType);
    if (!ok) {
      finish();
      setUserVoted(false); setVoteCalculating(false); setMyVoteType(null);
      return; // Firestore yazımı başarısız → geri al
    }
    invalidateDiscountVotes(d.id); // sonraki odakta taze sayı okunsun (iyimser artış ezilmesin)

    // İyimser sayım artışı — görüntülenen ilana yansıt (sonraki fetch'te sunucudan gelir)
    const field: 'activeVotes' | 'expiredVotes' = voteType === 'active' ? 'activeVotes' : 'expiredVotes';
    const bump = (disc: Discount | null): Discount | null =>
      disc && disc.id === d.id ? { ...disc, [field]: (disc[field] ?? 0) + 1 } : disc;
    setLocalDiscount(prev => bump(prev));
    setDiscount(prev => bump(prev));
    const bumped = { ...d, [field]: (d[field] ?? 0) + 1 };
    if (isDiscountExpired(bumped)) setExpireTimer(d.id);

    // ~1.1 sn "hesaplanıyor" göster, sonra güncel oranları yumuşak bir reveal ile sun
    voteCalcTimerRef.current = setTimeout(() => {
      finish();
      setVoteCalculating(false);
      voteRevealAnim.setValue(0);
      Animated.spring(voteRevealAnim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
    }, 1100);
  };

  const handleCopyCode = () => {
    if (!d.discountCode) return;
    haptic();
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
          ref={scrollViewRef}
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
              blurRadius={14}
            />
            <OptimizedImage
              src={d.imageUrl}
              alt={d.title}
              isDark={isDark}
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


            {/* Eklenme zamanı — sağ üst köşe */}
            {timeAgoText ? (
              <View style={styles.timeBadgeHero} pointerEvents="none">
                <Text style={styles.timeBadgeHeroText}>⏱ {timeAgoText}</Text>
              </View>
            ) : null}

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

          {/* ── Title card ─────────────────────────────────────────── */}
          <Animated.View style={[
            styles.titleCard,
            {
              backgroundColor: cardBg,
              opacity: titleAnim,
              transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}>
            {/* Brand + Category */}
            <View style={styles.titleTopRow}>
              <Text style={[styles.brandChip, { color: isDark ? Colors.gray300 : Colors.gray500 }]}>
                {d.brand}
              </Text>
              <View style={[styles.catChip, { backgroundColor: isDark ? Colors.orange + '28' : Colors.orange + '16' }]}>
                <Text style={[styles.catChipText, { color: Colors.orange }]}>{d.category}</Text>
              </View>
            </View>

            <View style={[styles.titleDivider, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]} />

            {/* Title */}
            <Text style={[styles.discountTitle, { color: textColor }]}>{d.title}</Text>
          </Animated.View>

          {/* ── Sponsorlu ilan açıklaması ───────────────────────────── */}
          {isAd && !!d.description && (
            <View style={[styles.descriptionCard, {
              backgroundColor: isDark ? '#1a1505' : '#fffbeb',
              borderColor: isDark ? Colors.yellow400 + '30' : Colors.yellow400 + '60',
            }]}>
              <View style={styles.descriptionHeader}>
                <View style={[styles.descriptionDot, { backgroundColor: Colors.yellow400 }]} />
                <Text style={[styles.descriptionLabel, { color: isDark ? Colors.yellow400 : '#92400e' }]}>
                  ÜRÜN AÇIKLAMASI
                </Text>
              </View>
              <Text style={[styles.descriptionText, { color: isDark ? Colors.gray300 : Colors.gray700 }]}>
                {d.description}
              </Text>
            </View>
          )}

          {/* ── Price card ──────────────────────────────────────────── */}
          {(d.newPrice > 0 || d.oldPrice > 0) && (
            <Animated.View style={[
              styles.priceCard,
              {
                backgroundColor: isDark ? '#16111f' : '#ffffff',
                opacity: priceAnim,
                transform: [{ translateY: priceAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              },
            ]}>
              {/* Header: label + discount badge */}
              <View style={styles.priceHeaderRow}>
                <View style={styles.priceLabelRow}>
                  <View style={[styles.priceLabelDot, { backgroundColor: Colors.orange }]} />
                  <Text style={[styles.priceHeaderLabel, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
                    GÜNCEL FİYAT
                  </Text>
                </View>
                {discountPercentage > 0 && (
                  <View style={[styles.pricePctBadge, { backgroundColor: isHotDeal ? Colors.red500 : Colors.orange }]}>
                    <Text style={styles.pricePctText}>
                      {isHotDeal ? '🔥 ' : ''} %{discountPercentage} İndirim
                    </Text>
                  </View>
                )}
              </View>

              {/* Main price */}
              <View style={styles.priceMainRow}>
                <View style={styles.newPriceGroup}>
                  <Text style={[styles.mainPrice, { color: Colors.orange }]}>
                    {Math.floor(d.newPrice).toLocaleString('tr-TR')}
                  </Text>
                  <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                </View>
                {d.oldPrice > 0 && (
                  <View style={styles.oldPriceGroup}>
                    <Text style={[styles.oldPriceSmallLabel, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>
                      Liste fiyatı
                    </Text>
                    <Text style={[styles.oldPrice, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                      {Math.floor(d.oldPrice).toLocaleString('tr-TR')} TL
                    </Text>
                  </View>
                )}
              </View>

              {/* Savings bar */}
              {savings > 0 && (
                <View style={[styles.savingsBar, {
                  backgroundColor: isDark ? '#052e16' : '#f0fdf4',
                  borderColor: isDark ? Colors.green500 + '35' : Colors.green500 + '55',
                }]}>
                  <Text style={[styles.savingsBarText, { color: isDark ? Colors.green400 : Colors.green500 }]}>
                    💚  {savings.toLocaleString('tr-TR')} TL tasarruf ediyorsunuz
                  </Text>
                </View>
              )}

            </Animated.View>
          )}

          {/* Favorite + Share */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={[styles.actionBtn, { backgroundColor: actionBtnBg, borderColor: isFavorite ? Colors.red500 : (isDark ? Colors.gray700 : Colors.gray200) }]}
              accessibilityRole="button"
              accessibilityState={{ selected: isFavorite }}
              accessibilityLabel={isFavorite ? 'Favorilendi' : 'Favorile'}
            >
              <Animated.Text style={{ fontSize: 16, transform: [{ scale: heartScale }] }}>
                {isFavorite ? '❤️' : '🤍'}
              </Animated.Text>
              <Text style={[styles.actionBtnText, { color: isFavorite ? Colors.red500 : (isDark ? Colors.gray300 : Colors.gray500) }]}>
                {isFavorite ? 'Favorilendi' : 'Favorile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={[styles.actionBtn, { backgroundColor: actionBtnBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}
              accessibilityRole="button"
              accessibilityLabel="WhatsApp'ta paylaş"
            >
              <Text style={{ fontSize: 16 }}>💬</Text>
              <Text style={[styles.actionBtnText, { color: isDark ? Colors.gray300 : Colors.gray500 }]}>WhatsApp'ta Paylaş</Text>
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
                accessibilityRole="button"
                accessibilityLabel={copied ? 'Kod kopyalandı' : `İndirim kodunu kopyala: ${d.discountCode}`}
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
            accessibilityRole="button"
            accessibilityState={{ disabled: isExpired && !isAd }}
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
                  <Text style={{ color: isDark ? Colors.gray300 : Colors.gray500, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                    📊 Bu indirim hâlâ devam ediyor mu?
                  </Text>
                  <View style={styles.voteButtons}>
                    <TouchableOpacity onPress={() => handleVote('active')} style={[styles.voteBtn, { backgroundColor: isDark ? '#052e16' : '#f0fdf4', borderColor: Colors.green500 }]} accessibilityRole="button" accessibilityLabel="Devam ediyor, oy ver">
                      <Text style={{ color: Colors.green500, fontWeight: '700' }}>✅ Devam Ediyor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleVote('expired')} style={[styles.voteBtn, { backgroundColor: isDark ? '#1f0a0a' : Colors.red50, borderColor: Colors.red500 }]} accessibilityRole="button" accessibilityLabel="Bitti, oy ver">
                      <Text style={{ color: Colors.red500, fontWeight: '700' }}>❌ Bitti</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : voteCalculating ? (
                <View style={{ alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                  <ActivityIndicator size="small" color={Colors.orange} />
                  <Animated.Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isDark ? Colors.gray300 : Colors.gray500,
                      opacity: voteCalcAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                    }}
                  >
                    🤖 Güncel oylar hesaplanıyor…
                  </Animated.Text>
                </View>
              ) : (
                <Animated.View
                  style={{
                    gap: 8,
                    opacity: voteRevealAnim,
                    transform: [{ translateY: voteRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: Colors.gray400, fontSize: 12, fontWeight: '600' }}>📊 Topluluk Oyları</Text>
                    <Text style={{ color: (myVoteType ?? userVoteType) === 'active' ? Colors.green500 : Colors.red500, fontSize: 12, fontWeight: '700' }}>
                      {(myVoteType ?? userVoteType) === 'active' ? '✅ Oyunuz: Devam Ediyor' : '❌ Oyunuz: Bitti'}
                    </Text>
                  </View>
                  {renderVoteBars(activeRatio, expiredRatio, isDark)}
                </Animated.View>
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

          {/* Similar discounts */}
          {(similarDiscounts.length > 0 || similarLoading) && (
            <View>
              <Text style={[styles.similarTitle, { color: isDark ? Colors.gray200 : Colors.gray700 }]}>🛍️ Benzer Fırsatlar</Text>
              <View style={styles.similarGrid}>
                {similarDiscounts.map(deal => (
                  <View key={deal.id} style={styles.similarCard}>
                    <DiscountCard
                      discount={deal}
                      isFavorite={favorites.includes(deal.id)}
                      onToggleFavorite={() => {
                        const next = favorites.includes(deal.id)
                          ? favorites.filter(f => f !== deal.id)
                          : [...favorites, deal.id];
                        setFavorites(next);
                        AsyncStorage.setItem('favoriteDiscounts', JSON.stringify(next));
                      }}
                      isExpired={isDiscountExpired(deal)}
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
        const inc = incomingDiscount;
        return (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: bg, transform: [{ translateX: inSlideX }] },
            ]}
            pointerEvents="none"
          >
            {inc && <View style={{ padding: 12, paddingTop: insets.top + 8, gap: 10 }}>
              {/* Hero image preview */}
              <View style={styles.heroContainer}>
                <Image
                  source={{ uri: inc.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  blurRadius={14}
                />
                <OptimizedImage
                  src={inc.imageUrl}
                  alt={inc.title}
                  isDark={isDark}
                  containerStyle={styles.heroInner}
                  resizeMode="contain"
                />
                {(() => {
                  const incIsAd = inc.isAd === true;
                  const incPct = !incIsAd && inc.oldPrice > 0 && inc.newPrice > 0
                    ? Math.round(((inc.oldPrice - inc.newPrice) / inc.oldPrice) * 100) : 0;
                  const incHot = incPct >= 30;
                  if (incIsAd) return (
                    <View style={[styles.discountBadge, { backgroundColor: Colors.yellow400 }]}>
                      <Text style={[styles.discountBadgeText, { color: Colors.yellow900 }]}>{inc.adBadge || 'REKLAM'}</Text>
                    </View>
                  );
                  if (incPct > 0) return (
                    <View style={[styles.discountBadge, { backgroundColor: incHot ? Colors.red500 : Colors.orange }]}>
                      <Text style={styles.discountBadgeText}>{incHot ? '🔥 ' : ''}%{incPct} İNDİRİM</Text>
                    </View>
                  );
                  return null;
                })()}
              </View>

              {/* Title preview */}
              <View style={[styles.titleCard, { backgroundColor: cardBg }]}>
                <View style={styles.titleTopRow}>
                  <Text style={[styles.brandChip, { color: isDark ? Colors.gray300 : Colors.gray500 }]}>
                    {inc.brand}
                  </Text>
                  <View style={[styles.catChip, { backgroundColor: isDark ? Colors.orange + '28' : Colors.orange + '16' }]}>
                    <Text style={[styles.catChipText, { color: Colors.orange }]}>{inc.category}</Text>
                  </View>
                </View>
                <View style={[styles.titleDivider, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]} />
                <Text style={[styles.discountTitle, { color: textColor }]} numberOfLines={2}>{inc.title}</Text>
                <View style={[styles.titleDivider, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]} />
                {(() => {
                    const incTimeAgo = timeAgoStr(inc.createdAt);
                    return incTimeAgo ? (
                      <View style={styles.metaRow}>
                        <Text style={[styles.metaText, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                          ⏱  {incTimeAgo}
                        </Text>
                      </View>
                    ) : null;
                  })()}
              </View>

              {/* Price preview */}
              {(inc.newPrice > 0 || inc.oldPrice > 0) && (() => {
                const incPct = inc.oldPrice > 0 && inc.newPrice > 0
                  ? Math.round(((inc.oldPrice - inc.newPrice) / inc.oldPrice) * 100) : 0;
                const incSavings = inc.oldPrice > inc.newPrice ? Math.round(inc.oldPrice - inc.newPrice) : 0;
                const incHot = incPct >= 30;
                return (
                  <View style={[styles.priceCard, { backgroundColor: isDark ? '#16111f' : '#ffffff' }]}>
                    <View style={styles.priceHeaderRow}>
                      <View style={styles.priceLabelRow}>
                        <View style={[styles.priceLabelDot, { backgroundColor: Colors.orange }]} />
                        <Text style={[styles.priceHeaderLabel, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>GÜNCEL FİYAT</Text>
                      </View>
                      {incPct > 0 && (
                        <View style={[styles.pricePctBadge, { backgroundColor: incHot ? Colors.red500 : Colors.orange }]}>
                          <Text style={styles.pricePctText}>{incHot ? '🔥 ' : ''}%{incPct} İndirim</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.priceMainRow}>
                      <View style={styles.newPriceGroup}>
                        <Text style={[styles.mainPrice, { color: Colors.orange }]}>{Math.floor(inc.newPrice).toLocaleString('tr-TR')}</Text>
                        <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                      </View>
                      {inc.oldPrice > 0 && (
                        <View style={styles.oldPriceGroup}>
                          <Text style={[styles.oldPriceSmallLabel, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>Liste fiyatı</Text>
                          <Text style={[styles.oldPrice, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                            {Math.floor(inc.oldPrice).toLocaleString('tr-TR')} TL
                          </Text>
                        </View>
                      )}
                    </View>
                    {incSavings > 0 && (
                      <View style={[styles.savingsBar, {
                        backgroundColor: isDark ? '#052e16' : '#f0fdf4',
                        borderColor: isDark ? Colors.green500 + '35' : Colors.green500 + '55',
                      }]}>
                        <Text style={[styles.savingsBarText, { color: isDark ? Colors.green400 : Colors.green500 }]}>
                          💚  {incSavings.toLocaleString('tr-TR')} TL tasarruf ediyorsunuz
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Action row preview */}
              <View style={styles.actionRow}>
                <View style={[styles.actionBtn, { backgroundColor: actionBtnBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}>
                  <Text style={{ fontSize: 16 }}>🤍</Text>
                  <Text style={[styles.actionBtnText, { color: isDark ? Colors.gray300 : Colors.gray500 }]}>Favorile</Text>
                </View>
                <View style={[styles.actionBtn, { backgroundColor: actionBtnBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}>
                  <Text style={{ fontSize: 16 }}>💬</Text>
                  <Text style={[styles.actionBtnText, { color: isDark ? Colors.gray300 : Colors.gray500 }]}>WhatsApp'ta Paylaş</Text>
                </View>
              </View>

              {/* CTA preview */}
              {(() => {
                const incIsAd = inc.isAd === true;
                const incExpired = isDiscountExpired(inc);
                const incUserVoted = hasUserVoted(inc.id);
                const incVoteData = { active: inc.activeVotes ?? 0, expired: inc.expiredVotes ?? 0 };
                const incTotalVotes = incVoteData.active + incVoteData.expired;
                const incActiveRatio = incTotalVotes > 0 ? incVoteData.active / incTotalVotes : 0;
                const incExpiredRatio = incTotalVotes > 0 ? incVoteData.expired / incTotalVotes : 0;
                const incVoteType = getUserVoteType(inc.id);
                return (
                  <>
                    <View style={[styles.ctaBtn, {
                      backgroundColor: incIsAd ? Colors.yellow400 : incExpired ? (isDark ? Colors.gray700 : Colors.gray300) : Colors.orange,
                    }]}>
                      <Text style={[styles.ctaBtnText, { color: incIsAd ? Colors.yellow900 : incExpired ? Colors.gray500 : Colors.white }]}>
                        {incIsAd ? '🛒 İndirime Git' : incExpired ? '⛔ İndirim Tükendi' : '🛒 FIRSATA GİT →'}
                      </Text>
                    </View>

                    {/* Voting preview */}
                    {!incIsAd && (
                      <View style={[styles.card, { backgroundColor: voteCardBg }]}>
                        {incExpired ? (
                          <View style={{ alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: Colors.red500, fontWeight: '800', fontSize: 14 }}>⚠️ Topluluk bu indirim bitti dedi!</Text>
                            {renderVoteBars(incActiveRatio, incExpiredRatio, isDark)}
                          </View>
                        ) : !incUserVoted ? (
                          <View style={{ gap: 10 }}>
                            <Text style={{ color: isDark ? Colors.gray300 : Colors.gray500, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                              📊 Bu indirim hâlâ devam ediyor mu?
                            </Text>
                            <View style={styles.voteButtons}>
                              <View style={[styles.voteBtn, { backgroundColor: isDark ? '#052e16' : '#f0fdf4', borderColor: Colors.green500 }]}>
                                <Text style={{ color: Colors.green500, fontWeight: '700' }}>✅ Devam Ediyor</Text>
                              </View>
                              <View style={[styles.voteBtn, { backgroundColor: isDark ? '#1f0a0a' : Colors.red50, borderColor: Colors.red500 }]}>
                                <Text style={{ color: Colors.red500, fontWeight: '700' }}>❌ Bitti</Text>
                              </View>
                            </View>
                          </View>
                        ) : (
                          <View style={{ gap: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: Colors.gray400, fontSize: 12, fontWeight: '600' }}>📊 Topluluk Oyları</Text>
                              <Text style={{ color: incVoteType === 'active' ? Colors.green500 : Colors.red500, fontSize: 12, fontWeight: '700' }}>
                                {incVoteType === 'active' ? '✅ Oyunuz: Devam Ediyor' : '❌ Oyunuz: Bitti'}
                              </Text>
                            </View>
                            {renderVoteBars(incActiveRatio, incExpiredRatio, isDark)}
                          </View>
                        )}
                        <Text style={[styles.voteFooter, { color: isDark ? Colors.gray600 : Colors.gray400 }]}>
                          🤖 Oylar algoritmamız tarafından değerlendiriliyor. Çoğunluk "bitti" dediğinde ilan otomatik kaldırılır.
                        </Text>
                      </View>
                    )}
                  </>
                );
              })()}
            </View>}
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
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray500, width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700' }}>
          %{Math.round(activeRatio * 100)}
        </Text>
      </View>
      <View style={styles.voteBarRow}>
        <Text style={{ width: 20 }}>❌</Text>
        <View style={[styles.voteBarTrack, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 }]}>
          <View style={[styles.voteBarFill, { width: `${expiredRatio * 100}%`, backgroundColor: Colors.red500 }]} />
        </View>
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray500, width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700' }}>
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

  // ── Title card ──────────────────────────────────────────────────
  titleCard: {
    borderRadius: 20,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  titleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandChip: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  titleDivider: { height: 1 },
  discountTitle: { fontSize: 17, fontWeight: '800', lineHeight: 24 },
  lowestPriceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.amber300,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  lowestPriceBadgeText: { color: Colors.amber800, fontSize: 12, fontWeight: '800' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: { fontSize: 12, fontWeight: '600' },

  // ── Price card ──────────────────────────────────────────────────
  priceCard: {
    borderRadius: 20,
    padding: 20,
    gap: 14,
    borderTopWidth: 4,
    borderTopColor: Colors.orange,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  priceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceLabelDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  priceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceHeaderLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  pricePctBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pricePctText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  priceMainRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  newPriceGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  mainPrice: { fontSize: 56, fontWeight: '900', lineHeight: 64 },
  priceUnit: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  oldPriceGroup: { alignItems: 'flex-end', gap: 5, marginBottom: 8 },
  oldPriceSmallLabel: { fontSize: 10, fontWeight: '600' },
  oldPrice: { textDecorationLine: 'line-through', fontSize: 15, fontWeight: '600' },
  savingsBar: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  savingsBarText: { fontSize: 14, fontWeight: '700' },
  priceDivider: { height: 1 },
  priceFooterNote: { fontSize: 11, textAlign: 'center' },

  // ── Sponsorlu açıklama kartı ─────────────────────────────────────
  descriptionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  descriptionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  descriptionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },

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
