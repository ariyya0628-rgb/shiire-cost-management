const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCode() {
  const codePath = path.join(__dirname, '..', 'apps-script', 'Code.gs');
  const code = fs.readFileSync(codePath, 'utf8');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: codePath });
  return sandbox;
}

test('normalizeAmount converts Japanese currency text to a number', () => {
  const gas = loadCode();

  assert.equal(gas.normalizeAmount('￥12,345円'), 12345);
  assert.equal(gas.normalizeAmount(' 1,980 '), 1980);
  assert.equal(gas.normalizeAmount(''), '');
});

test('buildPurchaseId uses the purchase date and a zero-padded daily sequence', () => {
  const gas = loadCode();

  assert.equal(gas.buildPurchaseId(new Date('2026-06-14T10:20:30+09:00'), 1), 'P-20260614-001');
  assert.equal(gas.buildPurchaseId('2026/06/14', 23), 'P-20260614-023');
});

test('mapFormRecord creates a DB row with defaults for first-stage registration', () => {
  const gas = loadCode();
  const record = {
    timestamp: new Date('2026-06-14T09:00:00+09:00'),
    fields: {
      '仕入日': '2026/06/13',
      '店舗名': 'GEO',
      '支払方法': '楽天カード',
      '合計金額': '￥12,345',
      '商品名メモ': 'switch lite グレー',
      '商品写真': ['file-product-1'],
      'レシート写真': ['file-receipt-1'],
      '数量': '',
      '型番': 'HDH-001'
    }
  };

  const row = gas.mapFormRecordToDbRow(record, {
    purchaseId: 'P-20260613-001',
    productPhotoUrls: ['https://drive.google.com/file/d/product/view'],
    receiptPhotoUrls: ['https://drive.google.com/file/d/receipt/view']
  });

  assert.equal(row[0], 'P-20260613-001');
  assert.equal(row[2], '2026/06/13');
  assert.equal(row[3], 'GEO');
  assert.equal(row[5], 12345);
  assert.equal(row[11], 1);
  assert.equal(row[16], 'https://drive.google.com/file/d/product/view');
  assert.equal(row[17], 'https://drive.google.com/file/d/receipt/view');
  assert.equal(row[18], '未確認');
});

test('isUnconfirmedRow catches missing confirmation fields and images', () => {
  const gas = loadCode();
  const headers = gas.DB_HEADERS;
  const confirmed = Array(headers.length).fill('');
  confirmed[headers.indexOf('商品名_確定')] = 'Nintendo Switch Lite グレー';
  confirmed[headers.indexOf('数量')] = 1;
  confirmed[headers.indexOf('単価')] = 12345;
  confirmed[headers.indexOf('商品写真URL')] = 'https://example.com/product';
  confirmed[headers.indexOf('レシート写真URL')] = 'https://example.com/receipt';
  confirmed[headers.indexOf('ステータス')] = '確認済';

  const missingName = confirmed.slice();
  missingName[headers.indexOf('商品名_確定')] = '';
  missingName[headers.indexOf('ステータス')] = '未確認';

  assert.equal(gas.isUnconfirmedRow(confirmed), false);
  assert.equal(gas.isUnconfirmedRow(missingName), true);
});

test('addPhotoInputItem falls back to a URL text field when file upload creation is unavailable', () => {
  const gas = loadCode();
  const calls = [];
  const form = {
    addParagraphTextItem() {
      calls.push('paragraph');
      return {
        setTitle(title) {
          calls.push(['title', title]);
          return this;
        },
        setHelpText(helpText) {
          calls.push(['help', helpText]);
          return this;
        },
        setRequired(required) {
          calls.push(['required', required]);
          return this;
        }
      };
    }
  };

  gas.addPhotoInputItem_(form, '商品写真', '写真を添付してください。');

  assert.equal(calls[0], 'paragraph');
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === 'title'), ['title', '商品写真']);
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === 'required'), ['required', false]);
});
