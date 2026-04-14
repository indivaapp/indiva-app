import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { submitAdRequest } from '../services/firebaseService';
import { CATEGORIES } from '../constants/categories';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

const CATEGORIES_WITH_OTHER = [...CATEGORIES, 'Diğer'];
type AdType = 'product' | 'store' | null;

export default function AdvertiseFormScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [adType, setAdType] = useState<AdType>(null);
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const inputBg = isDark ? Colors.gray700 : Colors.gray50;
  const inputBorder = isDark ? Colors.gray600 : Colors.gray300;
  const textColor = isDark ? Colors.white : Colors.gray900;

  const handleSubmit = async () => {
    if (!companyName || !contactPerson || !email || !url || !category || !adType) {
      Alert.alert('Hata', 'Lütfen tüm zorunlu alanları doldurun.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Hata', 'Lütfen geçerli bir e-posta girin.');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitAdRequest({ type: adType, companyName, contactPerson, email, url, category, discountCode, message });
      setIsSuccess(true);
    } catch {
      Alert.alert('Hata', 'Başvuru gönderilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <View style={[styles.successContainer, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 48 }}>✅</Text>
        <Text style={[styles.successTitle, { color: textColor }]}>Başvurunuz Alındı!</Text>
        <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, textAlign: 'center', lineHeight: 22 }}>
          İşbirliği talebiniz ekibimize iletildi. En kısa sürede e-posta yoluyla geri dönüş yapacağız.
        </Text>
        <TouchableOpacity style={[styles.successBtn, { backgroundColor: Colors.blue600 }]} onPress={() => navigation.goBack()}>
          <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 16 }}>Tamam</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Step 1: Type selection
  if (adType === null) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#0f1b2d' : '#eff6ff' }]}>
          <Text style={[styles.infoBannerTitle, { color: isDark ? '#93c5fd' : '#1e40af' }]}>Ücretsiz İşbirliği</Text>
          <Text style={{ color: isDark ? '#60a5fa' : '#1d4ed8', fontSize: 13, lineHeight: 20 }}>
            Para değil, karşılıklı değer. İndiva topluluğuyla buluşmanız için kapımız açık.
          </Text>
        </View>
        <Text style={{ color: isDark ? Colors.gray400 : Colors.gray600, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
          Başvuru türünü seçin
        </Text>
        <TouchableOpacity style={[styles.typeCard, { backgroundColor: cardBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}
          onPress={() => setAdType('product')}>
          <View style={[styles.typeIcon, { backgroundColor: Colors.orange + '22' }]}>
            <Text style={{ fontSize: 24 }}>🛒</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.typeTitle, { color: textColor }]}>Ürün İşbirliği</Text>
            <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 13 }}>İndirimli bir ürünü İndiva'da duyurun</Text>
          </View>
          <Text style={{ color: Colors.gray300 }}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.typeCard, { backgroundColor: cardBg, borderColor: isDark ? Colors.gray700 : Colors.gray200 }]}
          onPress={() => setAdType('store')}>
          <View style={[styles.typeIcon, { backgroundColor: Colors.blue500 + '22' }]}>
            <Text style={{ fontSize: 24 }}>🏢</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.typeTitle, { color: textColor }]}>Marka / Mağaza İşbirliği</Text>
            <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 13 }}>Markanızı İndiva topluluğuyla tanıştırın</Text>
          </View>
          <Text style={{ color: Colors.gray300 }}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Step 2: Form
  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <View style={[styles.formCard, { backgroundColor: cardBg }]}>
        <LabelInput label="Firma / Marka Adı *" value={companyName} onChangeText={setCompanyName}
          bg={inputBg} border={inputBorder} color={textColor} />
        <LabelInput label="Yetkili Kişi *" value={contactPerson} onChangeText={setContactPerson}
          bg={inputBg} border={inputBorder} color={textColor} />
        <LabelInput label="E-posta *" value={email} onChangeText={setEmail}
          bg={inputBg} border={inputBorder} color={textColor} keyboardType="email-address" />
        <LabelInput label={adType === 'product' ? 'Ürün / Kampanya Linki *' : 'Web Siteniz *'}
          value={url} onChangeText={setUrl}
          bg={inputBg} border={inputBorder} color={textColor} keyboardType="url" />

        <Text style={[styles.labelText, { color: isDark ? Colors.gray300 : Colors.gray700 }]}>
          {adType === 'product' ? 'Ürün Kategorisi *' : 'Sektör *'}
        </Text>
        <TouchableOpacity style={[styles.input, styles.pickerBtn, { backgroundColor: inputBg, borderColor: inputBorder }]}
          onPress={() => setShowCatPicker(!showCatPicker)}>
          <Text style={{ color: category ? textColor : Colors.gray400, fontSize: 14 }}>{category || 'Kategori seçin'}</Text>
          <Text style={{ color: Colors.gray400 }}>▼</Text>
        </TouchableOpacity>
        {showCatPicker && (
          <View style={[styles.catList, { backgroundColor: inputBg, borderColor: inputBorder }]}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {CATEGORIES_WITH_OTHER.map(c => (
                <TouchableOpacity key={c} style={styles.catOption}
                  onPress={() => { setCategory(c); setShowCatPicker(false); }}>
                  <Text style={{ color: textColor, fontSize: 14 }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <LabelInput label="Özel İndirim Kodu (İsteğe bağlı)" value={discountCode} onChangeText={setDiscountCode}
          bg={inputBg} border={inputBorder} color={textColor} />

        <Text style={[styles.labelText, { color: isDark ? Colors.gray300 : Colors.gray700 }]}>Mesajınız (İsteğe bağlı)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
          placeholder={adType === 'product' ? 'Kampanya detayları...' : 'Markanız hakkında kısa bilgi...'}
          placeholderTextColor={Colors.gray400}
          value={message} onChangeText={setMessage}
          multiline numberOfLines={3}
        />

        <TouchableOpacity style={[styles.submitBtn, { opacity: isSubmitting ? 0.6 : 1 }]}
          onPress={handleSubmit} disabled={isSubmitting}>
          <Text style={{ color: Colors.white, fontWeight: '800', fontSize: 15 }}>
            {isSubmitting ? 'Gönderiliyor...' : 'İşbirliği Başvurusu Gönder'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function LabelInput({ label, value, onChangeText, bg, border, color, keyboardType }: any) {
  return (
    <View>
      <Text style={[styles.labelText, { color }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: bg, borderColor: border, color }]}
        value={value} onChangeText={onChangeText}
        placeholderTextColor={Colors.gray400}
        keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  successTitle: { fontSize: 22, fontWeight: '800' },
  successBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14, marginTop: 16 },
  infoBanner: { borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.blue500 },
  infoBannerTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2, borderRadius: 16, padding: 16,
  },
  typeIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeTitle: { fontSize: 15, fontWeight: '700' },
  formCard: { borderRadius: 16, padding: 16, gap: 12 },
  labelText: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catList: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  catOption: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: Colors.blue600, paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 4 },
});
