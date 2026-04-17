import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, StatusBar, Dimensions } from 'react-native';
import { Colors } from '../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');

export default function SplashScreen() {
  const shimmerX = useRef(new Animated.Value(-SCREEN_W * 0.6)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(400),
      Animated.timing(shimmerX, {
        toValue: SCREEN_W * 0.8,
        duration: 750,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.orange} />
      <View style={styles.logoWrapper}>
        <Text style={styles.logoText}>İNDİVA</Text>
        {/* Yansıma şeridi */}
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmerStrip, { transform: [{ translateX: shimmerX }, { rotate: '15deg' }] }]}
        />
      </View>
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
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -40,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  logoText: {
    fontSize: 62,
    fontWeight: '900',
    fontFamily: 'PlayfairDisplay-VariableFont_wght',
    color: Colors.white,
    letterSpacing: 8,
    includeFontPadding: false,
  },
  shimmerStrip: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 36,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
