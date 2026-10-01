const $ = id => document.getElementById(id);
const KEY = 'milkman-moo';
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const F = ['vendor','rate','newRate','newFrom','paperRate','sunRate','advance','defL'];
const now = new Date();
const ym0 = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const curYm = ym0(now);
let ym = curYm, days = [], done = false;

const num = v => { const n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; };
const money = n => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN');
const ymp = () => ym.split('-').map(Number);
const daysIn = () => { const [y, m] = ymp(); return new Date(y, m, 0).getDate(); };
const dow = d => { const [y, m] = ymp(); return new Date(y, m - 1, d).getDay(); };
const fresh = () => Array.from({ length: daysIn() }, () => ({ l: '', late: false, paper: true }));
const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
function save() {
  try {
    const s = store();
    F.forEach(k => s[k] = $(k).value);
    s.paperOn = $('paperOn').checked;
    s.theme = document.documentElement.dataset.theme;
    s['d' + ym] = days;
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}

function build() {
  const [y, m] = ymp();
  $('monthLabel').textContent = MN[m - 1] + ' ' + y;
  $('cal').innerHTML = WD.map(w => `<b class="wd">${w}</b>`).join('') + days.map((d, i) => {
    const w = dow(i + 1);
    return `<div class="day${i ? '' : ' first'}${w === 0 ? ' sun' : ''}" id="d${i}" data-i="${i}" style="--c:${w + 1}">
      <div class="dh"><span class="dn">${i + 1}</span><span class="dw">${WD[w]}</span>${w === 0 ? '<span>☀️</span>' : ''}</div>
      <div class="st"><button data-a="-" aria-label="Less milk day ${i + 1}">−</button>
        <input type="number" min="0" step="0.5" data-f="l" value="${d.l}" placeholder="–" aria-label="Litres day ${i + 1}">
        <button data-a="+" aria-label="More milk day ${i + 1}">+</button></div>
      <div class="tg"><button class="t${d.late ? ' on' : ''}" data-a="late" title="Mark late">🐌</button>
        <button class="t tp${d.paper ? ' on' : ''}" data-a="paper" title="Newspaper delivered">📰</button></div></div>`;
  }).join('');
}

function calc() {
  const rate = num($('rate').value), nr = $('newRate').value, nf = parseInt($('newFrom').value) || 0;
  const on = $('paperOn').checked, pr = num($('paperRate').value);
  const sr = $('sunRate').value === '' ? pr : num($('sunRate').value);
  const adv = num($('advance').value);
  let L = 0, del = 0, miss = 0, late = 0, pend = 0, pn = 0, sn = 0, seg = {};
  document.body.classList.toggle('paperOn', on);
  days.forEach((d, i) => {
    const day = i + 1, entered = d.l !== '' && d.l != null, l = num(d.l);
    const r = (nr !== '' && nf && day >= nf) ? num(nr) : rate;
    if (!entered) pend++;
    else if (l === 0) miss++;
    else { del++; L += l; seg[r] = (seg[r] || 0) + l; }
    if (d.late) late++;
    if (on && d.paper && entered) { if (dow(day) === 0) sn++; else pn++; }
    const el = $('d' + i);
    el.classList.toggle('ok', entered && l > 0);
    el.classList.toggle('miss', entered && l === 0);
    el.classList.toggle('late', !!d.late);
    el.classList.toggle('today', ym === curYm && day === now.getDate());
  });
  const lines = Object.keys(seg).sort((a, b) => a - b).map(r => [`${seg[r]} L × ₹${r}`, money(seg[r] * r)]);
  const milk = Object.keys(seg).reduce((t, r) => t + seg[r] * r, 0);
  const paper = pn * pr + sn * sr;
  if (pn) lines.push([`Newspaper ${pn} days × ₹${pr}`, money(pn * pr)]);
  if (sn) lines.push([`Newspaper ${sn} Sundays × ₹${sr}`, money(sn * sr)]);
  const total = milk + paper, due = total - adv, ven = $('vendor').value.trim();
  $('lines').innerHTML = lines.map(x => `<dt>${x[0]}</dt><dd>${x[1]}</dd>`).join('') || '<dt>Nothing logged yet</dt><dd></dd>';
  $('billTitle').textContent = (ven || 'Vendor') + ' · ' + MN[ymp()[1] - 1].slice(0, 3) + ' ' + ymp()[0];
  const set = (id, v) => { const e = $(id); if (e.textContent !== String(v)) { e.textContent = v; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } };
  set('tLitres', L + ' L'); set('tDel', del); set('tMiss', miss); set('tLate', late); set('tPend', pend);
  set('tAvg', (del ? Math.round(L / del * 10) / 10 : 0) + ' L');
  set('tTotal', money(total)); set('tAdv', adv ? '- ' + money(adv) : '₹0'); set('tDue', money(due));
  $('milk').style.height = Math.min(100, L / (days.length * 2) * 100) + '%';
  const perfect = pend === 0 && miss === 0 && late === 0 && del > 0;
  if (perfect && !done) confetti();
  done = perfect;
  mood(L, miss, late, pend);
  return { ven, L, del, miss, late, total, adv, due, lines };
}

function mood(L, miss, late, pend) {
  const c = $('cow'), m = $('mood');
  if (L === 0 && miss === 0) { c.textContent = '🐮'; m.textContent = 'Log the litres and the bill sorts itself out.'; }
  else if (miss > 5) { c.textContent = '😟'; m.textContent = miss + ' missed days. Check before paying.'; }
  else if (late > 3) { c.textContent = '🐌'; m.textContent = late + ' late deliveries this month.'; }
  else if (pend === 0) { c.textContent = '🥳'; m.textContent = 'Whole month logged. Bill is ready to share.'; }
  else { c.textContent = '😄'; m.textContent = pend + ' days still to log.'; }
}

function confetti() {
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    s.className = 'cf'; s.textContent = ['🥛', '⭐', '🎉', '🐮'][i % 4];
    s.style.left = Math.random() * 100 + 'vw'; s.style.animationDelay = Math.random() * .6 + 's';
    document.body.appendChild(s); setTimeout(() => s.remove(), 3200);
  }
}
const toast = t => { $('toast').textContent = t; setTimeout(() => $('toast').textContent = '', 2500); };
const redraw = () => { build(); calc(); save(); };

$('cal').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const day = b.closest('.day'), d = days[day.dataset.i], a = b.dataset.a;
  if (a === '+' || a === '-') { d.l = Math.max(0, num(d.l) + (a === '+' ? .5 : -.5)); day.querySelector('input').value = d.l; }
  else { d[a] = !d[a]; b.classList.toggle('on', d[a]); }
  calc(); save();
});
$('cal').addEventListener('input', e => {
  if (e.target.dataset.f !== 'l') return;
  days[e.target.closest('.day').dataset.i].l = e.target.value; calc(); save();
});
[...F, 'paperOn'].forEach(id => $(id).addEventListener('input', () => { calc(); save(); }));

function go(k) {
  const [y, m] = ymp(); ym = ym0(new Date(y, m - 1 + k, 1));
  days = store()['d' + ym] || fresh(); done = false; build(); calc();
}
$('prev').onclick = () => go(-1);
$('next').onclick = () => go(1);
$('fill').onclick = () => {
  const lim = ym === curYm ? now.getDate() : days.length, v = $('defL').value === '' ? 1 : num($('defL').value);
  days.forEach((d, i) => { if (i < lim && d.l === '') d.l = v; }); redraw();
};
$('sundays').onclick = () => {
  const lim = ym === curYm ? now.getDate() : days.length;
  days.forEach((d, i) => { if (i < lim && dow(i + 1) === 0 && d.l === '') d.l = 0; }); redraw();
};
$('reset').onclick = () => { if (confirm('Clear all entries for this month?')) { days = fresh(); done = false; redraw(); } };
$('theme').onclick = () => {
  const t = document.documentElement; t.dataset.theme = t.dataset.theme === 'dark' ? 'light' : 'dark';
  $('theme').textContent = t.dataset.theme === 'dark' ? '☀️' : '🌙'; save();
};
$('print').onclick = () => window.print();
$('copy').onclick = () => {
  const b = calc(), [y, m] = ymp();
  const txt = `🥛 ${b.ven || 'Milk vendor'} - ${MN[m - 1]} ${y}\n` + b.lines.map(x => x[0] + ': ' + x[1]).join('\n') +
    `\nDelivered: ${b.del} days | Missed: ${b.miss} | Late: ${b.late}\nTotal: ${money(b.total)}` +
    (b.adv ? `\nAdvance paid: ${money(b.adv)}\nBalance due: ${money(b.due)}` : '');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied! Paste it in WhatsApp.'), () => toast('Copy failed. Copy the bill manually.'));
};
$('csv').onclick = () => {
  const on = $('paperOn').checked;
  const rows = ['Date,Litres,Late,Newspaper'].concat(days.map((d, i) =>
    `${ym}-${String(i + 1).padStart(2, '0')},${d.l === '' ? '' : num(d.l)},${d.late ? 'Yes' : ''},${on && d.paper ? 'Yes' : ''}`));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  a.download = `milk-${ym}.csv`; a.click();
};

const s = store();
F.forEach(k => { if (s[k] != null) $(k).value = s[k]; });
$('paperOn').checked = !!s.paperOn;
if (s.theme) { document.documentElement.dataset.theme = s.theme; $('theme').textContent = s.theme === 'dark' ? '☀️' : '🌙'; }
days = s['d' + ym] || fresh();
build(); calc();
