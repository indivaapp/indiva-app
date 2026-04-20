import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useNativeAd, NativeAdView, TestIds } from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

const NATIVE_AD_UNIT_ID = __DEV__
  ? TestIds.NATIVE
  : 'ca-app-pub-3675503435035155/8909740660';

export const nativeAdSupported = typeof useNativeAd === 'function';

export default function NativeAdCard({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  console.log('[NativeAdCard] nativeAdSupported:', nativeAdSupported);
  if (!nativeAdSupported) return null;
  return <NativeAdCardInner style={style} />;
}

function NativeAdCardInner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;
  const [loadFailed, setLoadFailed] = useState(false);

  const { isLoaded, load, nativeAd } = useNativeAd({
    unitId: NATIVE_AD_UNIT_ID,
    requestOptions: { requestNonPersonalizedAdsOnly: true },
    onAdFailedToLoad: (error: any) => {
      console.log('[NativeAdCard] load failed:', error?.message ?? error);
      setLoadFailed(true);
    },
  });

  useEffect(() => {
    console.log('[NativeAdCard] calling load(), unitId:', NATIVE_AD_UNIT_ID);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  console.log('[NativeAdCard] isLoaded:', isLoaded, 'loadFailed:', loadFailed, 'nativeAd:', !!nativeAd);

  if (loadFailed) return null;

  if (!isLoaded || !nativeAd) {
    return (
      <View style={[styles.container, styles.loading, { backgroundColor: cardBg }, style]}>
        <ActivityIndicator color={Colors.orange} size="small" />
      </View>
    );
  }

  const mainImageUrl = nativeAd.images?.[0]?.url;
  const iconUrl = nativeAd.icon?.url;

  return (
    <NativeAdView nativeAd={nativeAd} style={[styles.container, { backgroundColor: cardBg }, style]}>
      <View style={[styles.sponsoredBadge, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 }]}>
        <Text style={[styles.sponsoredText, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
          Sponsorlu
        </Text>
      </View>

      {mainImageUrl ? (
        <Image source={{ uri: mainImageUrl }} style={styles.mainImage} resizeMode="cover" />
      ) : iconUrl ? (
        <Image source={{ uri: iconUrl }} style={styles.mainImage} resizeMode="cover" />
      ) : null}

      <View style={styles.headlineRow}>
        {iconUrl && mainImageUrl && (
          <Image source={{ uri: iconUrl }} style={styles.advertiserIcon} resizeMode="cover" />
        )}
        <Text style={[styles.headline, { color: textColor }]} numberOfLines={2}>
          {nativeAd.headline}
        </Text>
      </View>

      {nativeAd.body ? (
        <Text style={[styles.body, { color: isDark ? Colors.gray400 : Colors.gray500 }]} numberOfLines={2}>
          {nativeAd.body}
        </Text>
      ) : null}

      {nativeAd.callToAction ? (
        <View style={styles.ctaBtn}>
          <Text style={styles.ctaText} numberOfLines={1}>{nativeAd.callToAction}</Text>
        </View>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  loading: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sponsoredBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sponsoredText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  mainImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: Colors.gray200,
  },
  headlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  advertiserIcon: { width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1 },
  headline: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  body: { fontSize: 11, lineHeight: 15 },
  ctaBtn: {
    backgroundColor: Colors.orange,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
});
