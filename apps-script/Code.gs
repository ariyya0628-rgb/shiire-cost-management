var TIMEZONE = 'Asia/Tokyo';
var SPREADSHEET_NAME = '仕入原価管理システム';
var FORM_TITLE = '仕入登録フォーム';
var DB_SHEET_NAME = '仕入DB';
var UNCONFIRMED_SHEET_NAME = '未確認リスト';
var DAILY_SUMMARY_SHEET_NAME = '日別集計';
var STORE_SUMMARY_SHEET_NAME = '店舗別集計';
var PAYMENT_SUMMARY_SHEET_NAME = '支払方法別集計';
var SETTINGS_SHEET_NAME = '設定';

var DB_HEADERS = [
  '仕入ID',
  '登録日時',
  '仕入日',
  '店舗名',
  '支払方法',
  '合計金額',
  '商品名メモ',
  '商品名_確定',
  '型番',
  'JAN',
  'ASIN',
  '数量',
  '単価',
  '送料',
  'ポイント利用',
  '実質原価',
  '商品写真URL',
  'レシート写真URL',
  'ステータス',
  '売上紐付けID',
  'メモ'
];

var FORM_FIELD_TITLES = {
  purchaseDate: '仕入日',
  storeName: '店舗名',
  paymentMethod: '支払方法',
  totalAmount: '合計金額',
  productMemo: '商品名メモ',
  productPhoto: '商品写真',
  receiptPhoto: 'レシート写真',
  quantity: '数量',
  modelNumber: '型番',
  jan: 'JAN',
  asin: 'ASIN',
  memo: '備考'
};

function setupPurchaseCostSystem() {
  var spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  setupSheets_(spreadsheet);

  var form = createPurchaseForm_(spreadsheet);
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onPurchaseFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onPurchaseFormSubmit')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();

  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: spreadsheet.getId(),
    FORM_ID: form.getId()
  });

  writeSettings_(spreadsheet, form);

  Logger.log('仕入DB: ' + spreadsheet.getUrl());
  Logger.log('フォーム編集URL: ' + form.getEditUrl());
  Logger.log('フォーム入力URL: ' + form.getPublishedUrl());

  return {
    spreadsheetUrl: spreadsheet.getUrl(),
    formEditUrl: form.getEditUrl(),
    formPublishedUrl: form.getPublishedUrl()
  };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('仕入管理')
    .addItem('シートを再整備', 'refreshPurchaseCostSheets')
    .addToUi();
}

function refreshPurchaseCostSheets() {
  setupSheets_(getSpreadsheet_());
}

function onPurchaseFormSubmit(e) {
  var spreadsheet = getSpreadsheet_();
  setupSheets_(spreadsheet);

  var record = formEventToRecord_(e);
  var purchaseDate = record.fields[FORM_FIELD_TITLES.purchaseDate] || record.timestamp;
  var sequence = getNextDailySequence_(
    spreadsheet.getSheetByName(DB_SHEET_NAME),
    formatDateCompact(purchaseDate)
  );
  var purchaseId = buildPurchaseId(purchaseDate, sequence);

  var row = mapFormRecordToDbRow(record, {
    purchaseId: purchaseId,
    productPhotoUrls: resolveFileUrls_(record.fields[FORM_FIELD_TITLES.productPhoto]),
    receiptPhotoUrls: resolveFileUrls_(record.fields[FORM_FIELD_TITLES.receiptPhoto])
  });

  spreadsheet.getSheetByName(DB_SHEET_NAME).appendRow(row);
}

function setupSheets_(spreadsheet) {
  var dbSheet = getOrCreateSheet_(spreadsheet, DB_SHEET_NAME);
  ensureHeaderRow_(dbSheet, DB_HEADERS);
  dbSheet.setFrozenRows(1);
  dbSheet.getRange(1, 1, 1, DB_HEADERS.length).setFontWeight('bold');
  dbSheet.autoResizeColumns(1, DB_HEADERS.length);

  setupUnconfirmedSheet_(spreadsheet);
  setupDailySummarySheet_(spreadsheet);
  setupStoreSummarySheet_(spreadsheet);
  setupPaymentSummarySheet_(spreadsheet);
  setupSettingsSheet_(spreadsheet);
}

function createPurchaseForm_(spreadsheet) {
  var form = FormApp.create(FORM_TITLE);
  form.setDescription('仕入れ直後、またはその日の最後にスマホから登録するためのフォームです。商品名メモは音声入力の雑なメモで問題ありません。');
  form.setCollectEmail(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  form.addDateItem()
    .setTitle(FORM_FIELD_TITLES.purchaseDate)
    .setHelpText('空欄の場合は登録日を仕入日として扱います。')
    .setRequired(false);
  form.addTextItem()
    .setTitle(FORM_FIELD_TITLES.storeName)
    .setHelpText('例: GEO、ハードオフ、Amazon')
    .setRequired(true);
  form.addTextItem()
    .setTitle(FORM_FIELD_TITLES.totalAmount)
    .setHelpText('例: 12345。円やカンマ付きでも登録できます。')
    .setRequired(true);
  form.addParagraphTextItem()
    .setTitle(FORM_FIELD_TITLES.productMemo)
    .setHelpText('音声入力で十分です。例: switch lite グレー 本体のみ')
    .setRequired(true);
  addPhotoInputItem_(
    form,
    FORM_FIELD_TITLES.productPhoto,
    '仕入れた商品が分かる写真を添付してください。自動作成でファイルアップロード欄にできない場合は、フォーム編集画面でこの質問を手動でファイルアップロードに置き換えてください。'
  );
  addPhotoInputItem_(
    form,
    FORM_FIELD_TITLES.receiptPhoto,
    'レシート、納品書、注文画面などを添付してください。自動作成でファイルアップロード欄にできない場合は、フォーム編集画面でこの質問を手動でファイルアップロードに置き換えてください。'
  );
  form.addListItem()
    .setTitle(FORM_FIELD_TITLES.paymentMethod)
    .setChoiceValues(['未選択', '現金', '楽天カード', 'PayPayカード', 'クレジットカード', 'PayPay', '銀行振込', 'その他'])
    .setRequired(false);
  form.addTextItem()
    .setTitle(FORM_FIELD_TITLES.quantity)
    .setHelpText('空欄なら1として登録します。')
    .setRequired(false);
  form.addTextItem()
    .setTitle(FORM_FIELD_TITLES.modelNumber)
    .setRequired(false);
  form.addTextItem()
    .setTitle(FORM_FIELD_TITLES.jan)
    .setRequired(false);
  form.addTextItem()
    .setTitle(FORM_FIELD_TITLES.asin)
    .setRequired(false);
  form.addParagraphTextItem()
    .setTitle(FORM_FIELD_TITLES.memo)
    .setRequired(false);

  return form;
}

function addPhotoInputItem_(form, title, helpText) {
  if (typeof form.addFileUploadItem === 'function') {
    return form.addFileUploadItem()
      .setTitle(title)
      .setHelpText(helpText)
      .setRequired(true);
  }

  return form.addParagraphTextItem()
    .setTitle(title)
    .setHelpText(helpText + '\nファイルアップロード項目を手動追加するまでは、Drive URLを貼り付けても登録できます。')
    .setRequired(false);
}

function mapFormRecordToDbRow(record, options) {
  var fields = record.fields || {};
  var purchaseDate = fields[FORM_FIELD_TITLES.purchaseDate] || record.timestamp;
  var quantity = normalizeAmount(fields[FORM_FIELD_TITLES.quantity]);
  if (quantity === '') {
    quantity = 1;
  }

  return [
    options.purchaseId,
    formatDateTime(record.timestamp),
    formatDateOnly(purchaseDate),
    valueOrBlank_(fields[FORM_FIELD_TITLES.storeName]),
    valueOrBlank_(fields[FORM_FIELD_TITLES.paymentMethod]),
    normalizeAmount(fields[FORM_FIELD_TITLES.totalAmount]),
    valueOrBlank_(fields[FORM_FIELD_TITLES.productMemo]),
    '',
    valueOrBlank_(fields[FORM_FIELD_TITLES.modelNumber]),
    valueOrBlank_(fields[FORM_FIELD_TITLES.jan]),
    valueOrBlank_(fields[FORM_FIELD_TITLES.asin]),
    quantity,
    '',
    '',
    '',
    '',
    joinUrls_(options.productPhotoUrls),
    joinUrls_(options.receiptPhotoUrls),
    '未確認',
    '',
    valueOrBlank_(fields[FORM_FIELD_TITLES.memo])
  ];
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  var text = String(value).replace(/[￥¥円,\s]/g, '');
  var normalized = text.replace(/[^\d.-]/g, '');
  if (normalized === '' || normalized === '-' || normalized === '.') {
    return '';
  }
  var numberValue = Number(normalized);
  return isNaN(numberValue) ? '' : numberValue;
}

function buildPurchaseId(purchaseDate, sequence) {
  return 'P-' + formatDateCompact(purchaseDate) + '-' + zeroPad_(sequence, 3);
}

function isUnconfirmedRow(row) {
  if (!row || row.length === 0) {
    return false;
  }
  return (
    valueOrBlank_(row[DB_HEADERS.indexOf('ステータス')]) === '未確認' ||
    valueOrBlank_(row[DB_HEADERS.indexOf('商品名_確定')]) === '' ||
    valueOrBlank_(row[DB_HEADERS.indexOf('数量')]) === '' ||
    valueOrBlank_(row[DB_HEADERS.indexOf('単価')]) === '' ||
    valueOrBlank_(row[DB_HEADERS.indexOf('商品写真URL')]) === '' ||
    valueOrBlank_(row[DB_HEADERS.indexOf('レシート写真URL')]) === ''
  );
}

function formEventToRecord_(e) {
  var namedValues = (e && e.namedValues) || {};
  return {
    timestamp: extractTimestamp_(e),
    fields: {
      '仕入日': extractField_(namedValues, '仕入日'),
      '店舗名': extractField_(namedValues, '店舗名'),
      '支払方法': extractField_(namedValues, '支払方法'),
      '合計金額': extractField_(namedValues, '合計金額'),
      '商品名メモ': extractField_(namedValues, '商品名メモ'),
      '商品写真': extractField_(namedValues, '商品写真'),
      'レシート写真': extractField_(namedValues, 'レシート写真'),
      '数量': extractField_(namedValues, '数量'),
      '型番': extractField_(namedValues, '型番'),
      'JAN': extractField_(namedValues, 'JAN'),
      'ASIN': extractField_(namedValues, 'ASIN'),
      '備考': extractField_(namedValues, '備考')
    }
  };
}

function extractTimestamp_(e) {
  if (e && e.namedValues && e.namedValues['タイムスタンプ']) {
    return extractField_(e.namedValues, 'タイムスタンプ');
  }
  if (e && e.namedValues && e.namedValues['Timestamp']) {
    return extractField_(e.namedValues, 'Timestamp');
  }
  return new Date();
}

function extractField_(namedValues, title) {
  var value = namedValues[title];
  if (Array.isArray(value)) {
    if (value.length === 1) {
      return value[0];
    }
    return value;
  }
  return value || '';
}

function resolveFileUrls_(value) {
  var values = flattenValues_(value);
  var urls = [];
  for (var i = 0; i < values.length; i++) {
    var url = resolveFileUrl_(values[i]);
    if (url) {
      urls.push(url);
    }
  }
  return urls;
}

function resolveFileUrl_(value) {
  var text = valueOrBlank_(value);
  if (text === '') {
    return '';
  }
  if (/^https?:\/\//.test(text)) {
    return text;
  }
  var fileId = extractDriveFileId_(text);
  if (fileId && typeof DriveApp !== 'undefined') {
    try {
      return DriveApp.getFileById(fileId).getUrl();
    } catch (error) {
      return text;
    }
  }
  return text;
}

function extractDriveFileId_(value) {
  var text = valueOrBlank_(value);
  var fileMatch = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return fileMatch[1];
  }
  var idMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return idMatch[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) {
    return text;
  }
  return '';
}

function getNextDailySequence_(dbSheet, compactDate) {
  var lastRow = dbSheet.getLastRow();
  if (lastRow < 2) {
    return 1;
  }
  var ids = dbSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var prefix = 'P-' + compactDate + '-';
  var maxSequence = 0;
  for (var i = 0; i < ids.length; i++) {
    var id = valueOrBlank_(ids[i][0]);
    if (id.indexOf(prefix) === 0) {
      var sequence = Number(id.substring(prefix.length));
      if (!isNaN(sequence) && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  }
  return maxSequence + 1;
}

function setupUnconfirmedSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, UNCONFIRMED_SHEET_NAME);
  ensureHeaderRow_(sheet, DB_HEADERS);
  sheet.getRange(2, 1).setFormula(
    '=IFERROR(FILTER(\'' + DB_SHEET_NAME + '\'!A2:U,(\'' + DB_SHEET_NAME + '\'!S2:S="未確認")+(LEN(\'' + DB_SHEET_NAME + '\'!H2:H)=0)+(LEN(\'' + DB_SHEET_NAME + '\'!L2:L)=0)+(LEN(\'' + DB_SHEET_NAME + '\'!M2:M)=0)+(LEN(\'' + DB_SHEET_NAME + '\'!Q2:Q)=0)+(LEN(\'' + DB_SHEET_NAME + '\'!R2:R)=0)),"未確認の行はありません")'
  );
  sheet.setFrozenRows(1);
}

function setupDailySummarySheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, DAILY_SUMMARY_SHEET_NAME);
  sheet.getRange(1, 1).setFormula(
    '=QUERY(\'' + DB_SHEET_NAME + '\'!A2:F,"select C, count(A), sum(F) where C is not null group by C order by C desc label C \'仕入日\', count(A) \'仕入件数\', sum(F) \'仕入合計金額\'",0)'
  );
}

function setupStoreSummarySheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, STORE_SUMMARY_SHEET_NAME);
  sheet.getRange(1, 1).setFormula(
    '=QUERY(\'' + DB_SHEET_NAME + '\'!A2:F,"select D, count(A), sum(F) where D is not null group by D order by sum(F) desc label D \'店舗名\', count(A) \'件数\', sum(F) \'合計金額\'",0)'
  );
}

function setupPaymentSummarySheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, PAYMENT_SUMMARY_SHEET_NAME);
  sheet.getRange(1, 1).setFormula(
    '=QUERY(\'' + DB_SHEET_NAME + '\'!A2:F,"select E, count(A), sum(F) where E is not null group by E order by sum(F) desc label E \'支払方法\', count(A) \'件数\', sum(F) \'合計金額\'",0)'
  );
}

function setupSettingsSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, SETTINGS_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 2).setValues([['項目', '値']]);
  }
}

function writeSettings_(spreadsheet, form) {
  var sheet = getOrCreateSheet_(spreadsheet, SETTINGS_SHEET_NAME);
  sheet.getRange(1, 1, 4, 2).setValues([
    ['項目', '値'],
    ['フォーム入力URL', form.getPublishedUrl()],
    ['フォーム編集URL', form.getEditUrl()],
    ['仕入DB URL', spreadsheet.getUrl()]
  ]);
  sheet.autoResizeColumns(1, 2);
}

function getSpreadsheet_() {
  var spreadsheetId = '';
  if (typeof PropertiesService !== 'undefined') {
    spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  }
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeaderRow_(sheet, headers) {
  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeader = existing.join('') !== '';
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function formatDateOnly(value) {
  if (!value) {
    return '';
  }
  var normalized = normalizedDateParts_(value);
  if (normalized) {
    return normalized.year + '/' + zeroPad_(normalized.month, 2) + '/' + zeroPad_(normalized.day, 2);
  }
  return formatDateWithPattern_(value, 'yyyy/MM/dd');
}

function formatDateCompact(value) {
  if (!value) {
    return '';
  }
  var normalized = normalizedDateParts_(value);
  if (normalized) {
    return String(normalized.year) + zeroPad_(normalized.month, 2) + zeroPad_(normalized.day, 2);
  }
  return formatDateWithPattern_(value, 'yyyyMMdd');
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  return formatDateWithPattern_(value, 'yyyy/MM/dd HH:mm:ss');
}

function formatDateWithPattern_(value, pattern) {
  var date = value instanceof Date ? value : new Date(value);
  if (typeof Utilities !== 'undefined') {
    return Utilities.formatDate(date, TIMEZONE, pattern);
  }
  if (pattern === 'yyyyMMdd') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date).replace(/-/g, '');
  }
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  var map = {};
  for (var i = 0; i < parts.length; i++) {
    map[parts[i].type] = parts[i].value;
  }
  if (pattern === 'yyyy/MM/dd HH:mm:ss') {
    return map.year + '/' + map.month + '/' + map.day + ' ' + map.hour + ':' + map.minute + ':' + map.second;
  }
  return map.year + '/' + map.month + '/' + map.day;
}

function normalizedDateParts_(value) {
  if (value instanceof Date) {
    return null;
  }
  var match = String(value).match(/^(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function flattenValues_(value) {
  if (value === null || value === undefined || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    var flattened = [];
    for (var i = 0; i < value.length; i++) {
      flattened = flattened.concat(flattenValues_(value[i]));
    }
    return flattened;
  }
  return String(value).split(/\s*,\s*/).filter(function(item) {
    return item !== '';
  });
}

function joinUrls_(value) {
  var urls = flattenValues_(value);
  return urls.join('\n');
}

function valueOrBlank_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  return String(value).trim();
}

function zeroPad_(value, length) {
  var text = String(value);
  while (text.length < length) {
    text = '0' + text;
  }
  return text;
}
