import React from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Linking,
} from 'react-native';
import type { InfluencerPost } from '../types';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

interface Props {
  post: InfluencerPost;
}

export default function InfluencerMiniCard({ post }: Props) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;
  const subColor = isDark ? Colors.gray400 : Colors.gray500;

  const discount = post.oldPrice && post.oldPrice > post.newPrice
    ? Math.round(((post.oldPrice - post.newPrice) / post.oldPrice) * 100)
    : null;

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      {/* Badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>⭐ {post.influencerHandle} tavsiyesi</Text>
      </View>

      {/* Image */}
      <Image
        source={{ uri: post.imageUrl }}
        style={styles.image}
        resizeMode="cover"
      />

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.brand, { color: subColor }]} numberOfLines={1}>{post.brand}</Text>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>{post.title}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.newPrice}>{post.newPrice.toLocaleString('tr-TR')} TL</Text>
          {post.oldPrice ? (
            <Text style={[styles.oldPrice, { color: subColor }]}>
              {post.oldPrice.toLocaleString('tr-TR')} TL
            </Text>
          ) : null}
          {discount ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>%{discount}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.ctaBtn}
        activeOpacity={0.85}
        onPress={() => post.productLink && Linking.openURL(post.productLink).catch(() => {})}
      >
        <Text style={styles.ctaText}>Fırsata Git →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  badge: {
    backgroundColor: Colors.orange,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  image: { width: '100%', aspectRatio: 1, backgroundColor: Colors.gray200 },
  info: { padding: 8, gap: 2 },
  brand: { fontSize: 10, fontWeight: '600' },
  title: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  newPrice: { fontSize: 13, fontWeight: '900', color: Colors.orange },
  oldPrice: { fontSize: 10, textDecorationLine: 'line-through' },
  discountBadge: {
    backgroundColor: Colors.red500,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  discountText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  ctaBtn: {
    backgroundColor: Colors.orange,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 'auto',
  },
  ctaText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
});
