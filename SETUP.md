# İNDİVA — React Native Kurulum Rehberi

## Gerekli Önkoşullar
- Node.js 18+
- Java JDK 17
- Android Studio (SDK 36, NDK 27)
- Android Studio üzerinde emülatör ya da fiziksel cihaz

---

## 1. Firebase Android Uygulaması Kaydet (ZORUNLU)

1. [Firebase Console](https://console.firebase.google.com) → `indiva-expo` projesine gir
2. **Proje Ayarları** → **Uygulamalarınız** → **Android uygulaması ekle**
3. Paket adı: `com.indivanative`
4. `google-services.json` dosyasını indir
5. **`android/app/google-services.json`** dosyasını indirdiğinle değiştir

> **Mevcut `google-services.json` şablondur ve `REPLACE_WITH_YOUR_ANDROID_APP_ID` değeri gerçek ID ile değiştirilmelidir.**

---

## 2. Uygulamayı Çalıştır

```bash
# Bağımlılıkları kur
cd D:\indivayeni
npm install

# Metro başlat (ayrı terminal)
npx react-native start --reset-cache

# Android'de çalıştır (ayrı terminal)
npx react-native run-android
```

---

## 3. Release APK Oluştur

### Keystore Oluştur (ilk kez)
```bash
keytool -genkey -v -keystore android/app/indiva-release.keystore \
  -alias indiva -keyalg RSA -keysize 2048 -validity 10000
```

### `android/app/build.gradle` güncelle
```gradle
signingConfigs {
    release {
        storeFile file('indiva-release.keystore')
        storePassword 'şifreniz'
        keyAlias 'indiva'
        keyPassword 'şifreniz'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
    }
}
```

### APK üret
```bash
cd android
./gradlew assembleRelease
# Çıktı: android/app/build/outputs/apk/release/app-release.apk
```

---

## 4. Uygulama Kimliği Değiştirme (Opsiyonel)

Uygulamayı Play Store'a kendi ID'nizle yüklemek istiyorsanız:

**`android/app/build.gradle`:**
```gradle
applicationId "com.indiva.app"  // istediğiniz paket adı
```

**`android/app/google-services.json`** içindeki `package_name` da güncellenmelidir.

---

## 5. Eksik Olmayan Özellikler (Orijinal ile %100 Uyumlu)

✅ Ana ekran — indirim listesi, arama, kategori filtresi, pull-to-refresh  
✅ İlan detayı — oylama, favorileme, paylaşma, indirim kodu kopyalama  
✅ Favoriler — localStorage → AsyncStorage  
✅ Bildirimler — swipe-to-delete, okundu işareti  
✅ Aktüel — BİM, A101, ŞOK broşürleri, lightbox görüntüleme  
✅ Profil — rozet sistemi, tema seçici, yardım/gizlilik/şartlar  
✅ Kazan — affiliate form, işbirliği başvurusu  
✅ Karanlık/Açık/Sistem teması  
✅ FCM push bildirimleri  
✅ Offline cache (AsyncStorage)  
