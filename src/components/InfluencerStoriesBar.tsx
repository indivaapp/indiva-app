import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import OptimizedImage from './OptimizedImage';
import type { Story } from '../types';

interface Props {
  stories: Story[];
  loading: boolean;
  viewedIds: string[];
  onPress: (story: Story) => void;
}

const AVATAR_SIZE = 60;
const RING_OUTER  = AVATAR_SIZE + 8;   // dış çember çapı
const RING_INNER  = AVATAR_SIZE + 3;   // maske çapı (boşluk = 2.5 px her yanda)

// Turuncunun dört ayrı tonu — döndükçe parıltılı gradient izlenimi verir
const C1 = '#FFD166'; // açık amber
const C2 = '#FF9A2E'; // canlı turuncu
const C3 = '#FF6B1A'; // koyu turuncu
const C4 = '#FFB347'; // sıcak turuncu

function SkeletonItem({ isDark }: { isDark: boolean }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const bg = isDark ? Colors.gray700 : Colors.gray200;
  return (
    <View style={styles.item}>
      <Animated.View style={[styles.skeletonCircle, { backgroundColor: bg, opacity: pulse }]} />
      <Animated.View style={[styles.skeletonLabel,  { backgroundColor: bg, opacity: pulse }]} />
    </View>
  );
}

/**
 * Dönen 4-renkli arka plan + inner maske = gradient çember.
 * React Native'in `overflow:'hidden'` + borderRadius kombinasyonu
 * yuvarlak kırpma sağladığı için SVG veya linear-gradient paketi gerekmez.
 */
function GradientRing({
  isDark,
  children,
}: {
  isDark: boolean;
  children: React.ReactNode;
}) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 4000,          // 4 sn / tur — ince, dikkat çekmeden döner
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // İç maske rengi header arka planıyla eşleşmeli
  const maskBg = isDark ? Colors.gray800 : Colors.white;
  // Dönen karenin kenegen = outerSize * √2 ≈ 1.42 → 1.5x yeterli
  const spinSize = RING_OUTER * 1.5;

  return (
    <View style={styles.gradientRingOuter}>
      {/* Dönen gradient arka plan */}
      <Animated.View
        style={[
          styles.gradientSpin,
          { width: spinSize, height: spinSize, transform: [{ rotate }] },
        ]}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: C1 }} />
          <View style={{ flex: 1, backgroundColor: C2 }} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: C4 }} />
          <View style={{ flex: 1, backgroundColor: C3 }} />
        </View>
      </Animated.View>

      {/* İç beyaz/koyu maske — ortayı kesiyor, sadece çember görünüyor */}
      <View style={[styles.gradientRingMask, { backgroundColor: maskBg }]} />

      {/* Avatar */}
      {children}
    </View>
  );
}

function StoryItem({
  story,
  seen,
  isDark,
  onPress,
}: {
  story: Story;
  seen: boolean;
  isDark: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={styles.item}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {seen ? (
          /* Görülmüş: düz ince gri çember */
          <View
            style={[
              styles.ring,
              { borderColor: isDark ? Colors.gray600 : Colors.gray300, borderWidth: 1.5 },
            ]}
          >
            <View style={styles.avatarWrap}>
              {story.productImage ? (
                <OptimizedImage
                  src={story.productImage}
                  isDark={isDark}
                  containerStyle={styles.avatarWrap}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: Colors.gray400 }]}>
                  <Text style={styles.avatarFallbackText}>✨</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Görülmemiş: dönen gradient çember + turuncu parıltı gölgesi */
          <View style={styles.glowWrap}>
            <GradientRing isDark={isDark}>
              <View style={styles.avatarWrap}>
                {story.productImage ? (
                  <OptimizedImage
                    src={story.productImage}
                    isDark={isDark}
                    containerStyle={styles.avatarWrap}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: Colors.orange }]}>
                    <Text style={styles.avatarFallbackText}>✨</Text>
                  </View>
                )}
              </View>
            </GradientRing>

            {/* Turuncu glow — Android elevation ile */}
            <View style={styles.glowBehind} />

            {/* Okunmamış nokta */}
            <View style={styles.unseenDot} />
          </View>
        )}
      </Animated.View>

      {story.brand ? (
        <Text
          style={[styles.label, { color: isDark ? Colors.gray300 : Colors.gray600 }]}
          numberOfLines={1}
        >
          {story.brand}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function StoriesBar({ stories, loading, viewedIds, onPress }: Props) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  // Story görsellerini önceden native cache'e al → StoryDetail açılınca blur anında hesaplanır
  useEffect(() => {
    stories.forEach(s => {
      if (s.productImage) Image.prefetch(s.productImage).catch(() => {});
    });
  }, [stories]);

  if (!loading && stories.length === 0) return null;

  return (
    <View style={[styles.container, { borderBottomColor: isDark ? Colors.gray700 : Colors.gray100 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading
          ? [0, 1, 2, 3, 4].map(i => <SkeletonItem key={i} isDark={isDark} />)
          : stories.map(story => (
              <StoryItem
                key={story.id}
                story={story}
                seen={viewedIds.includes(story.id)}
                isDark={isDark}
                onPress={() => onPress(story)}
              />
            ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 10,
  },
  item: {
    alignItems: 'center',
    width: RING_OUTER + 4,
    gap: 5,
  },

  // ── Görülmüş çember ───────────────────────────────────────────────
  ring: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },

  // ── Gradient çember (görülmemiş) ──────────────────────────────────
  glowWrap: {
    width: RING_OUTER,
    height: RING_OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dönen gradient kaplayan dış container — overflow:hidden çember kırpar
  gradientRingOuter: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientSpin: {
    position: 'absolute',
  },
  gradientRingMask: {
    position: 'absolute',
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
  },
  // Arkada turuncu parıltı (elevation ile Android'de görünür)
  glowBehind: {
    position: 'absolute',
    width: RING_OUTER - 4,
    height: RING_OUTER - 4,
    borderRadius: (RING_OUTER - 4) / 2,
    backgroundColor: 'transparent',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },

  // ── Avatar ────────────────────────────────────────────────────────
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 22,
    color: Colors.white,
  },

  // ── Okunmamış nokta ───────────────────────────────────────────────
  unseenDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.orange,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },

  // ── Etiket ────────────────────────────────────────────────────────
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    width: RING_OUTER + 4,
  },

  // ── Skeleton ──────────────────────────────────────────────────────
  skeletonCircle: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
  },
  skeletonLabel: {
    width: 44,
    height: 9,
    borderRadius: 5,
  },
});
