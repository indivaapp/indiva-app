import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Image,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptimizedImage from '../components/OptimizedImage';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';
import type { InfluencerStory } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'InfluencerStoryDetail'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const AUTO_ADVANCE_MS = 10000;
const SWIPE_THRESHOLD = 50;

function AvatarCircle({ uri, name }: { uri: string; name: string }) {
  const [err, setErr] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase();
  if (err || !uri) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarFallbackText}>{initial}</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={styles.avatar} onError={() => setErr(true)} />
  );
}

export default function InfluencerStoryDetailScreen({ route }: Props) {
  const { stories, initialIndex } = route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const story: InfluencerStory = stories[currentIndex];

  // Progress bars — one Animated.Value per story slot
  const progressAnims = useRef(stories.map(() => new Animated.Value(0))).current;
  const progressAnim = progressAnims[currentIndex];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Slide transition
  const slideX = useRef(new Animated.Value(0)).current;

  const goTo = useCallback(
    (nextIndex: number, direction: 'next' | 'prev') => {
      if (nextIndex < 0 || nextIndex >= stories.length) {
        navigation.goBack();
        return;
      }
      // Stop current progress animation
      animRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);

      // Slide out current, slide in next
      const outX = direction === 'next' ? -SCREEN_W * 0.3 : SCREEN_W * 0.3;
      const inStart = direction === 'next' ? SCREEN_W * 0.3 : -SCREEN_W * 0.3;

      Animated.timing(slideX, {
        toValue: outX,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(nextIndex);
        slideX.setValue(inStart);
        Animated.spring(slideX, {
          toValue: 0,
          friction: 9,
          tension: 80,
          useNativeDriver: true,
        }).start();
      });
    },
    [navigation, slideX, stories.length]
  );

  // Start progress animation & auto-advance whenever currentIndex changes
  useEffect(() => {
    // Reset this story's progress bar
    progressAnims[currentIndex].setValue(0);

    animRef.current = Animated.timing(progressAnims[currentIndex], {
      toValue: 1,
      duration: AUTO_ADVANCE_MS,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goTo(currentIndex + 1, 'next');
    });

    return () => {
      animRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // PanResponder for swipe
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        slideX.setValue(g.dx * 0.4);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) {
          goTo(currentIndex + 1, 'next');
        } else if (g.dx > SWIPE_THRESHOLD) {
          goTo(currentIndex - 1, 'prev');
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const handleGoToProduct = async () => {
    try {
      const supported = await Linking.canOpenURL(story.affiliateLink);
      if (supported) {
        await Linking.openURL(story.affiliateLink);
      } else {
        Alert.alert('Hata', 'Bu bağlantı açılamıyor.');
      }
    } catch {
      Alert.alert('Hata', 'Bağlantı açılırken bir sorun oluştu.');
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.slide, { transform: [{ translateX: slideX }] }]}
        {...panResponder.panHandlers}
      >
        {/* Full-screen product image */}
        <OptimizedImage
          source={{ uri: story.productImage }}
          style={styles.productImage}
          resizeMode="cover"
        />

        {/* Dark gradient overlay */}
        <View style={styles.overlay} />

        {/* Top bar: close + progress bars */}
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <View style={styles.progressRow}>
            {stories.map((_, i) => (
              <View key={i} style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        i < currentIndex
                          ? '100%'
                          : i === currentIndex
                          ? progressAnims[i].interpolate({
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
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Influencer info (top-left) */}
        <View style={[styles.influencerRow, { marginTop: insets.top + 52 }]}>
          <View style={styles.avatarRing}>
            <AvatarCircle uri={story.influencerAvatar} name={story.influencerName} />
          </View>
          <View style={styles.influencerInfo}>
            <Text style={styles.influencerName}>{story.influencerName}</Text>
            <Text style={styles.influencerHandle}>{story.influencerHandle}</Text>
          </View>
          <View style={styles.recommendBadge}>
            <Text style={styles.recommendText}>Tavsiye etti ✨</Text>
          </View>
        </View>

        {/* Tap zones for prev/next */}
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={() => goTo(currentIndex - 1, 'prev')}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={() => goTo(currentIndex + 1, 'next')}
            activeOpacity={1}
          />
        </View>

        {/* Bottom product info + CTA */}
        <View style={[styles.bottomCard, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.categoryText}>{story.category}</Text>
          <Text style={styles.brandText}>{story.productBrand}</Text>
          <Text style={styles.productTitle} numberOfLines={2}>
            {story.productTitle}
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleGoToProduct}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaText}>İndirime Git 🛍️</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray900,
    overflow: 'hidden',
  },
  slide: {
    flex: 1,
  },
  productImage: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    gap: 8,
    zIndex: 10,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingTop: 4,
  },
  progressTrack: {
    flex: 1,
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
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  influencerRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  avatarRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 2,
    borderColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  influencerInfo: { flex: 1 },
  influencerName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  influencerHandle: {
    color: Colors.orangeLight,
    fontSize: 12,
    fontWeight: '600',
  },
  recommendBadge: {
    backgroundColor: 'rgba(249,115,22,0.85)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  recommendText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: {
    flex: 1,
  },
  tapRight: {
    flex: 1,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  categoryText: {
    color: Colors.orangeLight,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  brandText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  productTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ctaButton: {
    backgroundColor: Colors.orange,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
});
