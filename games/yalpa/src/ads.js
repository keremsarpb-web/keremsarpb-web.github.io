// Reklam sistemi
// - Menüde küçük bir banner
// - Bölüm sonunda / menüye dönüşte geçilebilir tam ekran reklam (en sık 3 dakikada bir)
//
// Gerçek reklam geliri için AD_CONFIG'e kendi Google AdSense bilgilerini yaz.
// AdSense yalnızca oyunun web sürümünde (kendi alan adında) çalışır. Masaüstü (Electron)
// sürümünde reklam ağları reklam sunmadığı için oyunun kendi tanıtım reklamları gösterilir.
export const AD_CONFIG = {
  adsenseClient: '', // ör. 'ca-pub-1234567890123456'
  bannerSlot: '', // AdSense reklam birimi kimliği (banner)
  interstitialSlot: '', // AdSense reklam birimi kimliği (tam ekran)
  interstitialEverySec: 180,
  skipAfterSec: 5,
};

const HOUSE_ADS = [
  { icon: '🎉', title: 'Arkadaşlarını çağır!', text: 'Oda kur, 5 haneli kodu paylaş, birlikte yalpalayın.' },
  { icon: '👑', title: '20 kozmetik seni bekliyor', text: 'Taç, kanat, pelerin... Menüdeki dolaptan karakterini süsle.' },
  { icon: '🧗', title: 'İpucu: tırmanma', text: 'Kenara iki elle tutun, aşağı bak ve zıpla.' },
  { icon: '🪵', title: 'İpucu: tahta', text: 'Son boşlukta tahtayı tutup kenardan aşağı it, köprü olsun.' },
  { icon: '⭐', title: 'Yalpa\'yı beğendin mi?', text: 'Arkadaşlarına anlat, ne kadar çok kişi o kadar kaos!' },
];

const isWeb = location.protocol === 'https:' || location.protocol === 'http:';
const useAdsense = !!AD_CONFIG.adsenseClient && isWeb && !/^localhost$|^127\./.test(location.hostname);
let adsenseLoaded = false;

function loadAdsense() {
  if (adsenseLoaded || !useAdsense) return;
  adsenseLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(AD_CONFIG.adsenseClient);
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

function adsenseUnit(slot) {
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = AD_CONFIG.adsenseClient;
  ins.dataset.adSlot = slot;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  setTimeout(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {} }, 50);
  return ins;
}

function houseAd(big) {
  const ad = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)];
  const el = document.createElement('div');
  el.className = big ? 'house big' : 'house';
  const ic = document.createElement('div');
  ic.className = 'icon';
  ic.textContent = ad.icon;
  const tx = document.createElement('div');
  const t = document.createElement('b');
  t.textContent = ad.title;
  const p = document.createElement('span');
  p.textContent = ad.text;
  tx.append(t, p);
  el.append(ic, tx);
  return el;
}

let bannerTimer = null;
export function showBanner(container) {
  loadAdsense();
  const fill = () => {
    container.querySelector('.ad-body')?.remove();
    const body = document.createElement('div');
    body.className = 'ad-body';
    body.appendChild(useAdsense && AD_CONFIG.bannerSlot ? adsenseUnit(AD_CONFIG.bannerSlot) : houseAd(false));
    container.appendChild(body);
  };
  fill();
  clearInterval(bannerTimer);
  if (!useAdsense) bannerTimer = setInterval(fill, 12000);
}

let lastInterstitial = performance.now();
// Süresi dolduysa tam ekran reklam gösterir; kapanınca done() çağrılır
export function maybeInterstitial(overlay, done = () => {}) {
  const now = performance.now();
  if (now - lastInterstitial < AD_CONFIG.interstitialEverySec * 1000) { done(); return; }
  lastInterstitial = now;
  loadAdsense();
  const box = overlay.querySelector('.ad-content');
  box.innerHTML = '';
  box.appendChild(useAdsense && AD_CONFIG.interstitialSlot ? adsenseUnit(AD_CONFIG.interstitialSlot) : houseAd(true));
  const btn = overlay.querySelector('.ad-skip');
  let left = AD_CONFIG.skipAfterSec;
  btn.disabled = true;
  btn.textContent = `Geç (${left})`;
  overlay.classList.remove('hidden');
  document.exitPointerLock?.();
  const iv = setInterval(() => {
    left--;
    if (left > 0) { btn.textContent = `Geç (${left})`; return; }
    clearInterval(iv);
    btn.disabled = false;
    btn.textContent = 'Reklamı geç ✕';
  }, 1000);
  btn.onclick = () => {
    if (btn.disabled) return;
    overlay.classList.add('hidden');
    done();
  };
}
