import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { Colors } from '../constants/colors';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.orange} />
      <Text style={styles.logoText}>İNDİVA</Text>
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
  logoText: {
    fontSize: 62,
    fontWeight: '900',
    fontFamily: 'PlayfairDisplay-VariableFont_wght',
    color: Colors.white,
    letterSpacing: 8,
    includeFontPadding: false,
    marginTop: -40,
  },
});
