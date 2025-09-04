// Orchestrates Google local scraping

let controller = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'GMB_START') {
      if (controller?.running) { sendResponse({ ok: false, error: 'Already running' }); return; }
      controller = new Runner(msg.payload.queries || [], !!msg.payload.findEmails);
      controller.run().then(() => {}).catch(()=>{});
      sendResponse({ ok: true });
    } else if (msg?.type === 'GMB_STOP') {
      controller?.stop();
      sendResponse({ ok: true });
    }
  })();
  return true;
});

class Runner {
  constructor(queries, findEmails) {
    this.queries = queries;
    this.findEmails = findEmails;
    this.running = false;
    this.results = new Map(); // key -> item
    this.windowId = null;
    this.tabId = null;
  }
  async run() {
    this.running = true;
    try {
      await this.ensureWindow();
      for (let qi=0; qi<this.queries.length && this.running; qi++) {
        const q = this.queries[qi];
        await this.updateProgress(`Query ${qi+1}/${this.queries.length}: ${q}`);
        await this.processQuery(q);
        await this.emitResults();
      }
    } finally {
      this.running = false;
      if (this.windowId) chrome.windows.remove(this.windowId).catch(()=>{});
      this.windowId = null; this.tabId = null;
      chrome.runtime.sendMessage({ type: 'GMB_DONE' }).catch(()=>{});
    }
  }
  stop() { this.running = false; }
  async ensureWindow() {
    const win = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'minimized' });
    this.windowId = win.id;
    this.tabId = win.tabs?.[0]?.id || (await chrome.tabs.create({ windowId: win.id, url: 'about:blank', active: false })).id;
  }
  async processQuery(query) {
    const base = `https://www.google.com/search?hl=en&q=${encodeURIComponent(query)}&tbm=lcl`;
    let url = base;
    let page = 0;
    const visitedPages = new Set();
    while (this.running && url && !visitedPages.has(url)) {
      visitedPages.add(url);
      await chrome.tabs.update(this.tabId, { url });
      await waitForLoad(this.tabId);
      await sleep(400);
      // Ask content script for page items
      let data = await chrome.tabs.sendMessage(this.tabId, { type: 'GMB_SCRAPE' }).catch(()=>null);
      // content script might not be injected (match didn't run yet)
      if (!data) {
        try { await chrome.scripting.executeScript({ target: { tabId: this.tabId }, files: ['content/scrape_lcl.js'] });
          data = await chrome.tabs.sendMessage(this.tabId, { type: 'GMB_SCRAPE' }).catch(()=>null);
        } catch {}
      }
      if (!data) break;
      const items = data.items || [];
      for (const it of items) {
        const key = normalizeKey(it);
        const existing = this.results.get(key);
        const merged = mergeItems(existing, { ...it, query });
        this.results.set(key, merged);
      }
      await this.emitResults();
      // Optional email detection
      if (this.findEmails) {
        await this.findSiteMetaForNew(items);
        await this.emitResults();
      }
      page++;
      url = data.next || null;
      if (page > 50) break; // safety
      await this.updateProgress(`Query: ${query} • Page ${page} • Collected: ${this.results.size}`);
    }
  }
  async findSiteMetaForNew(items) {
    const targets = items.filter(i => i.website && (!hasEmail(i) || !hasProfiles(i)) ).slice(0, 5);
    for (const it of targets) {
      const meta = await tryFetchSiteMeta(it.website);
      const key = normalizeKey(it);
      const existing = this.results.get(key) || {};
      const merged = mergeItems(existing, meta);
      this.results.set(key, merged);
    }
  }
  async emitResults() {
    const arr = Array.from(this.results.values());
    chrome.runtime.sendMessage({ type: 'GMB_RESULTS', items: arr }).catch(()=>{});
  }
  async updateProgress(text) { chrome.runtime.sendMessage({ type: 'GMB_PROGRESS', text }).catch(()=>{}); }
}

function hasEmail(obj){ return !!(obj && obj.email && /@/.test(obj.email)); }
function hasProfiles(obj){ return !!(obj && Array.isArray(obj.profiles) && obj.profiles.length); }
function normalizeKey(it){ return (it.website || (it.name||'').toLowerCase() + '|' + (it.phone||'')).toString(); }

function waitForLoad(tabId){
  return new Promise(resolve => {
    const handler = (id, info) => { if (id===tabId && info.status==='complete'){ chrome.tabs.onUpdated.removeListener(handler); resolve(); } };
    chrome.tabs.onUpdated.addListener(handler);
  });
}
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function tryFetchSiteMeta(siteUrl) {
  try {
    const u = new URL(siteUrl);
    // Request origin permission at runtime
    await chrome.permissions?.request?.({ origins: [u.origin + '/*'] }).catch(()=>{});
    const res = await fetch(siteUrl, { method:'GET' });
    if (!res.ok) return null;
    const html = await res.text();
    const email = (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])[0] || '';
    const profiles = extractProfilesFromHtml(html, siteUrl);
    return { email, profiles };
  } catch { return { email:'', profiles:[] }; }
}

function extractProfilesFromHtml(html, baseUrl) {
  const out = new Set();
  const domains = ['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','tiktok.com','youtube.com','youtu.be'];
  const re = /href\s*=\s*"([^"]+)"/gi;
  let m; while ((m = re.exec(html)) !== null) {
    const href = m[1];
    try { const u = new URL(href, baseUrl); const h = u.hostname.toLowerCase(); if (domains.some(d=>h.endsWith(d))) out.add(u.href); } catch {}
  }
  return Array.from(out);
}

function mergeItems(a={}, b={}){
  const merged = { ...a, ...b };
  // Union profiles arrays
  const pa = Array.isArray(a.profiles) ? a.profiles : [];
  const pb = Array.isArray(b.profiles) ? b.profiles : [];
  merged.profiles = Array.from(new Set([...(pa||[]), ...(pb||[])]));
  // Prefer non-empty email
  if (!merged.email && b.email) merged.email = b.email;
  return merged;
}
