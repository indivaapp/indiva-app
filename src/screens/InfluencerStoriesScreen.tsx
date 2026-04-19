import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Linking,
  Animated, PanResponder, useWindowDimensions, StatusBar, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InfluencerPost } from '../types';
import { markPostAsSeen } from '../services/influencerService';
import { Colors } from '../constants/colors';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteP = RouteProp<RootStackParamList, 'InfluencerStories'>;

const STORY_DURATION = 5000;

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
};

export default function InfluencerStoriesScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteP>();
  const { posts, initialIndex } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const post = posts[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < posts.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      navigation.goBack();
    }
  }, [currentIndex, posts.length, navigation]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  }, [currentIndex]);

  useEffect(() => {
    markPostAsSeen(posts[currentIndex].id);
    progressAnim.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => animRef.current?.stop();
  // goNext değiştiğinde efekti yeniden başlatmamak için devre dışı bırakıldı
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) navigation.goBack();
      },
    }),
  ).current;

  const discount =
    post.oldPrice && post.oldPrice > post.newPrice
      ? Math.round(((post.oldPrice - post.newPrice) / post.oldPrice) * 100)
      : null;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Progress bars */}
      <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
        {posts.map((_, i) => (
          <View key={i} style={[styles.progressBg, { flex: 1 }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width:
                    i < currentIndex
                      ? '100%'
                      : i === currentIndex
                        ? progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          })
                        : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header: handle + platform + close */}
      <View style={styles.header}>
        <Text style={styles.platform}>
          {PLATFORM_ICON[post.platform] ?? '⭐'}
        </Text>
        <Text style={styles.handle}>{post.influencerHandle}</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Main image */}
      <Image
        source={{ uri: post.imageUrl }}
        style={[styles.image, { width }]}
        resizeMode="contain"
      />

      {/* Tap zones (invisible) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity style={styles.tapLeft} activeOpacity={1} onPress={goPrev} />
          <TouchableOpacity style={styles.tapRight} activeOpacity={1} onPress={goNext} />
        </View>
      </View>

      {/* Product info card */}
      <View style={[styles.productCard, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.productInfo}>
          <Text style={styles.productBrand}>{post.brand}</Text>
          <Text style={styles.productTitle} numberOfLines={2}>{post.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.newPrice}>{post.newPrice.toLocaleString('tr-TR')} TL</Text>
            {post.oldPrice ? (
              <Text style={styles.oldPrice}>{post.oldPrice.toLocaleString('tr-TR')} TL</Text>
            ) : null}
            {discount ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>%{discount} İndirim</Text>
              </View>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.85}
          onPress={() =>
            post.productLink && Linking.openURL(post.productLink).catch(() => {})
          }
        >
          <Text style={styles.ctaText}>Fırsata Git →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  progressBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.white,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
    zIndex: 10,
  },
  platform: { fontSize: 18 },
  handle: { flex: 1, color: Colors.white, fontWeight: '700', fontSize: 14 },
  closeBtn: { color: Colors.white, fontSize: 20, fontWeight: '700' },
  image: {
    flex: 1,
    backgroundColor: '#111',
  },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  tapLeft: { flex: 4 },
  tapRight: { flex: 6 },
  productCard: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  productInfo: { gap: 4 },
  productBrand: { color: Colors.gray400, fontSize: 11, fontWeight: '600' },
  productTitle: { color: Colors.white, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  newPrice: { color: Colors.orange, fontSize: 18, fontWeight: '900' },
  oldPrice: {
    color: Colors.gray400,
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: Colors.red500,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  ctaBtn: {
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { color: Colors.white, fontSize: 15, fontWeight: '900' },
});
