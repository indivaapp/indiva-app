import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useNativeAd, NativeAdView, TestIds } from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

const NATIVE_AD_UNIT_ID = __DEV__
  ? TestIds.NATIVE
  : 'ca-app-pub-3675503435035155/8909740660';

export default function NativeAdCard() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

  const { isLoaded, load, nativeAd } = useNativeAd({
    unitId: NATIVE_AD_UNIT_ID,
    requestOptions: { requestNonPersonalizedAdsOnly: true },
  });

  useEffect(() => {
    load();
  }, [load]);

  if (!isLoaded || !nativeAd) {
    return (
      <View style={[styles.container, { backgroundColor: cardBg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.orange} />
      </View>
    );
  }

  const imageUrl = nativeAd.images?.[0]?.url ?? nativeAd.icon?.url;

  return (
    <NativeAdView nativeAd={nativeAd} style={[styles.container, { backgroundColor: cardBg }]}>
      {/* Sponsorlu etiketi — AdMob politikası gereği zorunlu */}
      <View style={styles.sponsoredBadge}>
        <Text style={styles.sponsoredText}>Sponsorlu</Text>
      </View>

      {/* Ana görsel */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      ) : null}

      {/* Başlık */}
      <Text style={[styles.headline, { color: textColor }]} numberOfLines={2}>
        {nativeAd.headline}
      </Text>

      {/* Açıklama */}
      {nativeAd.body ? (
        <Text style={[styles.body, { color: isDark ? Colors.gray400 : Colors.gray500 }]} numberOfLines={2}>
          {nativeAd.body}
        </Text>
      ) : null}

      {/* CTA Butonu */}
      {nativeAd.callToAction ? (
        <View style={[styles.ctaBtn, { marginTop: 'auto' as any }]}>
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  sponsoredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sponsoredText: { color: Colors.white, fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: Colors.gray200 },
  headline: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  body: { fontSize: 11, lineHeight: 15 },
  ctaBtn: {
    backgroundColor: Colors.orange,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ctaText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
});
