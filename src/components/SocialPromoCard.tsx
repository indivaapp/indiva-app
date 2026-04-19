import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';

const ACCOUNTS = [
  {
    key: 'instagram',
    icon: '📸',
    handle: '@indivaapp',
    url: 'https://instagram.com/indivaapp',
    rowBg: '#C13584',
    borderColor: null,
  },
  {
    key: 'tiktok',
    icon: '🎵',
    handle: '@indivaapp',
    url: 'https://tiktok.com/@indivaapp',
    rowBg: '#010101',
    borderColor: '#69C9D0',
  },
  {
    key: 'telegram',
    icon: '✈️',
    handle: 't.me/indivaapp',
    url: 'https://t.me/indivaapp',
    rowBg: '#54a9eb',
    borderColor: null,
  },
];

export default function SocialPromoCard() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>İNDİVA SOSYAL{'\n'}MEDYADA!</Text>

      {ACCOUNTS.map(acc => (
        <TouchableOpacity
          key={acc.key}
          activeOpacity={0.82}
          onPress={() => Linking.openURL(acc.url).catch(() => {})}
          style={[
            styles.row,
            { backgroundColor: acc.rowBg },
            acc.borderColor ? { borderWidth: 1.5, borderColor: acc.borderColor } : null,
          ]}
        >
          <Text style={styles.rowIcon}>{acc.icon}</Text>
          <Text style={styles.rowHandle} numberOfLines={1}>{acc.handle}</Text>
          <View style={styles.followBtn}>
            <Text style={styles.followText}>Takip Et</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#1a2c5e',
    padding: 12,
    gap: 8,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  rowIcon: { fontSize: 20 },
  rowHandle: {
    flex: 1,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  followBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  followText: {
    color: '#1a2c5e',
    fontSize: 11,
    fontWeight: '800',
  },
});
