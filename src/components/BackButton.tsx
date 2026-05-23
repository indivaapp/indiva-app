import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  onPress: () => void;
}

/**
 * Uygulamanın tüm ekranlarında kullanılan standart geri butonu.
 * Hem custom header'lı ekranlarda hem de Stack.Screen headerLeft'inde kullanılır.
 */
export default function BackButton({ onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.btn}
      hitSlop={{ top: 10, right: 16, bottom: 10, left: 4 }}
      activeOpacity={0.65}
    >
      <Text style={styles.chevron}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 36,
    lineHeight: 40,
    color: Colors.orange,
    fontWeight: '300',
    marginTop: -3, // optik ortalama
  },
});
