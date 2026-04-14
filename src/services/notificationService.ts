import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Notification } from '../types';

const NOTIFICATIONS_KEY = 'userNotifications';
export const NOTIFICATIONS_CHANGED_EVENT = 'notificationsChanged';

// Lightweight event emitter — React Native'de 'events' modülü desteklenmez
type Listener = () => void;
const listeners = new Set<Listener>();

export const notificationEmitter = {
  on(event: string, cb: Listener) {
    if (event === NOTIFICATIONS_CHANGED_EVENT) listeners.add(cb);
  },
  off(event: string, cb: Listener) {
    if (event === NOTIFICATIONS_CHANGED_EVENT) listeners.delete(cb);
  },
  emit(event: string) {
    if (event === NOTIFICATIONS_CHANGED_EVENT) listeners.forEach(cb => cb());
  },
};

// ─── In-memory cache ─────────────────────────────────────────────────────────
let notificationsCache: Notification[] | null = null;

function formatRelativeDate(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffHour < 24) return `${diffHour} sa önce`;
  if (diffDay === 1) return 'Dün';
  if (diffDay < 7) return `${diffDay} gün önce`;
  return new Date(timestamp).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });
}

async function saveNotifications(notifications: Notification[]): Promise<void> {
  notificationsCache = notifications;
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  notificationEmitter.emit(NOTIFICATIONS_CHANGED_EVENT);
}

export async function loadNotificationsCache(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
    notificationsCache = stored ? JSON.parse(stored) : [];
  } catch {
    notificationsCache = [];
  }
}

export function getNotifications(): Notification[] {
  const notifications = notificationsCache ?? [];
  return notifications.map(n => ({
    ...n,
    date: n.timestamp ? formatRelativeDate(n.timestamp) : n.date,
  }));
}

export function getNotificationCount(): number {
  return getNotifications().filter(n => !n.read).length;
}

export async function markAllAsRead(): Promise<Notification[]> {
  const notifications = notificationsCache ?? [];
  const updated = notifications.map(n => ({ ...n, read: true }));
  await saveNotifications(updated);
  return updated.map(n => ({
    ...n,
    date: n.timestamp ? formatRelativeDate(n.timestamp) : n.date,
  }));
}

export async function deleteNotification(id: string): Promise<Notification[]> {
  const notifications = notificationsCache ?? [];
  const updated = notifications.filter(n => n.id !== id);
  await saveNotifications(updated);
  return updated.map(n => ({
    ...n,
    date: n.timestamp ? formatRelativeDate(n.timestamp) : n.date,
  }));
}

export async function deleteAllNotifications(): Promise<Notification[]> {
  await saveNotifications([]);
  return [];
}

export async function addNotification(
  title: string,
  body: string,
  discountId?: string
): Promise<Notification> {
  const notifications = notificationsCache ?? [];
  const timestamp = Date.now();
  const newNotification: Notification = {
    id: timestamp.toString(),
    title,
    body,
    date: 'Az önce',
    read: false,
    discountId,
    timestamp,
  };
  const updated = [newNotification, ...notifications].slice(0, 50);
  await saveNotifications(updated);
  return newNotification;
}
