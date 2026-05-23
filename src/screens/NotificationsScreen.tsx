import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Animated, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getNotifications, markAllAsRead, deleteNotification,
  deleteAllNotifications,
} from '../services/notificationService';
import type { Notification } from '../types';
import { Colors } from '../constants/colors';
import BackButton from '../components/BackButton';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// Maps notification type (or title keyword) to an emoji icon + accent color.
function getNotifMeta(title: string): { icon: string; accent: string } {
  const t = title.toLowerCase();
  if (t.includes('indirim') || t.includes('fırsat') || t.includes('%'))
    return { icon: '🏷️', accent: Colors.orange };
  if (t.includes('süpermarket') || t.includes('market') || t.includes('bim') || t.includes('a101') || t.includes('şok'))
    return { icon: '🛒', accent: '#16a34a' };
  if (t.includes('teknoloji') || t.includes('elektronik') || t.includes('telefon'))
    return { icon: '💻', accent: '#2563eb' };
  if (t.includes('moda') || t.includes('giyim') || t.includes('kıyafet'))
    return { icon: '👗', accent: '#db2777' };
  return { icon: '🔔', accent: Colors.orange };
}

function SwipeableNotification({
  notification,
  onDelete,
  onPress,
  isDark,
}: {
  notification: Notification;
  onDelete: () => void;
  onPress: () => void;
  isDark: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const { icon, accent } = getNotifMeta(notification.title);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 80) {
          Animated.timing(translateX, {
            toValue: 500,
            duration: 220,
            useNativeDriver: true,
          }).start(onDelete);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            friction: 8,
            tension: 80,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const cardBg = notification.read
    ? isDark ? Colors.gray800 : Colors.white
    : isDark ? '#1e2533' : '#fff8f2';

  const borderLeft = notification.read ? 'transparent' : accent;

  return (
    <View style={styles.swipeWrapper}>
      {/* Delete hint behind the card */}
      <View style={styles.deleteHint}>
        <Text style={styles.deleteHintText}>🗑</Text>
        <Text style={styles.deleteHintLabel}>Sil</Text>
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.82}
          style={[
            styles.notifCard,
            {
              backgroundColor: cardBg,
              borderLeftColor: borderLeft,
            },
          ]}
        >
          {/* Icon bubble */}
          <View style={[styles.iconBubble, { backgroundColor: accent + '1a' }]}>
            <Text style={styles.iconText}>{icon}</Text>
            {!notification.read && (
              <View style={[styles.unreadDot, { backgroundColor: accent }]} />
            )}
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <View style={styles.cardRow}>
              <Text
                style={[
                  styles.notifTitle,
                  {
                    color: notification.read
                      ? isDark ? Colors.gray400 : Colors.gray500
                      : isDark ? Colors.white : Colors.gray900,
                    fontWeight: notification.read ? '500' : '700',
                  },
                ]}
                numberOfLines={1}
              >
                {notification.title}
              </Text>
              <Text style={[styles.timeText, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
                {notification.date}
              </Text>
            </View>
            <Text
              style={[
                styles.notifBody,
                { color: isDark ? Colors.gray400 : Colors.gray500 },
              ]}
              numberOfLines={2}
            >
              {notification.body}
            </Text>
          </View>

          {/* Chevron if tappable */}
          {notification.discountId ? (
            <Text style={[styles.chevron, { color: isDark ? Colors.gray600 : Colors.gray300 }]}>›</Text>
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function NotificationsScreen() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    markAllAsRead().then(setNotifications);
  }, []);

  const handleDelete = async (id: string) => {
    const updated = await deleteNotification(id);
    setNotifications(updated);
  };

  const handleClearAll = async () => {
    const updated = await deleteAllNotifications();
    setNotifications(updated);
  };

  const handlePress = (notif: Notification) => {
    if (notif.discountId) {
      navigation.navigate('Detail', { id: notif.discountId });
    }
  };

  const bg     = isDark ? Colors.gray900 : Colors.gray50;
  const headBg = isDark ? Colors.gray800 : Colors.white;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>

      {/* ── Custom header ── */}
      <View style={[styles.header, { backgroundColor: headBg, paddingTop: insets.top }]}>
        <BackButton onPress={() => navigation.goBack()} />

        <Text style={[styles.headerTitle, { color: isDark ? Colors.white : Colors.gray900 }]}>
          Bildirimler
        </Text>

        {/* Right slot — "Tümünü Sil" only when there are items */}
        {notifications.length > 0 ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClearAll}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.clearText}>Temizle</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.clearBtn} />
        )}
      </View>

      {/* ── Swipe hint strip ── */}
      {notifications.length > 0 && (
        <View style={[styles.hintStrip, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
          <Text style={[styles.hintText, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
            ← Sağa kaydırarak bildirim silebilirsiniz
          </Text>
        </View>
      )}

      {/* ── Content ── */}
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Text style={{ fontSize: 36 }}>🔔</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: isDark ? Colors.white : Colors.gray800 }]}>
            Bildirim yok
          </Text>
          <Text style={[styles.emptySubtitle, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>
            Yeni indirimler geldiğinde burada görünecek.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home' } as any)}
            style={styles.exploreBtn}
          >
            <Text style={styles.exploreBtnText}>İndirimleri Keşfet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]} />
          )}
          renderItem={({ item }) => (
            <SwipeableNotification
              notification={item}
              onDelete={() => handleDelete(item.id)}
              onPress={() => handlePress(item)}
              isDark={isDark}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  clearBtn: {
    width: 72,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { color: Colors.red500, fontSize: 13, fontWeight: '600' },

  // ── Swipe hint ───────────────────────────────────────────────────
  hintStrip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  hintText: { fontSize: 11.5, textAlign: 'center' },

  // ── List ─────────────────────────────────────────────────────────
  listContainer: { paddingTop: 4 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76 },

  // ── Swipe-to-delete wrapper ───────────────────────────────────────
  swipeWrapper: { overflow: 'hidden' },
  deleteHint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 90,
    backgroundColor: Colors.red500,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteHintText: { fontSize: 18 },
  deleteHintLabel: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  // ── Notification card ─────────────────────────────────────────────
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderLeftWidth: 3,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  iconText: { fontSize: 20 },
  unreadDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  cardContent: { flex: 1, gap: 3 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notifTitle: { fontSize: 14, flex: 1 },
  timeText: { fontSize: 11, flexShrink: 0 },
  notifBody: { fontSize: 13, lineHeight: 18 },
  chevron: { fontSize: 22, fontWeight: '300', marginLeft: 2 },

  // ── Empty state ───────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    gap: 10,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.orange + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  exploreBtn: {
    backgroundColor: Colors.orange,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 8,
  },
  exploreBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});
