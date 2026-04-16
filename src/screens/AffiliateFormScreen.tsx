import React, { useState } from 'react';
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

export default function AffiliateFormScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [affiliateLink, setAffiliateLink] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const inputBg = isDark ? Colors.gray700 : Colors.gray50;
  const inputBorder = isDark ? Colors.gray600 : Colors.gray300;
  const textColor = isDark ? Colors.white : Colors.gray900;

  const pickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      maxWidth: 800,
      maxHeight: 800,
      quality: 1,
      includeBase64: true,
    });
    if (result.assets && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri ?? null);
      setImageBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null);
    }
  };

  const handleSubmit = async () => {
    if (!productName || !brand || !category || !affiliateLink || !newPrice || !imageBase64) {
      Alert.alert('Hata', 'Lütfen zorunlu alanları doldurun ve bir görsel seçin.');
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
    try {
      await submitPendingDiscount({
        title: productName,
        brand,
        category,
        link: affiliateLink,
        oldPrice: oldPrice ? parseFloat(oldPrice) : undefined,
        newPrice: parseFloat(newPrice),
        imageBase64,
      });
      setIsSuccess(true);
    } catch {
      Alert.alert('Hata', 'Gönderim sırasında bir hata oluştu. İnternet bağlantınızı kontrol edin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <View style={[styles.successContainer, { backgroundColor: bg }]}>
        <View style={styles.successIcon}>
          <Text style={{ fontSize: 48 }}>✅</Text>
        </View>
        <Text style={[styles.successTitle, { color: textColor }]}>Başvurunuz Alındı!</Text>
        <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, textAlign: 'center', lineHeight: 22 }}>
          İndirim talebiniz ekibimize iletildi. İncelendikten sonra yayınlanacak.
        </Text>
        <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.successBtnText}>Tamam</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Steps */}
      <View style={[styles.stepsCard, { backgroundColor: cardBg, margin: 16 }]}>
        <Text style={[styles.stepsLabel, { color: isDark ? Colors.gray300 : Colors.gray700 }]}>Nasıl Çalışır?</Text>
        {['Affiliate linkinizi oluşturun', 'Ürün bilgilerini forma girin', 'Ekibimiz inceler ve yayınlar', 'Her satıştan kazanın'].map((t, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepCircle}><Text style={styles.stepNum}>{i + 1}</Text></View>
            <Text style={{ color: isDark ? Colors.gray400 : Colors.gray600, fontSize: 13, flex: 1 }}>{t}</Text>
          </View>
        ))}
      </View>

      {/* Form */}
      <View style={[styles.formCard, { backgroundColor: cardBg, marginHorizontal: 16 }]}>
        <Text style={[styles.formTitle, { color: textColor }]}>İndirim Bilgileri</Text>

        <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
          placeholder="Ürün Başlığı *" placeholderTextColor={Colors.gray400}
          value={productName} onChangeText={setProductName} />

        <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
          placeholder="Marka / Market *" placeholderTextColor={Colors.gray400}
          value={brand} onChangeText={setBrand} />

        <TouchableOpacity
          style={[styles.input, styles.pickerBtn, { backgroundColor: inputBg, borderColor: inputBorder }]}
          onPress={() => setShowCatPicker(!showCatPicker)}
        >
          <Text style={{ color: category ? textColor : Colors.gray400, fontSize: 14 }}>
            {category || 'Kategori Seçin *'}
          </Text>
          <Text style={{ color: Colors.gray400 }}>▼</Text>
        </TouchableOpacity>
        {showCatPicker && (
          <View style={[styles.catPickerList, { backgroundColor: inputBg, borderColor: inputBorder }]}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} style={styles.catOption}
                  onPress={() => { setCategory(cat); setShowCatPicker(false); }}>
                  <Text style={{ color: textColor, fontSize: 14 }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
          placeholder="Affiliate / Ürün Linki *" placeholderTextColor={Colors.gray400}
          value={affiliateLink} onChangeText={setAffiliateLink} keyboardType="url" autoCapitalize="none" />

        <View style={styles.priceRow}>
          <TextInput style={[styles.input, styles.halfInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
            placeholder="Eski Fiyat" placeholderTextColor={Colors.gray400}
            value={oldPrice} onChangeText={setOldPrice} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.halfInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
            placeholder="Yeni Fiyat *" placeholderTextColor={Colors.gray400}
            value={newPrice} onChangeText={setNewPrice} keyboardType="numeric" />
        </View>

        {/* Image picker */}
        <Text style={{ color: isDark ? Colors.gray300 : Colors.gray700, fontSize: 13, fontWeight: '600' }}>Ürün Görseli *</Text>
        <TouchableOpacity style={[styles.imagePicker, { borderColor: imageUri ? Colors.green500 : inputBorder }]} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="contain" />
          ) : (
            <>
              <Text style={{ fontSize: 28 }}>📷</Text>
              <Text style={{ color: Colors.gray400, fontSize: 13 }}>Görsel seçmek için dokunun</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitBtn, { opacity: isSubmitting ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitBtnText}>{isSubmitting ? 'Gönderiliyor...' : 'İndirimi Gönder'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  successBtn: { backgroundColor: Colors.orange, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14, marginTop: 24 },
  successBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  stepsCard: { borderRadius: 16, padding: 16, gap: 8 },
  stepsLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.orange + '22', alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: Colors.orange, fontSize: 11, fontWeight: '800' },
  formCard: { borderRadius: 16, padding: 16, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catPickerList: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  catOption: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0' },
  priceRow: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  imagePicker: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8,
  },
  previewImg: { width: '100%', height: 160 },
  submitBtn: { backgroundColor: Colors.orange, paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
});
