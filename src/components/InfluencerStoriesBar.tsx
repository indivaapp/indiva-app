import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import OptimizedImage from './OptimizedImage';
import type { InfluencerStory } from '../types';

interface Props {
  stories: InfluencerStory[];
  loading: boolean;
  viewedIds: string[];
  onPress: (story: InfluencerStory) => void;
}

function StoryAvatar({ uri, name }: { uri: string; name: string }) {
  const initials = name.trim().charAt(0).toUpperCase();

  if (!uri) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarFallbackText}>{initials}</Text>
      </View>
    );
  }

  return (
    <OptimizedImage
      src={uri}
      containerStyle={styles.avatarImageContainer}
      resizeMode="cover"
    />
  );
}

export default function InfluencerStoriesBar({ stories, loading, viewedIds, onPress }: Props) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  if (!loading && stories.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
      <Text style={[styles.title, { color: isDark ? Colors.gray200 : Colors.gray700 }]}>
        ✨ Influencer Tavsiyeleri
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading
          ? [0, 1, 2, 3].map(i => (
              <View key={i} style={styles.item}>
                <View style={[styles.skeletonRing, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 }]} />
                <View style={[styles.skeletonLabel, { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 }]} />
              </View>
            ))
          : stories.map(story => {
              const seen = viewedIds.includes(story.id);
              return (
                <TouchableOpacity
                  key={story.id}
                  style={[styles.item, seen && styles.itemSeen]}
                  onPress={() => onPress(story)}
                  activeOpacity={0.75}
                >
                  {/* Outer glow ring — only visible when unseen */}
                  {!seen && (
                    <View style={styles.glowRing} />
                  )}

                  <View
                    style={[
                      styles.avatarRing,
                      seen
                        ? {
                            borderColor: isDark ? Colors.gray600 : Colors.gray300,
                            borderWidth: 1.5,
                          }
                        : {
                            borderColor: Colors.orange,
                            borderWidth: 2.5,
                            shadowColor: Colors.orange,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.55,
                            shadowRadius: 6,
                            elevation: 5,
                          },
                    ]}
                  >
                    <StoryAvatar uri={story.influencerAvatar} name={story.influencerName} />
                  </View>

                  <Text
                    style={[
                      styles.label,
                      {
                        color: seen
                          ? isDark ? Colors.gray500 : Colors.gray400
                          : isDark ? Colors.gray200 : Colors.gray700,
                        fontWeight: seen ? '500' : '700',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {story.influencerName}
                  </Text>

                  {/* Small dot indicator — orange if unseen */}
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: seen ? Colors.gray400 : Colors.orange },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 62;

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  scrollContent: {
    paddingHorizontal: 10,
    gap: 8,
  },
  item: {
    alignItems: 'center',
    width: 74,
    gap: 5,
  },
  itemSeen: {
    opacity: 0.65,
  },
  // Subtle outer glow ring behind the avatar ring
  glowRing: {
    position: 'absolute',
    width: AVATAR_SIZE + 14,
    height: AVATAR_SIZE + 14,
    borderRadius: (AVATAR_SIZE + 14) / 2,
    backgroundColor: Colors.orange + '18',
    top: -3,
  },
  avatarRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 2.5,
    borderColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatarImageContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
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
    fontSize: 24,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    textAlign: 'center',
    width: 72,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: -2,
  },
  skeletonRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
  },
  skeletonLabel: {
    width: 48,
    height: 10,
    borderRadius: 5,
  },
});
