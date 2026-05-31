import { Platform, PermissionsAndroid } from 'react-native';
import {
  getMessaging,
  requestPermission,
  getToken,
  onMessage,
  onTokenRefresh,
  onNotificationOpenedApp,
  getInitialNotification,
  subscribeToTopic,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import { addNotification } from './notificationService';
import { fetchStoriesCached } from './firebaseService';
import { navigationRef } from '../navigation/navigationRef';

const messaging = getMessaging();
const db = getFirestore();

interface PendingTarget { discountId?: string; storyId?: string }
let pendingTarget: PendingTarget | undefined;

function navigateToDiscount(discountId: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Detail', { id: discountId });
  }
}

async function navigateToStory(storyId: string) {
  try {
    const stories = await fetchStoriesCached();
    const idx = stories.findIndex(s => s.id === storyId);
    if (idx >= 0 && navigationRef.isReady()) {
      navigationRef.navigate('StoryDetail', { stories, initialIndex: idx });
    }
  } catch {}
}

async function navigateToTarget(discountId?: string, storyId?: string) {
  if (discountId) {
    navigateToDiscount(discountId);
  } else if (storyId) {
    await navigateToStory(storyId);
  }
}

// App.tsx'teki NavigationContainer onReady callback'inde çağrılır
export async function handlePendingNotification(): Promise<void> {
  const target = pendingTarget;
  pendingTarget = undefined;
  if (target) await navigateToTarget(target.discountId, target.storyId);
}

export async function setupPushNotifications(): Promise<void> {
  try {
    // Topic aboneliği bildirim izninden bağımsız yapılmalı.
    // İzin reddedilse bile topic'e abone olabiliriz; sistem bildirimleri
    // göstermez ama data mesajları yine de işlenir.
    await subscribeToTopic(messaging, 'all_users').catch(err =>
      console.warn('[FCM] all_users topic aboneliği başarısız:', err),
    );

    // Android 13+ (API 33+) için POST_NOTIFICATIONS iznini doğrudan iste.
    // requestPermission() iOS odaklıdır; Android'de PermissionsAndroid gerekir.
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: 'Bildirim İzni',
          message: 'İndiva\'dan indirim ve kampanya bildirimlerini almak ister misiniz?',
          buttonPositive: 'İzin Ver',
          buttonNegative: 'Hayır',
        },
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return;
    } else {
      // iOS ve Android < 13
      const authStatus = await requestPermission(messaging);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;
      if (!enabled) return;
    }

    const token = await getToken(messaging);
    if (token) {
      await setDoc(doc(collection(db, 'fcmTokens'), token), {
        token,
        updatedAt: serverTimestamp(),
      });
    }

    onTokenRefresh(messaging, async newToken => {
      await setDoc(doc(collection(db, 'fcmTokens'), newToken), {
        token: newToken,
        updatedAt: serverTimestamp(),
      });
    });

    // Uygulama arka plandayken bildirime tıklanınca
    onNotificationOpenedApp(messaging, remoteMessage => {
      const discountId = remoteMessage.data?.discountId as string | undefined;
      const storyId = remoteMessage.data?.storyId as string | undefined;
      navigateToTarget(discountId, storyId);
    });

    // Uygulama kapalıyken bildirime tıklanarak açılınca
    const initial = await getInitialNotification(messaging);
    if (initial?.data) {
      const discountId = initial.data.discountId as string | undefined;
      const storyId = initial.data.storyId as string | undefined;
      if (discountId || storyId) {
        pendingTarget = { discountId, storyId };
      }
    }
  } catch (err) {
    console.warn('Push notification setup failed:', err);
  }
}

export function onMessageListener(
  callback: (payload: any) => void
): () => void {
  const unsubscribe = onMessage(messaging, async remoteMessage => {
    // Sessiz durum güncelleme mesajlarını filtrele (DISCOUNT_EXPIRED vb.)
    // Bu mesajların notification alanı yoktur — sadece UI güncelleme sinyalidir,
    // bildirim merkezi kaydı oluşturmamalı.
    if (!remoteMessage.notification?.title && !remoteMessage.notification?.body) {
      callback(remoteMessage);
      return;
    }
    const title = remoteMessage.notification?.title || 'Yeni Bildirim';
    const body = remoteMessage.notification?.body || 'Yeni bir indirim fırsatı var!';
    const discountId = remoteMessage.data?.discountId as string | undefined;
    const storyId = remoteMessage.data?.storyId as string | undefined;
    // Görsel: top-level notification.image → RN'de notification.android.imageUrl;
    // Cloud Function yolunda data.image olarak da gelebilir.
    const image =
      (remoteMessage.notification as any)?.android?.imageUrl ||
      (remoteMessage.data?.image as string | undefined) ||
      undefined;
    await addNotification(title, body, discountId, storyId, image);
    callback(remoteMessage);
  });
  return unsubscribe;
}

// Background message handler index.js'e taşındı (React Native Firebase zorunluluğu).
// Bkz: index.js → setBackgroundMessageHandler
