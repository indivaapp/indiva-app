import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptimizedImage from '../components/OptimizedImage';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'InfluencerStoryDetail'>;

const { width: SCREEN_W } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_W * 1.05;

export default function InfluencerStoryDetailScreen({ route }: Props) {
  const { story } = route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [avatarError, setAvatarError] = useState(false);
  const initials = story.influencerName.trim().charAt(0).toUpperCase();

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray900;
  const subTextColor = isDark ? Colors.gray400 : Colors.gray500;

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
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: cardBg }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.backIcon, { color: isDark ? Colors.gray300 : Colors.gray700 }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Influencer Tavsiyesi</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Product image */}
        <View style={styles.imageContainer}>
          <OptimizedImage
            source={{ uri: story.productImage }}
            style={styles.productImage}
            resizeMode="cover"
          />
          <View style={[styles.categoryBadge, { backgroundColor: Colors.orange }]}>
            <Text style={styles.categoryBadgeText}>{story.category}</Text>
          </View>
        </View>

        {/* Influencer info card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.influencerRow}>
            <View style={styles.avatarRing}>
              {avatarError || !story.influencerAvatar ? (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initials}</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: story.influencerAvatar }}
                  style={styles.avatar}
                  onError={() => setAvatarError(true)}
                />
              )}
            </View>
            <View style={styles.influencerInfo}>
              <Text style={[styles.influencerName, { color: textColor }]}>
                {story.influencerName}
              </Text>
              <Text style={[styles.influencerHandle, { color: Colors.orange }]}>
                {story.influencerHandle}
              </Text>
            </View>
            <View style={[styles.recommendBadge, { backgroundColor: isDark ? '#2d1810' : '#fff7ed' }]}>
              <Text style={[styles.recommendText, { color: Colors.orange }]}>Tavsiye etti ✨</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]} />

          {/* Product info */}
          <Text style={[styles.brandText, { color: Colors.orange }]}>{story.productBrand}</Text>
          <Text style={[styles.productTitle, { color: textColor }]}>{story.productTitle}</Text>

          {/* CTA button */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleGoToProduct}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Ürüne Git 🛍️</Text>
          </TouchableOpacity>

          <Text style={[styles.disclaimer, { color: subTextColor }]}>
            Bu bağlantı affiliate link içerebilir.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 52;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 18, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  imageContainer: {
    width: SCREEN_W,
    height: IMAGE_HEIGHT,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    margin: 12,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  influencerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 22,
    fontWeight: '800',
  },
  influencerInfo: { flex: 1 },
  influencerName: {
    fontSize: 15,
    fontWeight: '800',
  },
  influencerHandle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  recommendBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  recommendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  productTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 20,
  },
  ctaButton: {
    backgroundColor: Colors.orange,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
});
