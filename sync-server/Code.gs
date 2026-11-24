/* Poker OS Trainer · 클라우드 동기화 Apps Script 백엔드 (2026-11-24 배포본)
 * 재배포 방법: Google 계정(joy8612@gmail.com)으로 script.google.com → 새 프로젝트 → 이 파일 전체를 Code.gs 에 붙여넣고 저장
 *   → 배포 > 새 배포 > 유형 "웹 앱" > 실행 계정 "나" > 액세스 권한 "모든 사용자" > 배포 후 /exec URL 복사
 *   → sync.js 의 CFG.endpoint/token 을 이 파일의 SYNC_TOKEN 과 배포 URL 에 맞춘다.
 * 저장 위치: Drive 의 poker_os_trainer_sync.json(핫) · poker_os_trainer_archive.json(콜드)
 */

/**
 * Poker OS Trainer · 클라우드 동기화 백엔드 (Google Apps Script 웹앱)
 *  - Drive JSON 2개: poker_os_trainer_sync.json (핫: 최근 핸드·원장·학습/설정), poker_os_trainer_archive.json (콜드: 전체 핸드 아카이브)
 *  - doGet  : action=pull | archive | stats
 *  - doPost : action=push (text/plain JSON 본문 → CORS preflight 회피) | archive
 *  - 병합은 서버에서도 합집합(dedup)이라 어느 기기가 늦게 올려도 기존 기록이 지워지지 않는다.
 */

var SYNC_TOKEN = '0834b2775a79610fe81dfe723c8a57f0a340b59bd459a81c';
var HOT_FILE = 'poker_os_trainer_sync.json';
var ARC_FILE = 'poker_os_trainer_archive.json';
var HAND_CAP = 600;
var LEDGER_CAP = 30000;
var ARCHIVE_CAP = 4000;

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fileHandle(name) {
  var it = DriveApp.getFilesByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFile(name, JSON.stringify({ version: 1, rev: 0, updatedAt: '', keys: {}, hands: [], ledger: [], archive: [] }), MimeType.PLAIN_TEXT);
}

function readDoc(name) {
  try {
    var f = fileHandle(name);
    var txt = f.getBlob().getDataAsString();
    var d = JSON.parse(txt || '{}');
    d.keys = d.keys || {};
    d.hands = d.hands || [];
    d.ledger = d.ledger || [];
    d.archive = d.archive || [];
    d.rev = Number(d.rev) || 0;
    return d;
  } catch (e) {
    return { version: 1, rev: 0, updatedAt: '', keys: {}, hands: [], ledger: [], archive: [] };
  }
}

function writeDoc(name, d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var f = fileHandle(name);
    d.version = 1;
    d.updatedAt = new Date().toISOString();
    d.rev = (Number(d.rev) || 0) + 1;
    f.setContent(JSON.stringify(d));
    return d;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handKey(h) {
  return [h.savedAt || '', h.handNo == null ? '' : h.handNo, h.position || '', h.hole || ''].join('|');
}
function ledgerKey(r) {
  return [r.t || '', r.sid || '', r.pl == null ? '' : r.pl, r.hn == null ? '' : r.hn].join('|');
}

function mergeHands(base, inc, cap) {
  var seen = {};
  var out = [];
  var add = function (h) {
    if (!h || typeof h !== 'object') return;
    var k = handKey(h);
    if (seen[k]) return;
    seen[k] = 1;
    out.push(h);
  };
  (base || []).forEach(add);
  (inc || []).forEach(add);
  out.sort(function (a, b) {
    var x = String(a.savedAt || ''), y = String(b.savedAt || '');
    if (x !== y) return x < y ? -1 : 1;
    return (a.handNo || 0) - (b.handNo || 0);
  });
  if (out.length > cap) out = out.slice(-cap);
  return out;
}

function mergeRows(base, inc, cap) {
  var seen = {};
  var out = [];
  var add = function (r) {
    if (!r || typeof r !== 'object') return;
    var k = ledgerKey(r);
    if (seen[k]) return;
    seen[k] = 1;
    out.push(r);
  };
  (base || []).forEach(add);
  (inc || []).forEach(add);
  if (out.length > cap) out = out.slice(-cap);
  return out;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (String(p.token || '') !== SYNC_TOKEN) return jsonOut({ ok: false, error: 'bad_token' });
  var action = String(p.action || 'pull');

  if (action === 'pull') {
    var d = readDoc(HOT_FILE);
    var since = String(p.since || '');
    var hands = since ? d.hands.filter(function (h) { return String(h.savedAt || '') > since; }) : d.hands;
    var ledger = since ? d.ledger.filter(function (r) { return String(r.t || '') > since; }) : d.ledger;
    return jsonOut({
      ok: true, rev: d.rev, updatedAt: d.updatedAt, since: since,
      hands: hands, ledger: ledger, keys: d.keys,
      counts: { hands: d.hands.length, ledger: d.ledger.length }
    });
  }

  if (action === 'archive') {
    var a = readDoc(ARC_FILE);
    var sinceA = String(p.since || '');
    var lim = Math.max(1, Math.min(500, Number(p.limit) || 250));
    var list = a.archive.filter(function (h) { return String(h.savedAt || '') > sinceA; });
    list.sort(function (x, y) {
      var m = String(x.savedAt || ''), n = String(y.savedAt || '');
      return m < n ? -1 : m > n ? 1 : (x.handNo || 0) - (y.handNo || 0);
    });
    var page = list.slice(0, lim);
    return jsonOut({
      ok: true, hands: page,
      nextSince: page.length ? String(page[page.length - 1].savedAt || '') : sinceA,
      remaining: Math.max(0, list.length - page.length),
      total: a.archive.length, rev: a.rev
    });
  }

  if (action === 'stats') {
    var hot = readDoc(HOT_FILE), arc = readDoc(ARC_FILE);
    return jsonOut({ ok: true, rev: hot.rev, updatedAt: hot.updatedAt, archiveRev: arc.rev,
      counts: { hands: hot.hands.length, ledger: hot.ledger.length, archive: arc.archive.length, keys: Object.keys(hot.keys || {}).length } });
  }

  return jsonOut({ ok: false, error: 'bad_action' });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return jsonOut({ ok: false, error: 'bad_json' }); }
  if (String(body.token || '') !== SYNC_TOKEN) return jsonOut({ ok: false, error: 'bad_token' });
  var action = String(body.action || 'push');

  if (action === 'archive') {
    var a = readDoc(ARC_FILE);
    a.archive = mergeHands(a.archive, body.hands || [], ARCHIVE_CAP);
    var w = writeDoc(ARC_FILE, a);
    return jsonOut({ ok: true, rev: w.rev, total: w.archive.length });
  }

  if (action !== 'push') return jsonOut({ ok: false, error: 'bad_action' });

  var d = readDoc(HOT_FILE);
  d.hands = mergeHands(d.hands, body.hands || [], HAND_CAP);
  d.ledger = mergeRows(d.ledger, body.ledger || [], LEDGER_CAP);
  var keys = body.keys || {};
  var touched = 0;
  for (var k in keys) {
    if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
    var inc = keys[k] || {};
    var cur = d.keys[k];
    if (!cur || Number(inc.t || 0) >= Number(cur.t || 0)) {
      d.keys[k] = { v: inc.v, t: Number(inc.t || 0) || Date.now() };
      touched++;
    }
  }
  var w2 = writeDoc(HOT_FILE, d);
  return jsonOut({ ok: true, rev: w2.rev, updatedAt: w2.updatedAt, keys: touched,
    counts: { hands: w2.hands.length, ledger: w2.ledger.length } });
}

function selftest() {
  var r = doGet({ parameter: { token: SYNC_TOKEN, action: 'stats' } });
  Logger.log(r.getContent());
}
