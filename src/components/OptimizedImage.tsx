import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Animated,
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
  // Yumuşak fade-in için — eskiden opaklık isLoaded ile ANLIK 0→1 atlıyordu,
  // özellikle liste kaydırırken görsel "aniden beliriyor" hissi veriyordu
  // (kullanıcı geri bildirimi: profesyonel bir cila için yumuşak geçiş istendi).
  const opacity = useRef(new Animated.Value(0)).current;

  // KÖK NEDEN (kayma/flaş şikayeti): bu bileşen ürün/aktüel sayfaları arasındaki
  // kaydırma geçişlerinde (DetailScreen, AktuelDetailScreen) AYNI instance olarak
  // kalıyor — sadece `src` prop'u değişiyor, bileşen yeniden mount olmuyor. Bu
  // yüzden isLoaded/hasError state'i ESKİ görselden "true" olarak kalıyordu:
  // yeni görsel henüz yüklenmemiş olsa bile üstü opaklık=1 ile gösterilmeye
  // çalışılıyor, ESKİ bitmap ekranda kalıp yeni görsel hazır olunca aniden
  // üzerine "flaş" ile atlıyordu (yumuşak geçiş yerine). `src` değiştiğinde
  // state'i sıfırlamak, placeholder'ın doğru şekilde tekrar devreye girmesini
  // ve eski görselin donuk kalmamasını sağlıyor.
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    opacity.setValue(0);
  }, [src, opacity]);

  const handleLoad = () => {
    setIsLoaded(true);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

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
        <Animated.Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFill, { opacity }, style]}
          resizeMode={resizeMode}
          fadeDuration={0}
          onLoad={handleLoad}
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
