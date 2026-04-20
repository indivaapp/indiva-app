import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { InfluencerStory } from '../types';

interface Props {
  stories: InfluencerStory[];
  loading: boolean;
  onPress: (story: InfluencerStory) => void;
}

function StoryAvatar({ uri, name }: { uri: string; name: string }) {
  const [error, setError] = React.useState(false);
  const initials = name.trim().charAt(0).toUpperCase();

  if (error || !uri) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarFallbackText}>{initials}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.avatarImage}
      onError={() => setError(true)}
    />
  );
}

export default function InfluencerStoriesBar({ stories, loading, onPress }: Props) {
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
          : stories.map(story => (
              <TouchableOpacity
                key={story.id}
                style={styles.item}
                onPress={() => onPress(story)}
                activeOpacity={0.75}
              >
                <View style={styles.avatarRing}>
                  <StoryAvatar uri={story.influencerAvatar} name={story.influencerName} />
                </View>
                <Text
                  style={[styles.label, { color: isDark ? Colors.gray300 : Colors.gray600 }]}
                  numberOfLines={1}
                >
                  {story.influencerName}
                </Text>
              </TouchableOpacity>
            ))}
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 62;

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 10,
    gap: 6,
  },
  item: {
    alignItems: 'center',
    width: 72,
    gap: 5,
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
  avatarImage: {
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
    fontSize: 24,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    width: 70,
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
