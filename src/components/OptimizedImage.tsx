import React, { useState } from 'react';
import {
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
  ImageStyle,
  ViewStyle,
  Text,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

interface OptimizedImageProps {
  src?: string;
  alt?: string;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  style,
  containerStyle,
  resizeMode = 'cover',
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  return (
    <View style={[styles.container, containerStyle]}>
      {!isLoaded && !hasError && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.skeleton,
            { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 },
          ]}
        >
          <ActivityIndicator color={Colors.orange} size="small" />
        </View>
      )}

      {hasError ? (
        <View
          style={[
            styles.errorContainer,
            { backgroundColor: isDark ? Colors.gray800 : Colors.gray100 },
          ]}
        >
          <Text style={{ fontSize: 24 }}>🖼️</Text>
          <Text style={styles.errorText}>Yüklenemedi</Text>
        </View>
      ) : src ? (
        <Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFill, { opacity: isLoaded ? 1 : 0 }, style]}
          resizeMode={resizeMode}
          onLoad={() => setIsLoaded(true)}
          onError={() => { setIsLoaded(true); setHasError(true); }}
          accessibilityLabel={alt}
        />
      ) : (
        <View style={[styles.errorContainer, { backgroundColor: isDark ? Colors.gray800 : Colors.gray100 }]}>
          <Text style={{ fontSize: 24 }}>🖼️</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  skeleton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  errorText: {
    fontSize: 11,
    color: Colors.gray400,
  },
});

export default OptimizedImage;
