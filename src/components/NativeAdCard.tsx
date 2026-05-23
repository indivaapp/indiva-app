import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { NativeAd, NativeAdView, TestIds } from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

// ─── Ad Unit ID ───────────────────────────────────────────────────────────────
const NATIVE_AD_UNIT_ID = __DEV__
  ? TestIds.NATIVE
  : 'ca-app-pub-3675503435035155/8909740660';

// ─── NativeAdCard ─────────────────────────────────────────────────────────────
// compact=true  → grid slotuna tam oturan kart (DiscountCard boyutu)
// compact=false → tam genişlik banner (profil, aktüel vb.)
export default function NativeAdCard({
  style,
  compact = false,
}: {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
} = {}) {
  return <NativeAdCardInner style={style} compact={compact} />;
}

function NativeAdCardInner({
  style,
  compact,
}: {
  style?: StyleProp<ViewStyle>;
  compact: boolean;
}) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  const [failed, setFailed] = useState(false);
  const adRef = useRef<NativeAd | null>(null);

  useEffect(() => {
    let cancelled = false;

    NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    })
      .then(ad => {
        if (cancelled) {
          ad.destroy();
          return;
        }
        adRef.current = ad;
        setNativeAd(ad);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      adRef.current?.destroy();
      adRef.current = null;
    };
  }, []);

  // ── Compact (grid) modu — iskelet placeholder ─────────────────────────────
  if (compact && !nativeAd) {
    if (failed) return null;
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

  if (!nativeAd) return null;

  const mainImageUrl = nativeAd.images?.[0]?.url;
  const iconUrl = nativeAd.icon?.url;

  // ── Compact (grid) modu — tam kart ────────────────────────────────────────
  if (compact) {
    const cardBg = isDark ? Colors.gray800 : Colors.white;
    const textColor = isDark ? Colors.white : Colors.gray800;
    const bodyColor = isDark ? Colors.gray400 : Colors.gray500;

    return (
      <View
        style={[styles.compactWrapper, style]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      >
        <NativeAdView
          nativeAd={nativeAd}
          style={[styles.compactCard, { backgroundColor: cardBg }]}
        >
          {/* Görsel bölümü — DiscountCard imageContainer ile aynı oranlar */}
          <View style={styles.compactImageContainer}>
            {mainImageUrl ? (
              <Image source={{ uri: mainImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : iconUrl ? (
              <Image source={{ uri: iconUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]} />
            )}
            {/* Reklam etiketi — Google politikası gereği */}
            <View style={styles.compactAdBadge}>
              <Text style={styles.compactAdBadgeText}>REKLAM</Text>
            </View>
          </View>

          {/* İçerik bölümü */}
          <View style={styles.compactContent}>
            {/* Reklamveren */}
            {nativeAd.advertiser ? (
              <Text style={[styles.compactAdvertiser, { color: bodyColor }]} numberOfLines={1}>
                {nativeAd.advertiser}
              </Text>
            ) : null}

            {/* Başlık */}
            <Text style={[styles.compactHeadline, { color: textColor }]} numberOfLines={2}>
              {nativeAd.headline}
            </Text>

            {/* Açıklama */}
            {nativeAd.body ? (
              <Text style={[styles.compactBody, { color: bodyColor }]} numberOfLines={2}>
                {nativeAd.body}
              </Text>
            ) : null}

            <View style={{ flex: 1 }} />

            {/* CTA butonu */}
            {nativeAd.callToAction ? (
              <View style={styles.compactCta}>
                <Text style={styles.compactCtaText} numberOfLines={1}>
                  {nativeAd.callToAction}
                </Text>
              </View>
            ) : null}
          </View>
        </NativeAdView>
      </View>
    );
  }

  // ── Tam genişlik modu (varsayılan) ─────────────────────────────────────────
  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
    >
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
            <Text
              style={[styles.advertiserName, { color: isDark ? Colors.gray400 : Colors.gray500 }]}
              numberOfLines={1}
            >
              {nativeAd.advertiser}
            </Text>
          ) : null}
        </View>

        {/* Ana görsel */}
        {mainImageUrl ? (
          <Image source={{ uri: mainImageUrl }} style={styles.mainImage} resizeMode="cover" />
        ) : iconUrl ? (
          <Image source={{ uri: iconUrl }} style={styles.iconOnlyImage} resizeMode="cover" />
        ) : null}

        {/* Başlık + ikon */}
        <View style={styles.headlineRow}>
          {iconUrl && mainImageUrl ? (
            <Image source={{ uri: iconUrl }} style={styles.advertiserIcon} resizeMode="cover" />
          ) : null}
          <Text
            style={[styles.headline, { color: isDark ? Colors.white : Colors.gray800 }]}
            numberOfLines={2}
          >
            {nativeAd.headline}
          </Text>
        </View>

        {/* Açıklama */}
        {nativeAd.body ? (
          <Text
            style={[styles.body, { color: isDark ? Colors.gray400 : Colors.gray500 }]}
            numberOfLines={2}
          >
            {nativeAd.body}
          </Text>
        ) : null}

        {/* CTA */}
        {nativeAd.callToAction ? (
          <View style={styles.ctaBtn}>
            <Text style={styles.ctaText} numberOfLines={1}>
              {nativeAd.callToAction}
            </Text>
          </View>
        ) : null}
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Compact (grid) stilleri ─────────────────────────────────────────────────
  compactWrapper: {
    flex: 1,
  },
  compactCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomRightRadius: 6,
    zIndex: 10,
  },
  compactAdBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    fontSize: 9,
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
