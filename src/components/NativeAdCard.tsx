import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useNativeAd, NativeAdView, TestIds } from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

const NATIVE_AD_UNIT_ID = __DEV__
  ? TestIds.NATIVE
  : 'ca-app-pub-3675503435035155/8909740660';

export const nativeAdSupported = typeof useNativeAd === 'function';

export default function NativeAdCard({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  if (!nativeAdSupported) return null;
  return <NativeAdCardInner style={style} />;
}

function NativeAdCardInner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [loadFailed, setLoadFailed] = useState(false);

  const { isLoaded, load, nativeAd } = useNativeAd({
    unitId: NATIVE_AD_UNIT_ID,
    requestOptions: { requestNonPersonalizedAdsOnly: true },
    onAdFailedToLoad: () => setLoadFailed(true),
  });

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadFailed || !isLoaded || !nativeAd) return null;

  const mainImageUrl = nativeAd.images?.[0]?.url;
  const iconUrl = nativeAd.icon?.url;

  return (
    /* Reklam alanını PanResponder'dan ve diğer gesture handler'lardan izole et */
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
        {/* Reklam etiketi — Google politikası gereği açıkça gösterilmeli */}
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

        {/* CTA butonu */}
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
