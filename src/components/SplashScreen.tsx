import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import { Colors } from '../constants/colors';

export default function SplashScreen() {
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale  = useRef(new Animated.Value(0.82)).current;
  const textTranslateY = useRef(new Animated.Value(24)).current;
  const shimmerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Metin giriş animasyonu
    Animated.parallel([
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(textScale, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.timing(textTranslateY, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Metin yerleştikten sonra hafif parlaklık efekti
      Animated.sequence([
        Animated.timing(shimmerOpacity, {
          toValue: 0.35,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerOpacity, {
          toValue: 0,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.orange} />

      {/* Üstten hafif karartma katmanı — derinlik hissi */}
      <View style={styles.topOverlay} pointerEvents="none" />

      {/* Ana logo metni */}
      <Animated.View
        style={[
          styles.logoWrapper,
          {
            opacity: textOpacity,
            transform: [
              { scale: textScale },
              { translateY: textTranslateY },
            ],
          },
        ]}
      >
        <Text style={styles.logoText}>İNDİVA</Text>

        {/* Parlaklık overlay */}
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmer, { opacity: shimmerOpacity }]}
        />
      </Animated.View>
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
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -40, // görsel olarak hafif yukarı kaydır
  },
  logoText: {
    fontSize: 56,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 10,
    includeFontPadding: false,
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.white,
    borderRadius: 4,
  },
});
