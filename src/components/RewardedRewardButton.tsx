import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import {
  RewardedAd, RewardedAdEventType, AdEventType, TestIds,
} from 'react-native-google-mobile-ads';
import { Colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { useAdsReady, useNonPersonalized } from '../../App';
import {
  grantRewardedReward, getTodayPointsClaims, DAILY_POINTS_LIMIT, REWARD_POINTS,
} from '../services/rewardService';

// ─── Ödüllü reklam birimi ───────────────────────────────────────────────────────
// Geliştirmede Google test reklamı, canlıda AdMob'daki gerçek Rewarded birimi.
const REWARDED_AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : 'ca-app-pub-3675503435035155/8795579926';

interface Props {
  /** Ödül verilince çağrılır (pointsAwarded=0 ise günlük limit dolmuş demektir) */
  onReward: (pointsAwarded: number) => void;
}

// Rütbe Yolu başlık satırının sağına oturan kompakt "reklam izle → +200 puan" pili.
export default function RewardedRewardButton({ onReward }: Props) {
  const adsReady        = useAdsReady();
  const nonPersonalized = useNonPersonalized();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [loaded, setLoaded]       = useState(false);
  const [showing, setShowing]     = useState(false);
  const [claimsLeft, setClaimsLeft] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const adRef       = useRef<RewardedAd | null>(null);
  const earnedRef   = useRef(false);
  const onRewardRef = useRef(onReward);
  useEffect(() => { onRewardRef.current = onReward; }, [onReward]);

  // Bugünkü kalan puan hakkı
  const refreshClaims = useCallback(() => {
    getTodayPointsClaims().then(c => setClaimsLeft(Math.max(0, DAILY_POINTS_LIMIT - c)));
  }, []);
  useEffect(() => { refreshClaims(); }, [refreshClaims]);

  // ── Ödüllü reklamı yükle (ödül/kapanış sonrası reloadKey ile yeniden) ────────
  useEffect(() => {
    if (!adsReady) return;

    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: nonPersonalized,
    });
    adRef.current = ad;
    earnedRef.current = false;
    setLoaded(false);

    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => setLoaded(true));
    const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earnedRef.current = true;
    });
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setShowing(false);
      if (earnedRef.current) {
        grantRewardedReward().then(({ pointsAwarded }) => {
          refreshClaims();
          onRewardRef.current(pointsAwarded);
        });
      }
      setReloadKey(k => k + 1);
    });
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      setShowing(false);
      setLoaded(false);
    });

    ad.load();

    return () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      adRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsReady, nonPersonalized, reloadKey]);

  const handlePress = () => {
    const ad = adRef.current;
    if (!ad || !loaded || showing) return;
    setShowing(true);
    ad.show().catch(() => setShowing(false));
  };

  // Günlük limit doldu → bilgilendirici sessiz rozet
  if (claimsLeft === 0) {
    return (
      <View style={[styles.doneChip, { backgroundColor: isDark ? Colors.gray700 : Colors.gray100 }]}>
        <Text style={[styles.doneText, { color: isDark ? Colors.gray400 : Colors.gray500 }]}>
          Yarın tekrar
        </Text>
      </View>
    );
  }

  const disabled = !loaded || showing;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      disabled={disabled}
      style={[styles.pill, disabled && styles.pillDisabled]}
    >
      {disabled ? (
        <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
      ) : (
        <View style={styles.playWrap}>
          <Text style={styles.playGlyph}>▶</Text>
        </View>
      )}
      <Text style={styles.pillText}>+{REWARD_POINTS} puan</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4f46e5',
    borderRadius: 20,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 5,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  pillDisabled: {
    opacity: 0.55,
  },
  playWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    color: '#fff',
    fontSize: 9,
    marginLeft: 1, // optik merkezleme
  },
  spinner: {
    width: 18,
    height: 18,
  },
  pillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  doneChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  doneText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
