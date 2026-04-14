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
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

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

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8,
    onPanResponderMove: (_, gs) => {
      if (gs.dx > 0) translateX.setValue(gs.dx);
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > 80) {
        Animated.timing(translateX, {
          toValue: 400,
          duration: 220,
          useNativeDriver: true,
        }).start(onDelete);
      } else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  })).current;

  return (
    <View style={styles.swipeWrapper}>
      <View style={[styles.deleteHint, { backgroundColor: Colors.red500 }]}>
        <Text style={{ color: Colors.white, fontWeight: '700' }}>🗑 Sil</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={onPress}
          style={[
            styles.notifItem,
            { backgroundColor: isDark ? Colors.gray800 : Colors.white },
          ]}
          activeOpacity={0.85}
        >
          <View style={styles.unreadDot}>
            {!notification.read && (
              <View style={[styles.blueDot, { backgroundColor: Colors.blue500 }]} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text
                style={[
                  styles.notifTitle,
                  { color: notification.read ? (isDark ? Colors.gray400 : Colors.gray500) : (isDark ? Colors.white : Colors.gray900) },
                ]}
                numberOfLines={1}
              >
                {notification.title}
              </Text>
              <Text style={{ color: Colors.gray400, fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{notification.date}</Text>
            </View>
            <Text style={[styles.notifBody, { color: isDark ? Colors.gray300 : Colors.gray600 }]} numberOfLines={2}>
              {notification.body}
            </Text>
          </View>
          {notification.discountId && (
            <Text style={{ color: Colors.gray400, marginLeft: 8 }}>›</Text>
          )}
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
      navigation.navigate('Detail', { id: notif.discountId, discount: undefined, discountList: undefined });
    }
  };

  const bg = isDark ? Colors.gray900 : Colors.gray50;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {notifications.length > 0 && (
        <View style={[styles.topBar, { backgroundColor: isDark ? Colors.gray800 : Colors.white }]}>
          <View style={[styles.hintBox, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]}>
            <Text style={{ color: isDark ? Colors.gray300 : Colors.gray500, fontSize: 12 }}>
              ℹ️ Bildirimi silmek için sağa kaydırın
            </Text>
          </View>
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
            <Text style={{ color: Colors.red500, fontWeight: '700', fontSize: 13 }}>Tümünü Sil</Text>
          </TouchableOpacity>
        </View>
      )}

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔔</Text>
          <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 15 }}>
            Yeni bildiriminiz yok.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 80 }]}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: isDark ? Colors.gray700 : Colors.gray200, marginLeft: 56 }} />
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  hintBox: { flex: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContainer: { paddingTop: 0 },
  swipeWrapper: { position: 'relative', overflow: 'hidden' },
  deleteHint: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  unreadDot: { width: 20, alignItems: 'center' },
  blueDot: { width: 8, height: 8, borderRadius: 4 },
  notifTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  notifBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
});
