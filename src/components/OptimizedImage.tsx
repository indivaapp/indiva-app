import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ImageStyle,
  ViewStyle,
  Text,
} from 'react-native';
import { Colors } from '../constants/colors';

interface OptimizedImageProps {
  src?: string;
  alt?: string;
  isDark?: boolean;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  isDark = false,
  style,
  containerStyle,
  resizeMode = 'cover',
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {!isLoaded && !hasError && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? Colors.gray700 : Colors.gray200 },
          ]}
        />
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
          fadeDuration={0}
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
