(async function loadAds() {
  try {
    const ads = await fetch('/api/ads/active').then(r => r.json());
    if (!ads || !ads.length) return;

    const tickers = ads.filter(a => a.type === 'ticker');
    const banners = ads.filter(a => a.type === 'banner');
    const promos  = ads.filter(a => a.type === 'promo');

    // Ticker strip (scrolling text bar below nav)
    if (tickers.length) {
      const strip = document.createElement('div');
      strip.id = 'ad-ticker-strip';
      strip.style.cssText = 'background:linear-gradient(90deg,#0a1520,#0d1f30);border-bottom:1px solid rgba(0,230,118,.15);overflow:hidden;white-space:nowrap;padding:8px 0;font-size:.78rem;color:#00e676;letter-spacing:.5px;position:relative;z-index:99';
      const inner = document.createElement('div');
      inner.style.cssText = 'display:inline-block;animation:tickerScroll 30s linear infinite;padding-left:100%';
      inner.innerHTML = tickers.map(t => {
        const clickable = t.link_url ? `href="${t.link_url}" target="_blank"` : '';
        return `<${clickable?'a':'span'} ${clickable} style="color:#00e676;text-decoration:none;margin-right:80px">📢 ${t.title}${t.body ? ' — ' + t.body : ''}</${clickable?'a':'span'}>`;
      }).join('');
      strip.appendChild(inner);

      const style = document.createElement('style');
      style.textContent = '@keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}';
      document.head.appendChild(style);

      const nav = document.querySelector('nav');
      if (nav && nav.nextSibling) {
        nav.parentNode.insertBefore(strip, nav.nextSibling);
      } else if (nav) {
        nav.parentNode.appendChild(strip);
      }
    }

    // Banner ad (shown in a dedicated #ad-banner slot if present, or inserted after ticker)
    if (banners.length) {
      const b = banners[0];
      const bannerEl = document.createElement('div');
      bannerEl.style.cssText = 'margin:0;background:linear-gradient(135deg,rgba(0,230,118,.07),rgba(0,229,255,.05));border-bottom:1px solid rgba(0,230,118,.12);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:.88rem';
      bannerEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px">
          ${b.image_url ? `<img src="${b.image_url}" alt="" style="height:38px;border-radius:6px;object-fit:cover">` : '<span style="font-size:1.4rem">🏆</span>'}
          <div>
            <div style="font-weight:700;color:#f0f4ff;font-family:Rajdhani,sans-serif;font-size:1rem">${b.title}</div>
            <div style="color:#6b7a99;font-size:.8rem">${b.body}</div>
          </div>
        </div>
        ${b.link_url ? `<a href="${b.link_url}" target="_blank" style="background:#00e676;color:#000;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:700;font-size:.8rem;white-space:nowrap">Learn More →</a>` : ''}`;

      const slot = document.getElementById('ad-banner-slot') || document.getElementById('ad-ticker-strip');
      if (slot && slot.nextSibling) {
        slot.parentNode.insertBefore(bannerEl, slot.nextSibling);
      }
    }

    // Promo cards (injected into #promo-cards-slot if present)
    const promoSlot = document.getElementById('promo-cards-slot');
    if (promoSlot && promos.length) {
      promoSlot.innerHTML = promos.map(p => `
        <div style="background:#0f1623;border:1px solid rgba(0,230,118,.15);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:10px">
          ${p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%;border-radius:8px;object-fit:cover;max-height:160px">` : ''}
          <div style="font-weight:700;font-family:Rajdhani,sans-serif;font-size:1rem;color:#f0f4ff">${p.title}</div>
          <div style="color:#6b7a99;font-size:.85rem;line-height:1.6">${p.body}</div>
          ${p.link_url ? `<a href="${p.link_url}" target="_blank" style="background:#00e676;color:#000;padding:9px 18px;border-radius:6px;text-decoration:none;font-weight:700;font-size:.8rem;text-align:center">View Promo →</a>` : ''}
        </div>`).join('');
    }
  } catch (e) {
    // Ads loading is non-critical — fail silently
  }
})();
