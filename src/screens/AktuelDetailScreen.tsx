import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Image,
  Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { fetchBrochuresByStore } from '../services/firebaseService';
import OptimizedImage from '../components/OptimizedImage';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';
import type { Brochure } from '../types';

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

const MREC_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-3675503435035155/8261572668';

type ListItem =
  | { type: 'brochure'; data: Brochure; index: number }
  | { type: 'banner'; key: string }
  | { type: 'footer' };

type Props = NativeStackScreenProps<RootStackParamList, 'AktuelDetail'>;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function AktuelDetailScreen({ route }: Props) {
  const { storeName } = route.params;
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();

  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;

  useEffect(() => {
    setIsLoading(true);
    setError('');
    fetchBrochuresByStore(storeName)
      .then(setBrochures)
      .catch(() => setError('Kataloglar yüklenirken hata oluştu.'))
      .finally(() => setIsLoading(false));
  }, [storeName]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: Colors.red500, fontSize: 14, textAlign: 'center', padding: 20 }}>{error}</Text>
        <TouchableOpacity
          onPress={() => {
            setError('');
            setIsLoading(true);
            fetchBrochuresByStore(storeName).then(setBrochures).catch(() => setError('Kataloglar yüklenirken hata oluştu.')).finally(() => setIsLoading(false));
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: Colors.orange, fontWeight: '700' }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (brochures.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
        <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 15 }}>
          Bu market için aktif katalog yok.
        </Text>
      </View>
    );
  }

  // Build flat list data: brochures interleaved with banner ads every 4 items + footer
  const listData: ListItem[] = [];
  brochures.forEach((item, i) => {
    listData.push({ type: 'brochure', data: item, index: i });
    if ((i + 1) % 2 === 0 && i < brochures.length - 1) {
      listData.push({ type: 'banner', key: `banner_${i}` });
    }
  });
  listData.push({ type: 'footer' });

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FlatList
        data={listData}
        keyExtractor={item =>
          item.type === 'brochure'
            ? item.data.id
            : item.type === 'banner'
            ? item.key
            : '__footer__'
        }
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
        renderItem={({ item }) => {
          if (item.type === 'banner') {
            return (
              <View style={styles.bannerWrapper}>
                <BannerAd
                  unitId={BANNER_AD_UNIT_ID}
                  size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                  requestOptions={{ requestNonPersonalizedAdsOnly: true }}
                />
              </View>
            );
          }
          if (item.type === 'footer') {
            return (
              <View style={styles.mrecWrapper}>
                <BannerAd
                  unitId={MREC_AD_UNIT_ID}
                  size={BannerAdSize.MEDIUM_RECTANGLE}
                  requestOptions={{ requestNonPersonalizedAdsOnly: true }}
                />
              </View>
            );
          }
          // brochure item
          const { data, index } = item;
          return (
            <TouchableOpacity
              style={[styles.brochureCard, { backgroundColor: cardBg }]}
              activeOpacity={0.85}
              onPress={() => setLightboxIndex(index)}
            >
              <View style={styles.brochureImageContainer}>
                <OptimizedImage
                  src={data.imageUrl}
                  alt={data.title}
                  containerStyle={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.brochureInfo}>
                <Text style={[styles.brochureTitle, { color: isDark ? Colors.white : Colors.gray800 }]} numberOfLines={1}>
                  {data.title}
                </Text>
                {data.validityDate ? (
                  <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 11 }}>
                    📅 {data.validityDate}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Lightbox */}
      <Modal visible={lightboxIndex >= 0} transparent animationType="fade">
        <View style={styles.lightboxBg}>
          {lightboxIndex >= 0 && (
            <>
              <Image
                source={{ uri: brochures[lightboxIndex].imageUrl }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
              {/* Page counter */}
              <View style={styles.pageCounter}>
                <Text style={styles.pageCounterText}>
                  {lightboxIndex + 1} / {brochures.length}
                </Text>
              </View>
              {/* Nav buttons */}
              {lightboxIndex > 0 && (
                <TouchableOpacity
                  style={[styles.navBtnLB, styles.navBtnLeft]}
                  onPress={() => setLightboxIndex(lightboxIndex - 1)}
                >
                  <Text style={styles.navBtnText}>‹</Text>
                </TouchableOpacity>
              )}
              {lightboxIndex < brochures.length - 1 && (
                <TouchableOpacity
                  style={[styles.navBtnLB, styles.navBtnRight]}
                  onPress={() => setLightboxIndex(lightboxIndex + 1)}
                >
                  <Text style={styles.navBtnText}>›</Text>
                </TouchableOpacity>
              )}
              {/* Close */}
              <TouchableOpacity
                style={styles.closeBtnLB}
                onPress={() => setLightboxIndex(-1)}
              >
                <Text style={{ color: Colors.white, fontSize: 18, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>
              {/* Validity */}
              {brochures[lightboxIndex].validityDate && (
                <View style={styles.validityBadge}>
                  <Text style={{ color: Colors.white, fontSize: 12 }}>📅 {brochures[lightboxIndex].validityDate}</Text>
                </View>
              )}
              {/* Thumbnails */}
              <View style={styles.thumbBar}>
                <FlatList
                  data={brochures}
                  horizontal
                  keyExtractor={item => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      onPress={() => setLightboxIndex(index)}
                      style={[
                        styles.thumbItem,
                        {
                          borderColor: index === lightboxIndex ? Colors.orange : 'transparent',
                          opacity: index === lightboxIndex ? 1 : 0.4,
                        },
                      ]}
                    >
                      <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContainer: { padding: 12, gap: 12 },
  brochureCard: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  brochureImageContainer: { aspectRatio: 3 / 4, width: '100%', backgroundColor: Colors.gray100 },
  brochureInfo: { padding: 12, gap: 4 },
  brochureTitle: { fontSize: 14, fontWeight: '700' },
  bannerWrapper: { alignItems: 'center', marginVertical: 4 },
  mrecWrapper: { alignItems: 'center', marginTop: 8, marginBottom: 4 },
  lightboxBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: { width: SCREEN_W, height: SCREEN_H * 0.7 },
  pageCounter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pageCounterText: { color: Colors.white, fontWeight: '600', fontSize: 13 },
  navBtnLB: {
    position: 'absolute',
    top: '50%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 24,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnLeft: { left: 8 },
  navBtnRight: { right: 8 },
  navBtnText: { color: Colors.white, fontSize: 28, fontWeight: '300', marginTop: -3 },
  closeBtnLB: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validityBadge: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  thumbBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
  },
  thumbItem: {
    width: 44,
    height: 66,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
  },
  thumbImage: { width: '100%', height: '100%' },
});
