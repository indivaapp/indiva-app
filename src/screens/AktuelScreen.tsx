import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const stores = [
  {
    slug: 'bim',
    name: 'BİM',
    description: 'Aktüel ürünler ve haftalık kampanyalar',
    color: '#e30613',
    logo: require('../assets/logos/bim.png'),
  },
  {
    slug: 'a101',
    name: 'A101',
    description: 'Bu haftanın fırsat ürünleri',
    color: '#0057a8',
    logo: require('../assets/logos/a101.png'),
  },
  {
    slug: 'sok',
    name: 'ŞOK',
    description: 'Kampanyalı ve indirimli ürünler',
    color: '#d4a017',
    logo: require('../assets/logos/sok.png'),
  },
];

export default function AktuelScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const bg = isDark ? Colors.gray900 : Colors.gray50;

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top + 12, paddingBottom: 24 }]}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: isDark ? Colors.white : Colors.gray800 }]}>
          Aktüel Kataloglar
        </Text>
        <Text style={[styles.pageSubtitle, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
          Market broşürlerine göz at
        </Text>
      </View>

      {/* Store cards */}
      {stores.map(store => (
        <TouchableOpacity
          key={store.slug}
          style={[
            styles.storeCard,
            {
              backgroundColor: isDark ? Colors.gray800 : Colors.white,
              borderColor: isDark ? Colors.gray700 : Colors.gray200,
            },
          ]}
          activeOpacity={0.82}
          onPress={() => navigation.navigate('AktuelDetail', { storeName: store.slug })}
        >
          {/* Colored left accent */}
          <View style={[styles.colorAccent, { backgroundColor: store.color }]} />

          {/* Logo area */}
          <View style={[styles.logoContainer, { backgroundColor: isDark ? Colors.gray900 : Colors.gray50 }]}>
            <Image source={store.logo} style={styles.logo} resizeMode="contain" />
          </View>

          {/* Text info */}
          <View style={styles.storeInfo}>
            <Text style={[styles.storeName, { color: isDark ? Colors.white : Colors.gray800 }]}>
              {store.name} Aktüel
            </Text>
            <Text style={[styles.storeDesc, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
              {store.description}
            </Text>
          </View>

          {/* Arrow */}
          <Text style={[styles.arrow, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 12,
  },
  pageHeader: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  pageSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  storeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  colorAccent: {
    width: 5,
    alignSelf: 'stretch',
  },
  logoContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 12,
    borderRadius: 14,
  },
  logo: {
    width: 56,
    height: 44,
  },
  storeInfo: {
    flex: 1,
    gap: 3,
    paddingVertical: 16,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '800',
  },
  storeDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  arrow: {
    fontSize: 26,
    fontWeight: '300',
    paddingHorizontal: 16,
  },
});
