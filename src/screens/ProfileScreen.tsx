import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme, Theme } from '../context/ThemeContext';
import {
  getContributionStats, setClaimedTierMin, BADGE_TIERS, ContributionStats, Badge,
} from '../services/contributionService';
import { loadVotesCache } from '../services/voteService';
import NativeAdCard from '../components/NativeAdCard';
import type { RootStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const INTERSTITIAL_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-3675503435035155/1880723761';
const rankInterstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, { requestNonPersonalizedAdsOnly: true });

const CONGRATS_MESSAGES: Record<string, string> = {
  'Aktif Üye': 'İndirim takibinde ciddi bir oyuncusun. Fırsatlar seni bekliyor!',
  'İndirim Takipçisi': 'Artık en iyi indirimleri ilk sen görüyorsun. Alışverişte bir adım öndesin!',
  'Fırsat Uzmanı': 'İndirim dünyasının gerçek bir uzmanısın. Cüzdanın teşekkür ediyor!',
  'İndirim Ustası': '👑 Zirveye ulaştın! İndirim avının en büyük ustasısın.',
};

const themeOptions: { label: string; value: Theme; icon: string }[] = [
  { label: 'Açık', value: 'light', icon: '☀️' },
  { label: 'Koyu', value: 'dark', icon: '🌙' },
  { label: 'Sistem', value: 'system', icon: '⚙️' },
];

const menuItems = [
  { name: 'Yardım & Destek', screen: 'ProfileHelp' as const, icon: '❓' },
  { name: 'Gizlilik Politikası', screen: 'ProfilePrivacy' as const, icon: '🛡️' },
  { name: 'Kullanım Şartları', screen: 'ProfileTerms' as const, icon: '📄' },
];

const SPARKLE_POSITIONS = [
  { x: -60, y: -60 }, { x: 0, y: -80 }, { x: 60, y: -60 },
  { x: -80, y: 0 }, { x: 80, y: 0 },
  { x: -60, y: 60 }, { x: 0, y: 80 }, { x: 60, y: 60 },
];

export default function ProfileScreen() {
  const { effectiveTheme, theme, setTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();

  const [stats, setStats] = useState<ContributionStats | null>(null);
  const [congratsBadge, setCongratsBadge] = useState<Badge | null>(null);

  const scrollRef = useRef<any>(null);
  useScrollToTop(scrollRef);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  const progressAnim = useRef(new Animated.Value(0)).current;
  const unlockPulse = useRef(new Animated.Value(1)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const bg = isDark ? Colors.gray900 : Colors.gray50;
  const cardBg = isDark ? Colors.gray800 : Colors.white;
  const textColor = isDark ? Colors.white : Colors.gray800;

  const welcomeCardBg  = isDark ? Colors.gray800 : '#eff6ff'; // soft blue
  const roadmapCardBg  = isDark ? Colors.gray800 : '#f5f3ff'; // soft lavender
  const themeCardBg    = isDark ? Colors.gray800 : '#f0fdfa'; // soft mint

  const refreshStats = (s: ContributionStats) => {
    setStats(s);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, { toValue: s.progress, duration: 1000, useNativeDriver: false }).start();
  };

  useEffect(() => {
    rankInterstitial.load();
  }, []);

  useFocusEffect(useCallback(() => {
    loadVotesCache()
      .then(() => getContributionStats().then(refreshStats).catch(() => {}))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  useEffect(() => {
    if (stats?.pendingRankUp) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(unlockPulse, { toValue: 1.18, duration: 650, useNativeDriver: true }),
          Animated.timing(unlockPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      unlockPulse.setValue(1);
    }
    return () => pulseLoop.current?.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.pendingRankUp?.label]);

  const claimRankUp = async (tier: Badge) => {
    await setClaimedTierMin(tier.min);
    badgeScale.setValue(0);
    sparkleAnim.setValue(0);
    setCongratsBadge(tier);
    Animated.parallel([
      Animated.spring(badgeScale, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }),
      Animated.timing(sparkleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();
    getContributionStats().then(refreshStats);
  };

  const handleUnlockPress = () => {
    if (!stats?.pendingRankUp) return;
    const tier = stats.pendingRankUp;
    const unsubClosed = rankInterstitial.addAdEventListener(AdEventType.CLOSED, () => {
      unsubClosed();
      rankInterstitial.load();
      claimRankUp(tier);
    });
    if (rankInterstitial.loaded) {
      rankInterstitial.show().catch(() => { unsubClosed(); claimRankUp(tier); });
    } else {
      unsubClosed();
      claimRankUp(tier);
    }
  };

  if (!stats) return <View style={[styles.container, { backgroundColor: bg }]} />;

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <>
      <ScrollView ref={scrollRef} style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 16 }}>

          {/* Welcome card */}
          <View style={[styles.card, { backgroundColor: welcomeCardBg }]}>
            <View style={styles.welcomeRow}>
              <View style={styles.avatarCircle}>
                <Text style={{ fontSize: 24 }}>🎯</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.welcomeTitle, { color: textColor }]}>İNDİVA'ya Hoş Geldin! 👋</Text>
                <Text style={{ color: isDark ? Colors.gray400 : Colors.gray500, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
                  Türkiye'nin en sıcak indirimlerini toplulukla birlikte takip ediyoruz.
                </Text>
              </View>
            </View>
          </View>

          {/* Contribution card */}
          <View style={styles.contribCard}>
            <View style={styles.contribHeader}>
              <View style={styles.badgeIconBox}>
                <Text style={{ fontSize: 28 }}>{stats.badge.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeLabel}>Rozet</Text>
                <Text style={styles.badgeName}>{stats.badge.label}</Text>
                {stats.pendingRankUp ? (
                  <TouchableOpacity onPress={handleUnlockPress} activeOpacity={0.8}>
                    <Animated.View style={[styles.unlockBtn, { transform: [{ scale: unlockPulse }] }]}>
                      <Text style={styles.unlockBtnText}>
                        🔓 {stats.pendingRankUp.icon} {stats.pendingRankUp.label} — Kilidi Aç!
                      </Text>
                    </Animated.View>
                  </TouchableOpacity>
                ) : stats.nextTier ? (
                  <Text style={styles.nextTierText}>Sonraki: {stats.nextTier.icon} {stats.nextTier.label}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.pointsValue}>{stats.points}</Text>
                <Text style={styles.pointsLabel}>puan</Text>
              </View>
            </View>

            {/* Progress bar */}
            {stats.nextTier && (
              <View style={styles.progressSection}>
                <View style={styles.progressLabels}>
                  <Text style={styles.progressLabelText}>{stats.badge.min} puan</Text>
                  <Text style={styles.progressLabelText}>{stats.nextTier.min} puan</Text>
                </View>
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
                </View>
                {stats.pendingRankUp && (
                  <Text style={styles.readyText}>🎉 Bir sonraki rütbeye geçmeye hazırsın!</Text>
                )}
              </View>
            )}
            {!stats.nextTier && (
              <Text style={styles.maxBadgeText}>🏆 Maksimum rozete ulaştın!</Text>
            )}

            {/* 3 stat boxes */}
            <View style={styles.statsRow}>
              {[
                { label: 'Oy', value: stats.voteCount, icon: '🗳️', pts: '×10' },
                { label: 'Favori', value: stats.favoriteCount, icon: '❤️', pts: '×5' },
                { label: 'İnceleme', value: stats.visitCount, icon: '👁️', pts: '×2' },
              ].map(s => (
                <View key={s.label} style={styles.statBox}>
                  <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={styles.statPts}>{s.pts} puan</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Badge road map */}
          <View style={[styles.card, { backgroundColor: roadmapCardBg }]}>
            <Text style={[styles.sectionLabel, { color: isDark ? Colors.gray500 : Colors.gray400 }]}>Rozet Yol Haritası</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {[...BADGE_TIERS].reverse().map(tier => {
                const earned = stats.points >= tier.min;
                const isCurrent = stats.badge.label === tier.label;
                const isPending = stats.pendingRankUp?.label === tier.label;
                return (
                  <TouchableOpacity
                    key={tier.label}
                    activeOpacity={isPending ? 0.8 : 1}
                    onPress={isPending ? handleUnlockPress : undefined}
                    style={[
                      styles.tierCard,
                      {
                        backgroundColor: isCurrent
                          ? (isDark ? Colors.orange + '22' : '#fff7ed')
                          : isPending
                          ? (isDark ? '#1a2e1a' : '#f0fdf4')
                          : (isDark ? Colors.gray700 + '80' : Colors.gray50),
                        borderColor: isCurrent ? Colors.orange : isPending ? Colors.green500 : Colors.gray200,
                        borderWidth: isCurrent || isPending ? 2 : 1,
                        opacity: earned || isCurrent || isPending ? 1 : 0.4,
                      },
                    ]}
                  >
                    {isPending ? (
                      <Animated.Text style={{ fontSize: 22, transform: [{ scale: unlockPulse }] }}>🔓</Animated.Text>
                    ) : (
                      <Text style={{ fontSize: 22 }}>{tier.icon}</Text>
                    )}
                    <Text style={[styles.tierLabel, {
                      color: isCurrent ? Colors.orange : isPending ? Colors.green500 : textColor,
                    }]}>{tier.label}</Text>
                    <Text style={{ color: Colors.gray400, fontSize: 10 }}>{tier.min}+ puan</Text>
                    {isCurrent && <Text style={{ color: Colors.orange, fontSize: 10, fontWeight: '800' }}>AKTİF</Text>}
                    {earned && !isCurrent && !isPending && <Text style={{ color: Colors.green500, fontSize: 12 }}>✓</Text>}
                    {isPending && <Text style={{ color: Colors.green500, fontSize: 9, fontWeight: '800' }}>KİLİDİ AÇ</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Theme picker */}
          <View style={[styles.card, { backgroundColor: themeCardBg }]}>
            <View style={styles.themeHeader}>
              <Text style={{ fontSize: 16 }}>🎨</Text>
              <Text style={[styles.themeHeaderText, { color: textColor }]}>Tema</Text>
            </View>
            <View style={[styles.themeToggle, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]}>
              {themeOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setTheme(opt.value)}
                  style={[
                    styles.themeBtn,
                    {
                      backgroundColor: theme === opt.value
                        ? (isDark ? Colors.gray600 : Colors.white)
                        : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{opt.icon}</Text>
                  <Text style={{
                    color: theme === opt.value ? Colors.orange : (isDark ? Colors.gray400 : Colors.gray500),
                    fontWeight: theme === opt.value ? '700' : '500',
                    fontSize: 13,
                  }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Menu */}
          <View style={[styles.card, { backgroundColor: cardBg, padding: 0, overflow: 'hidden' }]}>
            {menuItems.map((item, i) => (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.menuItem,
                  i < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? Colors.gray700 : Colors.gray100 },
                ]}
                onPress={() => navigation.navigate(item.screen)}
              >
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                <Text style={[styles.menuItemText, { color: isDark ? Colors.gray200 : Colors.gray700 }]}>{item.name}</Text>
                <Text style={{ color: Colors.gray400 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ textAlign: 'center', color: Colors.gray400, fontSize: 12, marginTop: 8 }}>İNDİVA v1.2.0</Text>

          <NativeAdCard style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      </ScrollView>

      {/* Congrats Modal */}
      <Modal visible={!!congratsBadge} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          {congratsBadge && (
            <View style={styles.modalCard}>
              {/* Sparkles */}
              <View style={styles.sparkleContainer} pointerEvents="none">
                {SPARKLE_POSITIONS.map((pos, i) => (
                  <Animated.Text
                    key={i}
                    style={[
                      styles.sparkle,
                      {
                        transform: [
                          {
                            translateX: sparkleAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, pos.x],
                            }),
                          },
                          {
                            translateY: sparkleAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, pos.y],
                            }),
                          },
                        ],
                        opacity: sparkleAnim.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0, 1, 0.6],
                        }),
                      },
                    ]}
                  >
                    {i % 2 === 0 ? '✨' : '🎉'}
                  </Animated.Text>
                ))}
              </View>

              <Animated.Text style={[styles.modalBadgeIcon, { transform: [{ scale: badgeScale }] }]}>
                {congratsBadge.icon}
              </Animated.Text>

              <Text style={styles.modalTitle}>Tebrikler! 🎊</Text>
              <Text style={styles.modalBadgeName}>{congratsBadge.label}</Text>
              <Text style={styles.modalBadgeRank}>rozetini kazandın!</Text>
              <Text style={styles.modalMessage}>
                {CONGRATS_MESSAGES[congratsBadge.label] ?? 'Harika ilerliyorsun! En iyi fırsatları kaçırma.'}
              </Text>

              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => setCongratsBadge(null)}
              >
                <Text style={styles.modalBtnText}>Harika! Devam Et →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.orange + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 16, fontWeight: '800' },
  contribCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: Colors.orange,
    gap: 16,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  contribHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badgeIconBox: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  badgeName: { color: Colors.white, fontSize: 18, fontWeight: '900' },
  nextTierText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  unlockBtn: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  unlockBtnText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  pointsValue: { color: Colors.white, fontSize: 28, fontWeight: '900' },
  pointsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  progressSection: { gap: 6 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabelText: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  progressTrack: { height: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.white, borderRadius: 5 },
  readyText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  maxBadgeText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 2,
  },
  statValue: { color: Colors.white, fontSize: 18, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
  statPts: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  tierCard: {
    width: 90, borderRadius: 14, paddingVertical: 10,
    alignItems: 'center', gap: 3,
  },
  tierLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  themeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  themeHeaderText: { fontWeight: '600', fontSize: 14 },
  themeToggle: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  themeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 10,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuItemText: { flex: 1, fontSize: 14, fontWeight: '500' },
  // Congrats modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 28, padding: 32,
    alignItems: 'center', gap: 8,
    width: '100%', maxWidth: 340,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 12,
  },
  sparkleContainer: {
    position: 'absolute', top: '40%', left: '50%',
    width: 0, height: 0,
  },
  sparkle: { position: 'absolute', fontSize: 20 },
  modalBadgeIcon: { fontSize: 72, marginBottom: 8 },
  modalTitle: { fontSize: 26, fontWeight: '900', color: Colors.gray900 },
  modalBadgeName: { fontSize: 20, fontWeight: '900', color: Colors.orange },
  modalBadgeRank: { fontSize: 14, color: Colors.gray500, marginTop: -4 },
  modalMessage: {
    fontSize: 14, color: Colors.gray600, textAlign: 'center',
    lineHeight: 20, marginTop: 8, marginBottom: 4,
  },
  modalBtn: {
    backgroundColor: Colors.orange, borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 8,
  },
  modalBtnText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
});
