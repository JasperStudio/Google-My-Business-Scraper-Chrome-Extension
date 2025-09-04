const queriesEl = document.getElementById('queries');
const optEmails = document.getElementById('optEmails');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const exportBtn = document.getElementById('export');
const statusEl = document.getElementById('status');
const tbody = document.getElementById('tbody');

let running = false;
let results = [];

startBtn.addEventListener('click', async () => {
  const queries = queriesEl.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (!queries.length) { statusEl.textContent = 'Enter at least one query'; return; }
  results = [];
  renderResults();
  running = true;
  startBtn.disabled = true; stopBtn.disabled = false; exportBtn.disabled = true;
  statusEl.textContent = 'Starting…';
  const resp = await chrome.runtime.sendMessage({ type: 'GMB_START', payload: { queries, findEmails: optEmails.checked } });
  if (!resp?.ok) { statusEl.textContent = 'Failed to start: ' + (resp?.error || 'Unknown'); startBtn.disabled = false; stopBtn.disabled = true; return; }
});

stopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'GMB_STOP' });
});

exportBtn.addEventListener('click', () => {
  const header = 'name,website,phone,email,address,profiles,query\n';
  const lines = results.map(r => [r.name||'', r.website||'', r.phone||'', r.email||'', r.address||'', (r.profiles||[]).join(' | '), r.query||''].map(csv).join(',')).join('\n');
  const blob = new Blob([header + lines], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'gmb-results.csv', saveAs: true });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'GMB_PROGRESS') {
    statusEl.textContent = msg.text || '';
  } else if (msg?.type === 'GMB_RESULTS') {
    results = msg.items || [];
    renderResults();
    exportBtn.disabled = results.length === 0;
  } else if (msg?.type === 'GMB_DONE') {
    running = false;
    statusEl.textContent = 'Done.';
    startBtn.disabled = false; stopBtn.disabled = true; exportBtn.disabled = results.length === 0;
  }
});

function renderResults() {
  tbody.innerHTML = '';
  for (const r of results) {
    const row = document.createElement('div'); row.className = 'rowgrid';
    row.innerHTML = `
      <div>${esc(r.name||'')}</div>
      <div>${r.website ? `<a class="link" href="${r.website}" target="_blank">${esc(r.website)}</a>` : ''}</div>
      <div>${esc(r.phone||'')}</div>
      <div>${esc(r.email||'')}</div>
      <div>${esc(r.address||'')}</div>
      <div>${esc((r.profiles||[]).join(' | '))}</div>
      <div>${esc(r.query||'')}</div>
    `;
    tbody.appendChild(row);
  }
}

function csv(s){ const t = (s||'').toString(); return /[",\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }
function esc(s){ return (s||'').toString().replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
