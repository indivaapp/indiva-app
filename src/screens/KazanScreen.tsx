import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const AFFILIATE_STEPS = [
  { icon: '🔗', text: 'Platformda affiliate linki oluşturun' },
  { icon: '📝', text: 'Ürün bilgilerini ve linki forma ekleyin' },
  { icon: '✅', text: 'Ekibimiz inceler, uygun bulursa yayınlar' },
  { icon: '💰', text: 'Her satıştan affiliate gelirinizi kazanın' },
];

const PARTNER_FEATURES = [
  { icon: '🌱', title: 'Ücretsiz', desc: 'Herhangi bir ödeme yok' },
  { icon: '🎯', title: 'Doğru Kitle', desc: 'İndirim arayanlar' },
  { icon: '🤝', title: 'Gerçek Ortaklık', desc: 'Karşılıklı değer' },
  { icon: '📈', title: 'Büyüme', desc: 'Toplulukla güçlenin' },
];

export default function KazanScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const bg      = isDark ? Colors.gray900  : '#f8f9fb';
  const cardBg  = isDark ? Colors.gray800  : Colors.white;
  const textCol = isDark ? Colors.white    : Colors.gray900;
  const subCol  = isDark ? Colors.gray400  : Colors.gray500;
  const sepCol  = isDark ? Colors.gray700  : Colors.gray200;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />

        <Text style={styles.heroEyebrow}>✦  ORTAKLIK PROGRAMI</Text>

        <View style={styles.heroIconWrap}>
          <Text style={{ fontSize: 32 }}>💸</Text>
        </View>

        <Text style={styles.heroTitle}>Fırsatı Paylaş,{'\n'}Kazanmaya Başla</Text>
        <Text style={styles.heroSub}>
          İndirimli ürünleri bizimle paylaş ya da markanı{'\n'}topluluğumuzla buluştur.
        </Text>
      </View>

      {/* ── Pillars ──────────────────────────────────────────────── */}
      <View style={[styles.pillars, { backgroundColor: cardBg }]}>
        {[
          { icon: '🔗', label: 'Affiliate Link' },
          { icon: '⚡', label: 'Hızlı Onay' },
          { icon: '💰', label: 'Satıştan Kazan' },
        ].map((p, i, arr) => (
          <React.Fragment key={p.label}>
            <View style={styles.pillar}>
              <Text style={{ fontSize: 20 }}>{p.icon}</Text>
              <Text style={[styles.pillarLabel, { color: subCol }]}>{p.label}</Text>
            </View>
            {i < arr.length - 1 && (
              <View style={[styles.pillarSep, { backgroundColor: sepCol }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 18, marginTop: 22 }}>

        {/* ── Affiliate Card ──────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={[styles.cardHead, { backgroundColor: Colors.orange }]}>
            <View style={styles.cardHeadIcon}>
              <Text style={{ fontSize: 22 }}>🔗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardHeadTitle}>İndirim Paylaş & Kazan</Text>
              <Text style={styles.cardHeadSub}>Her satıştan komisyon geliri elde edin</Text>
            </View>
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>Affiliate</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={[styles.cardDesc, { color: subCol }]}>
              Trendyol, Hepsiburada veya diğer platformlarda oluşturduğunuz{' '}
              <Text style={{ fontWeight: '700', color: Colors.orange }}>
                satış ortaklığı (affiliate) linki
              </Text>
              ni bize gönderin. Onaylandığında yayınlanır.
            </Text>

            {/* Steps */}
            <View style={[styles.stepsBox, { backgroundColor: isDark ? Colors.gray900 : Colors.gray100 + 'cc', borderColor: sepCol }]}>
              {AFFILIATE_STEPS.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: Colors.orange + '22' }]}>
                    <Text style={[styles.stepNumText, { color: Colors.orange }]}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 13 }}>{s.icon}</Text>
                  <Text style={[styles.stepText, { color: subCol }]}>{s.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: Colors.orange }]}
              onPress={() => navigation.navigate('AffiliateForm')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>İndirim Paylaş & Kazan  →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Partnership Card ────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={[styles.cardHead, { backgroundColor: Colors.blue600 }]}>
            <View style={styles.cardHeadIcon}>
              <Text style={{ fontSize: 22 }}>🤝</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardHeadTitle}>İşbirliği Başvurusu</Text>
              <Text style={styles.cardHeadSub}>Marka ve içerik üreticileri için</Text>
            </View>
            <View style={[styles.cardBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.cardBadgeText}>Ücretsiz</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={[styles.cardDesc, { color: subCol }]}>
              Markanızı veya ürünlerinizi İndiva topluluğuyla buluşturmak istiyorsanız
              işbirliği başvurusunda bulunabilirsiniz.
            </Text>

            {/* Feature grid */}
            <View style={styles.featureGrid}>
              {PARTNER_FEATURES.map(f => (
                <View
                  key={f.title}
                  style={[
                    styles.featureItem,
                    {
                      backgroundColor: isDark ? '#0f1b2d' : '#eff6ff',
                      borderColor: isDark ? '#1e3a5f' : '#bfdbfe',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 18 }}>{f.icon}</Text>
                  <Text style={[styles.featureTitle, { color: textCol }]}>{f.title}</Text>
                  <Text style={[styles.featureDesc, { color: subCol }]}>{f.desc}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: Colors.blue600 }]}
              onPress={() => navigation.navigate('AdvertiseForm')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>İşbirliği Başvurusu Yap  →</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ── Hero ──────────────────────────────────────────────────────────
  hero: {
    backgroundColor: Colors.orange,
    paddingHorizontal: 24,
    paddingBottom: 48,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDeco1: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -50, right: -60,
  },
  heroDeco2: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -30, left: -40,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11, fontWeight: '700', letterSpacing: 1.8,
    marginBottom: 16,
  },
  heroIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  heroTitle: {
    color: Colors.white,
    fontSize: 23, fontWeight: '900',
    textAlign: 'center', lineHeight: 30,
    marginBottom: 10,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13.5, textAlign: 'center', lineHeight: 21,
  },

  // ── Pillars ────────────────────────────────────────────────────────
  pillars: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    marginHorizontal: 16, marginTop: -26,
    borderRadius: 18, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
  },
  pillar: { alignItems: 'center', gap: 5, flex: 1 },
  pillarLabel: { fontSize: 11, fontWeight: '600' },
  pillarSep: { width: 1, height: 36 },

  // ── Card ───────────────────────────────────────────────────────────
  card: {
    borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09, shadowRadius: 8, elevation: 4,
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 15,
  },
  cardHeadIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeadTitle: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  cardHeadSub: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  cardBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20,
  },
  cardBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  cardBody: { padding: 16, gap: 14 },
  cardDesc: { fontSize: 13.5, lineHeight: 21 },

  // ── Steps ─────────────────────────────────────────────────────────
  stepsBox: {
    borderRadius: 12, borderWidth: 1,
    padding: 12, gap: 10,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: { fontSize: 12, fontWeight: '800' },
  stepText: { fontSize: 13, flex: 1 },

  // ── Feature grid ───────────────────────────────────────────────────
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureItem: {
    width: '47.5%', borderRadius: 13, padding: 12, gap: 3, borderWidth: 1,
  },
  featureTitle: { fontSize: 12, fontWeight: '700' },
  featureDesc: { fontSize: 11 },

  // ── CTA ────────────────────────────────────────────────────────────
  cta: {
    paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', marginTop: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  ctaText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
});
