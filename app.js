(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KEY = 'milkman-moo';
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const now = new Date();
  const currentYM = toYM(now);

  let root = readStore();
  let ym = currentYM;
  let month = getMonthData(ym);
  let selectedDay = ym === currentYM ? now.getDate() : 1;
  let saveTimer = null;
  let toastTimer = null;
  let undoEntries = null;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function toYM(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function splitYM(value = ym) {
    return value.split('-').map(Number);
  }

  function daysInMonth(value = ym) {
    const [year, monthNumber] = splitYM(value);
    return new Date(year, monthNumber, 0).getDate();
  }

  function dayOfWeek(day, value = ym) {
    const [year, monthNumber] = splitYM(value);
    return new Date(year, monthNumber - 1, day).getDay();
  }

  function dateISO(day, value = ym) {
    return value + '-' + String(day).padStart(2, '0');
  }

  function numberOr(value, fallback = 0) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function money(value) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readStore() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (error) {
      console.error('Unable to read saved data:', error);
      return {};
    }
  }

  function defaultsFromRoot() {
    const defaults = root.defaults || {};
    return {
      vendor: defaults.vendor ?? root.vendor ?? '',
      rate: numberOr(defaults.rate ?? root.rate, 56),
      paperOn: defaults.paperOn ?? !!root.paperOn,
      paperRate: numberOr(defaults.paperRate ?? root.paperRate, 5),
      sunRate: defaults.sunRate ?? (root.sunRate === '' || root.sunRate == null ? null : numberOr(root.sunRate, 5)),
      defaultL: numberOr(defaults.defaultL ?? root.defL, 1) || 1
    };
  }

  function blankEntry() {
    return {
      litres: null,
      late: false,
      paper: false,
      note: ''
    };
  }

  function createMonth(value) {
    const defaults = defaultsFromRoot();
    const totalDays = daysInMonth(value);
    const oldEntries = Array.isArray(root['d' + value]) ? root['d' + value] : null;

    const entries = Array.from({ length: totalDays }, (_, index) => {
      const old = oldEntries?.[index];
      if (!old) return blankEntry();
      return {
        litres: old.l === '' || old.l == null ? null : numberOr(old.l, 0),
        late: !!old.late && numberOr(old.l, 0) > 0,
        paper: !!old.paper,
        note: ''
      };
    });

    const rates = [{ id: uid(), from: 1, rate: defaults.rate }];
    const oldNewRate = root.newRate;
    const oldNewFrom = Number.parseInt(root.newFrom, 10);
    if (oldNewRate !== '' && oldNewRate != null && Number.isInteger(oldNewFrom) && oldNewFrom >= 2 && oldNewFrom <= totalDays) {
      rates.push({ id: uid(), from: oldNewFrom, rate: numberOr(oldNewRate, defaults.rate) });
    }

    const payments = [];
    if (value === currentYM && numberOr(root.advance, 0) > 0) {
      payments.push({
        id: uid(),
        date: dateISO(1, value),
        amount: numberOr(root.advance, 0),
        note: 'Imported advance payment'
      });
    }

    return {
      vendor: defaults.vendor,
      paperOn: defaults.paperOn,
      paperRate: defaults.paperRate,
      sunRate: defaults.sunRate,
      defaultL: defaults.defaultL,
      rates,
      payments,
      entries
    };
  }

  function normalizeMonth(data, value) {
    const defaults = defaultsFromRoot();
    const totalDays = daysInMonth(value);
    const safe = data && typeof data === 'object' ? data : createMonth(value);

    safe.vendor = typeof safe.vendor === 'string' ? safe.vendor : defaults.vendor;
    safe.paperOn = !!safe.paperOn;
    safe.paperRate = numberOr(safe.paperRate, defaults.paperRate);
    safe.sunRate = safe.sunRate === '' || safe.sunRate == null ? null : numberOr(safe.sunRate, safe.paperRate);
    safe.defaultL = numberOr(safe.defaultL, defaults.defaultL) || 1;

    if (!Array.isArray(safe.rates) || !safe.rates.length) {
      safe.rates = [{ id: uid(), from: 1, rate: defaults.rate }];
    }

    safe.rates = safe.rates
      .map((r) => ({
        id: r.id || uid(),
        from: Math.max(1, Math.min(totalDays, Number.parseInt(r.from, 10) || 1)),
        rate: numberOr(r.rate, defaults.rate)
      }))
      .sort((a, b) => a.from - b.from);

    if (!safe.rates.some((r) => r.from === 1)) {
      safe.rates.unshift({ id: uid(), from: 1, rate: defaults.rate });
    }

    // Keep only the latest entry for the same start day.
    const rateMap = new Map();
    safe.rates.forEach((r) => rateMap.set(r.from, r));
    safe.rates = [...rateMap.values()].sort((a, b) => a.from - b.from);

    safe.payments = Array.isArray(safe.payments)
      ? safe.payments
          .map((p) => ({
            id: p.id || uid(),
            date: typeof p.date === 'string' && p.date ? p.date : dateISO(1, value),
            amount: numberOr(p.amount, 0),
            note: typeof p.note === 'string' ? p.note : ''
          }))
          .filter((p) => p.amount > 0)
      : [];

    const old = Array.isArray(safe.entries) ? safe.entries : [];
    safe.entries = Array.from({ length: totalDays }, (_, i) => {
      const entry = old[i] || blankEntry();
      const litres = entry.litres === '' || entry.litres == null ? null : numberOr(entry.litres, 0);
      return {
        litres,
        late: !!entry.late && litres != null && litres > 0,
        paper: !!entry.paper,
        note: typeof entry.note === 'string' ? entry.note.slice(0, 180) : ''
      };
    });

    return safe;
  }

  function getMonthData(value) {
    root.months = root.months && typeof root.months === 'object' ? root.months : {};
    if (!root.months[value]) root.months[value] = createMonth(value);
    root.months[value] = normalizeMonth(root.months[value], value);
    return root.months[value];
  }

  function rateForDay(day) {
    const rates = [...month.rates].sort((a, b) => a.from - b.from);
    let rate = rates[0]?.rate || 0;
    for (const item of rates) {
      if (day >= item.from) rate = item.rate;
      else break;
    }
    return numberOr(rate, 0);
  }

  function newspaperRateForDay(day) {
    if (!month.paperOn) return 0;
    const isSunday = dayOfWeek(day) === 0;
    if (isSunday && month.sunRate != null) return numberOr(month.sunRate, month.paperRate);
    return numberOr(month.paperRate, 0);
  }

  function queueSave() {
    $('saveStatus').textContent = 'Saving…';
    $('saveStatus').style.color = 'var(--muted)';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveNow();
      $('saveStatus').textContent = '✓ Saved';
      $('saveStatus').style.color = 'var(--green)';
    }, 180);
  }

  function saveNow() {
    try {
      root.version = 2;
      root.theme = document.documentElement.dataset.theme || 'light';
      root.vendor = month.vendor;
      root.months = root.months || {};
      root.months[ym] = month;

      const existingDefaults = defaultsFromRoot();
      root.defaults = {
        vendor: month.vendor,
        rate: ym >= currentYM ? rateForDay(daysInMonth()) : existingDefaults.rate,
        paperOn: month.paperOn,
        paperRate: month.paperRate,
        sunRate: month.sunRate,
        defaultL: month.defaultL
      };

      localStorage.setItem(KEY, JSON.stringify(root));
    } catch (error) {
      console.error('Unable to save data:', error);
      $('saveStatus').textContent = 'Save failed';
      $('saveStatus').style.color = 'var(--danger)';
      showToast('Unable to save. Check browser storage permissions.');
    }
  }

  function calculate() {
    let litres = 0;
    let delivered = 0;
    let missed = 0;
    let late = 0;
    let pending = 0;
    let paperNormal = 0;
    let paperSunday = 0;
    const milkByRate = new Map();

    month.entries.forEach((entry, index) => {
      const day = index + 1;
      if (entry.litres == null) {
        pending++;
      } else if (entry.litres === 0) {
        missed++;
      } else {
        delivered++;
        litres += entry.litres;
        const rate = rateForDay(day);
        milkByRate.set(rate, (milkByRate.get(rate) || 0) + entry.litres);
        if (entry.late) late++;
      }

      if (month.paperOn && entry.paper) {
        if (dayOfWeek(day) === 0) paperSunday++;
        else paperNormal++;
      }
    });

    const billLines = [];
    let milkTotal = 0;

    [...milkByRate.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([rate, qty]) => {
        const amount = qty * rate;
        milkTotal += amount;
        billLines.push({ label: `${formatQty(qty)} L × ${money(rate)}/L`, amount });
      });

    let paperTotal = 0;
    if (month.paperOn && paperNormal) {
      const amount = paperNormal * numberOr(month.paperRate, 0);
      paperTotal += amount;
      billLines.push({ label: `Newspaper ${paperNormal} day${paperNormal === 1 ? '' : 's'} × ${money(month.paperRate)}`, amount });
    }

    if (month.paperOn && paperSunday) {
      const rate = month.sunRate == null ? numberOr(month.paperRate, 0) : numberOr(month.sunRate, month.paperRate);
      const amount = paperSunday * rate;
      paperTotal += amount;
      billLines.push({ label: `Newspaper ${paperSunday} Sunday${paperSunday === 1 ? '' : 's'} × ${money(rate)}`, amount });
    }

    const total = milkTotal + paperTotal;
    const payments = month.payments.reduce((sum, item) => sum + numberOr(item.amount, 0), 0);
    const balance = total - payments;
    const logged = month.entries.length - pending;
    const progress = month.entries.length ? Math.round((logged / month.entries.length) * 100) : 0;
    const average = delivered ? litres / delivered : 0;

    return {
      litres,
      delivered,
      missed,
      late,
      pending,
      paperNormal,
      paperSunday,
      milkTotal,
      paperTotal,
      total,
      payments,
      balance,
      progress,
      average,
      billLines
    };
  }

  function formatQty(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  function dayStatus(entry) {
    if (entry.litres == null) return 'pending';
    if (entry.litres === 0) return 'missed';
    if (entry.late) return 'late';
    return 'delivered';
  }

  function statusText(status) {
    return {
      delivered: 'Delivered',
      missed: 'Missed',
      late: 'Late',
      pending: 'Not logged'
    }[status] || 'Not logged';
  }

  function renderAll() {
    renderHeader();
    renderCalendar();
    renderEditor();
    renderSettings();
    renderBill();
  }

  function renderHeader() {
    const [year, monthNumber] = splitYM();
    $('monthLabel').textContent = `${MONTHS[monthNumber - 1]} ${year}`;
    const calc = calculate();

    if (!calc.litres && !calc.missed) {
      $('moodText').textContent = 'Select a day and start logging.';
    } else if (calc.pending === 0) {
      $('moodText').textContent = 'Whole month logged. Your bill is ready.';
    } else if (calc.late > 3) {
      $('moodText').textContent = `${calc.late} late deliveries recorded.`;
    } else {
      $('moodText').textContent = `${calc.pending} day${calc.pending === 1 ? '' : 's'} still to log.`;
    }
  }

  function renderCalendar() {
    const firstDow = dayOfWeek(1);
    let html = WEEKDAYS.map((day) => `<div class="weekday">${day}</div>`).join('');
    html += Array.from({ length: firstDow }, () => '<div class="calendar-spacer" aria-hidden="true"></div>').join('');

    month.entries.forEach((entry, index) => {
      const day = index + 1;
      const status = dayStatus(entry);
      const isToday = ym === currentYM && day === now.getDate();
      const isSelected = day === selectedDay;
      const isSunday = dayOfWeek(day) === 0;
      const isFuture = ym > currentYM || (ym === currentYM && day > now.getDate());
      const qty = entry.litres == null ? '—' : `${formatQty(entry.litres)} L`;
      const icons = `${entry.paper && month.paperOn ? '📰' : ''}${entry.note ? ' 📝' : ''}`.trim();

      html += `
        <button
          type="button"
          class="calendar-day status-${status}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${isSunday ? ' sunday' : ''}${isFuture ? ' future' : ''}"
          data-day="${day}"
          aria-label="${MONTHS[splitYM()[1] - 1]} ${day}: ${statusText(status)}"
        >
          <div class="day-topline">
            <span class="day-number">${day}</span>
            <span class="day-icons">${icons}</span>
          </div>
          <div class="day-main">
            <strong>${qty}</strong>
            <span>${statusText(status)}</span>
          </div>
          <div class="day-bottomline">
            <span>${isSunday ? '☀ Sunday' : ''}</span>
            <span>${entry.litres != null && entry.litres > 0 ? money(entry.litres * rateForDay(day)) : ''}</span>
          </div>
        </button>`;
    });

    $('calendar').innerHTML = html;
  }

  function renderEditor() {
    selectedDay = Math.max(1, Math.min(daysInMonth(), selectedDay));
    const entry = month.entries[selectedDay - 1];
    const status = dayStatus(entry);
    const [year, monthNumber] = splitYM();
    const date = new Date(year, monthNumber - 1, selectedDay);

    $('selectedDateLabel').textContent = date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    $('selectedStatus').textContent = statusText(status);
    $('selectedStatus').className = `status-chip ${status}`;
    $('qtyInput').value = entry.litres == null ? '' : entry.litres;
    $('lateToggle').checked = !!entry.late;
    $('lateToggle').disabled = !(entry.litres > 0);
    $('paperToggle').checked = !!entry.paper;
    $('paperToggle').disabled = !month.paperOn;
    $('paperToggleHelp').textContent = month.paperOn
      ? `Charge for this day: ${money(newspaperRateForDay(selectedDay))}`
      : 'Enable newspaper in Settings if needed.';
    $('noteInput').value = entry.note || '';
    $('noteCount').textContent = `${(entry.note || '').length}/180`;
    $('rateForSelectedDay').textContent = `Milk rate: ${money(rateForDay(selectedDay))}/L`;
  }

  function renderSummary(calc) {
    $('summaryLitres').textContent = `${formatQty(calc.litres)} L`;
    $('summaryAvg').textContent = `${formatQty(calc.average)} L average`;
    $('summaryDelivered').textContent = calc.delivered;
    $('summaryLate').textContent = `${calc.late} late`;
    $('summaryMissed').textContent = calc.missed;
    $('summaryPending').textContent = `${calc.pending} not logged`;
    $('summaryPayments').textContent = `${money(calc.payments)} paid`;

    if (calc.balance >= 0) {
      $('summaryBalanceLabel').textContent = 'Balance due';
      $('summaryBalance').textContent = money(calc.balance);
    } else {
      $('summaryBalanceLabel').textContent = 'Credit';
      $('summaryBalance').textContent = money(Math.abs(calc.balance));
    }
  }

  function renderBill() {
    const calc = calculate();
    const [year, monthNumber] = splitYM();
    renderSummary(calc);

    $('billTitle').textContent = `${month.vendor || 'Milk vendor'} · ${MONTHS[monthNumber - 1]} ${year}`;
    $('billLitres').textContent = `${formatQty(calc.litres)} L`;
    $('billDelivered').textContent = `${calc.delivered} day${calc.delivered === 1 ? '' : 's'}`;
    $('billLate').textContent = `${calc.late} day${calc.late === 1 ? '' : 's'}`;
    $('billPending').textContent = `${calc.pending} day${calc.pending === 1 ? '' : 's'}`;
    $('progressPct').textContent = `${calc.progress}%`;
    $('progressRing').style.setProperty('--p', `${calc.progress}%`);

    $('billLines').innerHTML = calc.billLines.length
      ? calc.billLines.map((line) => `
          <div class="bill-line">
            <span>${escapeHTML(line.label)}</span>
            <strong>${money(line.amount)}</strong>
          </div>`).join('')
      : '<div class="empty-line">Nothing billed yet. Add a daily entry to begin.</div>';

    $('billTotal').textContent = money(calc.total);
    $('billPayments').textContent = `− ${money(calc.payments)}`;

    if (calc.balance >= 0) {
      $('balanceLabel').textContent = 'Balance due';
      $('billBalance').textContent = money(calc.balance);
    } else {
      $('balanceLabel').textContent = 'Credit balance';
      $('billBalance').textContent = money(Math.abs(calc.balance));
    }
  }

  function renderSettings() {
    $('vendorInput').value = month.vendor;
    $('baseRateInput').value = month.rates.find((r) => r.from === 1)?.rate ?? 0;
    $('defaultLInput').value = month.defaultL;
    $('paperOnInput').checked = month.paperOn;
    $('paperRateInput').value = month.paperRate;
    $('sunRateInput').value = month.sunRate == null ? '' : month.sunRate;

    $('rateHistoryList').innerHTML = month.rates
      .slice()
      .sort((a, b) => a.from - b.from)
      .map((item) => `
        <div class="history-item">
          <div>
            <strong>From day ${item.from}: ${money(item.rate)}/L</strong>
            <small>${item.from === 1 ? 'Base monthly rate' : 'Rate change'}</small>
          </div>
          ${item.from === 1 ? '' : `<button class="history-remove" type="button" data-remove-rate="${item.id}" title="Remove rate change">×</button>`}
        </div>`).join('');

    $('paymentHistoryList').innerHTML = month.payments.length
      ? month.payments
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((item) => `
            <div class="history-item">
              <div>
                <strong>${money(item.amount)} · ${formatPaymentDate(item.date)}</strong>
                <small>${escapeHTML(item.note || 'Payment')}</small>
              </div>
              <button class="history-remove" type="button" data-remove-payment="${item.id}" title="Remove payment">×</button>
            </div>`).join('')
      : '<div class="empty-line">No payments recorded yet.</div>';

    if (!$('paymentDateInput').value) {
      const defaultDay = ym === currentYM ? Math.min(now.getDate(), daysInMonth()) : 1;
      $('paymentDateInput').value = dateISO(defaultDay);
    }
  }

  function formatPaymentDate(value) {
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return value;
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    });
  }

  function updateEntry(mutator, options = {}) {
    const entry = month.entries[selectedDay - 1];
    mutator(entry);

    if (!(entry.litres > 0)) entry.late = false;
    if (!month.paperOn) entry.paper = false;

    renderCalendar();
    renderEditor();
    renderBill();
    renderHeader();
    queueSave();

    if (options.toast) showToast(options.toast);
  }

  function setLitres(value) {
    updateEntry((entry) => {
      entry.litres = value == null || value === '' ? null : Math.max(0, numberOr(value, 0));
    });
  }

  function shiftMonth(delta) {
    saveNow();
    const [year, monthNumber] = splitYM();
    ym = toYM(new Date(year, monthNumber - 1 + delta, 1));
    month = getMonthData(ym);
    selectedDay = ym === currentYM ? now.getDate() : 1;
    $('paymentDateInput').value = '';
    renderAll();
    queueSave();
  }

  function goToday() {
    saveNow();
    ym = currentYM;
    month = getMonthData(ym);
    selectedDay = now.getDate();
    $('paymentDateInput').value = '';
    renderAll();
  }

  function bulkLimit() {
    if (ym > currentYM) return 0;
    if (ym === currentYM) return Math.min(now.getDate(), daysInMonth());
    return daysInMonth();
  }

  function showToast(message, actionLabel = '', action = null) {
    clearTimeout(toastTimer);
    const toast = $('toast');
    toast.innerHTML = `<span>${escapeHTML(message)}</span>${actionLabel ? `<button type="button" id="toastAction">${escapeHTML(actionLabel)}</button>` : ''}`;
    toast.classList.add('show');

    if (actionLabel && action) {
      $('toastAction').onclick = () => {
        action();
        hideToast();
      };
    }

    toastTimer = setTimeout(hideToast, actionLabel ? 5500 : 2600);
  }

  function hideToast() {
    $('toast').classList.remove('show');
  }

  function openSettings() {
    renderSettings();
    $('drawerBackdrop').hidden = false;
    requestAnimationFrame(() => $('drawerBackdrop').classList.add('show'));
    $('settingsDrawer').classList.add('open');
    $('settingsDrawer').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeSettings() {
    $('settingsDrawer').classList.remove('open');
    $('settingsDrawer').setAttribute('aria-hidden', 'true');
    $('drawerBackdrop').classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(() => { $('drawerBackdrop').hidden = true; }, 210);
  }

  function addRateChange() {
    const from = Number.parseInt($('newRateDayInput').value, 10);
    const rateText = $('newRateValueInput').value;
    const rate = numberOr(rateText, -1);

    if (!Number.isInteger(from) || from < 2 || from > daysInMonth()) {
      showToast(`Choose a day between 2 and ${daysInMonth()}.`);
      return;
    }
    if (rateText === '' || rate < 0) {
      showToast('Enter a valid milk rate.');
      return;
    }

    month.rates = month.rates.filter((item) => item.from !== from);
    month.rates.push({ id: uid(), from, rate });
    month.rates.sort((a, b) => a.from - b.from);
    $('newRateDayInput').value = '';
    $('newRateValueInput').value = '';
    renderSettings();
    renderCalendar();
    renderEditor();
    renderBill();
    queueSave();
    showToast('Rate change added.');
  }

  function addPayment() {
    const amountText = $('paymentAmountInput').value;
    const amount = numberOr(amountText, 0);
    const date = $('paymentDateInput').value;
    const note = $('paymentNoteInput').value.trim();

    if (amountText === '' || amount <= 0) {
      showToast('Enter a payment amount greater than ₹0.');
      return;
    }
    if (!date || !date.startsWith(ym + '-')) {
      showToast('Choose a payment date inside the selected month.');
      return;
    }

    month.payments.push({ id: uid(), date, amount, note });
    $('paymentAmountInput').value = '';
    $('paymentNoteInput').value = '';
    renderSettings();
    renderBill();
    queueSave();
    showToast('Payment added.');
  }

  function resetDailyEntries() {
    if (!window.confirm('Clear all daily entries for this month? Rates and payments will stay unchanged.')) return;

    undoEntries = JSON.parse(JSON.stringify(month.entries));
    month.entries = Array.from({ length: daysInMonth() }, blankEntry);
    selectedDay = ym === currentYM ? Math.min(now.getDate(), daysInMonth()) : 1;
    renderAll();
    queueSave();
    showToast('Daily entries reset.', 'Undo', () => {
      if (!undoEntries) return;
      month.entries = undoEntries;
      undoEntries = null;
      renderAll();
      queueSave();
    });
  }

  function buildBillText() {
    const calc = calculate();
    const [year, monthNumber] = splitYM();
    const lines = calc.billLines.length
      ? calc.billLines.map((line) => `${line.label}: ${money(line.amount)}`).join('\n')
      : 'No billed entries yet.';
    const balanceText = calc.balance >= 0
      ? `Balance due: ${money(calc.balance)}`
      : `Credit balance: ${money(Math.abs(calc.balance))}`;

    return `🥛 ${month.vendor || 'Milk vendor'} - ${MONTHS[monthNumber - 1]} ${year}\n` +
      `${lines}\n` +
      `Delivered: ${calc.delivered} | Missed: ${calc.missed} | Late: ${calc.late}\n` +
      `Total: ${money(calc.total)}\n` +
      `Payments: ${money(calc.payments)}\n` +
      balanceText;
  }

  function shareWhatsApp() {
    const text = buildBillText();
    const url = 'https://wa.me/?text=' + encodeURIComponent(text);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');

    if (!opened) {
      copyText(text)
        .then(() => showToast('WhatsApp was blocked. Bill copied instead.'))
        .catch(() => showToast('Unable to open WhatsApp or copy the bill.'));
    }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        ok ? resolve() : reject(new Error('Copy failed'));
      } catch (error) {
        reject(error);
      }
    });
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadCSV() {
    const rows = [[
      'Date', 'Litres', 'Status', 'Late', 'Newspaper', 'Note',
      'Milk Rate', 'Milk Amount', 'Paper Amount'
    ]];

    month.entries.forEach((entry, index) => {
      const day = index + 1;
      const rate = rateForDay(day);
      const milkAmount = entry.litres != null && entry.litres > 0 ? entry.litres * rate : 0;
      const paperAmount = month.paperOn && entry.paper ? newspaperRateForDay(day) : 0;
      rows.push([
        dateISO(day),
        entry.litres == null ? '' : entry.litres,
        statusText(dayStatus(entry)),
        entry.late ? 'Yes' : 'No',
        month.paperOn && entry.paper ? 'Yes' : 'No',
        entry.note || '',
        rate,
        milkAmount,
        paperAmount
      ]);
    });

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `milk-${ym}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Events ----------

  $('calendar').addEventListener('click', (event) => {
    const dayButton = event.target.closest('[data-day]');
    if (!dayButton) return;
    selectedDay = Number(dayButton.dataset.day);
    renderCalendar();
    renderEditor();
  });

  $('prevMonth').addEventListener('click', () => shiftMonth(-1));
  $('nextMonth').addEventListener('click', () => shiftMonth(1));
  $('todayBtn').addEventListener('click', goToday);

  $('qtyPlus').addEventListener('click', () => {
    const entry = month.entries[selectedDay - 1];
    const next = entry.litres == null ? month.defaultL : entry.litres + 0.5;
    setLitres(next);
  });

  $('qtyMinus').addEventListener('click', () => {
    const entry = month.entries[selectedDay - 1];
    const next = entry.litres == null ? 0 : Math.max(0, entry.litres - 0.5);
    setLitres(next);
  });

  $('qtyInput').addEventListener('input', (event) => {
    const raw = event.target.value;
    setLitres(raw === '' ? null : raw);
  });

  $('missedBtn').addEventListener('click', () => {
    updateEntry((entry) => {
      entry.litres = 0;
      entry.late = false;
    }, { toast: 'Marked as missed.' });
  });

  $('clearDayBtn').addEventListener('click', () => {
    updateEntry((entry) => {
      entry.litres = null;
      entry.late = false;
      entry.paper = false;
      entry.note = '';
    }, { toast: 'Day cleared.' });
  });

  $('lateToggle').addEventListener('change', (event) => {
    const entry = month.entries[selectedDay - 1];
    if (!(entry.litres > 0)) {
      event.target.checked = false;
      showToast('Add delivered milk before marking it late.');
      return;
    }
    updateEntry((item) => { item.late = event.target.checked; });
  });

  $('paperToggle').addEventListener('change', (event) => {
    if (!month.paperOn) {
      event.target.checked = false;
      showToast('Enable newspaper in Settings first.');
      return;
    }
    updateEntry((entry) => { entry.paper = event.target.checked; });
  });

  $('noteInput').addEventListener('input', (event) => {
    const value = event.target.value.slice(0, 180);
    month.entries[selectedDay - 1].note = value;
    $('noteCount').textContent = `${value.length}/180`;
    renderCalendar();
    queueSave();
  });

  $('saveDayBtn').addEventListener('click', () => {
    saveNow();
    $('saveStatus').textContent = '✓ Saved';
    $('saveStatus').style.color = 'var(--green)';
    showToast('Entry saved.');
  });

  $('fillToTodayBtn').addEventListener('click', () => {
    const limit = bulkLimit();
    if (!limit) {
      showToast('Future months cannot be filled automatically.');
      return;
    }

    month.entries.forEach((entry, index) => {
      if (index < limit && entry.litres == null) entry.litres = month.defaultL;
    });
    renderAll();
    queueSave();
    showToast('Empty days filled.');
  });

  $('sundaysOffBtn').addEventListener('click', () => {
    const limit = bulkLimit();
    if (!limit) {
      showToast('Future months cannot be changed automatically.');
      return;
    }

    month.entries.forEach((entry, index) => {
      const day = index + 1;
      if (index < limit && dayOfWeek(day) === 0 && entry.litres == null) entry.litres = 0;
    });
    renderAll();
    queueSave();
    showToast('Empty Sundays marked off.');
  });

  $('settingsBtn').addEventListener('click', openSettings);
  $('closeSettingsBtn').addEventListener('click', closeSettings);
  $('drawerBackdrop').addEventListener('click', closeSettings);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('settingsDrawer').classList.contains('open')) closeSettings();
  });

  $('vendorInput').addEventListener('input', (event) => {
    month.vendor = event.target.value.slice(0, 60);
    renderHeader();
    renderBill();
    queueSave();
  });

  $('baseRateInput').addEventListener('input', (event) => {
    const base = month.rates.find((r) => r.from === 1);
    if (base) base.rate = numberOr(event.target.value, 0);
    renderCalendar();
    renderEditor();
    renderBill();
    queueSave();
  });

  $('defaultLInput').addEventListener('input', (event) => {
    month.defaultL = numberOr(event.target.value, 1) || 1;
    queueSave();
  });

  $('paperOnInput').addEventListener('change', (event) => {
    month.paperOn = event.target.checked;
    if (!month.paperOn) month.entries.forEach((entry) => { entry.paper = false; });
    renderAll();
    queueSave();
  });

  $('paperRateInput').addEventListener('input', (event) => {
    month.paperRate = numberOr(event.target.value, 0);
    renderEditor();
    renderBill();
    queueSave();
  });

  $('sunRateInput').addEventListener('input', (event) => {
    month.sunRate = event.target.value === '' ? null : numberOr(event.target.value, month.paperRate);
    renderEditor();
    renderBill();
    queueSave();
  });

  $('addRateBtn').addEventListener('click', addRateChange);
  $('addPaymentBtn').addEventListener('click', addPayment);
  $('resetMonthBtn').addEventListener('click', resetDailyEntries);

  $('rateHistoryList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-rate]');
    if (!button) return;
    month.rates = month.rates.filter((item) => item.id !== button.dataset.removeRate || item.from === 1);
    renderSettings();
    renderCalendar();
    renderEditor();
    renderBill();
    queueSave();
    showToast('Rate change removed.');
  });

  $('paymentHistoryList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-payment]');
    if (!button) return;
    month.payments = month.payments.filter((item) => item.id !== button.dataset.removePayment);
    renderSettings();
    renderBill();
    queueSave();
    showToast('Payment removed.');
  });

  $('themeBtn').addEventListener('click', () => {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    $('themeBtn').textContent = html.dataset.theme === 'dark' ? '☀️' : '🌙';
    queueSave();
  });

  $('whatsappBtn').addEventListener('click', shareWhatsApp);
  $('printBtn').addEventListener('click', () => window.print());
  $('csvBtn').addEventListener('click', downloadCSV);

  // ---------- Initial load ----------

  if (root.theme) document.documentElement.dataset.theme = root.theme;
  $('themeBtn').textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';

  renderAll();
  saveNow();
})();
