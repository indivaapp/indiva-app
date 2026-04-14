import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
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
  : 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

const getFavoriteIds = async (): Promise<string[]> => {
  try {
    const v = await AsyncStorage.getItem('favoriteDiscounts');
    return v ? JSON.parse(v) : [];
  } catch { return []; }
};

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
  const { id, discount: routeDiscount, discountList: routeList } = route.params;
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

  const currentIndex = routeList ? routeList.findIndex((d: Discount) => d.id === id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = routeList !== null && routeList !== undefined && currentIndex >= 0 && currentIndex < (routeList?.length ?? 0) - 1;

  const bg = isDark ? Colors.gray900 : Colors.gray100;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

  // Load interstitial ad
  useEffect(() => {
    interstitial.load();
    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {});
    return () => unsubLoaded();
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
          if (d) setDiscount(d);
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

  const navigateToDiscount = useCallback((dir: 'prev' | 'next') => {
    if (!routeList) return;
    const targetIndex = dir === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= routeList.length) return;
    const target = routeList[targetIndex];
    navigation.replace('Detail', { id: target.id, discount: target, discountList: routeList });
  }, [routeList, currentIndex, navigation]);

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

  const isExpired = isDiscountExpired(discount.id, votes);
  const isAd = discount.isAd === true;
  const isFavorite = favorites.includes(discount.id);
  const discountPercentage =
    discount.oldPrice > 0 && discount.newPrice > 0
      ? Math.round(((discount.oldPrice - discount.newPrice) / discount.oldPrice) * 100)
      : 0;
  const savings = discount.oldPrice > discount.newPrice ? Math.round(discount.oldPrice - discount.newPrice) : 0;
  const isHotDeal = discountPercentage >= 30;
  const isLowestPrice = discountPercentage >= 50;
  const voteData = votes[discount.id] || { active: 0, expired: 0 };
  const totalVotes = voteData.active + voteData.expired;
  const activeRatio = totalVotes > 0 ? voteData.active / totalVotes : 0;
  const expiredRatio = totalVotes > 0 ? voteData.expired / totalVotes : 0;
  const userVoteType = getUserVoteType(discount.id);

  const handleShare = async () => {
    const shareUrl = discount.link || `https://indiva.app/detay/${discount.id}`;
    const text = `🔥 İNDİVA'da ${discountPercentage > 0 ? `%${discountPercentage} indirimli ` : ''}fırsat!\n${discount.title}`;
    try { await Share.share({ message: `${text}\n${shareUrl}`, title: discount.title }); } catch {}
  };

  const handleToggleFavorite = async () => {
    const next = isFavorite
      ? favorites.filter(f => f !== discount.id)
      : [...favorites, discount.id];
    setFavorites(next);
    await AsyncStorage.setItem('favoriteDiscounts', JSON.stringify(next));
  };

  const handleGoToDiscount = () => {
    if (isAd) { if (discount.link) Linking.openURL(discount.link); return; }
    if (!isExpired && discount.link) {
      Linking.openURL(discount.link);
      // Show interstitial after visiting deal
      if (interstitial.loaded) interstitial.show().catch(() => {});
    }
  };

  const handleVote = async (voteType: 'active' | 'expired') => {
    if (userVoted) return;
    await addVote(discount.id, voteType);
    const newVotes = getVotes();
    setVotes(newVotes);
    setUserVoted(true);
    if (isDiscountExpired(discount.id, newVotes)) {
      setExpireTimer(discount.id);
    }
  };

  const handleCopyCode = () => {
    if (!discount.discountCode) return;
    Clipboard.setString(discount.discountCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: bg }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button + navigation */}
        <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: bg }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={{ color: Colors.orange, fontSize: 16 }}>← Geri</Text>
          </TouchableOpacity>
          <View style={styles.navButtons}>
            {hasPrev && (
              <TouchableOpacity onPress={() => navigateToDiscount('prev')} style={styles.navBtn}>
                <Text style={{ color: Colors.orange }}>‹ Önceki</Text>
              </TouchableOpacity>
            )}
            {hasNext && (
              <TouchableOpacity onPress={() => navigateToDiscount('next')} style={styles.navBtn}>
                <Text style={{ color: Colors.orange }}>Sonraki ›</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ padding: 12, gap: 10 }}>
          {/* Hero image */}
          <TouchableOpacity
            style={styles.heroContainer}
            onPress={() => setLightboxVisible(true)}
            activeOpacity={0.9}
          >
            <OptimizedImage
              src={discount.imageUrl}
              alt={discount.title}
              containerStyle={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            {/* Blur bg */}
            <Image
              source={{ uri: discount.imageUrl }}
              style={StyleSheet.absoluteFill}
              blurRadius={20}
            />
            <OptimizedImage
              src={discount.imageUrl}
              alt={discount.title}
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
                <Text style={[styles.discountBadgeText, { color: Colors.yellow900 }]}>{discount.adBadge || 'REKLAM'}</Text>
              </View>
            )}

            {/* Time badge */}
            {timeAgoStr(discount.createdAt) && (
              <View style={styles.timeBadgeHero}>
                <Text style={styles.timeBadgeHeroText}>⏱ {timeAgoStr(discount.createdAt)} yakalandı</Text>
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
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.titleRowTop}>
              <View style={[styles.catBadge, { backgroundColor: isDark ? Colors.orange + '33' : Colors.orange + '22' }]}>
                <Text style={[styles.catBadgeText, { color: Colors.orange }]}>{discount.category}</Text>
              </View>
              <Text style={[styles.brandText, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>{discount.brand}</Text>
            </View>
            <Text style={[styles.discountTitle, { color: textColor }]}>{discount.title}</Text>
            {isLowestPrice && !isAd && (
              <View style={styles.lowestPriceBadge}>
                <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '800' }}>👑 EN UYGUN FİYAT</Text>
              </View>
            )}
          </View>

          {/* Price card */}
          {(discount.newPrice > 0 || discount.oldPrice > 0) && (
            <View style={[styles.card, styles.priceCard, { backgroundColor: isDark ? '#1a1a2e' : '#fff7f0' }]}>
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
                  <Text style={[styles.mainPrice, { color: Colors.orange }]}>{discount.newPrice}</Text>
                  <Text style={[styles.priceUnit, { color: Colors.orange }]}>TL</Text>
                </View>
                {discount.oldPrice > 0 && (
                  <View style={styles.oldPriceCol}>
                    <Text style={[styles.oldPrice, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                      {discount.oldPrice} TL
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
            </View>
          )}

          {/* Favorite + Share */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: isFavorite ? Colors.red500 : (isDark ? Colors.gray700 : Colors.gray200) }]}
            >
              <Text style={{ fontSize: 16 }}>{isFavorite ? '❤️' : '🤍'}</Text>
              <Text style={[styles.actionBtnText, { color: isFavorite ? Colors.red500 : (isDark ? Colors.gray300 : Colors.gray600) }]}>
                {isFavorite ? 'Favorilendi' : 'Favorile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}
            >
              <Text style={{ fontSize: 16 }}>📤</Text>
              <Text style={[styles.actionBtnText, { color: isDark ? Colors.gray300 : Colors.gray600 }]}>Paylaş</Text>
            </TouchableOpacity>
          </View>

          {/* Discount code */}
          {discount.discountCode && (
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
                  {copied ? '✓ Kopyalandı!' : discount.discountCode}
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

      {/* Lightbox modal */}
      <Modal visible={lightboxVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxVisible(false)}
        >
          <Image
            source={{ uri: discount.imageUrl }}
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
  navButtons: { flexDirection: 'row', gap: 12 },
  navBtn: { padding: 4 },
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
