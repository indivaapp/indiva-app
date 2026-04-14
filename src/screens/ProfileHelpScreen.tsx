import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

export default function ProfileHelpScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const textColor = isDark ? Colors.white : Colors.gray800;
  const bodyColor = isDark ? Colors.gray300 : Colors.gray600;

  const faqs = [
    { q: 'İNDİVA nedir?', a: 'İNDİVA, Türkiye genelindeki en güncel indirimleri topluluk tarafından takip edilen bir fırsat platformudur.' },
    { q: 'İndirimler nasıl ekleniyor?', a: 'İndirimler hem otomatik tarama ile hem de topluluk üyelerinin gönderimleriyle eklenir. Her ilan ekibimiz tarafından incelenir.' },
    { q: 'Oy sistemi nasıl çalışır?', a: 'Her kullanıcı bir indirime "devam ediyor" veya "bitti" oyu verebilir. Çoğunluk "bitti" dediğinde ilan otomatik olarak feed\'den kaldırılır.' },
    { q: 'Favorilere nasıl eklerim?', a: 'İndirim kartındaki kalp ikonuna dokunarak o fırsatı favorilere ekleyebilirsiniz. Favorilerim sekmesinden hepsini görebilirsiniz.' },
    { q: 'Sorun bildirmek istiyorum', a: 'Herhangi bir sorun veya öneriniz için indiva.app@gmail.com adresine e-posta gönderebilirsiniz.' },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? Colors.gray900 : Colors.gray50 }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
    >
      {faqs.map((faq, i) => (
        <View key={i} style={[styles.card, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
          <Text style={[styles.question, { color: textColor }]}>{faq.q}</Text>
          <Text style={[styles.answer, { color: bodyColor }]}>{faq.a}</Text>
        </View>
      ))}
      <View style={styles.contactBox}>
        <Text style={{ color: Colors.orange, fontWeight: '700', fontSize: 14 }}>📧 İletişim</Text>
        <Text style={{ color: bodyColor, fontSize: 13, marginTop: 4 }}>indiva.app@gmail.com</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 6 },
  question: { fontSize: 15, fontWeight: '700' },
  answer: { fontSize: 13, lineHeight: 20 },
  contactBox: { alignItems: 'center', paddingVertical: 20 },
});
