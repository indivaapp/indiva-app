import {
  getMessaging,
  requestPermission,
  getToken,
  onMessage,
  onTokenRefresh,
  onNotificationOpenedApp,
  getInitialNotification,
  setBackgroundMessageHandler,
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
import { navigationRef } from '../navigation/navigationRef';

const messaging = getMessaging();
const db = getFirestore();

// Uygulama kapalıyken bildirime tıklanırsa navigation hazır olana kadar sakla
let pendingDiscountId: string | undefined;

function navigateToDiscount(discountId: string | undefined) {
  if (!discountId) return;
  if (navigationRef.isReady()) {
    navigationRef.navigate('Detail', { id: discountId });
  }
}

// App.tsx'teki NavigationContainer onReady callback'inde çağrılır
export function handlePendingNotification() {
  const id = pendingDiscountId;
  pendingDiscountId = undefined;
  navigateToDiscount(id);
}

export async function setupPushNotifications(): Promise<void> {
  try {
    const authStatus = await requestPermission(messaging);
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;

    if (!enabled) return;

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
      navigateToDiscount(discountId);
    });

    // Uygulama kapalıyken bildirime tıklanarak açılınca
    const initial = await getInitialNotification(messaging);
    if (initial?.data?.discountId) {
      pendingDiscountId = initial.data.discountId as string;
    }
  } catch (err) {
    console.warn('Push notification setup failed:', err);
  }
}

export function onMessageListener(
  callback: (payload: any) => void
): () => void {
  const unsubscribe = onMessage(messaging, async remoteMessage => {
    const title = remoteMessage.notification?.title || 'Yeni Bildirim';
    const body = remoteMessage.notification?.body || 'Yeni bir indirim fırsatı var!';
    const discountId = remoteMessage.data?.discountId as string | undefined;
    await addNotification(title, body, discountId);
    callback(remoteMessage);
  });
  return unsubscribe;
}

// Background message handler — must be called outside of any component
setBackgroundMessageHandler(messaging, async remoteMessage => {
  const title = remoteMessage.notification?.title || 'Yeni Bildirim';
  const body = remoteMessage.notification?.body || 'Yeni bir indirim fırsatı var!';
  const discountId = remoteMessage.data?.discountId as string | undefined;
  await addNotification(title, body, discountId);
});
