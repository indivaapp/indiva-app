import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Colors } from '../constants/colors';

export default function SplashScreen() {
  const clipWidth = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(false);

  const handleLayout = (e: LayoutChangeEvent) => {
    if (measured) return;
    setMeasured(true);
    const w = e.nativeEvent.layout.width;
    Animated.sequence([
      Animated.delay(350),
      Animated.timing(clipWidth, {
        toValue: w,
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.orange} />
      <View style={styles.logoWrapper}>
        {/* Altta soluk yazı */}
        <Text style={[styles.logoText, { opacity: 0.45 }]} onLayout={handleLayout}>
          İNDİVA
        </Text>
        {/* Üstte parlak yazı — soldan sağa açılır */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { overflow: 'hidden', width: clipWidth }]}
        >
          <Text style={styles.logoText}>İNDİVA</Text>
        </Animated.View>
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
    marginTop: -40,
  },
  logoText: {
    fontSize: 62,
    fontWeight: '900',
    fontFamily: 'PlayfairDisplay-VariableFont_wght',
    color: Colors.white,
    letterSpacing: 8,
    includeFontPadding: false,
  },
});
