import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

export default function ProfileTermsScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const textColor = isDark ? Colors.gray200 : Colors.gray700;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? Colors.gray900 : Colors.gray50 }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
    >
      <Text style={[styles.sectionTitle, { color: isDark ? Colors.white : Colors.gray800 }]}>Kullanım Şartları</Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>1. Kabul</Text>
      <Text style={[styles.body, { color: textColor }]}>
        İNDİVA uygulamasını kullanarak bu kullanım şartlarını kabul etmiş sayılırsınız.
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>2. Hizmet Tanımı</Text>
      <Text style={[styles.body, { color: textColor }]}>
        İNDİVA, çeşitli kaynaklardan derlenen indirim fırsatlarını kullanıcılarına ulaştıran bir bilgilendirme platformudur. Sunulan fiyat ve indirim bilgileri referans amaçlıdır; satın alma kararı kullanıcıya aittir.
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>3. Kullanıcı Sorumlulukları</Text>
      <Text style={[styles.body, { color: textColor }]}>
        • Oy sistemini kötüye kullanmamak{'\n'}
        • Yanıltıcı indirim bilgisi göndermemek{'\n'}
        • Spam veya uygunsuz içerik paylaşmamak
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>4. Sorumluluk Reddi</Text>
      <Text style={[styles.body, { color: textColor }]}>
        İNDİVA, üçüncü taraf web sitelerindeki fiyat değişikliklerinden, stok durumlarından veya kampanya koşullarından sorumlu değildir. Fırsatlar bilgilendirme amaçlı paylaşılmaktadır.
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>5. İletişim</Text>
      <Text style={[styles.body, { color: textColor }]}>
        Kullanım şartları hakkında: indivaapp@gmail.com
      </Text>

      <Text style={[styles.footer, { color: Colors.gray400 }]}>Son güncelleme: Nisan 2026</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 22 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 24 },
});
