/* Poker OS Trainer · 클라우드 자동 동기화 (2026-11-24)
 * 백엔드: Google Apps Script 웹앱 + Google Drive JSON
 *  - PC·휴대폰 어느 브라우저에서 열어도 핸드·원장·세션·약점/단골 학습 기록이 이어집니다.
 *  - 기록은 합집합(dedup) 병합이라 이미 쌓인 기록이 빈 클라우드로 덮여 사라지지 않습니다.
 *  - 설정/학습 프로필은 최신값 또는 큰 값(카운터 최대) 병합을 씁니다.
 *
 * 이 파일은 index.html / report.html 이 <head>에서 함께 불러 씁니다.
 * 동기화를 끄려면 CFG.endpoint 를 빈 문자열로 두면 됩니다(앱은 평소처럼 로컬로 동작).
 */
(function () {
  'use strict';

  var CFG = {
    endpoint: 'https://script.google.com/macros/s/AKfycbww1Dq6vnHyDY8ypbhrD20oStTo17KxXicS6sIt7ktVYAS5i-8jLN0P1XCUEJplreyiYA/exec',
    token: '0834b2775a79610fe81dfe723c8a57f0a340b59bd459a81c',
    handCap: 600,            // 클라우드에 보관하는 최근 핸드 수
    ledgerCap: 30000,        // 손익 원장 최대 행 (앱과 동일)
    debounceMs: 2000,        // 기록 변경 후 자동 저장까지 대기
    pollMs: 90000,           // 화면을 보고 있을 때 클라우드 확인 주기
    overlapMs: 180000,       // 시계 오차 대비 겹쳐 읽기
    reloadTag: 'pokerSyncReload'
  };

  var K = {
    session: 'kangwon_limit_holdem_trainer_active_session_v30',
    historyLegacy: 'kangwon_limit_holdem_trainer_history_v30',
    history: 'poker_os_history_v5_lzw1',
    training: 'kangwon_limit_holdem_training_profile_v30',
    leaks: 'poker_os_leaks_v1',
    solver: 'poker_os_solver_learning_v2',
    regular: 'poker_os_regular_memory_v1',
    ledger: 'poker_os_pl_ledger_v1',
    coach: 'poker_os_coach_v1',
    buyin: 'poker_os_hero_buyin_v1',
    potguard: 'poker_os_potguard_v1',
    real: 'poker_os_real_sessions_v1',
    prefs: 'poker_os_report_prefs_v1',
    fieldobs: 'poker_os_field_obs_v1'
  };
  var META_KEY = 'poker_os_sync_meta_v1';
  var BACKUP_KEY = 'poker_os_sync_backup_v1';

  // name -> {ls: localStorage 키, mode: max|last|union|session}
  var SCALARS = {
    leaks: { ls: K.leaks, mode: 'max' },
    solver: { ls: K.solver, mode: 'max' },
    regular: { ls: K.regular, mode: 'max' },
    training: { ls: K.training, mode: 'max' },
    buyin: { ls: K.buyin, mode: 'max' },
    potguard: { ls: K.potguard, mode: 'last' },
    prefs: { ls: K.prefs, mode: 'last' },
    real: { ls: K.real, mode: 'union' },
    fieldobs: { ls: K.fieldobs, mode: 'union' }
  };

  var meta = loadMeta();
  var suppress = false;
  var timer = null, busy = false, pollTimer = null;
  var lastResult = '';
  var ui = null;

  // ---------- 저장소 도우미 ----------
  function loadMeta() {
    try {
      var m = JSON.parse(localStorage.getItem(META_KEY) || 'null') || {};
      m.t = m.t || {}; m.pushed = m.pushed || {};
      return m;
    } catch (e) { return { t: {}, pushed: {} }; }
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  function readRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function readJSON(k) { try { var r = localStorage.getItem(k); return r === null ? undefined : JSON.parse(r); } catch (e) { return undefined; } }
  function parseMaybe(raw) {
    if (raw === null || raw === undefined) return undefined;
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }
  function writeRaw(k, v) {
    suppress = true;
    try { localStorage.setItem(k, v); } catch (e) { suppress = false; return false; }
    suppress = false;
    return true;
  }
  function isSyncedKey(k) {
    if (k === K.history || k === K.ledger || k === K.session) return true;
    for (var n in SCALARS) { if (SCALARS[n].ls === k) return true; }
    return false;
  }
  function nowMs() { return Date.now(); }
  function isoMinus(iso, ms) {
    var t = Date.parse(iso || '');
    if (!isFinite(t)) return '';
    return new Date(t - ms).toISOString();
  }

  // ---------- 레코드 키 (앱의 가져오기 로직과 동일) ----------
  function handKey(h) {
    return (h.savedAt || '') + '|' + (h.handNo == null ? '' : h.handNo) + '|' + (h.position || '') + '|' + (h.hole || '');
  }
  function ledgerKey(r) {
    return (r.t || '') + '|' + (r.sid || '') + '|' + (r.pl == null ? '' : r.pl) + '|' + (r.hn == null ? '' : r.hn);
  }
  function bySavedAt(a, b) {
    return String(a.savedAt || '').localeCompare(String(b.savedAt || '')) || ((a.handNo || 0) - (b.handNo || 0));
  }
  function byT(a, b) { return String(a.t || '').localeCompare(String(b.t || '')); }

  function unionBy(base, inc, keyFn, sortFn, cap) {
    var seen = new Set(), out = [];
    var push = function (x) {
      if (!x || typeof x !== 'object') return;
      var k = keyFn(x);
      if (seen.has(k)) return;
      seen.add(k); out.push(x);
    };
    (base || []).forEach(push);
    (inc || []).forEach(push);
    out.sort(sortFn);
    if (cap && out.length > cap) out = out.slice(-cap);
    return out;
  }

  // 카운터 중심 객체 병합: 숫자는 큰 값, 배열은 합집합, 객체는 재귀, 나머지는 새 값
  function deepMax(a, b, depth) {
    depth = depth || 0;
    if (a === undefined || a === null) return b;
    if (b === undefined || b === null) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
      var seen = new Set(), out = [];
      a.concat(b).forEach(function (x) {
        var s = typeof x === 'string' ? x : JSON.stringify(x);
        if (seen.has(s)) return;
        seen.add(s); out.push(x);
      });
      return out.length > 200 ? out.slice(-200) : out;
    }
    if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      var out2 = {}, k;
      for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out2[k] = a[k];
      for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out2[k] = deepMax(a[k], b[k], depth + 1);
      return out2;
    }
    if (typeof a === 'number' && typeof b === 'number') {
      if (isFinite(a) && isFinite(b)) return Math.max(a, b);
      return b;
    }
    return b;
  }

  // ---------- IndexedDB 누적 아카이브 (앱 v6.12와 같은 DB/스토어/키) ----------
  var IDB_NAME = 'poker_os_archive_v1', IDB_STORE = 'hands', idbP = null;
  function idbKey(h) {
    return (h.sessionId || 'nosession') + '|' + (h.handNo != null ? h.handNo : (h.savedAt || '')) + (h.sessionId ? '' : '|' + (h.savedAt || '') + '|' + (h.hole || ''));
  }
  function idbOpen() {
    if (idbP) return idbP;
    idbP = new Promise(function (res, rej) {
      try {
        var r = indexedDB.open(IDB_NAME, 1);
        r.onupgradeneeded = function () {
          var db = r.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'k' });
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
    idbP.catch(function () { idbP = null; });
    return idbP;
  }
  function idbPut(list) {
    if (!list || !list.length) return Promise.resolve(0);
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, 'readwrite'), st = tx.objectStore(IDB_STORE);
        list.forEach(function (h) { if (h && typeof h === 'object') st.put({ k: idbKey(h), h: h }); });
        tx.oncomplete = function () { res(list.length); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function () { return 0; });
  }
  function idbAll() {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE), st = tx.objectStore(IDB_STORE);
        if (st.getAll) {
          var rq = st.getAll();
          rq.onsuccess = function () {
            var out = (rq.result || []).map(function (x) { return x.h; }).filter(Boolean);
            out.sort(bySavedAt); res(out);
          };
          rq.onerror = function () { rej(rq.error); };
          return;
        }
        var out2 = [], cur = st.openCursor();
        cur.onsuccess = function () { var c = cur.result; if (c) { out2.push(c.value.h); c.continue(); } else { out2.sort(bySavedAt); res(out2); } };
        cur.onerror = function () { rej(cur.error); };
      });
    }).catch(function () { return []; });
  }
  function idbCount() { return idbAll().then(function (a) { return a.length; }); }

  // ---------- 네트워크 ----------
  function enabled() { return !!(CFG.endpoint && CFG.token); }
  function url(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : params[k]);
    }).join('&');
    return CFG.endpoint + (CFG.endpoint.indexOf('?') >= 0 ? '&' : '?') + q;
  }
  function get(params) {
    return fetch(url(params), { cache: 'no-store', redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function post(body) {
    return fetch(CFG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // ---------- 병합 ----------
  function cloudHandsSnapshot() { return readJSON(K.history); }

  function mergeHandsIntoLocal(cloudHands, stats) {
    if (!cloudHands || !cloudHands.length) return;
    var local = [];
    var failed = false;
    try {
      var raw = readRaw(K.history);
      var dec = window.PokerOSDebug && PokerOSDebug.archiveDecode;
      if (raw !== null) {
        local = JSON.parse(dec ? dec(raw) : raw) || [];
        if (!Array.isArray(local)) local = [];
      }
    } catch (e) { failed = true; local = []; }
    if (failed) { idbPut(cloudHands); return; }   // 로컬 기록을 읽지 못했으면 건드리지 않는다(보존 우선)
    var merged = unionBy(local, cloudHands, handKey, bySavedAt, 0);
    var added = merged.length - local.length;
    if (added > 0 || (merged.length && JSON.stringify(merged.map(handKey)) !== JSON.stringify(local.map(handKey)))) {
      var enc = window.PokerOSDebug && PokerOSDebug.archiveEncode;
      var payload = JSON.stringify(merged.slice(-500));
      writeRaw(K.history, enc ? enc(payload) : payload);
      stats.hands += Math.max(0, added);
    }
    idbPut(merged);
  }

  function mergeLedgerIntoLocal(cloudRows, stats) {
    if (!cloudRows || !cloudRows.length) return;
    var local = readJSON(K.ledger);
    if (!Array.isArray(local)) local = [];
    var merged = unionBy(local, cloudRows, ledgerKey, byT, CFG.ledgerCap);
    if (merged.length !== local.length) {
      writeRaw(K.ledger, JSON.stringify(merged));
      stats.ledger += Math.max(0, merged.length - local.length);
    }
  }

  function unionArrayLocal(localV, cloudV, keyFn) {
    var a = Array.isArray(localV) ? localV : [];
    var b = Array.isArray(cloudV) ? cloudV : [];
    return unionBy(a, b, keyFn, function (x, y) { return 0; }, 0);
  }

  function applyScalar(name, entry, stats, force) {
    var def = SCALARS[name];
    if (!def || !entry || !Object.prototype.hasOwnProperty.call(entry, 'v')) return;
    var cloudV = entry.v, cloudT = Number(entry.t) || 0;
    var raw = readRaw(def.ls);
    var localV = parseMaybe(raw);
    var localT = Number(meta.t[name]) || 0;
    var out, changed = false;

    if (raw === null || localV === undefined) {
      out = cloudV; changed = (raw === null);
    } else if (def.mode === 'max') {
      out = deepMax(localV, cloudV);
      changed = JSON.stringify(out) !== JSON.stringify(localV) && JSON.stringify(out) !== raw;
    } else if (def.mode === 'union') {
      out = unionArrayLocal(localV, cloudV, function (x) {
        return x && (x.id || [x.date, x.limit, x.hours, x.pl].join('|'));
      });
      changed = JSON.stringify(out) !== JSON.stringify(localV);
    } else { // last
      if (force || cloudT > localT) { out = cloudV; changed = JSON.stringify(out) !== JSON.stringify(localV); }
      else out = localV;
    }
    if (changed) {
      writeRaw(def.ls, typeof out === 'string' ? out : JSON.stringify(out));
      stats.keys.push(name);
    }
    if (cloudT > localT) { meta.t[name] = cloudT; }
  }

  function applySession(entry, stats) {
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, 'v')) return;
    var cloud = entry.v;
    if (!cloud || !cloud.state) return;
    var local = readJSON(K.session);
    var localSaved = local && local.savedAt ? Date.parse(local.savedAt) : 0;
    var cloudSaved = cloud.savedAt ? Date.parse(cloud.savedAt) : 0;
    var localActive = !!(local && local.state && !local.state.sessionEnded);
    var appActive = false;
    try { appActive = !!(typeof S !== 'undefined' && S && !S.sessionEnded && !S.sessionEnded); } catch (e) {}
    if (appActive || localActive) return;            // 진행 중인 세션은 절대 덮어쓰지 않는다
    if (cloudSaved > localSaved) {
      writeRaw(K.session, JSON.stringify(cloud));
      stats.session = true;
    }
  }

  function mergePull(res, opts) {
    opts = opts || {};
    var stats = { hands: 0, ledger: 0, keys: [], session: false };
    var d = res || {};
    if (d.hands) mergeHandsIntoLocal(d.hands, stats);
    if (d.ledger) mergeLedgerIntoLocal(d.ledger, stats);
    var keys = d.keys || {};
    Object.keys(SCALARS).forEach(function (n) { if (keys[n]) applyScalar(n, keys[n], stats, !!opts.force); });
    if (keys.session) applySession(keys.session, stats);
    saveMeta();
    return stats;
  }

  function statsChanged(st) {
    return !!(st && (st.hands || st.ledger || st.session || (st.keys && st.keys.length)));
  }

  // ---------- 로컬 → 클라우드 ----------
  function localPushPayload(force) {
    var since = force ? '' : (meta.pushCursor || '');
    var hands = cloudHandsSnapshot();
    if (!Array.isArray(hands)) hands = [];
    if (since) hands = hands.filter(function (h) { return String(h.savedAt || '') > since; });

    var ledger = readJSON(K.ledger);
    if (!Array.isArray(ledger)) ledger = [];
    if (since) ledger = ledger.filter(function (r) { return String(r.t || '') > since; });

    var keys = {};
    Object.keys(SCALARS).forEach(function (n) {
      var def = SCALARS[n];
      var raw = readRaw(def.ls);
      if (raw === null) return;
      var v = parseMaybe(raw);
      var sig = typeof v === 'string' ? v : JSON.stringify(v);
      if (!force && meta.pushed[n] === sig) return;
      keys[n] = { v: v, t: force ? nowMs() : (Number(meta.t[n]) || nowMs()) };
    });
    var sessRaw = readRaw(K.session);
    if (sessRaw !== null) {
      var sess = parseMaybe(sessRaw);
      var sig2 = typeof sess === 'string' ? sess : JSON.stringify(sess);
      if (force || meta.pushed.session !== sig2) keys.session = { v: sess, t: force ? nowMs() : (Number(meta.t.session) || nowMs()) };
    }
    return { hands: hands, ledger: ledger, keys: keys, empty: !hands.length && !ledger.length && !Object.keys(keys).length };
  }

  function pushOnce(force) {
    var p = localPushPayload(force);
    if (p.empty) return Promise.resolve({ sent: 0, skipped: true });   // 보낼 것이 없으면 쓰기 요청을 만들지 않는다
    var body = { token: CFG.token, action: 'push', source: navigator.userAgent.slice(0, 120), hands: p.hands, ledger: p.ledger, keys: p.keys };
    var size = JSON.stringify(body).length;
    return post(body).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'push failed');
      var nowIso = new Date().toISOString();
      meta.pushCursor = isoMinus(nowIso, CFG.overlapMs);
      meta.lastPush = nowIso;
      Object.keys(p.keys).forEach(function (n) {
        var v = p.keys[n].v;
        meta.pushed[n] = typeof v === 'string' ? v : JSON.stringify(v);
        meta.t[n] = Math.max(Number(meta.t[n]) || 0, Number(p.keys[n].t) || 0);
      });
      saveMeta();
      return { sent: p.hands.length + p.ledger.length, size: size, counts: res.counts, rev: res.rev };
    });
  }

  // ---------- 한 번 동기화 ----------
  function syncOnce(opts) {
    opts = opts || {};
    if (!enabled()) { setStatus('off', '동기화 꺼짐'); return Promise.resolve(null); }
    if (busy) return Promise.resolve(null);
    busy = true;
    setStatus('syncing', '동기화 중…');
    var since = opts.full ? '' : (meta.pullCursor || '');
    var pullP = opts.pushOnly ? Promise.resolve(null) : get({ action: 'pull', token: CFG.token, since: since }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'pull failed');
      meta.pullCursor = isoMinus(res.updatedAt || new Date().toISOString(), CFG.overlapMs);
      meta.cloudRev = res.rev;
      var st = mergePull(res, { force: !!opts.force });
      if (st.session && !opts.silentReload) reloadOnce('session');
      else if (statsChanged(st) && !opts.noRender) refreshApp();
      return st;
    });
    return pullP.then(function (st) {
      return pushOnce(!!opts.force).then(function (pr) { return { pull: st, push: pr }; });
    }).then(function (r) {
      var at = new Date();
      meta.lastSyncAt = at.toISOString();
      meta.lastError = '';
      saveMeta();
      setStatus('ok', '동기화됨');
      var bits = [];
      var st = r.pull || {};
      if (st.hands) bits.push('핸드 +' + st.hands);
      if (st.ledger) bits.push('원장 +' + st.ledger);
      if (st.keys && st.keys.length) bits.push('학습/설정 ' + st.keys.length + '개');
      if (r.push && r.push.sent) bits.push('전송 ' + r.push.sent + '건');
      lastResult = (bits.length ? bits.join(' · ') + ' · ' : '') + hhmm(at);
      if (ui && ui.note) ui.note.textContent = lastResult;
      busy = false;
      return r;
    }).catch(function (err) {
      busy = false;
      meta.lastError = String(err && err.message || err);
      saveMeta();
      setStatus('error', '오프라인');
      if (ui && ui.note) ui.note.textContent = '연결 실패 · ' + isoHhmm(meta.lastSyncAt) + ' 마지막 성공';
      return null;
    });
  }

  function hhmm(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function isoHhmm(iso) { var t = Date.parse(iso || ''); return t ? hhmm(new Date(t)) : '-'; }

  // ---------- 앱 화면 갱신 ----------
  function isReportPage() {
    return /report\.html$/i.test(location.pathname);
  }

  function refreshApp() {
    if (isReportPage()) { reloadOnce('report'); return; }   // 리포트는 그리기가 클로저 안이라 한 번 다시 그린다
    var fns = ['renderHistory', 'renderEdgeMetrics', 'renderRecentHistoryLite', 'renderCurriculum', 'renderReview'];
    fns.forEach(function (name) {
      try { if (typeof window[name] === 'function') window[name](); } catch (e) {}
    });
    try { if (window.PokerOSDebug && typeof PokerOSDebug.buildCoachSnapshot === 'function') PokerOSDebug.buildCoachSnapshot(); } catch (e) {}
    markRebuilt();
  }
  function markRebuilt() {}

  function reloadOnce(tag) {
    try {
      if (sessionStorage.getItem(CFG.reloadTag) === tag) return;
      sessionStorage.setItem(CFG.reloadTag, tag);
    } catch (e) { return; }
    setTimeout(function () { location.reload(); }, 60);
  }

  // ---------- 변경 감지 → 디바운스 저장 ----------
  function markDirty(k) {
    var n = null;
    for (var name in SCALARS) { if (SCALARS[name].ls === k) { n = name; break; } }
    if (n) meta.t[n] = nowMs();
    if (k === K.session) meta.t.session = nowMs();
    saveMeta();
    schedule(CFG.debounceMs);
  }
  function schedule(ms) {
    if (!enabled()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; syncOnce({ noRender: false }); }, ms == null ? CFG.debounceMs : ms);
  }

  function installHook() {
    try {
      var orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        var r = orig.call(this, k, v);
        try {
          if (!suppress && this === window.localStorage && isSyncedKey(k)) markDirty(k);
        } catch (e) {}
        return r;
      };
    } catch (e) {}
  }

  // ---------- 전체 아카이브(IndexedDB) 백업/복원 ----------
  function archiveBackup() {
    if (!enabled()) return Promise.reject(new Error('동기화 설정 없음'));
    return idbAll().then(function (all) {
      if (!all.length) return { pushed: 0, total: 0 };
      var since = meta.archiveCursor || '';
      var todo = all.filter(function (h) { return String(h.savedAt || '') > since; });
      if (!todo.length) return { pushed: 0, total: all.length };
      var pages = [], i = 0;
      while (i < todo.length) { pages.push(todo.slice(i, i + 200)); i += 200; }
      var pushed = 0, seq = Promise.resolve();
      pages.forEach(function (page) {
        seq = seq.then(function () {
          return post({ token: CFG.token, action: 'archive', hands: page }).then(function (res) {
            if (!res || !res.ok) throw new Error((res && res.error) || 'archive push failed');
            pushed += page.length;
            meta.archiveCursor = isoMinus(new Date().toISOString(), CFG.overlapMs);
            saveMeta();
            if (ui && ui.arc) ui.arc.textContent = '아카이브 백업 중… ' + pushed + '/' + todo.length;
          });
        });
      });
      return seq.then(function () { return { pushed: pushed, total: all.length }; });
    });
  }

  function archiveRestore() {
    if (!enabled()) return Promise.reject(new Error('동기화 설정 없음'));
    var since = '', got = 0, rounds = 0;
    function step() {
      rounds++;
      return get({ action: 'archive', token: CFG.token, since: since, limit: 250 }).then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'archive pull failed');
        if (res.hands && res.hands.length) {
          got += res.hands.length;
          since = res.nextSince || since;
          if (ui && ui.arc) ui.arc.textContent = '아카이브 복원 중… ' + got + '핸드';
          return idbPut(res.hands).then(function () {
            return mergeHandsIntoLocal(res.hands, { hands: 0, ledger: 0, keys: [] });
          }).then(function () {
            if (res.remaining > 0 && rounds < 60) return step();
            return { got: got, total: res.total };
          });
        }
        return { got: got, total: res.total || 0 };
      });
    }
    return step();
  }

  // ---------- 화면 ----------
  var CSS = '' +
    '.posSync{display:inline-flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}' +
    '.posSyncBadge{border:1px solid #363b36;background:#151915;color:#cfd6cf;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;line-height:1.5}' +
    '.posSyncBadge[data-state="ok"]{color:#8fc79b;border-color:#2f5c3c}' +
    '.posSyncBadge[data-state="syncing"]{color:#e2c77e;border-color:#5d5232}' +
    '.posSyncBadge[data-state="error"]{color:#d96e67;border-color:#6b3a36}' +
    '.posSyncBadge[data-state="off"]{color:#8f8e86;border-color:#2a372c}' +
    '.posSyncPanel{position:fixed;inset:0;background:#000a;z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px}' +
    '.posSyncPanel[hidden]{display:none}' +
    '.posSyncCard{max-width:420px;width:100%;background:#12160f;border:1px solid #3a4238;border-radius:14px;padding:14px;color:#f0efec;font:13px/1.5 system-ui,-apple-system,"Noto Sans KR",sans-serif;box-shadow:0 18px 50px #000a}' +
    '.posSyncCard h3{margin:0 0 4px;font-size:15px}' +
    '.posSyncCard p{margin:0 0 8px;font-size:12px;color:#b7bfb7}' +
    '.posSyncCard .row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
    '.posSyncCard button{font:inherit;border-radius:9px;border:1px solid #3a4238;background:#1b221a;color:#f0efec;padding:8px 10px;cursor:pointer}' +
    '.posSyncCard button.primary{background:#e2c77e;color:#16140f;border-color:#e2c77e;font-weight:800}' +
    '.posSyncCard .msg{font-size:11.5px;color:#9aa39a;min-height:16px;white-space:pre-wrap}' +
    '.posSyncCard .danger{color:#d96e67}' +
    '.posSyncCard input{font:inherit;width:100%;padding:7px 8px;border-radius:8px;border:1px solid #3a4238;background:#0d120e;color:#f0efec}';

  function mountUi() {
    if (ui) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var host = document.querySelector('.posSync');
    if (!host) {
      var h1 = document.querySelector('.header h1') || document.querySelector('header h1') || document.querySelector('h1');
      var parent = (h1 && h1.parentNode) || document.querySelector('.header') || document.querySelector('header') || document.body;
      host = document.createElement('div');
      host.className = 'posSync';
      if (h1 && h1.parentNode) {
        var sub = h1.nextElementSibling;
        if (sub && sub.className && String(sub.className).indexOf('sub') >= 0) sub.parentNode.insertBefore(host, sub.nextSibling);
        else h1.parentNode.insertBefore(host, h1.nextSibling);
      } else parent.appendChild(host);
    }
    host.innerHTML = '';

    var badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'posSyncBadge';
    badge.dataset.state = 'off';
    badge.textContent = enabled() ? '☁️ 대기' : '☁️ 동기화 꺼짐';
    badge.addEventListener('click', openPanel);
    host.appendChild(badge);

    var note = document.createElement('span');
    note.className = 'posSyncNote';
    note.style.cssText = 'font-size:11px;color:#8f8e86';
    host.appendChild(note);

    ui = { host: host, badge: badge, note: note, panel: null };
    if (enabled()) setStatus('ok', '동기화됨');
  }

  function setStatus(state, label) {
    if (!ui) return;
    ui.badge.dataset.state = state;
    ui.badge.textContent = '☁️ ' + label;
    ui.badge.title = 'Poker OS 클라우드 동기화 · ' + (meta.lastSyncAt ? '마지막 ' + isoHhmm(meta.lastSyncAt) : '아직 없음') + (meta.lastError ? ' · ' + meta.lastError : '');
  }

  function openPanel() {
    if (!ui) return;
    if (ui.panel) { ui.panel.hidden = false; refreshPanel(); return; }
    var wrap = document.createElement('div');
    wrap.className = 'posSyncPanel';
    wrap.innerHTML = '' +
      '<div class="posSyncCard" role="dialog" aria-label="클라우드 동기화">' +
      '<h3>☁️ 클라우드 동기화</h3>' +
      '<p>핸드·손익 원장·세션·약점/단골 학습 기록을 Google Drive 한 파일에 보관합니다. PC와 휴대폰 어느 쪽에서 접속해도 이어집니다. 병합은 합집합이라 기존 기록이 지워지지 않습니다.</p>' +
      '<div class="msg" id="psMsg"></div>' +
      '<div class="row"><button class="primary" id="psNow">지금 동기화</button><button id="psPull">클라우드 불러오기</button><button id="psPush">클라우드 저장</button></div>' +
      '<div class="row"><button id="psArcBackup">전체 아카이브 백업</button><button id="psArcRestore">전체 아카이브 복원</button></div>' +
      '<div class="row"><button id="psJson">JSON 백업 파일</button><button id="psClose">닫기</button></div>' +
      '<div class="msg" id="psArc"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    ui.panel = wrap;
    ui.msg = wrap.querySelector('#psMsg');
    ui.arc = wrap.querySelector('#psArc');
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.hidden = true; });
    wrap.querySelector('#psClose').addEventListener('click', function () { wrap.hidden = true; });
    wrap.querySelector('#psNow').addEventListener('click', function () {
      ui.msg.textContent = '동기화 중…';
      syncOnce({ force: false }).then(function (r) { ui.msg.textContent = r ? '완료 · ' + lastResult : '연결 실패 · ' + (meta.lastError || ''); refreshPanel(); });
    });
    wrap.querySelector('#psPull').addEventListener('click', function () {
      if (!confirm('클라우드 값을 이 브라우저로 가져옵니다.\n학습 기록은 큰 값으로 합쳐지고, 설정·세션은 클라우드 값이 우선합니다.\n계속할까요?')) return;
      backupLocalScalars();
      ui.msg.textContent = '클라우드에서 불러오는 중…';
      syncOnce({ force: true, full: true, pushOnly: false }).then(function (r) {
        ui.msg.textContent = r ? '불러오기 완료 · ' + lastResult : '연결 실패 · ' + (meta.lastError || '');
        setTimeout(function () { location.reload(); }, 500);
      });
    });
    wrap.querySelector('#psPush').addEventListener('click', function () {
      ui.msg.textContent = '클라우드에 저장하는 중…';
      syncOnce({ force: true, pushOnly: true }).then(function (r) {
        ui.msg.textContent = r && r.push ? '저장 완료 · ' + r.push.sent + '건 전송' : '연결 실패 · ' + (meta.lastError || '');
        refreshPanel();
      });
    });
    wrap.querySelector('#psArcBackup').addEventListener('click', function () {
      ui.arc.textContent = '아카이브 백업 시작…';
      archiveBackup().then(function (r) { ui.arc.textContent = '아카이브 백업 완료 · ' + r.pushed + '핸드 전송(로컬 총 ' + r.total + ')'; })
        .catch(function (e) { ui.arc.textContent = '아카이브 백업 실패 · ' + (e.message || e); });
    });
    wrap.querySelector('#psArcRestore').addEventListener('click', function () {
      if (!confirm('클라우드의 전체 핸드 아카이브를 이 브라우저로 복원합니다.\n(중복은 자동 제거됩니다)')) return;
      ui.arc.textContent = '아카이브 복원 시작…';
      archiveRestore().then(function (r) { ui.arc.textContent = '아카이브 복원 완료 · ' + r.got + '핸드'; })
        .catch(function (e) { ui.arc.textContent = '아카이브 복원 실패 · ' + (e.message || e); });
    });
    wrap.querySelector('#psJson').addEventListener('click', downloadBackup);
    refreshPanel();
  }

  function refreshPanel() {
    if (!ui || !ui.msg) return;
    var lines = [];
    lines.push('상태: ' + (meta.lastError ? '연결 실패(' + meta.lastError + ')' : (meta.lastSyncAt ? '정상' : '아직 동기화 안 됨')));
    lines.push('마지막 성공: ' + (meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString('ko-KR') : '-'));
    if (lastResult) lines.push('최근: ' + lastResult);
    try {
      var hands = cloudHandsSnapshot();
      var led = readJSON(K.ledger);
      lines.push('이 브라우저: 핸드 ' + (Array.isArray(hands) ? hands.length : 0) + '개(최근) · 원장 ' + (Array.isArray(led) ? led.length : 0) + '행');
    } catch (e) {}
    ui.msg.textContent = lines.join('\n');
  }

  function backupLocalScalars() {
    try {
      var snap = { at: new Date().toISOString(), values: {} };
      Object.keys(SCALARS).forEach(function (n) { var r = readRaw(SCALARS[n].ls); if (r !== null) snap.values[n] = r; });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(snap));
    } catch (e) {}
  }

  function downloadBackup() {
    try {
      var obj = {
        type: 'poker-os-sync-backup', schemaVersion: 'sync-backup-v1', exportedAt: new Date().toISOString(),
        keys: {}, hands: cloudHandsSnapshot() || [], ledger: readJSON(K.ledger) || []
      };
      Object.keys(SCALARS).forEach(function (n) { var r = readRaw(SCALARS[n].ls); if (r !== null) obj.keys[n] = parseMaybe(r); });
      var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'poker_os_sync_backup_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      if (ui && ui.arc) ui.arc.textContent = 'JSON 백업 파일을 저장했습니다.';
    } catch (e) {
      if (ui && ui.arc) ui.arc.textContent = 'JSON 백업 실패 · ' + (e.message || e);
    }
  }

  // ---------- 시작 ----------
  function start() {
    installHook();
    mountUi();
    if (!enabled()) { setStatus('off', '동기화 꺼짐'); return; }
    // 첫 진입: 세션에 아직 안 불러왔으면 한 번 동기화
    var fresh = true;
    try { fresh = sessionStorage.getItem(CFG.reloadTag) !== 'started'; sessionStorage.setItem(CFG.reloadTag, 'started'); } catch (e) {}
    // 세션 재시작 시각 기준: 마지막 동기화가 2분 이내면 건너뛴다
    var recent = meta.lastSyncAt && (nowMs() - Date.parse(meta.lastSyncAt) < 120000);
    if (!recent) syncOnce({});
    startPolling();
    window.addEventListener('online', function () { syncOnce({}); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { if (timer) { clearTimeout(timer); timer = null; syncOnce({}); } }
      else { syncOnce({}); }
    });
    window.addEventListener('pagehide', function () { if (timer) { clearTimeout(timer); timer = null; syncOnce({}); } });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      if (timer || busy) return;
      syncOnce({});
    }, CFG.pollMs);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.PokerOSSync = {
    cfg: CFG, meta: function () { return meta; },
    sync: syncOnce, mergeHandsUnion: function (a, b) { return unionBy(a, b, handKey, bySavedAt, 0); },
    handKey: handKey, ledgerKey: ledgerKey, deepMax: deepMax,
    status: function () { return { enabled: enabled(), lastSyncAt: meta.lastSyncAt, lastError: meta.lastError, lastResult: lastResult }; },
    archiveBackup: archiveBackup, archiveRestore: archiveRestore, idbAll: idbAll,
    setEndpoint: function (url, token) { CFG.endpoint = url; CFG.token = token; }
  };
})();
