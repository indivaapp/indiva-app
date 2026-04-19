import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

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

export default function SocialPromoCard({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const containerBg = isDark ? Colors.gray800 : Colors.white;
  const titleColor = Colors.orange;
  const subtitleColor = isDark ? Colors.gray400 : Colors.gray500;
  const followBtnBg = isDark ? Colors.gray700 : Colors.gray100;
  const followBtnText = isDark ? Colors.white : Colors.gray800;

  return (
    <View style={[styles.container, { backgroundColor: containerBg }, style]}>
      <Text style={[styles.title, { color: titleColor }]}>İNDİVA</Text>
      <Text style={[styles.subtitle, { color: subtitleColor }]}>Sosyal medyada takip et</Text>

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
          <View style={[styles.followBtn, { backgroundColor: followBtnBg }]}>
            <Text style={[styles.followText, { color: followBtnText }]}>Takip Et</Text>
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
    padding: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: 'PlayfairDisplay-VariableFont_wght',
  },
  subtitle: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: -4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  rowIcon: { fontSize: 18 },
  rowHandle: { flex: 1, color: '#ffffff', fontWeight: '700', fontSize: 12 },
  followBtn: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  followText: { fontSize: 10, fontWeight: '800' },
});
