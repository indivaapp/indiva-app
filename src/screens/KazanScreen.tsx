import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function KazanScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? Colors.gray900 : Colors.gray50 }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
    >
      {/* Hero Banner */}
      <View style={[styles.heroBanner, { paddingTop: insets.top + 20 }]}>
        <View style={styles.heroIconBox}>
          <Text style={{ fontSize: 28 }}>🔗</Text>
        </View>
        <Text style={styles.heroTitle}>Fırsatı Paylaş,{'\n'}Satış Ortaklığı Geliri Kazan</Text>
        <Text style={styles.heroDesc}>
          Yakaladığınız indirimi İndiva'ya gönderin. Ekibimiz inceleyip yayınlar; affiliate linkiniz üzerinden her satıştan siz kazanırsınız.
        </Text>
      </View>

      {/* Value Pillars */}
      <View style={[styles.pillarsCard, { backgroundColor: cardBg }]}>
        {[
          { icon: '🔗', label: 'Affiliate Link' },
          { icon: '✅', label: 'Hızlı Onay' },
          { icon: '💰', label: 'Satıştan Kazan' },
        ].map((p, i) => (
          <React.Fragment key={p.label}>
            {i > 0 && <View style={[styles.pillarDivider, { backgroundColor: isDark ? Colors.gray600 : Colors.gray200 }]} />}
            <View style={styles.pillarItem}>
              <Text style={{ fontSize: 22 }}>{p.icon}</Text>
              <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 11, fontWeight: '500' }}>{p.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16, marginTop: 20 }}>
        {/* Affiliate Card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconBox, { backgroundColor: 'rgba(249,115,22,0.2)' }]}>
              <Text style={{ fontSize: 24 }}>🔗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: Colors.white }]}>Affiliate Linkinizi Paylaşın</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Her satıştan komisyon geliri elde edin</Text>
            </View>
          </View>
          <View style={[styles.cardBody, { backgroundColor: cardBg }]}>
            <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
              Trendyol, Hepsiburada veya diğer platformlarda oluşturduğunuz{' '}
              <Text style={{ fontWeight: '700', color: Colors.orange }}>satış ortaklığı (affiliate) linki</Text>ni bize gönderin. Onaylandığında yayınlanır ve her satışta komisyonunuz hesabınıza aktarılır.
            </Text>
            {['Platformda affiliate linki oluşturun', 'Ürün bilgilerini ve linki forma ekleyin', 'Ekibimiz inceler, uygun bulursa yayınlar', 'Her satıştan affiliate gelirinizi kazanın'].map((text, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.stepCircle, { backgroundColor: Colors.orange + '22' }]}>
                  <Text style={{ color: Colors.orange, fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
                </View>
                <Text style={{ color: isDark ? Colors.gray400 : Colors.gray600, fontSize: 13, flex: 1 }}>{text}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: Colors.orange }]}
              onPress={() => navigation.navigate('AffiliateForm')}
            >
              <Text style={styles.ctaBtnText}>İndirim Paylaş & Kazan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Partnership Card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={[styles.cardHeader, { backgroundColor: Colors.blue600 }]}>
            <View style={[styles.cardIconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={{ fontSize: 24 }}>🤝</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: Colors.white }]}>İşbirliği Başvurusu</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Marka ve içerik üreticileri için</Text>
            </View>
          </View>
          <View style={[styles.cardBody, { backgroundColor: cardBg }]}>
            <Text style={{ color: isDark ? Colors.gray300 : Colors.gray600, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
              Markanızı veya ürünlerinizi İndiva topluluğuyla buluşturmak istiyorsanız işbirliği başvurusunda bulunabilirsiniz.
            </Text>
            <View style={styles.gridRow}>
              {[
                { icon: '🌱', title: 'Ücretsiz', desc: 'Herhangi bir ödeme yok' },
                { icon: '🤝', title: 'Gerçek Ortaklık', desc: 'Karşılıklı değer' },
                { icon: '🎯', title: 'Doğru Kitle', desc: 'İndirim arayanlar' },
                { icon: '📈', title: 'Büyüme', desc: 'Toplulukla güçlenin' },
              ].map(item => (
                <View key={item.title} style={[styles.gridItem, { backgroundColor: isDark ? '#0f1b2d' : '#eff6ff' }]}>
                  <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                  <Text style={[styles.gridItemTitle, { color: textColor }]}>{item.title}</Text>
                  <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 11 }}>{item.desc}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: Colors.blue600 }]}
              onPress={() => navigation.navigate('AdvertiseForm')}
            >
              <Text style={styles.ctaBtnText}>İşbirliği Başvurusu Yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroBanner: {
    backgroundColor: Colors.orange,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  heroIconBox: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroTitle: { color: Colors.white, fontSize: 20, fontWeight: '900', textAlign: 'center', lineHeight: 26 },
  heroDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8, maxWidth: 300 },
  pillarsCard: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginHorizontal: 16, marginTop: -24,
    borderRadius: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  pillarItem: { alignItems: 'center', gap: 4 },
  pillarDivider: { width: 1, marginVertical: 4 },
  card: { borderRadius: 16, overflow: 'hidden' },
  cardHeader: {
    backgroundColor: Colors.orange,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cardIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardBody: { padding: 16, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  stepCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ctaBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  ctaBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  gridItem: { width: '47%', borderRadius: 12, padding: 12, gap: 2 },
  gridItemTitle: { fontSize: 12, fontWeight: '700' },
});
