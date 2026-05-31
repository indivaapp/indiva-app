import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { useAdsReady, useNonPersonalized } from '../../App';
import { getCachedNativeAd } from '../services/nativeAdPool';
import { AD_UNITS } from '../constants/adUnits';

// ─── Fallback promolar (reklam yüklenemediğinde gösterilir) ───────────────────
const FALLBACK_PROMOS = [
  { icon: '🔔', title: 'Fırsatları kaçırma!', body: 'Bildirimlere abone ol, anlık indirimler hemen gelsin.' },
  { icon: '⭐', title: 'İNDİVA\'yı beğendin mi?', body: 'Play Store\'da yorum bırakırsan çok mutlu oluruz!' },
  { icon: '🎯', title: 'Favorile, kaybet!', body: 'İlgilendiğin ilanları favorile, sonra kolayca bul.' },
  { icon: '📣', title: 'Arkadaşlarına anlat!', body: 'İNDİVA\'yı paylaş, birlikte daha çok tasarruf edin.' },
] as const;
// Uygulama oturumu boyunca aynı promoyu göster (hafızada sabit)
const PROMO_IDX = Math.floor(Math.random() * FALLBACK_PROMOS.length);

// ─── Ad Unit ID ───────────────────────────────────────────────────────────────
const NATIVE_AD_UNIT_ID = AD_UNITS.native;

// ─── NativeAdCard ─────────────────────────────────────────────────────────────
// compact=true    → grid slotuna tam oturan kart (DiscountCard boyutu)
// compact=false   → tam genişlik banner (profil, aktüel vb.)
// horizontal=true → yatay şerit (başlık-fiyat arası gibi dar alanlar)
export default function NativeAdCard({
  style,
  compact = false,
  horizontal = false,
  cacheKey,
}: {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  horizontal?: boolean;
  cacheKey?: string;
} = {}) {
  return <NativeAdCardInner style={style} compact={compact} horizontal={horizontal} cacheKey={cacheKey} />;
}

function NativeAdCardInner({
  style,
  compact,
  horizontal,
  cacheKey,
}: {
  style?: StyleProp<ViewStyle>;
  compact: boolean;
  horizontal: boolean;
  cacheKey?: string;
}) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const adsReady        = useAdsReady();
  const nonPersonalized = useNonPersonalized();
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  const [failed, setFailed] = useState(false);
  const adRef = useRef<NativeAd | null>(null);

  useEffect(() => {
    // MobileAds.initialize() tamamlanmadan istek atma — race condition
    if (!adsReady) return;

    let cancelled = false;

    // cacheKey verildiyse (feed slotları) havuzdan al — kaydırınca yeniden istek atma.
    // Havuz reklamın ömrünü yönetir → unmount'ta destroy ETME.
    // cacheKey yoksa (detay/profil tekil reklam) eski davranış: kendi örneği + destroy.
    const request = cacheKey
      ? getCachedNativeAd(cacheKey, NATIVE_AD_UNIT_ID, nonPersonalized)
      : NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, { requestNonPersonalizedAdsOnly: nonPersonalized });

    request
      .then(ad => {
        if (cancelled) {
          if (!cacheKey) ad.destroy(); // havuzdaki reklamı yok etme
          return;
        }
        if (!cacheKey) adRef.current = ad;
        setNativeAd(ad);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (!cacheKey) {
        adRef.current?.destroy();
        adRef.current = null;
      }
    };
  }, [adsReady, cacheKey]);

  // İNDİVA tanıtım kartı — reklam yüklenemediğinde veya reklamsız modda gösterilir
  const promo = FALLBACK_PROMOS[PROMO_IDX];
  const compactPromoCard = (
    <View style={[styles.compactWrapper, style]}>
      <View style={[styles.compactCard, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
        {/* Üst renkli şerit */}
        <View style={[styles.promoStripe, { backgroundColor: '#4f46e5' }]}>
          <Text style={styles.promoStripeTxt}>İNDİVA</Text>
        </View>
        {/* İkon */}
        <View style={styles.promoIconWrap}>
          <Text style={styles.promoIcon}>{promo.icon}</Text>
        </View>
        {/* Metin */}
        <View style={styles.compactContent}>
          <Text style={[styles.compactHeadline, { color: isDark ? Colors.white : Colors.gray800 }]} numberOfLines={2}>
            {promo.title}
          </Text>
          <Text style={[styles.compactBody, { color: isDark ? Colors.gray400 : Colors.gray500 }]} numberOfLines={3}>
            {promo.body}
          </Text>
        </View>
      </View>
    </View>
  );

  // Yatay şerit tanıtımı (horizontal mod reklam gelmezse boş kalmasın)
  const horizontalPromo = (
    <View style={[styles.hWrapper, style]}>
      <View style={[styles.hCard, { backgroundColor: isDark ? '#1a1f2e' : '#f0f4ff', borderColor: isDark ? '#2d3748' : '#c7d2fe' }]}>
        <View style={[styles.hIcon, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 22 }}>{promo.icon}</Text>
        </View>
        <View style={styles.hTextCol}>
          <Text style={[styles.hHeadline, { color: isDark ? Colors.white : Colors.gray800 }]} numberOfLines={1}>{promo.title}</Text>
          <Text style={[styles.hBody, { color: isDark ? Colors.gray400 : Colors.gray500 }]} numberOfLines={1}>{promo.body}</Text>
        </View>
      </View>
    </View>
  );

  // Tam genişlik tanıtımı (full-width mod reklam gelmezse boş kalmasın)
  const fullWidthPromo = (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? '#1a1f2e' : '#f0f4ff', borderColor: isDark ? '#2d3748' : '#c7d2fe' },
        style,
      ]}
    >
      <View style={styles.adLabelRow}>
        <View style={styles.adLabelBadge}>
          <Text style={styles.adLabelText}>İNDİVA</Text>
        </View>
      </View>
      <View style={styles.headlineRow}>
        <Text style={{ fontSize: 24 }}>{promo.icon}</Text>
        <Text style={[styles.headline, { color: isDark ? Colors.white : Colors.gray800 }]} numberOfLines={2}>
          {promo.title}
        </Text>
      </View>
      <Text style={[styles.body, { color: isDark ? Colors.gray400 : Colors.gray500 }]} numberOfLines={2}>
        {promo.body}
      </Text>
    </View>
  );

  // ── Compact (grid) modu — yükleniyor / fallback ──────────────────────────
  if (compact && !nativeAd) {
    if (failed) {
      // Reklam yüklenemedi — uygulama promo kartı göster (boş alan bırakma)
      return compactPromoCard;
    }
    // Yükleniyor — DiscountCard ile aynı boyutta hafif iskelet
    const skBg = isDark ? Colors.gray700 : Colors.gray200;
    const skContent = isDark ? Colors.gray800 : Colors.white;
    return (
      <View style={[styles.compactSkeleton, { backgroundColor: skContent }, style]}>
        <View style={[styles.compactSkeletonImg, { backgroundColor: skBg }]} />
        <View style={{ padding: 12, gap: 8 }}>
          <View style={[styles.skLine, { width: '40%', backgroundColor: skBg }]} />
          <View style={[styles.skLine, { width: '90%', backgroundColor: skBg }]} />
          <View style={[styles.skLine, { width: '65%', backgroundColor: skBg }]} />
          <View style={[styles.skLineBtn, { backgroundColor: skBg }]} />
        </View>
      </View>
    );
  }

  // Buraya gelindiğinde compact modu yukarıda ele alındı → horizontal veya full-width.
  if (!nativeAd) {
    if (!failed) return null;                       // yükleniyor — kısa süre boş (pop-in)
    return horizontal ? horizontalPromo : fullWidthPromo; // başarısız → İNDİVA tanıtımı
  }

  const iconUrl = nativeAd.icon?.url;

  // ── Horizontal (yatay şerit) modu ─────────────────────────────────────────
  if (horizontal) {
    const stripBg      = isDark ? '#1a1f2e' : '#f0f4ff';
    const stripBorder  = isDark ? '#2d3748' : '#c7d2fe';
    const headlineColor = isDark ? Colors.white    : Colors.gray800;
    const bodyColor     = isDark ? Colors.gray400  : Colors.gray500;

    return (
      <View style={[styles.hWrapper, style]}>
        <NativeAdView nativeAd={nativeAd}
          style={[styles.hCard, { backgroundColor: stripBg, borderColor: stripBorder }]}
        >
          {/* REKLAM etiketi — sağ üst köşe */}
          <View style={styles.hBadge} pointerEvents="none">
            <Text style={styles.hBadgeText}>REKLAM</Text>
          </View>

          {/* Sol: ikon (icon asset varsa kaydet; yoksa medya görseli) */}
          {iconUrl ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: iconUrl }} style={styles.hIcon} resizeMode="cover" />
            </NativeAsset>
          ) : (
            <NativeMediaView resizeMode="cover" style={styles.hIcon} />
          )}

          {/* Orta: başlık + açıklama */}
          <View style={styles.hTextCol}>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={[styles.hHeadline, { color: headlineColor }]} numberOfLines={1}>
                {nativeAd.headline}
              </Text>
            </NativeAsset>
            {nativeAd.body ? (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text style={[styles.hBody, { color: bodyColor }]} numberOfLines={1}>
                  {nativeAd.body}
                </Text>
              </NativeAsset>
            ) : nativeAd.advertiser ? (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={[styles.hBody, { color: bodyColor }]} numberOfLines={1}>
                  {nativeAd.advertiser}
                </Text>
              </NativeAsset>
            ) : null}
          </View>

          {/* Sağ: CTA */}
          {nativeAd.callToAction ? (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={styles.hCta}>
                <Text style={styles.hCtaText} numberOfLines={1}>
                  {nativeAd.callToAction}
                </Text>
              </View>
            </NativeAsset>
          ) : null}
        </NativeAdView>
      </View>
    );
  }

  // ── Compact (grid) modu — tam kart ────────────────────────────────────────
  if (compact) {
    const cardBg = isDark ? Colors.gray800 : Colors.white;
    const textColor = isDark ? Colors.white : Colors.gray800;
    const bodyColor = isDark ? Colors.gray400 : Colors.gray500;

    return (
      <View style={[styles.compactWrapper, style]}>
        <NativeAdView
          nativeAd={nativeAd}
          style={[styles.compactCard, { backgroundColor: cardBg }]}
        >

          {/* Görsel bölümü — medya MediaView ile gösterilir (politika gereği) */}
          <View style={[styles.compactImageContainer, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]}>
            <NativeMediaView resizeMode="cover" style={StyleSheet.absoluteFill} />
            {/* Reklam etiketi — sol üst (AdChoices sağ üste otomatik gelir) */}
            <View style={styles.compactAdBadge} pointerEvents="none">
              <Text style={styles.compactAdBadgeText}>REKLAM</Text>
            </View>
          </View>

          {/* İçerik bölümü */}
          <View style={styles.compactContent}>
            {/* Reklamveren */}
            {nativeAd.advertiser ? (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={[styles.compactAdvertiser, { color: bodyColor }]} numberOfLines={1}>
                  {nativeAd.advertiser}
                </Text>
              </NativeAsset>
            ) : null}

            {/* Başlık */}
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={[styles.compactHeadline, { color: textColor }]} numberOfLines={2}>
                {nativeAd.headline}
              </Text>
            </NativeAsset>

            {/* Açıklama */}
            {nativeAd.body ? (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text style={[styles.compactBody, { color: bodyColor }]} numberOfLines={2}>
                  {nativeAd.body}
                </Text>
              </NativeAsset>
            ) : null}

            <View style={{ flex: 1 }} />

            {/* CTA butonu */}
            {nativeAd.callToAction ? (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <View style={styles.compactCta}>
                  <Text style={styles.compactCtaText} numberOfLines={1}>
                    {nativeAd.callToAction}
                  </Text>
                </View>
              </NativeAsset>
            ) : null}
          </View>
        </NativeAdView>
      </View>
    );
  }

  // ── Tam genişlik modu (varsayılan) ─────────────────────────────────────────
  return (
    <View>
      <NativeAdView
        nativeAd={nativeAd}
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#1a1f2e' : '#f0f4ff',
            borderColor: isDark ? '#2d3748' : '#c7d2fe',
          },
          style,
        ]}
      >
        {/* Reklam etiketi */}
        <View style={styles.adLabelRow}>
          <View style={styles.adLabelBadge}>
            <Text style={styles.adLabelText}>REKLAM</Text>
          </View>
          {nativeAd.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text
                style={[styles.advertiserName, { color: isDark ? Colors.gray400 : Colors.gray500 }]}
                numberOfLines={1}
              >
                {nativeAd.advertiser}
              </Text>
            </NativeAsset>
          ) : null}
        </View>

        {/* Ana görsel — medya MediaView ile gösterilir (politika gereği) */}
        <NativeMediaView resizeMode="cover" style={styles.mainImage} />

        {/* Başlık + ikon */}
        <View style={styles.headlineRow}>
          {iconUrl ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: iconUrl }} style={styles.advertiserIcon} resizeMode="cover" />
            </NativeAsset>
          ) : null}
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text
              style={[styles.headline, { color: isDark ? Colors.white : Colors.gray800 }]}
              numberOfLines={2}
            >
              {nativeAd.headline}
            </Text>
          </NativeAsset>
        </View>

        {/* Açıklama */}
        {nativeAd.body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text
              style={[styles.body, { color: isDark ? Colors.gray400 : Colors.gray500 }]}
              numberOfLines={2}
            >
              {nativeAd.body}
            </Text>
          </NativeAsset>
        ) : null}

        {/* CTA */}
        {nativeAd.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <View style={styles.ctaBtn}>
              <Text style={styles.ctaText} numberOfLines={1}>
                {nativeAd.callToAction}
              </Text>
            </View>
          </NativeAsset>
        ) : null}
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Horizontal (yatay şerit) stilleri ────────────────────────────────────────
  hWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  hCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  hBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomLeftRadius: 6,
    zIndex: 10,
  },
  hBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hIcon: {
    width: 42,
    height: 42,
    borderRadius: 9,
    flexShrink: 0,
  },
  hTextCol: {
    flex: 1,
    gap: 3,
    paddingRight: 4,
  },
  hHeadline: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  hBody: {
    fontSize: 11,
    lineHeight: 14,
  },
  hCta: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexShrink: 0,
  },
  hCtaText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Compact (grid) stilleri ─────────────────────────────────────────────────
  // overflow:'hidden' ve borderRadius burada (wrapper View'da) tanımlanmalı.
  // NativeAdView üzerinde overflow:'hidden' olursa Android'de native touch
  // event'ları kesilir ve reklamlara tıklanamaz.
  compactWrapper: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactCard: {
    flex: 1,
  },
  compactImageContainer: {
    aspectRatio: 1,
    width: '100%',
    backgroundColor: Colors.gray100,
  },
  compactAdBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomRightRadius: 8,
    zIndex: 10,
  },
  compactAdBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  compactContent: {
    padding: 12,
    flex: 1,
  },
  compactAdvertiser: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
    color: Colors.gray400,
  },
  compactHeadline: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minHeight: 36,
  },
  compactBody: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  compactCta: {
    marginTop: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  compactCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  // ── Fallback promo kart stilleri ────────────────────────────────────────────
  promoStripe: {
    height: 6,
    width: '100%',
  },
  promoStripeTxt: {
    display: 'none', // sadece renk şeridi, yazı yok
  },
  promoIconWrap: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
  },
  promoIcon: {
    fontSize: 36,
  },

  // ── Compact iskelet stilleri ─────────────────────────────────────────────────
  compactSkeleton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  compactSkeletonImg: {
    aspectRatio: 1,
    width: '100%',
  },
  skLine: {
    height: 10,
    borderRadius: 5,
  },
  skLineBtn: {
    height: 34,
    borderRadius: 10,
    marginTop: 4,
  },
  // ── Tam genişlik stilleri ────────────────────────────────────────────────────
  container: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    gap: 8,
  },
  adLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adLabelBadge: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  adLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  advertiserName: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  mainImage: {
    width: '100%',
    aspectRatio: 1.91,
    borderRadius: 8,
    backgroundColor: Colors.gray200,
  },
  iconOnlyImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: Colors.gray200,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  advertiserIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    flexShrink: 0,
    marginTop: 1,
  },
  headline: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  body: {
    fontSize: 11,
    lineHeight: 16,
  },
  ctaBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 2,
  },
  ctaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
