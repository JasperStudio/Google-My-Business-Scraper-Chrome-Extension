// Scrape Google local (tbm=lcl) page for listings

function scrape() {
  const items = [];
  // Strategy: find cards that have a Website link, then extract name/phone/address nearby
  const websiteLinks = Array.from(document.querySelectorAll('a')).filter(a => /website/i.test(a.textContent||''));
  const seen = new Set();
  for (const a of websiteLinks) {
    const card = a.closest('div');
    if (!card) continue;
    let name = '';
    // Prefer a compact heading element
    const heading = card.querySelector('div[role="heading"], a[role="link"] div[role="heading"], a[role="link"][aria-level]');
    if (heading && (heading.textContent||'').trim()) {
      name = cleanName(heading.textContent||'');
    } else {
      // Fallback: walk up to find a heading-like text
      let ptr = card;
      for (let i=0;i<5 && ptr;i++) {
        ptr = ptr.parentElement;
        const h = ptr?.querySelector?.('div[role="heading"], a[role="link"], div');
        if (h && (h.textContent||'').trim()) { name = cleanName(h.textContent||''); break; }
      }
    }
    // Extract website
    let website = a.getAttribute('href') || '';
    try {
      const u = new URL(website, location.href);
      const q = u.searchParams.get('q') || u.searchParams.get('url');
      if (q) website = q;
      else website = u.href;
    } catch {}
    // Extract phone/address text nearby
    const textBlock = (card.textContent||'').replace(/\s+/g,' ').trim();
    const phoneMatch = textBlock.match(/(\+?\d[\d\s\-()]{7,})/);
    const address = findAddressText(card);
    const profiles = collectProfiles(card);
    const key = website || name + '|' + (phoneMatch ? phoneMatch[1] : '');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name, website, phone: phoneMatch ? phoneMatch[1] : '', address, profiles });
  }
  // Try also to parse cards without Website link (fallback)
  if (items.length === 0) {
    const cards = Array.from(document.querySelectorAll('div[role="article"], div[jscontroller]'));
    for (const c of cards) {
      const nameEl = c.querySelector('div[role="heading"], a[role="link"]');
      const name = cleanName((nameEl?.textContent||'')); if (!name) continue;
      const phone = ((c.textContent||'').match(/(\+?\d[\d\s\-()]{7,})/)||[])[1]||'';
      items.push({ name, website: '', phone, address: findAddressText(c), profiles: collectProfiles(c) });
    }
  }
  const next = findNextUrl();
  return { items, next };
}

function cleanName(raw) {
  let s = (raw||'').replace(/\s+/g,' ').trim();
  // Remove rating pattern and everything after, e.g., "5.0(171) · Plumber ..."
  s = s.replace(/\d(?:[.,]\d)?\s*\([\d,]+\).*/,'').trim();
  // Cut at first middle dot section (category / status)
  if (s.includes('·')) s = s.split('·')[0].trim();
  // Remove trailing open/close status words
  s = s.replace(/\b(Open|Closed|Opens|Closes).*$/i,'').trim();
  // Collapse quotes artifacts
  s = s.replace(/["“”]+.*$/,'').trim();
  return s;
}

function collectProfiles(root) {
  const out = new Set();
  const domains = ['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','tiktok.com','youtube.com','youtu.be'];
  const links = Array.from(root.querySelectorAll('a[href]'));
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href) continue;
    try {
      const u = new URL(href, location.href);
      const host = u.hostname.toLowerCase();
      if (domains.some(d => host.endsWith(d))) {
        // Unwrap Google redirect URLs
        const q = u.searchParams.get('q') || u.searchParams.get('url');
        out.add((q || u.href));
      }
    } catch {}
  }
  return Array.from(out);
}

function findNextUrl() {
  // Look for Next link
  const nextLink = Array.from(document.querySelectorAll('a')).find(a => /next/i.test(a.textContent||'') || a.id === 'pnnext' || a.getAttribute('aria-label') === 'Next');
  if (nextLink) {
    try { return new URL(nextLink.getAttribute('href'), location.href).href; } catch {}
  }
  // Sometimes pagination uses start= parameter; attempt to infer
  const u = new URL(location.href);
  const start = parseInt(u.searchParams.get('start')||'0',10);
  if (!isNaN(start)) {
    u.searchParams.set('start', String(start + 20));
    return u.href;
  }
  return null;
}

function findAddressText(root) {
  // Heuristic: address-like lines (contains street/road/ave/rd etc.)
  const txt = (root.textContent||'').split('\n').map(s => s.trim()).filter(Boolean);
  const m = txt.find(s => /(street|st\.|road|rd\.|avenue|ave\.|highway|hwy\.|drive|dr\.|lane|ln\.|auckland|new zealand)/i.test(s));
  return m || '';
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GMB_SCRAPE') {
    try { sendResponse(scrape()); } catch (e) { sendResponse({ items: [], next: null, error: String(e?.message || e) }); }
  }
  return true;
});
