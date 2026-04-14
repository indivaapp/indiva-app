import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Colors } from '../constants/colors';

export default function SplashScreen() {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoContainer, { transform: [{ scale }], opacity }]}>
        <Text style={styles.logoEmoji}>🔥</Text>
        <Text style={styles.logoText}>İNDİVA</Text>
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        En sıcak fırsatlar burada
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    gap: 8,
  },
  logoEmoji: {
    fontSize: 56,
    marginBottom: 4,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 6,
  },
  tagline: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: 1,
  },
});
