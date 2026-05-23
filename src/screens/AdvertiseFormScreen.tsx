import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { submitAdRequest } from '../services/firebaseService';
import { CATEGORIES } from '../constants/categories';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-3675503435035155/1880723761';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

const CATEGORIES_WITH_OTHER = [...CATEGORIES, 'Diğer'];
type AdType = 'product' | 'store' | null;

const AD_TYPES = [
  {
    key: 'product' as AdType,
    icon: '🛒',
    title: 'Ürün İşbirliği',
    desc: 'İndirimli bir ürünü İndiva\'da duyurun',
    accent: Colors.orange,
    accentBg: Colors.orange + '15',
    accentBorder: Colors.orange + '40',
  },
  {
    key: 'store' as AdType,
    icon: '🏢',
    title: 'Marka / Mağaza İşbirliği',
    desc: 'Markanızı İndiva topluluğuyla tanıştırın',
    accent: Colors.blue600,
    accentBg: Colors.blue600 + '15',
    accentBorder: Colors.blue600 + '40',
  },
];

export default function AdvertiseFormScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [adType, setAdType]             = useState<AdType>(null);
  const [companyName, setCompanyName]   = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail]               = useState('');
  const [url, setUrl]                   = useState('');
  const [category, setCategory]         = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [message, setMessage]           = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess]       = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const submissionResultRef = useRef<'success' | 'error' | null>(null);
  const adClosedRef = useRef(false);
  const adShownRef  = useRef(false);

  useEffect(() => {
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      interstitial.load();
      adClosedRef.current = true;
      if (submissionResultRef.current !== null) {
        if (submissionResultRef.current === 'success') {
          setIsSuccess(true);
        } else {
          Alert.alert('Hata', 'Başvuru gönderilirken bir hata oluştu.');
          setIsSubmitting(false);
        }
        submissionResultRef.current = null;
      }
    });
    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => {
      setTimeout(() => { try { interstitial.load(); } catch {} }, 3000);
    });
    interstitial.load();
    return () => { unsubClosed(); unsubError(); };
  }, []);

  // ── Theme helpers ──────────────────────────────────────────────────
  const bg          = isDark ? Colors.gray900  : '#f8f9fb';
  const cardBg      = isDark ? Colors.gray800  : Colors.white;
  const inputBg     = isDark ? Colors.gray700  : Colors.gray100;
  const inputBorder = isDark ? Colors.gray600  : Colors.gray200;
  const textColor   = isDark ? Colors.white    : Colors.gray900;
  const labelColor  = isDark ? Colors.gray300  : Colors.gray700;
  const subColor    = isDark ? Colors.gray400  : Colors.gray500;

  const accent = adType === 'store' ? Colors.blue600 : Colors.orange;

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!companyName || !contactPerson || !email || !url || !category || !adType) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm zorunlu (*) alanları doldurun.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Hata', 'Lütfen geçerli bir e-posta adresi girin.');
      return;
    }

    setIsSubmitting(true);
    submissionResultRef.current = null;
    adClosedRef.current = false;
    adShownRef.current  = false;

    if (interstitial.loaded) {
      adShownRef.current = true;
      interstitial.show().catch(() => { adShownRef.current = false; });
    }

    try {
      await submitAdRequest({
        type: adType, companyName, contactPerson,
        email, url, category, discountCode, message,
      });
      if (!adShownRef.current || adClosedRef.current) setIsSuccess(true);
      else submissionResultRef.current = 'success';
    } catch {
      if (!adShownRef.current || adClosedRef.current) {
        Alert.alert('Hata', 'Başvuru gönderilirken bir hata oluştu.');
        setIsSubmitting(false);
      } else {
        submissionResultRef.current = 'error';
      }
    }
  };

  // ── Success ───────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <View style={[styles.successWrap, { backgroundColor: bg }]}>
        <View style={[styles.successIconWrap, { backgroundColor: Colors.blue600 + '18' }]}>
          <Text style={{ fontSize: 44 }}>🤝</Text>
        </View>
        <Text style={[styles.successTitle, { color: textColor }]}>Başvurunuz Alındı!</Text>
        <Text style={[styles.successDesc, { color: subColor }]}>
          İşbirliği talebiniz ekibimize iletildi.{'\n'}En kısa sürede e-posta ile geri döneceğiz.
        </Text>
        <TouchableOpacity
          style={[styles.successBtn, { backgroundColor: Colors.blue600 }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={styles.successBtnText}>Tamam</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step 1: Type selection ────────────────────────────────────────
  if (adType === null) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#0f1b2d' : '#eff6ff', borderLeftColor: Colors.blue500 }]}>
          <Text style={[styles.infoBannerTitle, { color: isDark ? '#93c5fd' : Colors.blue700 }]}>
            💙  Ücretsiz İşbirliği
          </Text>
          <Text style={[styles.infoBannerDesc, { color: isDark ? '#60a5fa' : Colors.blue600 }]}>
            Para değil, karşılıklı değer. İndiva topluluğuyla buluşmanız için kapımız açık.
          </Text>
        </View>

        <Text style={[styles.typeSectionLabel, { color: subColor }]}>Başvuru türünüzü seçin</Text>

        {AD_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[
              styles.typeCard,
              {
                backgroundColor: cardBg,
                borderColor: isDark ? Colors.gray700 : Colors.gray200,
              },
            ]}
            onPress={() => setAdType(t.key)}
            activeOpacity={0.82}
          >
            <View style={[styles.typeIconWrap, { backgroundColor: t.accentBg }]}>
              <Text style={{ fontSize: 26 }}>{t.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.typeTitle, { color: textColor }]}>{t.title}</Text>
              <Text style={[styles.typeDesc, { color: subColor }]}>{t.desc}</Text>
            </View>
            <View style={[styles.typeChevronWrap, { backgroundColor: t.accentBg }]}>
              <Text style={[styles.typeChevron, { color: t.accent }]}>›</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Features row */}
        <View style={styles.featuresRow}>
          {[
            { icon: '🔒', label: 'Güvenli' },
            { icon: '⚡', label: 'Hızlı Yanıt' },
            { icon: '🎯', label: 'Hedefli Kitle' },
            { icon: '🤝', label: 'Karşılıklı' },
          ].map(f => (
            <View key={f.label} style={[styles.featurePill, { backgroundColor: cardBg }]}>
              <Text style={{ fontSize: 15 }}>{f.icon}</Text>
              <Text style={[styles.featurePillText, { color: subColor }]}>{f.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Step 2: Form ──────────────────────────────────────────────────
  const isStore = adType === 'store';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Type indicator */}
      <View style={[styles.typeIndicator, { backgroundColor: accent + '14', borderBottomColor: accent + '25' }]}>
        <Text style={{ fontSize: 18 }}>{isStore ? '🏢' : '🛒'}</Text>
        <Text style={[styles.typeIndicatorText, { color: accent }]}>
          {isStore ? 'Marka / Mağaza İşbirliği' : 'Ürün İşbirliği'}
        </Text>
        <TouchableOpacity onPress={() => setAdType(null)}>
          <Text style={[styles.typeChangeBtn, { color: accent }]}>Değiştir</Text>
        </TouchableOpacity>
      </View>

      {/* ── Section: Yetkili Bilgileri ── */}
      <SectionBlock title="Yetkili Bilgileri" accent={accent} textColor={textColor}>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <FieldRow label="Yetkili Kişi" required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="Ad Soyad"
              placeholderTextColor={Colors.gray400}
              value={contactPerson} onChangeText={setContactPerson}
            />
          </FieldRow>
          <Separator color={inputBorder} />
          <FieldRow label="E-posta Adresi" required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="ornek@sirket.com"
              placeholderTextColor={Colors.gray400}
              value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none"
            />
          </FieldRow>
        </View>
      </SectionBlock>

      {/* ── Section: İşletme Bilgileri ── */}
      <SectionBlock title="İşletme Bilgileri" accent={accent} textColor={textColor}>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <FieldRow label="Firma / Marka Adı" required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder={isStore ? 'Marka adınız' : 'Firma adınız'}
              placeholderTextColor={Colors.gray400}
              value={companyName} onChangeText={setCompanyName}
            />
          </FieldRow>

          <Separator color={inputBorder} />

          <FieldRow label={isStore ? 'Web Siteniz' : 'Ürün / Kampanya Linki'} required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="https://..."
              placeholderTextColor={Colors.gray400}
              value={url} onChangeText={setUrl}
              keyboardType="url" autoCapitalize="none"
            />
          </FieldRow>

          <Separator color={inputBorder} />

          <FieldRow label={isStore ? 'Sektör' : 'Ürün Kategorisi'} required labelColor={labelColor}>
            <TouchableOpacity
              style={[styles.input, styles.pickerRow, { backgroundColor: inputBg, borderColor: inputBorder }]}
              onPress={() => setShowCatPicker(v => !v)}
            >
              <Text style={{ color: category ? textColor : Colors.gray400, fontSize: 14, flex: 1 }}>
                {category || 'Kategori seçin'}
              </Text>
              <Text style={{ color: subColor, fontSize: 12 }}>{showCatPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showCatPicker && (
              <View style={[styles.catList, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {CATEGORIES_WITH_OTHER.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.catOption, { borderBottomColor: inputBorder }]}
                      onPress={() => { setCategory(c); setShowCatPicker(false); }}
                    >
                      <Text style={{
                        color: c === category ? Colors.orange : textColor,
                        fontSize: 14,
                        fontWeight: c === category ? '700' : '400',
                      }}>{c}</Text>
                      {c === category && <Text style={{ color: Colors.orange }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </FieldRow>
        </View>
      </SectionBlock>

      {/* ── Section: Kampanya Detayları (optional) ── */}
      <SectionBlock title="Kampanya Detayları" hint="isteğe bağlı" accent={accent} textColor={textColor}>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <FieldRow label="Özel İndirim Kodu" labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="ör. INDIVA20"
              placeholderTextColor={Colors.gray400}
              value={discountCode} onChangeText={setDiscountCode}
              autoCapitalize="characters"
            />
          </FieldRow>

          <Separator color={inputBorder} />

          <FieldRow label={isStore ? 'Markanız Hakkında' : 'Kampanya Detayları'} labelColor={labelColor}>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder={isStore ? 'Markanız ve hedefleriniz hakkında kısa bilgi...' : 'Kampanya detayları ve koşulları...'}
              placeholderTextColor={Colors.gray400}
              value={message} onChangeText={setMessage}
              multiline numberOfLines={3} textAlignVertical="top"
            />
          </FieldRow>
        </View>
      </SectionBlock>

      {/* ── Submit ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: accent, opacity: isSubmitting ? 0.65 : 1 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>
            {isSubmitting ? '⏳  Gönderiliyor...' : '🚀  Başvuruyu Gönder'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.submitNote, { color: subColor }]}>
          Başvurunuz incelendikten sonra e-posta ile geri dönüş yapılacaktır.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────
function SectionBlock({
  title, hint, accent, textColor, children,
}: {
  title: string; hint?: string; accent: string; textColor: string; children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 10 }}>
      <View style={[blockStyles.header, { borderLeftColor: accent }]}>
        <Text style={[blockStyles.title, { color: textColor }]}>{title}</Text>
        {hint && <Text style={blockStyles.hint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function FieldRow({
  label, required, labelColor, children,
}: {
  label: string; required?: boolean; labelColor: string; children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[fieldStyles.label, { color: labelColor }]}>{label}</Text>
        {required && <Text style={fieldStyles.req}>*</Text>}
      </View>
      {children}
    </View>
  );
}

function Separator({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginVertical: 2, opacity: 0.4 }} />;
}

const blockStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderLeftWidth: 3, paddingLeft: 10,
  },
  title: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, color: Colors.gray400 },
});

const fieldStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  req: { color: Colors.orange, fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
  // ── Type selection ────────────────────────────────────────────────
  infoBanner: {
    borderRadius: 14, padding: 16, borderLeftWidth: 4,
    marginBottom: 20,
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  infoBannerDesc: { fontSize: 13, lineHeight: 20 },
  typeSectionLabel: {
    fontSize: 13, fontWeight: '600',
    textAlign: 'center', marginBottom: 12,
  },
  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderRadius: 18, padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  typeIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  typeTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  typeDesc: { fontSize: 13 },
  typeChevronWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  typeChevron: { fontSize: 22, fontWeight: '700' },
  featuresRow: {
    flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap',
  },
  featurePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  featurePillText: { fontSize: 12, fontWeight: '600' },

  // ── Type indicator bar ────────────────────────────────────────────
  typeIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  typeIndicatorText: { flex: 1, fontSize: 13, fontWeight: '700' },
  typeChangeBtn: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },

  // ── Card ──────────────────────────────────────────────────────────
  card: {
    borderRadius: 16, padding: 16, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },

  // ── Input ─────────────────────────────────────────────────────────
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center' },
  catList: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  catOption: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  textArea: { minHeight: 88, paddingTop: 11 },

  // ── Submit ────────────────────────────────────────────────────────
  submitBtn: {
    paddingVertical: 16, borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 5,
  },
  submitBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  submitNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },

  // ── Success ───────────────────────────────────────────────────────
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  successDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  successBtn: {
    paddingHorizontal: 44, paddingVertical: 14,
    borderRadius: 14, marginTop: 28,
  },
  successBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
});
