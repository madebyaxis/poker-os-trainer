// Poker OS regression — 2026-11-13 patch 중심. 브라우저(tests/run.html) 또는 Playwright에서 실행.
// 순수 함수(snapshotCanonicalRecommendation, p10TurnRule, CANON, RAKE_CAP)만 호출하며 기록·세션을 건드리지 않는다.
function runPokerOSRegression(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const card=x=>({r:x[0],s:x.slice(1),v:'23456789TJQKA'.indexOf(x[0])+2});
  const board=s=>s.split(' ').map(card);
  const hand={limit:'10만'};
  const pf=(o)=>D.snapshotCanonicalRecommendation(Object.assign({street:'preflop',toCall:5000,currentBet:5000,streetAggressionCount:0,stack:400000,limpers:0},o),hand);
  // Rake
  ok('rake cap 10만 = 20,000',D.RAKE_CAP['10만']===20000,D.RAKE_CAP);
  ok('rake cap 30만 = 20,000',D.RAKE_CAP['30만']===20000,D.RAKE_CAP);
  // Preflop limped pots
  let r=pf({pos:'CO',hole:'KJo',facing:'Limpers',limpers:1});ok('CO KJo 1 limper → Fold PF14',r.action==='Fold'&&/PF14/.test(r.rule),r);
  r=pf({pos:'BTN',hole:'KQo',facing:'Limpers',limpers:2});ok('BTN KQo 2 limpers → Fold PF14',r.action==='Fold'&&/PF14/.test(r.rule),r);
  r=pf({pos:'HJ',hole:'KQo',facing:'Limpers',limpers:1});ok('HJ KQo 1 limper → Raise PF05(late)',r.action==='Raise'&&/PF05/.test(r.rule),r);
  r=pf({pos:'MP',hole:'ATo',facing:'Limpers',limpers:3});ok('MP ATo 3 limpers → Fold PF14',r.action==='Fold',r);
  r=pf({pos:'CO',hole:'55',facing:'Limpers',limpers:1});ok('CO 55 1 limper → Review(overlimp 유지)',r.action==='Review',r);
  r=pf({pos:'BTN',hole:'JTs',facing:'Limpers',limpers:2});ok('BTN JTs 2 limpers → Review(overlimp 유지)',r.action==='Review',r);
  r=pf({pos:'BTN',hole:'AKo',facing:'Limpers',limpers:4});ok('BTN AKo 4 limpers → Raise PF07',r.action==='Raise',r);
  r=pf({pos:'BB',hole:'KJo',facing:'Limpers',limpers:2,toCall:0});ok('BB KJo 2 limpers 추가 0 → Check',r.action==='Check',r);
  // Facing EP raise
  const vs=(pos,hole,raiser='UTG')=>pf({pos,hole,facing:'Raised',toCall:10000,currentBet:10000,streetAggressionCount:1,preflopRaiserPos:raiser});
  r=vs('HJ','JTs');ok('HJ JTs vs UTG raise → Fold PF09',r.action==='Fold'&&/PF09/.test(r.rule),r);
  r=vs('CO','T9s');ok('CO T9s vs UTG raise → Fold',r.action==='Fold',r);
  r=vs('BTN','JJ');ok('BTN JJ vs UTG raise → Call PF13',r.action==='Call'&&/PF13/.test(r.rule),r);
  r=vs('BTN','AQs');ok('BTN AQs vs UTG raise → Call PF13',r.action==='Call',r);
  r=vs('BTN','AKo');ok('BTN AKo vs UTG raise → Cap PF08',r.action==='Cap',r);
  r=vs('MP','KJo');ok('MP KJo vs UTG raise → Fold PF09',r.action==='Fold',r);
  r=vs('BTN','JTs','CO');ok('BTN JTs vs CO raise → EP 규칙 미적용',!r||!/PF09|PF13/.test(r.rule||''),r);
  // Turn rules
  const H=(a)=>a.map(([seat,position,street,semantic])=>({seat,position,street,semantic}));
  const kkHist=H([[8,'CO','flop','Bet'],[4,'UTG+2','flop','Raise'],[8,'CO','flop','Call'],[4,'UTG+2','turn','Bet']]);
  const b1=board('2♣ 2♦ T♥ 5♠');
  const T=(o)=>D.p10TurnRule(Object.assign({street:'turn',risk:D.boardRiskFor(o.board)},o));
  r=T({tc:10000,hc:'overpair',players:6,history:kkHist,heroPos:'CO',board:b1,heroCards:[card('K♠'),card('K♥')],aggressive:false});
  ok('KK 2-2-T 6way 플랍레이저 턴벳 → Fold T04',r&&r.action==='Fold'&&/T04/.test(r.rule),r);
  r=T({tc:10000,hc:'overpair',players:6,history:kkHist,heroPos:'CO',board:b1,heroCards:[card('K♠'),card('K♥')],aggressive:true});
  ok('같은 상황·공격성 관찰됨 → Review',r&&r.action==='Review',r);
  r=T({tc:10000,hc:'overpair',players:2,history:kkHist,heroPos:'CO',board:b1,heroCards:[card('K♠'),card('K♥')],aggressive:false});
  ok('같은 보드 헤즈업 → 규칙 미적용',r===null,r);
  const b2=board('9♠ 7♠ 4♦ 2♠');
  r=T({tc:0,hc:'overpair',players:6,history:[],heroPos:'SB',board:b2,heroCards:[card('A♠'),card('A♥')],aggressive:false});
  ok('AA(A♠) 턴 플러시 완성 6way → Review T06(Bet 제안)',r&&r.action==='Review'&&r.suggestedAction==='Bet'&&/T06/.test(r.rule),r);
  r=T({tc:0,hc:'overpair',players:5,history:[],heroPos:'SB',board:b2,heroCards:[card('Q♦'),card('Q♥')],aggressive:false});
  ok('QQ(스페이드 없음) 턴 플러시 완성 5way → Check T05',r&&r.action==='Check'&&/T05/.test(r.rule),r);
  r=T({tc:0,hc:'overpair',players:5,history:[],heroPos:'SB',board:board('9♠ 7♠ 4♠ 2♦'),heroCards:[card('Q♦'),card('Q♥')],aggressive:false});
  ok('플랍에 이미 플러시 완성·턴 블랭크 → 미적용',r===null,r);
  r=T({tc:0,hc:'overpair',players:2,history:[],heroPos:'SB',board:b2,heroCards:[card('Q♦'),card('Q♥')],aggressive:false});
  ok('헤즈업 턴 완성 → 미적용',r===null,r);
  // History regrade mirror (snapshot turn)
  r=D.snapshotCanonicalRecommendation({street:'turn',toCall:10000,handClass:'overpair',boardRisk:D.boardRiskFor(b1),playersActive:6,pos:'CO',board:'2♣ 2♦ T♥ 5♠',publicActionHistory:kkHist,heroCards:[card('K♠'),card('K♥')]},hand);
  ok('기록 재채점도 KK → Fold T04',r&&r.action==='Fold'&&/T04/.test(r.rule),r);
  // Drill bank & self test
  const st=D.runV3SelfTests();ok('runV3SelfTests PASS',st.ok,st);
  return {passed:out.filter(x=>x.pass).length,total:out.length,failed:out.filter(x=>!x.pass)};
}
if(typeof module!=='undefined')module.exports={runPokerOSRegression};

// v5.3 (2026-11-15) 강원랜드 현장형 업데이트 검사
function runPokerOSRegressionV53(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const P=D.FIELD_PROFILES;
  ok('Kangwon 30 profile 존재',!!P['Kangwon 30'],Object.keys(P));
  const s30=P['Kangwon 30'].styles,s10=P['Kangwon Live'].styles;
  const aggr=s=>['Regular','Tight-Aggressive','Loose-Aggressive','Tricky-Aggressive','Maniac'].reduce((a,k)=>a+(s[k]||0),0);
  ok('30만 필드 레귤러·공격형 비중 > 10만',aggr(s30)>aggr(s10),[aggr(s30),aggr(s10)]);
  ok('30만 style 합 = 1',Math.abs(Object.values(s30).reduce((a,b)=>a+b,0)-1)<.001,s30);
  ok('30만 skill bag 8명',P['Kangwon 30'].skills.length===8,P['Kangwon 30'].skills);
  const names=[...D.KANGWON_REGULARS['10만'],...D.KANGWON_REGULARS['30만']].map(r=>r.name);
  ok('단골 이름 중복 없음',new Set(names).size===names.length,names);
  ok('10만 스톱선 = Founder 확정(-20만/+25만/+30만)',D.STOP_LINES['10만'].loss===-200000&&D.STOP_LINES['10만'].review===250000&&D.STOP_LINES['10만'].win===300000,D.STOP_LINES['10만']);
  ok('콤프 10만 2천/h · 30만 3천/h',D.COMP_PER_HOUR['10만']===2000&&D.COMP_PER_HOUR['30만']===3000,D.COMP_PER_HOUR);
  ok('손익 원장 배열',Array.isArray(D.ensurePLLedger()),null);
  ok('10만에서는 30만 공격 레이어 미적용',D.kangwon30PreflopAggression({type:'Maniac',agg:.9,seat:0,hole:[]},5000,.5,{position:1})===null||D.getState()?.cfg?.label==='30만',null);
  return out;
}

// v5.4 (2026-11-16) 게임 화면 도크 · 코칭 스냅샷
function runPokerOSRegressionV54(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  ok('플레이 도크 생성',!!doc.getElementById('playDock'),null);
  ok('오른쪽 패널 숨김',doc.querySelector('aside.side')?.classList.contains('stash'),null);
  for(const id of ['review','log','decisionLab','readSeat','exportHistory'])ok(`도크로 이동: #${id}`,!!doc.getElementById(id)?.closest('#playDock'),null);
  const snap=D.buildCoachSnapshot();ok('코칭 스냅샷 생성',snap&&Array.isArray(snap.decisions)&&Array.isArray(snap.hands),snap&&snap.schema);
  return out;
}

// v5.5 (2026-11-16) 강원랜드 현장형 프리플랍 범위
function runPokerOSRegressionV55(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const t=c=>D.pfTier(c);
  ok('AA·AK 등급1',t('AA')===1&&t('AKo')===1&&t('AKs')===1,[t('AA'),t('AKo')]);
  ok('72o·K3o·T2o 정크(6)',t('72o')===6&&t('K3o')===6&&t('T2o')===6,[t('72o'),t('K3o'),t('T2o')]);
  ok('A5o·J9o·87o·K4s 등급5(현장 루즈 림프 패)',[t('A5o'),t('J9o'),t('87o'),t('K4s')].every(x=>x===5),[t('A5o'),t('J9o'),t('87o'),t('K4s')]);
  ok('44·T9s·KTo 등급4',[t('44'),t('T9s'),t('KTo')].every(x=>x===4),[t('44'),t('T9s'),t('KTo')]);
  ok('스타일 9종 설정',Object.keys(D.KANGWON_PF_STYLE).length===9,Object.keys(D.KANGWON_PF_STYLE));
  return out;
}

// v5.6 (2026-11-16) 사연 있는 포스트플랍 · 30만 현장 테이블
function runPokerOSRegressionV56(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const s=D.FIELD_PROFILES['Kangwon 30'].styles,loose=(s['Calling Station']||0)+(s['Loose-Passive']||0);
  ok('30만 필드 루즈 패시브·콜링 비중 ≥ 40%',loose>=.4,loose);
  ok('30만 매니악은 소수(≤5%)',(s.Maniac||0)<=.05,s.Maniac);
  ok('30만 style 합 = 1',Math.abs(Object.values(s).reduce((a,b)=>a+b,0)-1)<.001,null);
  const caps=D.KANGWON_REGULARS['30만'].filter(r=>r.capper);
  ok('30만 캡 아저씨 단골 1명',caps.length===1,caps.map(r=>r.name));
  ok('포스트플랍 함수 노출',typeof D.kangwonPostflop==='function'&&typeof D.kwMadeTier==='function'&&typeof D.kwDraws==='function',null);
  return out;
}
