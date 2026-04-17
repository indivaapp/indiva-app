import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const stores = [
  { slug: 'bim', color: '#e30613', logo: require('../assets/logos/bim.png') },
  { slug: 'a101', color: '#0057a8', logo: require('../assets/logos/a101.png') },
  { slug: 'sok', color: '#ffcc00', logo: require('../assets/logos/sok.png') },
];

export default function AktuelScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const bg = isDark ? Colors.gray900 : Colors.gray50;

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top + 12, paddingBottom: 24 }]}>
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
          activeOpacity={0.85}
          onPress={() => navigation.navigate('AktuelDetail', { storeName: store.slug })}
        >
          <Image
            source={store.logo}
            style={styles.logo}
            resizeMode="contain"
          />
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
  storeCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  logo: {
    width: '60%',
    height: '65%',
  },
});
