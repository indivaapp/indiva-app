import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import type { InfluencerPost } from '../types';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
};

interface Props {
  posts: InfluencerPost[];
  seenIds: string[];
  onStoryPress: (index: number) => void;
}

export default function InfluencerStoriesStrip({ posts, seenIds, onStoryPress }: Props) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  if (posts.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
      <Text style={[styles.sectionTitle, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
        ⭐ Influencer Tavsiyeleri
      </Text>
      <FlatList
        data={posts}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const seen = seenIds.includes(item.id);
          return (
            <TouchableOpacity
              style={styles.storyItem}
              activeOpacity={0.8}
              onPress={() => onStoryPress(index)}
            >
              <View style={[styles.ring, { borderColor: seen ? Colors.gray400 : Colors.orange }]}>
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.avatar}
                  resizeMode="cover"
                />
              </View>
              <Text
                style={[styles.handle, { color: isDark ? Colors.gray300 : Colors.gray700 }]}
                numberOfLines={1}
              >
                {PLATFORM_ICON[item.platform] ?? '⭐'} {item.influencerHandle.replace('@', '')}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 14,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  listContent: { paddingHorizontal: 14, gap: 14 },
  storyItem: { alignItems: 'center', width: 68 },
  ring: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    padding: 2,
    marginBottom: 4,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    backgroundColor: Colors.gray200,
  },
  handle: { fontSize: 10, fontWeight: '600', textAlign: 'center', width: 68 },
});
