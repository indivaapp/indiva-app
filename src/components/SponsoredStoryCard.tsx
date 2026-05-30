import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdsReady, useNonPersonalized } from '../../App';
import { Colors } from '../constants/colors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const AD_DURATION_MS = 5000;

// Native Advanced reklam birimi
const AD_UNIT_ID = __DEV__
  ? TestIds.NATIVE
  : 'ca-app-pub-3675503435035155/8909740660';

interface Props {
  /** Kartın görünür olup olmadığı. false olsa da mount'ta ad pre-load edilir. */
  visible: boolean;
  /** Süre dolunca veya kullanıcı kapatınca tetiklenir */
  onDismiss: () => void;
  /** Ad yüklenince parent'a haber ver (gösterim için hazır) */
  onAdLoaded?: () => void;
}

export default function SponsoredStoryCard({ visible, onDismiss, onAdLoaded }: Props) {
  const insets = useSafeAreaInsets();
  const adsReady        = useAdsReady();
  const nonPersonalized = useNonPersonalized();
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  const adRef = useRef<NativeAd | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  // ── Reklam yükleme — screen açılır açılmaz arka planda başlar ──────────────
  useEffect(() => {
    if (!adsReady) return;
    let cancelled = false;

    NativeAd.createForAdRequest(AD_UNIT_ID, { requestNonPersonalizedAdsOnly: nonPersonalized })
      .then(ad => {
        if (cancelled) { ad.destroy(); return; }
        adRef.current = ad;
        setNativeAd(ad);
        onAdLoaded?.();
      })
      .catch(() => {
        // Yükleme başarısız — parent sponsorlu slotu atlayacak
      });

    return () => {
      cancelled = true;
      adRef.current?.destroy();
      adRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsReady]);

  // ── İlerleme çubuğu — sadece visible=true ve ad yüklüyken çalışır ─────────
  useEffect(() => {
    if (!visible || !nativeAd) return;

    progressAnim.setValue(0);
    timerAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: AD_DURATION_MS,
      useNativeDriver: true,
    });
    timerAnimRef.current.start(({ finished }) => {
      if (finished) onDismissRef.current();
    });

    return () => {
      timerAnimRef.current?.stop();
    };
  }, [visible, nativeAd, progressAnim]);

  // Görünmüyorsa veya ad yoksa: null render (ama component mount'ta kalır → pre-load devam eder)
  if (!visible || !nativeAd) return null;

  const iconUrl = nativeAd.icon?.url;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Düz koyu arka plan — reklam kreatifini değiştirmemek için blur/scrim kaldırıldı */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0d14' }]} />

      {/* ── NativeAdView: tüm reklam içeriği + tıklama kaydı ───────────── */}
      <NativeAdView nativeAd={nativeAd} style={StyleSheet.absoluteFill}>

        {/* Ana medya — MediaView ile gösterilir (politika gereği) */}
        <NativeMediaView resizeMode="contain" style={styles.mainImage} />

        {/* Alt içerik: başlık + CTA */}
        <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 80 }]}>
          {iconUrl ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: iconUrl }} style={styles.advertiserIcon} resizeMode="cover" />
            </NativeAsset>
          ) : null}
          {nativeAd.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text style={styles.advertiserName} numberOfLines={1}>
                {nativeAd.advertiser}
              </Text>
            </NativeAsset>
          ) : null}
          {nativeAd.headline ? (
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={styles.headline} numberOfLines={2}>
                {nativeAd.headline}
              </Text>
            </NativeAsset>
          ) : null}
          {nativeAd.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={styles.body} numberOfLines={2}>
                {nativeAd.body}
              </Text>
            </NativeAsset>
          ) : null}
          {nativeAd.callToAction ? (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={styles.ctaBtn}>
                <Text style={styles.ctaText}>{nativeAd.callToAction}</Text>
              </View>
            </NativeAsset>
          ) : null}
        </View>
      </NativeAdView>

      {/* ── Üst bar: NativeAdView DIŞINDA — yanlışlıkla reklam tıklamasını önler ── */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {/* İlerleme çubuğu */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              { transform: [{ scaleX: progressAnim }] },
            ]}
          />
        </View>

        {/* Sponsorlu etiketi + Kapat */}
        <View style={styles.topRow}>
          <View style={styles.sponsoredBadge}>
            <Text style={styles.sponsoredText}>REKLAM</Text>
          </View>
          {nativeAd.advertiser ? (
            <Text style={styles.advertiserLabel} numberOfLines={1}>
              {nativeAd.advertiser}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              timerAnimRef.current?.stop();
              onDismiss();
            }}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  mainImage: {
    position: 'absolute',
    width: SCREEN_W,
    height: SCREEN_H * 0.65,
    top: SCREEN_H * 0.12,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    gap: 6,
  },
  advertiserIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginBottom: 2,
  },
  advertiserName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  headline: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  body: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 18,
  },
  ctaBtn: {
    marginTop: 4,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '800',
  },
  // ── Üst bar ────────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    gap: 8,
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 2,
    transformOrigin: 'left center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sponsoredBadge: {
    backgroundColor: '#4f46e5',
    borderRadius: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  sponsoredText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  advertiserLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});
