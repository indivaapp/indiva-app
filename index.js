/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { addNotification, loadNotificationsCache } from './src/services/notificationService';

// ─── Background / Killed-state Message Handler ───────────────────────────────
// React Native Firebase zorunluluğu: index.js'de AppRegistry'den ÖNCE
// kaydedilmeli. Bu handler uygulamanın arka planda veya kapalı olduğu
// durumlarda FCM mesajlarını işler ve bildirimi kayıt eder.
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  // Sessiz durum güncelleme mesajlarını filtrele (DISCOUNT_EXPIRED vb.)
  // notification alanı olmayan data-only mesajlar yalnızca UI sinyali içindir —
  // bildirim merkezi kaydı oluşturmamalı.
  if (!remoteMessage.notification?.title && !remoteMessage.notification?.body) {
    return;
  }
  // Cache boşsa AsyncStorage'dan yükle (arka plan başlangıcında null olur)
  await loadNotificationsCache();
  const title  = remoteMessage.notification?.title || 'Yeni Bildirim';
  const body   = remoteMessage.notification?.body  || 'Yeni bir bildirim var!';
  const discountId = remoteMessage.data?.discountId;
  const storyId    = remoteMessage.data?.storyId;
  await addNotification(title, body, discountId, storyId);
});

AppRegistry.registerComponent(appName, () => App);
