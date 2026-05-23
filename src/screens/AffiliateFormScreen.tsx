import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { launchImageLibrary } from 'react-native-image-picker';
import { submitPendingDiscount } from '../services/firebaseService';
import { CATEGORIES } from '../constants/categories';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-3675503435035155/1880723761';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

const STEPS = [
  { num: '1', label: 'Link oluştur' },
  { num: '2', label: 'Formu doldur' },
  { num: '3', label: 'İnceleme' },
  { num: '4', label: 'Kazan!' },
];

export default function AffiliateFormScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [productName, setProductName]   = useState('');
  const [brand, setBrand]               = useState('');
  const [category, setCategory]         = useState('');
  const [affiliateLink, setAffiliateLink] = useState('');
  const [oldPrice, setOldPrice]         = useState('');
  const [newPrice, setNewPrice]         = useState('');
  const [imageBase64, setImageBase64]   = useState<string | null>(null);
  const [imageUri, setImageUri]         = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess]       = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const submissionResultRef = useRef<'success' | 'error' | null>(null);
  const adClosedRef  = useRef(false);
  const adShownRef   = useRef(false);

  useEffect(() => {
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      interstitial.load();
      adClosedRef.current = true;
      if (submissionResultRef.current !== null) {
        if (submissionResultRef.current === 'success') {
          setIsSuccess(true);
        } else {
          Alert.alert('Hata', 'Gönderim sırasında bir hata oluştu. İnternet bağlantınızı kontrol edin.');
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

  // ── Handlers ──────────────────────────────────────────────────────
  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 800, maxHeight: 800,
        quality: 1, includeBase64: true,
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Hata', result.errorMessage ?? 'Görsel seçilirken bir sorun oluştu.');
        return;
      }
      if (result.assets?.[0]) {
        const asset = result.assets[0];
        setImageUri(asset.uri ?? null);
        setImageBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null);
      }
    } catch {
      Alert.alert('Hata', 'Görsel seçilirken beklenmeyen bir hata oluştu.');
    }
  };

  const handleSubmit = async () => {
    if (!productName || !brand || !category || !affiliateLink || !newPrice || !imageBase64) {
      Alert.alert('Eksik Bilgi', 'Lütfen zorunlu (*) alanları doldurun ve bir görsel seçin.');
      return;
    }
    const npNum = parseFloat(newPrice);
    if (isNaN(npNum) || npNum <= 0) {
      Alert.alert('Hata', 'Yeni fiyat sıfırdan büyük olmalıdır.');
      return;
    }
    if (oldPrice) {
      const opNum = parseFloat(oldPrice);
      if (isNaN(opNum) || opNum <= npNum) {
        Alert.alert('Hata', 'Eski fiyat, yeni fiyattan büyük olmalıdır.');
        return;
      }
    }

    setIsSubmitting(true);
    submissionResultRef.current = null;
    adClosedRef.current  = false;
    adShownRef.current   = false;

    if (interstitial.loaded) {
      adShownRef.current = true;
      interstitial.show().catch(() => { adShownRef.current = false; });
    }

    try {
      await submitPendingDiscount({
        title: productName, brand, category,
        link: affiliateLink,
        oldPrice: oldPrice ? parseFloat(oldPrice) : undefined,
        newPrice: parseFloat(newPrice),
        imageBase64,
      });
      if (!adShownRef.current || adClosedRef.current) setIsSuccess(true);
      else submissionResultRef.current = 'success';
    } catch {
      if (!adShownRef.current || adClosedRef.current) {
        Alert.alert('Hata', 'Gönderim sırasında bir hata oluştu. İnternet bağlantınızı kontrol edin.');
        setIsSubmitting(false);
      } else {
        submissionResultRef.current = 'error';
      }
    }
  };

  // ── Success screen ────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <View style={[styles.successWrap, { backgroundColor: bg }]}>
        <View style={styles.successIconWrap}>
          <Text style={{ fontSize: 44 }}>✅</Text>
        </View>
        <Text style={[styles.successTitle, { color: textColor }]}>Başvurunuz Alındı!</Text>
        <Text style={[styles.successDesc, { color: subColor }]}>
          İndirim talebiniz ekibimize iletildi.{'\n'}İncelendikten sonra yayınlanacak.
        </Text>
        <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={styles.successBtnText}>Tamam</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── How it works strip ── */}
      <View style={[styles.stepsStrip, { backgroundColor: Colors.orange + '14', borderBottomColor: Colors.orange + '22' }]}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.num}>
            <View style={styles.stripStep}>
              <View style={[styles.stripCircle, { backgroundColor: Colors.orange + '22' }]}>
                <Text style={[styles.stripNum, { color: Colors.orange }]}>{s.num}</Text>
              </View>
              <Text style={[styles.stripLabel, { color: subColor }]}>{s.label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stripLine, { backgroundColor: Colors.orange + '30' }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* ── Product info section ── */}
      <View style={styles.sectionWrap}>
        <View style={[styles.sectionHeader, { borderLeftColor: Colors.orange }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Ürün Bilgileri</Text>
          <Text style={[styles.sectionHint, { color: subColor }]}>* zorunlu alan</Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Field label="Ürün Başlığı" required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="ör. Samsung Galaxy A55 128GB"
              placeholderTextColor={Colors.gray400}
              value={productName} onChangeText={setProductName}
            />
          </Field>

          <Separator color={inputBorder} />

          <Field label="Marka / Market" required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="ör. Trendyol, Hepsiburada"
              placeholderTextColor={Colors.gray400}
              value={brand} onChangeText={setBrand}
            />
          </Field>

          <Separator color={inputBorder} />

          <Field label="Kategori" required labelColor={labelColor}>
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
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catOption, { borderBottomColor: inputBorder }]}
                      onPress={() => { setCategory(cat); setShowCatPicker(false); }}
                    >
                      <Text style={{ color: cat === category ? Colors.orange : textColor, fontSize: 14,
                        fontWeight: cat === category ? '700' : '400' }}>
                        {cat}
                      </Text>
                      {cat === category && <Text style={{ color: Colors.orange }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </Field>
        </View>
      </View>

      {/* ── Link & pricing section ── */}
      <View style={styles.sectionWrap}>
        <View style={[styles.sectionHeader, { borderLeftColor: Colors.orange }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Link & Fiyat</Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Field label="Affiliate / Ürün Linki" required labelColor={labelColor}>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              placeholder="https://..."
              placeholderTextColor={Colors.gray400}
              value={affiliateLink} onChangeText={setAffiliateLink}
              keyboardType="url" autoCapitalize="none"
            />
          </Field>

          <Separator color={inputBorder} />

          <View style={styles.priceRow}>
            <View style={{ flex: 1 }}>
              <Field label="Eski Fiyat (TL)" labelColor={labelColor}>
                <TextInput
                  style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                  placeholder="0.00"
                  placeholderTextColor={Colors.gray400}
                  value={oldPrice} onChangeText={setOldPrice}
                  keyboardType="numeric"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Yeni Fiyat (TL)" required labelColor={labelColor}>
                <TextInput
                  style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
                  placeholder="0.00"
                  placeholderTextColor={Colors.gray400}
                  value={newPrice} onChangeText={setNewPrice}
                  keyboardType="numeric"
                />
              </Field>
            </View>
          </View>
        </View>
      </View>

      {/* ── Image section ── */}
      <View style={styles.sectionWrap}>
        <View style={[styles.sectionHeader, { borderLeftColor: Colors.orange }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Ürün Görseli  *</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.imagePicker,
            {
              backgroundColor: cardBg,
              borderColor: imageUri ? Colors.green500 : inputBorder,
              borderStyle: imageUri ? 'solid' : 'dashed',
            },
          ]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          {imageUri ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="contain" />
              <View style={styles.imageEditBadge}>
                <Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700' }}>✎ Değiştir</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.imagePickerIcon, { backgroundColor: Colors.orange + '18' }]}>
                <Text style={{ fontSize: 28 }}>📷</Text>
              </View>
              <Text style={[styles.imagePickerTitle, { color: textColor }]}>Görsel Seç</Text>
              <Text style={[styles.imagePickerSub, { color: subColor }]}>
                Ürünün net bir fotoğrafını ekleyin
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Submit ── */}
      <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
        <TouchableOpacity
          style={[styles.submitBtn, { opacity: isSubmitting ? 0.65 : 1 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>
            {isSubmitting ? '⏳  Gönderiliyor...' : '🚀  İndirimi Gönder'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.submitNote, { color: subColor }]}>
          Gönderilen içerikler ekibimiz tarafından incelenir.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────
function Field({
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
  return <View style={[{ height: 1, backgroundColor: color, marginVertical: 2, opacity: 0.5 }]} />;
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  req: { color: Colors.orange, fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
  // ── How-it-works strip ────────────────────────────────────────────
  stepsStrip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  stripStep: { alignItems: 'center', gap: 5, flex: 1 },
  stripCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  stripNum: { fontSize: 13, fontWeight: '800' },
  stripLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  stripLine: { flex: 0.4, height: 1.5, marginBottom: 14 },

  // ── Section ───────────────────────────────────────────────────────
  sectionWrap: { paddingHorizontal: 16, marginTop: 20, gap: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderLeftWidth: 3, paddingLeft: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionHint: { fontSize: 12 },

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
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  catList: {
    borderWidth: 1, borderRadius: 10,
    overflow: 'hidden', marginTop: 4,
  },
  catOption: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  priceRow: { flexDirection: 'row', gap: 12 },

  // ── Image picker ──────────────────────────────────────────────────
  imagePicker: {
    marginHorizontal: 16,
    borderWidth: 2, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, gap: 10,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  imagePickerIcon: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  imagePickerTitle: { fontSize: 15, fontWeight: '700' },
  imagePickerSub: { fontSize: 12 },
  imagePreviewWrap: { width: '100%', position: 'relative' },
  imagePreview: { width: '100%', height: 180 },
  imageEditBadge: {
    position: 'absolute', bottom: 8, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },

  // ── Submit ────────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: Colors.orange,
    paddingVertical: 16, borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  submitBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  submitNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },

  // ── Success ───────────────────────────────────────────────────────
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.green500 + '18',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  successDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  successBtn: {
    backgroundColor: Colors.orange,
    paddingHorizontal: 44, paddingVertical: 14,
    borderRadius: 14, marginTop: 28,
  },
  successBtnText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
});
