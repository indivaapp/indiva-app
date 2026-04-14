import {
  getMessaging,
  requestPermission,
  getToken,
  onMessage,
  onTokenRefresh,
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

const messaging = getMessaging();
const db = getFirestore();

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
    // Callback fired after notification is persisted to cache
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
