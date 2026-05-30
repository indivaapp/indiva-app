// ─── App Open reklamı bastırma ───────────────────────────────────────────────
// Kullanıcı bir reklam/link ile uygulamadan ayrılıp döndüğünde, dönüşte App Open
// reklamının çıkıp "reklam üstüne reklam" hissi yaratmasını önler.
// Dış bir bağlantı açılmadan hemen önce suppressAppOpen() çağrılır; App Open
// gösterim mantığı isAppOpenSuppressed() ile bu pencerede gösterimi atlar.

let suppressUntil = 0;

/** Belirtilen süre boyunca App Open reklamını bastır (varsayılan 30 sn). */
export function suppressAppOpen(ms = 30000): void {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

export function isAppOpenSuppressed(): boolean {
  return Date.now() < suppressUntil;
}
