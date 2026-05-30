import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// ---------------------------------------------------------------------------
// Config — set with:
//   firebase functions:config:set telegram.bot_token="TOKEN" telegram.channel_id="@kanal_adi"
// ---------------------------------------------------------------------------
const cfg = () => functions.config().telegram as { bot_token: string; channel_id: string };

const TELEGRAM_API = () => `https://api.telegram.org/bot${cfg().bot_token}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function discountPct(oldPrice: number, newPrice: number): number {
  if (!oldPrice || !newPrice || oldPrice <= 0 || newPrice <= 0) return 0;
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

function buildMessage(data: FirebaseFirestore.DocumentData): string {
  const pct = discountPct(data.oldPrice, data.newPrice);
  const title = escapeHtml(data.title ?? '');
  const brand = escapeHtml(data.brand ?? '');
  const category = escapeHtml(data.category ?? '');

  let msg = '';

  // Header — boyuta göre emoji ve başlık
  if (pct >= 50) {
    msg += `🔥🔥 <b>%${pct} DEV İNDİRİM!</b>\n\n`;
  } else if (pct >= 30) {
    msg += `🔥 <b>%${pct} İNDİRİM</b>\n\n`;
  } else if (pct > 0) {
    msg += `💸 <b>%${pct} İndirim</b>\n\n`;
  } else {
    msg += `🛒 <b>Yeni Fırsat</b>\n\n`;
  }

  // Ürün adı
  msg += `<b>${title}</b>\n`;

  // Marka + kategori
  const meta: string[] = [];
  if (brand) meta.push(`🏪 ${brand}`);
  if (category) meta.push(category);
  if (meta.length) msg += meta.join(' · ') + '\n';

  msg += '\n';

  // Fiyat
  if (data.newPrice > 0) {
    msg += `💰 <b>${data.newPrice} TL</b>`;
    if (data.oldPrice > 0 && data.oldPrice > data.newPrice) {
      msg += `  <s>${data.oldPrice} TL</s>`;
      const savings = Math.round(data.oldPrice - data.newPrice);
      msg += `\n💵 ${savings} TL tasarruf!`;
    }
    msg += '\n\n';
  }

  // İndirim kodu
  if (data.discountCode) {
    msg += `🎁 Kod: <code>${escapeHtml(data.discountCode)}</code>\n\n`;
  }

  // CTA butonu
  if (data.link) {
    msg += `<a href="${data.link}">🛒 Fırsata Git →</a>\n\n`;
  }

  msg += `📲 <i>Daha fazla fırsat için <b>İNDİVA</b> uygulamasını indir!</i>`;

  return msg;
}

async function sendPhoto(text: string, imageUrl: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API()}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg().channel_id,
      photo: imageUrl,
      caption: text,
      parse_mode: 'HTML',
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function sendMessage(text: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg().channel_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ---------------------------------------------------------------------------
// Cloud Function — yeni indirim eklendikçe Telegram kanalına gönder
// ---------------------------------------------------------------------------
export const onNewDiscount = functions
  .region('europe-west1')
  .firestore.document('discounts/{discountId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    if (!data) return;

    // Reklamları ve bitmiş indirimleri atla
    if (data.isAd === true) return;
    if (data.status === 'İndirim Bitti') return;

    const text = buildMessage(data);

    // Görsel varsa fotoğraflı mesaj, yoksa sade metin
    if (data.imageUrl) {
      try {
        await sendPhoto(text, data.imageUrl);
        return;
      } catch {
        // Görsel erişilemezse metin olarak dene
      }
    }

    await sendMessage(text);
  });
