import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Discount } from '../types';
import OptimizedImage from './OptimizedImage';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { suppressAppOpen } from '../services/appOpenControl';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface DiscountCardProps {
  discount: Discount;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isExpired: boolean;
  discountList?: Discount[];
}

const DiscountCardInner: React.FC<DiscountCardProps> = ({
  discount,
  isFavorite,
  onToggleFavorite,
  isExpired,
  discountList,
}) => {
  const navigation = useNavigation<NavProp>();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const isAd = discount.isAd === true;
  const isServerExpired = discount.status === 'İndirim Bitti';
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartMounted = useRef(false);

  // Kalp bounce animasyonu — sadece favori durumu DEĞİŞTİĞİNDE tetiklenir (mount'ta değil)
  useEffect(() => {
    if (!heartMounted.current) { heartMounted.current = true; return; }
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.5,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFavorite]);

  useEffect(() => {
    if (!isServerExpired || !discount.deleteAt) return;
    const getDeleteAtMs = (): number => {
      const dt = discount.deleteAt as any;
      if (!dt) return 0;
      if (typeof dt.toMillis === 'function') return dt.toMillis();
      if (typeof dt.seconds === 'number') return dt.seconds * 1000;
      if (dt instanceof Date) return dt.getTime();
      return new Date(dt).getTime();
    };
    const deleteAtMs = getDeleteAtMs();
    if (!deleteAtMs) return;
    const update = () => {
      const remaining = deleteAtMs - Date.now();
      if (remaining <= 0) { setIsHidden(true); return; }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isServerExpired, discount.deleteAt]);

  const discountPercentage = useMemo(
    () =>
      discount.oldPrice > 0 && discount.newPrice > 0
        ? Math.round(((discount.oldPrice - discount.newPrice) / discount.oldPrice) * 100)
        : 0,
    [discount.oldPrice, discount.newPrice]
  );

  const timeAgo = useMemo((): string => {
    const ct = discount.createdAt as any;
    if (!ct) return '';
    const ms =
      typeof ct.toMillis === 'function'
        ? ct.toMillis()
        : ct.seconds
        ? ct.seconds * 1000
        : 0;
    if (!ms) return '';
    const diff = Math.floor((Date.now() - ms) / 60000);
    if (diff < 1) return 'Az önce';
    if (diff < 60) return `${diff} dk önce`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h} sa önce`;
    return `${Math.floor(h / 24)} gün önce`;
  }, [discount.createdAt]);

  if (isHidden) return null;

  const formatPrice = (price: number) => {
    return Math.floor(price).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const handleShare = async () => {
    const shareText = `🔥 İNDİVA'da ${discountPercentage > 0 ? `%${discountPercentage} indirimli ` : ''}fırsat!\n${discount.title}`;
    const shareUrl = discount.link || `https://indiva.app/detay/${discount.id}`;
    try {
      await Share.share({ message: `${shareText}\n${shareUrl}`, title: discount.title });
    } catch {}
  };

  const handleGoToDiscount = async () => {
    try {
      if (isAd) {
        if (discount.link) { suppressAppOpen(); await Linking.openURL(discount.link); }
        return;
      }
      if (!isExpired && !isServerExpired && discount.link) {
        suppressAppOpen();
        await Linking.openURL(discount.link);
      }
    } catch {
      // Bağlantı açılamadı — sessizce yoksay
    }
  };

  const handleCardPress = () => {
    navigation.push('Detail', {
      id: discount.id,
      discount,
      discountList: discountList ?? undefined,
    });
  };

  const showPrices =
    (isAd && discount.newPrice) || (!isAd && (discount.newPrice || discount.oldPrice));

  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const borderColor = isAd
    ? Colors.yellow400
    : isFavorite
    ? Colors.orange
    : isDark
    ? Colors.gray700
    : Colors.gray200;

  return (
    <TouchableOpacity
      onPress={handleCardPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor,
          borderWidth: isAd || isFavorite ? 2 : 0,
          opacity: isServerExpired ? 0.6 : 1,
        },
      ]}
    >
      {/* Expired overlay */}
      {isServerExpired && countdown && (
        <View style={styles.expiredOverlay}>
          <Text style={styles.expiredLabel}>🚩 İndirim Sona Erdi</Text>
          <Text style={styles.countdown}>{countdown}</Text>
          <Text style={styles.removedSoon}>sonra kaldırılacak</Text>
        </View>
      )}

      {isExpired && !isAd && !isServerExpired && (
        <View style={styles.votedExpiredOverlay}>
          <View style={styles.expiredBadge}>
            <Text style={styles.expiredBadgeText}>İNDİRİM TÜKENDİ</Text>
          </View>
        </View>
      )}

      {/* Image */}
      <View style={styles.imageContainer}>
        {isAd && (
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>{discount.adBadge || 'REKLAM'}</Text>
          </View>
        )}
        {discountPercentage > 0 && !isAd && (
          <View style={styles.discountPctBadge}>
            <Text style={styles.discountPctText}>%{discountPercentage}</Text>
          </View>
        )}
        <OptimizedImage
          src={discount.imageUrl}
          alt={discount.title}
          isDark={isDark}
          containerStyle={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        {!isAd && timeAgo ? (
          <View style={styles.timeBadge}>
            <Text style={styles.timeBadgeText}>{timeAgo}</Text>
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          {!isAd && (
            <TouchableOpacity
              onPress={onToggleFavorite}
              style={[styles.actionBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Animated.Text style={{ fontSize: 16, transform: [{ scale: heartScale }] }}>
                {isFavorite ? '❤️' : '🤍'}
              </Animated.Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleShare}
            style={[styles.actionBtn, { backgroundColor: 'rgba(0,0,0,0.38)' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 16 }}>🔗</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {!isAd && (discount.category || discount.brand) && (
          <View style={styles.tagsRow}>
            {discount.category ? (
              <Text style={styles.categoryTag}>{discount.category}</Text>
            ) : null}
            {discount.category && discount.brand ? (
              <Text style={styles.separator}> | </Text>
            ) : null}
            {discount.brand ? (
              <Text style={styles.brandTag}>{discount.brand}</Text>
            ) : null}
          </View>
        )}

        <Text
          style={[styles.title, { color: isDark ? Colors.white : Colors.gray800 }]}
          numberOfLines={2}
        >
          {discount.title}
        </Text>

        <View style={styles.spacer} />

        {/* Price */}
        <View style={styles.priceContainer}>
          {showPrices ? (
            discount.oldPrice > 0 ? (
              <View style={styles.priceRow}>
                <View style={[styles.oldPriceBox, { backgroundColor: isDark ? Colors.gray600 : Colors.gray700 }]}>
                  <Text style={styles.oldPrice}>{formatPrice(discount.oldPrice)}₺</Text>
                </View>
                <View style={styles.newPriceBox}>
                  <Text style={styles.newPrice}>{formatPrice(discount.newPrice)}₺</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.singlePriceBox, { borderColor: isDark ? Colors.gray600 : Colors.gray200 }]}>
                <Text style={[styles.singlePrice, { color: isDark ? Colors.white : Colors.gray800 }]}>
                  {formatPrice(discount.newPrice)}₺
                </Text>
              </View>
            )
          ) : (
            <View style={styles.adPriceBox}>
              <Text style={styles.adPriceText}>İndirime Git ›</Text>
            </View>
          )}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          onPress={handleGoToDiscount}
          disabled={(isExpired || isServerExpired) && !isAd}
          style={[
            styles.ctaButton,
            {
              backgroundColor: isAd
                ? Colors.yellow400
                : (isExpired || isServerExpired)
                ? isDark ? Colors.gray600 : Colors.gray400
                : Colors.orange,
            },
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              {
                color: isAd
                  ? Colors.yellow900
                  : (isExpired || isServerExpired) && isDark
                  ? Colors.gray400
                  : Colors.white,
              },
            ]}
          >
            {isAd
              ? 'İndirime Git'
              : isExpired || isServerExpired
              ? 'İndirim Sona Erdi'
              : 'İndirime Git'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    aspectRatio: 1,
    width: '100%',
    backgroundColor: Colors.gray100,
  },
  adBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: Colors.yellow400,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomRightRadius: 6,
    zIndex: 20,
  },
  adBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.yellow900,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  discountPctBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: Colors.red500,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderBottomRightRadius: 8,
    zIndex: 20,
  },
  discountPctText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  timeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    zIndex: 10,
  },
  timeBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '500',
  },
  actionButtons: {
    position: 'absolute',
    top: 8,
    right: 8,
    gap: 6,
    zIndex: 20,
  },
  actionBtn: {
    borderRadius: 99,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  expiredOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    gap: 2,
  },
  expiredLabel: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countdown: {
    color: Colors.yellow400,
    fontWeight: '800',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  removedSoon: {
    color: Colors.gray400,
    fontSize: 9,
  },
  votedExpiredOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(55,65,81,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  expiredBadge: {
    borderWidth: 4,
    borderColor: Colors.white,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    transform: [{ rotate: '-12deg' }],
  },
  expiredBadgeText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
  },
  content: {
    padding: 12,
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  categoryTag: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.orange,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  separator: {
    fontSize: 12,
    color: Colors.gray400,
  },
  brandTag: {
    fontSize: 12,
    color: Colors.gray500,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    minHeight: 38,
  },
  spacer: { flex: 1 },
  priceContainer: { marginTop: 8 },
  priceRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  oldPriceBox: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oldPrice: {
    color: Colors.gray300,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  newPriceBox: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.orangeRing,
  },
  newPrice: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  singlePriceBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  singlePrice: {
    fontSize: 16,
    fontWeight: '800',
  },
  adPriceBox: {
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  adPriceText: {
    color: Colors.yellow900,
    fontWeight: '800',
    fontSize: 16,
  },
  ctaButton: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ctaText: {
    fontWeight: '800',
    fontSize: 16,
  },
});

const DiscountCard = memo(DiscountCardInner);
export default DiscountCard;
