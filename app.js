const $ = id => document.getElementById(id);

const money = n =>
  'NT$ ' + Number(n || 0).toLocaleString('zh-TW', {
    maximumFractionDigits: 2
  });

const today = () => new Date().toISOString().slice(0, 10);

let expenses = [];
let trips = [];
let saved = [];
let receiptData = '';

try {
  expenses = JSON.parse(localStorage.getItem('draftExpenses') || '[]');
  trips = JSON.parse(localStorage.getItem('draftTrips') || '[]');
  saved = JSON.parse(localStorage.getItem('claims') || '[]');
} catch (e) {
  console.error('讀取資料失敗', e);
}

function persist() {
  localStorage.setItem('draftExpenses', JSON.stringify(expenses));
  localStorage.setItem('draftTrips', JSON.stringify(trips));
  localStorage.setItem('claims', JSON.stringify(saved));
}

function tab(id) {
  document.querySelectorAll('.tab').forEach(s => {
    s.classList.add('hide');
  });

  document.querySelectorAll('nav button').forEach(b => {
    b.classList.remove('active');
  });

  $(id).classList.remove('hide');

  const btn = document.querySelector(`[data-tab="${id}"]`);
  if (btn) btn.classList.add('active');

  if (id === 'history') renderHistory();
  if (id === 'home') renderHome();

  window.scrollTo(0, 0);
}

document.querySelectorAll('nav button').forEach(b => {
  b.onclick = () => tab(b.dataset.tab);
});

['eDate', 'fDate', 'spendDate', 'tripDate'].forEach(id => {
  $(id).value = today();
});


/* =========================
   事務支出單
========================= */

function expenseSum() {
  return expenses.reduce((s, x) => s + x.amount, 0);
}

function tax() {
  return expenseSum() *
    Math.max(0, Number($('taxRate').value || 0)) / 100;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function renderExpenses() {
  $('expenseRows').innerHTML = expenses.map((x, i) => `
    <tr>
      <td>${esc(x.date)}</td>
      <td>${esc(x.category)}<br>${esc(x.desc)}</td>
      <td>${x.qty} ${esc(x.unit)}</td>
      <td>${money(x.price)}</td>
      <td>${money(x.amount)}</td>
      <td>
        <button class="danger" onclick="delExpense(${i})">刪除</button>
      </td>
    </tr>
  `).join('');

  $('eSubtotal').textContent = money(expenseSum());
  $('taxAmount').textContent = money(tax());
  $('eGrand').textContent = money(expenseSum() + tax());
}

function delExpense(i) {
  expenses.splice(i, 1);
  persist();
  renderExpenses();
}

function calcLine() {
  const total =
    Number($('qty').value || 0) *
    Number($('price').value || 0);

  $('lineTotal').textContent = money(total);
}

['qty', 'price', 'taxRate'].forEach(id => {
  $(id).addEventListener('input', () => {
    calcLine();
    renderExpenses();
  });
});

$('addExpense').onclick = () => {
  const qty = Number($('qty').value || 0);
  const price = Number($('price').value || 0);

  if (!$('desc').value.trim() && !$('shop').value.trim()) {
    alert('請輸入支出說明或店家名稱');
    return;
  }

  expenses.push({
    date: $('spendDate').value,
    category: $('category').value,
    shop: $('shop').value,
    desc: $('desc').value,
    qty,
    unit: $('unit').value,
    price,
    amount: qty * price,
    pay: $('pay').value,
    receipt: receiptData
  });

  persist();
  renderExpenses();

  ['shop', 'desc', 'unit'].forEach(id => {
    $(id).value = '';
  });

  $('qty').value = 1;
  $('price').value = 0;

  receiptData = '';
  $('preview').classList.add('hide');
  $('receipt').value = '';

  calcLine();
};

$('clearExpense').onclick = () => {
  ['shop', 'desc', 'unit', 'ocrResult'].forEach(id => {
    $(id).value = '';
  });

  $('qty').value = 1;
  $('price').value = 0;

  calcLine();
};


/* =========================
   發票照片上傳及 OCR
========================= */

$('receipt').onchange = e => {
  const f = e.target.files[0];

  if (!f) return;

  const reader = new FileReader();

  reader.onload = () => {
    receiptData = reader.result;
    $('preview').src = receiptData;
    $('preview').classList.remove('hide');
  };

  reader.readAsDataURL(f);
};

$('ocr').onclick = async () => {
  const f = $('receipt').files[0];

  if (!f) {
    alert('請先拍照或選擇收據照片');
    return;
  }

  if (!window.Tesseract) {
    alert('OCR 元件載入失敗，請確認網路連線');
    return;
  }

  try {
    $('ocrStatus').textContent = '辨識中，請稍候…';

    const result = await Tesseract.recognize(
      f,
      'chi_tra+eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            $('ocrStatus').textContent =
              '辨識進度 ' + Math.round(m.progress * 100) + '%';
          }
        }
      }
    );

    const text = result.data.text;

    $('ocrResult').value = text;

    const nums = text.match(
      /(?:NT\$|＄|\$)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/g
    ) || [];

    const vals = nums
      .map(v => Number(v.replace(/[^0-9.]/g, '')))
      .filter(v => v > 0);

    if (vals.length) {
      $('price').value = vals[vals.length - 1];
      $('qty').value = 1;
      calcLine();
    }

    const date = text.match(
      /(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/
    );

    if (date) {
      $('spendDate').value =
        `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
    }

    $('ocrStatus').textContent =
      '辨識完成，請核對欄位及金額。';

  } catch (e) {
    $('ocrStatus').textContent = '辨識失敗：' + e.message;
  }
};

$('taxRate').oninput = renderExpenses;


/* =========================
   油資申請單
========================= */

function tripDistance() {
  return Math.max(
    0,
    Number($('kmEnd').value || 0) -
    Number($('kmStart').value || 0)
  );
}

['kmStart', 'kmEnd'].forEach(id => {
  $(id).oninput = () => {
    $('tripKm').textContent =
      tripDistance().toFixed(1) + ' km';
  };
});

function tripTotals() {
  return {
    km: trips.reduce((s, t) => s + t.km, 0),
    highway: trips.reduce((s, t) => s + t.highway, 0),
    cost: trips.reduce((s, t) => s + t.cost, 0)
  };
}

function renderTrips() {
  const t = tripTotals();

  $('fuelRows').innerHTML = trips.map((x, i) => `
    <tr>
      <td>${esc(x.date)}</td>
      <td>${esc(x.desc)}</td>
      <td>${x.start}–${x.end}</td>
      <td>${x.km.toFixed(1)}</td>
      <td>${x.highway.toFixed(1)}</td>
      <td>${money(x.cost)}</td>
      <td>
        <button class="danger" onclick="delTrip(${i})">刪除</button>
      </td>
    </tr>
  `).join('');

  $('totalKm').textContent = t.km.toFixed(1) + ' km';
  $('totalHighway').textContent =
    t.highway.toFixed(1) + ' km';
  $('totalFuel').textContent = money(t.cost);
}

function delTrip(i) {
  trips.splice(i, 1);
  persist();
  renderTrips();
}

$('addTrip').onclick = () => {
  const start = Number($('kmStart').value || 0);
  const end = Number($('kmEnd').value || 0);

  if (end < start) {
    alert('終點里程不可小於起點里程');
    return;
  }

  trips.push({
    date: $('tripDate').value,
    desc: $('tripDesc').value,
    start,
    end,
    km: end - start,
    highway: Number($('highway').value || 0),
    cost: Number($('fuelCost').value || 0)
  });

  persist();
  renderTrips();

  $('tripDesc').value = '';
  $('kmStart').value = '';
  $('kmEnd').value = '';
  $('highway').value = 0;
  $('fuelCost').value = 0;
  $('tripKm').textContent = '0 km';
};


/* =========================
   儲存請款單
========================= */

function saveClaim(type) {
  let obj;

  if (type === 'expense') {
    if (!expenses.length) {
      alert('請先新增至少一筆支出明細');
      return;
    }

    obj = {
      id: $('eNo').value || 'EXP-' + Date.now(),
      type,
      caseNo: $('eCase').value,
      date: $('eDate').value,
      pay: $('ePay').value,
      note: $('eNote').value,
      items: [...expenses],
      subtotal: expenseSum(),
      taxRate: Number($('taxRate').value || 0),
      tax: tax(),
      total: expenseSum() + tax()
    };

    expenses = [];
    renderExpenses();

  } else {
    if (!trips.length) {
      alert('請先新增至少一筆行程');
      return;
    }

    const t = tripTotals();

    obj = {
      id: $('fNo').value || 'FUEL-' + Date.now(),
      type,
      caseNo: $('fCase').value,
      date: $('fDate').value,
      car: $('fCar').value,
      items: [...trips],
      ...t
    };

    trips = [];
    renderTrips();
  }

  saved.push(obj);

  persist();

  alert('已儲存請款單：' + obj.id);

  renderHome();
}

$('saveExpense').onclick = () => saveClaim('expense');
$('saveFuel').onclick = () => saveClaim('fuel');


/* =========================
   A4 列印
========================= */

function printDoc(html) {
  $('printArea').innerHTML = html;
  window.print();
}

function expensePrint(x) {
  const rows = x.items.map(i => `
    <tr>
      <td>${esc(i.category)}</td>
      <td>${esc(i.desc)}<br>${esc(i.shop)}</td>
      <td>${i.qty}</td>
      <td>${esc(i.unit)}</td>
      <td>${money(i.price)}</td>
      <td>${money(i.amount)}</td>
    </tr>
  `).join('');

  return `
    <div class="print-page">

      <div class="print-meta">
        <span>案件編號：${esc(x.caseNo)}</span>
        <span>請款單編號：${esc(x.id)}</span>
      </div>

      <div class="print-title">事 務 支 出 單</div>

      <div class="print-meta">
        <span>填單日期：${esc(x.date)}</span>
        <span>付款方式：${esc(x.pay)}</span>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th>會計科目</th>
            <th>說明</th>
            <th>數量</th>
            <th>單位</th>
            <th>支出單價</th>
            <th>支出總價</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="total">
        小計：${money(x.subtotal)}
        稅金：${money(x.tax)}
        總計：${money(x.total)}
      </div>

      <div class="print-note">
        備註：${esc(x.note || '')}
      </div>

      <div class="print-sign">
        <span>財務主管：________________</span>
        <span>會計：________________</span>
        <span>申請人：________________</span>
      </div>

    </div>
  `;
}

function fuelPrint(x) {
  const rows = x.items.map(i => `
    <tr>
      <td>${esc(i.date)}</td>
      <td>${esc(i.desc)}</td>
      <td>${i.start}</td>
      <td>${i.end}</td>
      <td>${i.km.toFixed(1)}</td>
      <td>${i.highway.toFixed(1)}</td>
      <td>${money(i.cost)}</td>
    </tr>
  `).join('');

  return `
    <div class="print-page">

      <div class="print-meta">
        <span>案件編號：${esc(x.caseNo)}</span>
        <span>申請單編號：${esc(x.id)}</span>
      </div>

      <div class="print-title">油 資 申 請 單</div>

      <div class="print-meta">
        <span>申請日期：${esc(x.date)}</span>
        <span>車號／使用人：${esc(x.car)}</span>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>起迄說明</th>
            <th>起點里程</th>
            <th>終點里程</th>
            <th>行駛公里</th>
            <th>高速公里</th>
            <th>油資</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="total">
        總行駛里程：${x.km.toFixed(1)} km
        高速公路：${x.highway.toFixed(1)} km
        油資：${money(x.cost)}
      </div>

      <div class="print-sign">
        <span>財務主管：________________</span>
        <span>會計：________________</span>
        <span>申請人：________________</span>
      </div>

    </div>
  `;
}

function printCurrent(type) {
  let x = {};

  if (type === 'expense') {
    if (!expenses.length) {
      alert('目前沒有未儲存的支出明細');
      return;
    }

    x = {
      id: $('eNo').value || '草稿',
      caseNo: $('eCase').value,
      date: $('eDate').value,
      pay: $('ePay').value,
      note: $('eNote').value,
      items: expenses,
      subtotal: expenseSum(),
      tax: tax(),
      total: expenseSum() + tax()
    };

    printDoc(expensePrint(x));

  } else {
    if (!trips.length) {
      alert('目前沒有未儲存的油資行程');
      return;
    }

    const t = tripTotals();

    x = {
      id: $('fNo').value || '草稿',
      caseNo: $('fCase').value,
      date: $('fDate').value,
      car: $('fCar').value,
      items: trips,
      ...t
    };

    printDoc(fuelPrint(x));
  }
}

$('printExpense').onclick = () => printCurrent('expense');
$('printFuel').onclick = () => printCurrent('fuel');


/* =========================
   首頁總覽
========================= */

function renderHome() {
  const ex = saved
    .filter(x => x.type === 'expense')
    .reduce((s, x) => s + x.total, 0);

  const km = saved
    .filter(x => x.type === 'fuel')
    .reduce((s, x) => s + x.km, 0);

  $('sumExpense').textContent = money(ex);
  $('sumKm').textContent = km.toFixed(1) + ' km';
  $('count').textContent = saved.length;

  $('recent').innerHTML = saved
    .slice(-5)
    .reverse()
    .map(x => `
      <div class="record">
        <div>
          <b>
            ${x.type === 'expense' ? '事務支出單' : '油資申請單'}
            ｜${esc(x.id)}
          </b>
          <small>
            ${esc(x.date)}　案件：${esc(x.caseNo)}
          </small>
        </div>

        <b>
          ${x.type === 'expense'
            ? money(x.total)
            : x.km.toFixed(1) + ' km'}
        </b>
      </div>
    `).join('') || '目前尚無紀錄';
}


/* =========================
   歷史紀錄
========================= */

function renderHistory() {
  $('historyList').innerHTML = saved
    .map((x, i) => `
      <div class="record">
        <div>
          <b>
            ${x.type === 'expense' ? '事務支出單' : '油資申請單'}
            ｜${esc(x.id)}
          </b>

          <small>
            ${esc(x.date)}
            案件：${esc(x.caseNo)}
            ${x.type === 'expense'
              ? money(x.total)
              : x.km.toFixed(1) + ' km'}
          </small>
        </div>

        <button onclick="printSaved(${i})">列印</button>
      </div>
    `).join('') || '<p class="muted">尚無已儲存紀錄。</p>';
}

function printSaved(i) {
  const x = saved[i];

  printDoc(
    x.type === 'expense'
      ? expensePrint(x)
      : fuelPrint(x)
  );
}


/* =========================
   整案彙整列印
========================= */

$('printBundle').onclick = () => {
  if (!saved.length) {
    alert('尚無已儲存資料');
    return;
  }

  let html = saved
    .map(x =>
      x.type === 'expense'
        ? expensePrint(x)
        : fuelPrint(x)
    )
    .join('');

  const receipts = saved
    .filter(x => x.type === 'expense')
    .flatMap(x => x.items.map(i => i.receipt).filter(Boolean));

  receipts.forEach((src, i) => {
    html += `
      <div class="print-page">
        <div class="print-title">
          發票／收據附件 ${i + 1}
        </div>
        <img class="receipt-img" src="${src}">
      </div>
    `;
  });

  printDoc(html);
};


/* =========================
   CSV 備份
========================= */

$('export').onclick = () => {
  const rows = [[
    '表單類型',
    '請款編號',
    '案件編號',
    '日期',
    '項目/行程',
    '數量/公里',
    '單價/高速公里',
    '金額/油資'
  ]];

  saved.forEach(x => {
    x.items.forEach(i => {
      rows.push([
        x.type,
        x.id,
        x.caseNo,
        x.date,
        i.desc,
        x.type === 'expense' ? i.qty : i.km,
        x.type === 'expense' ? i.price : i.highway,
        x.type === 'expense' ? i.amount : i.cost
      ]);
    });
  });

  const csv = '\ufeff' + rows
    .map(r =>
      r.map(v =>
        '"' + String(v ?? '').replace(/"/g, '""') + '"'
      ).join(',')
    )
    .join('\r\n');

  const a = document.createElement('a');

  a.href = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' })
  );

  a.download = '請款資料備份.csv';
  a.click();

  URL.revokeObjectURL(a.href);
};


/* =========================
   清除資料
========================= */

$('clearAll').onclick = () => {
  if (confirm('確定清除這個瀏覽器內的所有請款紀錄與草稿？建議先匯出 CSV。')) {
    saved = [];
    expenses = [];
    trips = [];

    persist();

    renderHome();
    renderHistory();
    renderExpenses();
    renderTrips();
  }
};


/* =========================
   系統初始化
========================= */

renderExpenses();
renderTrips();
renderHome();
calcLine();
