import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

export default function ProfilePrivacyScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const textColor = isDark ? Colors.gray200 : Colors.gray700;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? Colors.gray900 : Colors.gray50 }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
    >
      <Text style={[styles.sectionTitle, { color: isDark ? Colors.white : Colors.gray800 }]}>Gizlilik Politikası</Text>
      <Text style={[styles.body, { color: textColor }]}>
        İNDİVA uygulaması, kullanıcılarına en güncel indirim fırsatlarını sunmayı amaçlar. Bu gizlilik politikası, uygulama kullanımınız sırasında veri toplama, kullanma ve koruma uygulamalarımızı açıklar.
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>1. Toplanan Veriler</Text>
      <Text style={[styles.body, { color: textColor }]}>
        • Oy tercihleri, favori listeleri ve inceleme sayıları yalnızca cihazınızda yerel olarak saklanır.{'\n'}
        • Push bildirim token'ınız Firebase Cloud Messaging üzerinden yönetilir ve bildirim göndermek amacıyla kullanılır.{'\n'}
        • Uygulama üzerinden gönderilen form verileri (affiliate başvurusu, işbirliği başvurusu) Firebase Firestore'da güvenli şekilde saklanır.
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>2. Veri Kullanımı</Text>
      <Text style={[styles.body, { color: textColor }]}>
        Toplanan veriler yalnızca uygulama deneyimini iyileştirmek, ilgili indirimleri göstermek ve bildirim göndermek amacıyla kullanılır. Kişisel verileriniz üçüncü taraflarla paylaşılmaz.
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>3. Reklamlar</Text>
      <Text style={[styles.body, { color: textColor }]}>
        Uygulama, Google AdMob aracılığıyla kişiselleştirilmemiş reklamlar gösterebilir. Google'ın gizlilik politikası için: https://policies.google.com/privacy
      </Text>

      <Text style={[styles.heading, { color: isDark ? Colors.white : Colors.gray800 }]}>4. İletişim</Text>
      <Text style={[styles.body, { color: textColor }]}>
        Gizlilik politikamız hakkında sorularınız için: indivaapp@gmail.com
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
