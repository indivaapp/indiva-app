import { Vibration } from 'react-native';

/**
 * Shared lightweight haptic feedback — uses Vibration as a fallback since
 * react-native-haptic-feedback isn't installed. Short pulses feel like a
 * tap on Android; on iOS this routes through the taptic engine.
 *
 * Önceden sadece InfluencerStoryDetailScreen'de vardı (kopya kodla) — favori,
 * oy verme, kupon kopyalama gibi diğer ana etkileşimlerde hiç haptic yoktu.
 * Buraya taşındı ki tüm uygulamada tutarlı bir dokunsal his olsun.
 */
export function haptic(ms: number = 10) {
  try { Vibration.vibrate(ms); } catch {}
}
