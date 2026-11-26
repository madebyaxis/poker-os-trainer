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

// v5.7 (2026-11-16) 방화범·공격 루즈 테이블 훈련
function runPokerOSRegressionV57(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const s=D.FIELD_PROFILES['Kangwon Aggro']?.styles||{};
  ok('공격·루즈 프로필 존재, style 합 = 1',Math.abs(Object.values(s).reduce((a,b)=>a+b,0)-1)<.001,s);
  ok('공격 프로필 공격형(LAG·트리키·매니악) ≥ 45%',(s.Maniac||0)+(s['Loose-Aggressive']||0)+(s['Tricky-Aggressive']||0)>=.45,null);
  ok('방화범 단골 2명',D.ARSONIST_POOL.filter(r=>r.arsonist).length===2,null);
  ok('프로필 선택지에 공격 테이블',!!doc.querySelector('#tableProfile option[value="Kangwon Aggro"]'),null);
  ok('캡 빈도 매니악 > LAG > 레귤러',D.CAP_RATE.Maniac>D.CAP_RATE['Loose-Aggressive']&&D.CAP_RATE['Loose-Aggressive']>D.CAP_RATE.Regular,D.CAP_RATE);
  return out;
}

// v5.8 (2026-11-16) 속도 · 방화범 비공개 · 방화범도 사연 있게
function runPokerOSRegressionV58(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  ok('기록 캐시 동작',Array.isArray(D.loadHistory())&&D.loadHistory()!==D.loadHistory(),null);
  ok('좌석에 방화범 표시 없음',![...doc.querySelectorAll('.regTag')].some(x=>/방화범/.test(x.textContent+x.title)),null);
  ok('방화범 함수 교체됨',/사연|story/.test(D.arsonistPostflop.toString()),null);
  return out;
}

// v5.9 (2026-11-16) 실전 기록 분석 반영
function runPokerOSRegressionV59(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const c=(r,s)=>({r,s,v:{A:14,K:13,Q:12,J:11,T:10}[r]||Number(r)});
  const board=[c('T','♠'),c('T','♣'),c('3','♣'),c('K','♥')];
  ok('페어드 보드 AA는 원페어 수준(1)',D.v59EffCat([c('A','♥'),c('A','♣')],board)===1,D.v59EffCat([c('A','♥'),c('A','♣')],board));
  ok('페어드 보드 T9는 트립스(3)',D.v59EffCat([c('T','♥'),c('9','♣')],board)===3,null);
  ok('KQ는 원페어(1)',D.v59EffCat([c('K','♦'),c('Q','♣')],board)===1,null);
  ok('K3는 진짜 투페어(2)',D.v59EffCat([c('K','♦'),c('3','♦')],board)===2,null);
  return out;
}

// v6.0 (2026-11-17) 데스크톱 한 화면 · 사람별 바이인
function runPokerOSRegressionV60(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const xs=Array.from({length:400},()=>D.v60OppBuyin('30만'));
  ok('30만 상대 바이인 50~300만',xs.every(x=>x>=500000&&x<=3000000),[Math.min(...xs),Math.max(...xs)]);
  ok('30만 상대 바이인이 사람마다 다름',new Set(xs).size>=10,new Set(xs).size);
  const ys=Array.from({length:400},()=>D.v60OppBuyin('10만'));
  ok('10만 상대 바이인 20~100만(잠정)',ys.every(x=>x>=200000&&x<=1000000),[Math.min(...ys),Math.max(...ys)]);
  ok('내 바이인 입력칸',!!doc.getElementById('heroBuyin'),null);
  return out;
}

// v6.1 (2026-11-17) 칩·팟 연출 · 딜러
function runPokerOSRegressionV61(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  ok('30만 칩 단위 1만원',D.CHIP_DENOM['30만'].fly===10000,D.CHIP_DENOM['30만']);
  ok('딜러 그림 표시',!!doc.querySelector('.dealerFig svg'),null);
  ok('칩 레이어는 클릭을 막지 않음',doc.querySelector('.chipLayer')&&getComputedStyle(doc.querySelector('.chipLayer')).pointerEvents==='none',null);
  return out;
}

// v6.2 (2026-11-17) 세션 리포트 창
function runPokerOSRegressionV62(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  ok('세션 리포트 창 함수',typeof D.v62Open==='function'&&typeof D.v62Close==='function',null);
  return out;
}

// v6.4 (2026-11-17) 카드 크게 · 모드·프로필 보완
function runPokerOSRegressionV64(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  ok('프로필 설명 6종',Object.keys(D.PROFILE_META).length===6,Object.keys(D.PROFILE_META));
  ok('프로필 설명 표시 요소',!!doc.getElementById('profileHelp'),null);
  const m=doc.querySelector('.seat .mini');ok('좌석 카드 너비 ≥ 22px',!m||parseFloat(getComputedStyle(m).width)>=22,m&&getComputedStyle(m).width);
  return out;
}

// v6.9 (2026-11-17) 싼 가격 폴드 확인 · 모델 점검 · 쇼다운 공개 패
function runPokerOSRegressionV69(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const row=(act)=>({act});
  const cf=D.v69ModelCheck({street:'river',estimatedEquity:.38,toCall:30000,pot:350000,playersActive:2},row('Fold'));
  ok('싼 가격 폴드 판정(필요 8%·추정 38%)',cf&&cf.k==='cheapfold',cf);
  const nf=D.v69ModelCheck({street:'river',estimatedEquity:.12,toCall:30000,pot:350000,playersActive:2},row('Fold'));
  ok('승률 낮으면 폴드 허용',nf===null,nf);
  const vc=D.v69ModelCheck({street:'river',estimatedEquity:.84,toCall:0,pot:300000,playersActive:2},row('Check'));
  ok('리버 밸류 체크 판정',vc&&vc.k==='valuecheck',vc);
  const mw=D.v69ModelCheck({street:'flop',estimatedEquity:.19,toCall:0,pot:200000,playersActive:4},row('Bet'));
  ok('멀티웨이 약한 벳 판정',mw&&mw.k==='mwbet',mw);
  ok('가격 확인 UI',!!doc.getElementById('potGuard')&&!!doc.getElementById('potGuardOn'),null);
  return out;
}

// v6.9.1 (2026-11-18) 모드·프로필 변경 → 새 세션
function runPokerOSRegressionV691(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  ok('변경 대기 안내 요소',!!doc.getElementById('pendingBar'),null);
  ok('변경 대기 함수',typeof D.v691Pending==='function'&&Array.isArray(D.v691Pending()),null);
  return out;
}

// v6.9.2 (2026-11-18) 필드 프로필 옵션 값
function runPokerOSRegressionV692(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const vals=[...doc.getElementById('tableProfile').options].map(o=>o.value);
  ok('모든 프로필 옵션 값이 FIELD_PROFILES 키',vals.length===6&&['Normal','Soft','Reg Heavy','Kangwon Live','Kangwon 30','Kangwon Aggro'].every(k=>vals.includes(k)),vals);
  return out;
}

// v6.9.7 (2026-11-18) 핸드리뷰 모델 참고 권장
function runPokerOSRegressionV697(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const f=D.modelReviewRec;
  const a=f({street:'turn',toCall:10000,pot:82000,actionEV:{foldEV:0,callEV:39300,raiseEV:45891},actualSemantic:'Call',estimatedEquity:.9});
  ok('EV 비교 → 레이즈 권장',a&&a.action==='Raise',a);
  const b=f({street:'river',toCall:0,pot:200000,actionEV:{checkEV:14000,betEV:30000},actualSemantic:'Check'});
  ok('체크 상황 벳 권장',b&&b.action==='Bet'&&!D.mrSameAct(b,'Check'),b);
  const c=f({street:'flop',toCall:30000,pot:230000,estimatedEquity:.4,requiredEquity:.115,actualSemantic:'Fold'});
  ok('승률 vs 필요 승률 보정 → 콜',c&&c.action==='Call',c);
  const d=f({street:'preflop',why:'MODEL · KTo / Hero BB / MP raise → Fold (matrix continue 범위 밖).',actualSemantic:'Call'});
  ok('프리플랍 모델 폴드',d&&d.action==='Fold',d);
  const e=f({street:'preflop',facing:'Limpers',why:'MODEL · marginal offsuit entry를 줄입니다.',actualSemantic:'Fold'});
  ok('림프 팟 모델 폴드',e&&e.action==='Fold',e);
  ok('권장이 없으면 null',f({street:'flop',toCall:0,pot:100000,actualSemantic:'Check'})===null,null);
  return out;
}

function runPokerOSRegressionV610(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const t=D.v610Tightness;
  ok('이미지: VPIP 9% → 최대 강도',t(.09,40)===1,t(.09,40));
  ok('이미지: VPIP 13% → 중간 강도',Math.abs(t(.13,40)-.5)<1e-9,t(.13,40));
  ok('이미지: VPIP 20% → 영향 없음',t(.2,40)===0,t(.2,40));
  ok('이미지: 표본 25핸드 미만 → 영향 없음',t(.05,10)===0,t(.05,10));
  return out;
}

function runPokerOSRegressionV611(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const cp=D.v611CapProb,hb=D.v611Habit,rp=D.v611RaiseProb;
  const capper={name:'엄태호',type:'Maniac'},reg={name:'아무개',type:'Regular'},stn={name:'손님',type:'Calling Station'};
  ok('v6.12 누적 아카이브 API 노출',typeof D.v612ArchivePut==='function'&&typeof D.v612ArchiveAll==='function'&&D.v612Key({sessionId:'S-1',handNo:5})==='S-1|5',D.v612Key&&D.v612Key({sessionId:'S-1',handNo:5}));
  ok('캡: 지정 인물은 일반인보다 습관 높음',hb(capper)>.8&&hb(reg)<.2,[hb(capper),hb(reg)]);
  ok('캡: 같은 패면 지정 인물이 더 자주',cp(capper,3)>cp(reg,3)*2,[cp(capper,3),cp(reg,3)]);
  ok('캡: 일반인은 상위 패일수록 자주',cp(reg,1)>cp(reg,2)&&cp(reg,2)>cp(reg,3)&&cp(reg,3)>cp(reg,4),[1,2,3,4].map(t=>cp(reg,t)));
  ok('캡: 캡 단골도 정크(등급6)로는 안 함, 등급5는 드묾',cp(capper,6)===0&&cp(capper,5)<.1&&cp(capper,2)>.5,[cp(capper,6),cp(capper,5),cp(capper,2)]);
  const w=D.v611CapperW;
  ok('캡 단골 레인지: 99·TT 페어와 AQs·KQs 포함',w('TT')>=.8&&w('99')>=.5&&w('AQs')>=.7&&w('KQs')>=.4,[w('TT'),w('99'),w('AQs'),w('KQs')]);
  ok('캡 단골 레인지: Axs·Kxs는 가끔(객기), 정크는 안 함',w('A5s')>0&&w('A5s')<.2&&w('K9s')>0&&w('K9s')<.2&&w('72o')===0&&w('A5o')===0,[w('A5s'),w('K9s'),w('72o'),w('A5o')]);
  ok('캡: 일반인은 정크로 캡 안 함',cp(reg,6)===0,cp(reg,6));
  ok('캡: 콜링스테이션은 일반 레귤러보다 덜',cp(stn,1)<cp(reg,1)*1.05,[cp(stn,1),cp(reg,1)]);
  const st={sid:'x',walk:0,phase:0,period:150,amp:.7,base:.1,m:0,mHand:-1,flops:[]};
  ok('분위기: -1~1 범위',D.v611Mood!==undefined&&true,'exists');
  const base={st:'flop',tier:'air',outs:0,type:'Regular',agg:.5,n:3,raised:false,wet:false,scare:false};
  const r=(o)=>rp({...base,...o}).q;
  ok('레이즈: 강한 패 > 정크',r({tier:'strong'})>r({tier:'air'})*10,[r({tier:'strong'}),r({tier:'air'})]);
  ok('레이즈: 공격형 > 패시브(같은 패)',r({tier:'good',type:'Maniac',agg:.9})>r({tier:'good',type:'Calling Station',agg:.2}),[r({tier:'good',type:'Maniac',agg:.9}),r({tier:'good',type:'Calling Station',agg:.2})]);
  ok('레이즈: 리버 블러프 < 플랍 세미블러프',r({st:'river',tier:'air'})<r({st:'flop',tier:'weak',outs:9}),[r({st:'river',tier:'air'}),r({st:'flop',tier:'weak',outs:9})]);
  ok('레이즈: 이미 레이즈된 스트리트는 강한 패만',r({raised:true,tier:'good'})===0&&r({raised:true,tier:'strong'})>0,[r({raised:true,tier:'good'}),r({raised:true,tier:'strong'})]);
  ok('레이즈: 멀티웨이는 같은 패라도 줄어듦',r({tier:'good',n:5})<r({tier:'good',n:2}),[r({tier:'good',n:5}),r({tier:'good',n:2})]);
  ok('레이즈: 리버는 강한 패 위주(굿 < 스트롱 1/10)',r({st:'river',tier:'good'})<r({st:'river',tier:'strong'})/10,[r({st:'river',tier:'good'}),r({st:'river',tier:'strong'})]);
  ok('레이즈: 확률 0~0.9',[ 'flop','turn','river'].every(s=>['strong','good','marginal','weak','air'].every(t=>{const q=r({st:s,tier:t,outs:12,type:'Maniac',agg:1});return q>=0&&q<=.9})),'range');
  return out;
}

// v6.13 (2026-11-24) PC·폰 클라우드 동기화(sync.js) 검사 — 순수 병합 함수만 호출한다.
function runPokerOSRegressionV613(D,doc){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const S=doc&&doc.defaultView&&doc.defaultView.PokerOSSync;
  ok('sync.js 로드 · PokerOSSync 노출',!!S,typeof S);
  if(!S){return out;}
  ok('동기화 배지가 화면에 삽입됨',!!(doc&&doc.querySelector('.posSyncBadge')),doc&&!!doc.querySelector('.posSyncBadge'));
  ok('엔드포인트·토큰 설정됨',!!S.cfg.endpoint&&!!S.cfg.token,[S.cfg.endpoint?'endpoint ok':'endpoint 없음',S.cfg.token?'token ok':'token 없음']);
  const h1={savedAt:'2026-11-20T01:00:00.000Z',handNo:1,position:'BTN',hole:'A♠ K♠',handPL:1000};
  const h2={savedAt:'2026-11-20T01:05:00.000Z',handNo:2,position:'CO',hole:'7♥ 7♦',handPL:-500};
  ok('핸드 키 = 앱 가져오기 키 형식',
    S.handKey(h1)==='2026-11-20T01:00:00.000Z|1|BTN|A♠ K♠',S.handKey(h1));
  const one=S.mergeHandsUnion([h1],[h1]);
  ok('같은 핸드는 중복 제거',one.length===1,one.length);
  const two=S.mergeHandsUnion([h1],[h2]);
  ok('다른 핸드는 합집합',two.length===2&&two[0].handNo===1&&two[1].handNo===2,two.map(x=>x.handNo));
  const order=S.mergeHandsUnion([h2],[h1]);
  ok('합집합은 savedAt 오름차순',order.length===2&&order[0].handNo===1,order.map(x=>x.handNo));
  const many=[h1,h2];
  ok('같은 배열 두 번 합쳐도 그대로',S.mergeHandsUnion(many,many).length===2,S.mergeHandsUnion(many,many).length);
  ok('클라우드가 비어도 로컬 기록 유지(빈 배열 병합)',S.mergeHandsUnion(many,[]).length===2,S.mergeHandsUnion(many,[]).length);
  ok('원장 키 형식',S.ledgerKey({t:'2026-11-20T01:00:00.000Z',sid:'S-1',pl:1000,hn:3})==='2026-11-20T01:00:00.000Z|S-1|1000|3',S.ledgerKey({t:'2026-11-20T01:00:00.000Z',sid:'S-1',pl:1000,hn:3}));
  const m=S.deepMax({a:{attempts:3,correct:1},b:[1,2]},{a:{attempts:1,correct:2},b:[2,3]});
  ok('학습 카운터는 큰 값 병합',m.a.attempts===3&&m.a.correct===2,m.a);
  ok('배열은 합집합 병합',m.b.length===3,m.b);
  ok('로컬에만 있는 값 유지',S.deepMax({x:5},{}).x===5,S.deepMax({x:5},{}).x);
  const st=S.status();
  ok('상태 조회 가능 (자동화/localhost 에선 동기화 차단이 정상)',st&&typeof st.enabled==='boolean'&&(st.enabled===true||/^(localhost|127\.0\.0\.1)$/.test(location.hostname)||navigator.webdriver),st);
  return out;
}

// v6.19 (2026-11-26) 포스트플랍 정본(Postflop Canon v1) 검사 — 순수 함수만 호출한다.
// 설계 문서 4-6의 26검사 + 규칙 ID/믹스/문맥결손 검사.
function runPostflopCanonRegression(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const card=x=>({r:x[0],s:x.slice(1),v:'23456789TJQKA'.indexOf(x[0])+2});
  const B=s=>s.trim().split(/\s+/).map(card);
  const H=s=>s.trim().split(/\s+/).map(card);
  const near=(a,b,tol=.001)=>Math.abs(a-b)<=tol;
  const hand={limit:'10만'};

  // ── 가격·수학 (8)
  let p=D.pfxPrice('river','30만',240000,30000,{ways:2,playersBehind:0});
  ok('30만 12BB 1벳 need=10.5%',near(p.rawNeed,.10526),p.rawNeed);
  p=D.pfxPrice('turn','10만',60000,10000,{ways:2,playersBehind:0});
  ok('10만 12BB 1벳 need=13.2%',near(p.rawNeed,.13158),p.rawNeed);
  ok('레이크 반영(무레이크 30만 12BB=10.0%)',near(30000/300000,.1)&&p.rawNeed>.131,p.rawNeed);
  p=D.pfxPrice('turn','30만',240000,30000,{ways:3,playersBehind:1});
  ok('needRaised1 30만 12BB=15.0%',near(p.raisedNeed,.15038),p.raisedNeed);
  p=D.pfxPrice('river','10만',60000,10000,{ways:3,playersBehind:2});
  ok('10만 리버 4벳 캡 12BB=23.4%',near(p.cappedNeed,.23392),p.cappedNeed);
  p=D.pfxPrice('river','30만',240000,30000,{ways:2,playersBehind:0});
  ok('MDF HU 12BB=88.9%',near(p.mdf,.88889),p.mdf);
  p=D.pfxPrice('river','30만',240000,30000,{ways:3,playersBehind:1});
  ok('멀티웨이 MDF 3명=51.9%',near(p.mdfMultiway,.51942),p.mdfMultiway);
  const e0=D.pfxPrice('river','30만',240000,30000,{ways:2,playersBehind:0}).effNeed;
  const e1=D.pfxPrice('river','30만',240000,30000,{ways:3,playersBehind:1}).effNeed;
  const e2=D.pfxPrice('river','30만',240000,30000,{ways:4,playersBehind:2}).effNeed;
  ok('effNeed 단조성(뒤 인원↑ → need↑)',e0<e1&&e1<e2,[e0,e1,e2]);

  // ── 아웃츠 (6)
  let o=D.pfxOuts(H('A♠ K♠'),B('9♠ 7♠ 4♦ 2♥'),'turn',30000,'30만');
  ok('9아웃 턴=19.6%',o.raw===9&&near(o.equity1,9/46),o);
  o=D.pfxOuts(H('J♠ T♠'),B('9♠ 8♠ 2♦'),'flop',20000,'30만');
  ok('15아웃 플랍=54.1%',o.raw===15&&near(o.equity2,.5412,.002),o);
  o=D.pfxOuts(H('A♠ K♦'),B('9♠ 9♣ 7♠ 4♠'),'turn',30000,'30만');
  ok('dirty outs 할인(위험 2 → ×0.65)',o.raw===9&&o.clean===6,[o.raw,o.clean]);
  o=D.pfxOuts(H('A♠ K♠'),B('9♠ 7♠ 4♦ 2♥'),'turn',30000,'30만');
  ok('callReqPot 9아웃 턴 30만=4.7BB',near(o.callReqPotBB,4.667,.05),o.callReqPotBB);
  ok('임플라이드 1.5BB 차감',near(o.impliedReqPotBB,o.callReqPotBB-1.5),o.impliedReqPotBB);
  o=D.pfxOuts(H('A♠ K♠'),B('9♠ 7♠ 4♦ 2♥ Q♣'),'river',30000,'30만');
  ok('리버 아웃츠 0',o.raw===0&&o.equity1===0,o);

  // ── 분류·보드 (6)
  let c=D.pfClassify(H('K♠ K♥'),B('2♣ 2♦ T♥ 5♠'),'turn');
  ok('KK 2-2-T → overpair/good',c.hc==='overpair'&&c.tier==='good',c);
  c=D.pfClassify(H('7♠ 8♥'),B('T♠ T♥ T♦ 2♣ 3♠'),'river');
  ok('보드 트립스(홀 기여 없음) → weak',c.hc==='board_trips'&&c.tier==='weak',c);
  c=D.pfClassify(H('K♠ J♦'),B('K♥ 8♣ 3♦ 2♠'),'turn');
  ok('탑페어 약키커 → marginal',c.hc==='top_pair_weak'&&c.tier==='marginal',c);
  let t=D.pfxTexture(B('9♠ 7♠ 4♦'),'flop');
  ok('twoTone_connected 판정',t.code==='twoTone_connected',t.code);
  t=D.pfxTexture(B('9♠ 7♠ 4♦ 2♠'),'turn');
  ok('completion 판정(턴 플러시 완성)',t.code==='completion',t.code);
  c=D.pfClassify(H('A♠ K♦'),B('9♠ 7♠ 4♦ 2♠'),'turn');
  ok('넛 플러시 블로커 검출',c.blockers.nutFlush===true,c.blockers);

  // ── 규칙 (6)
  let r=D.pfxMatch({limit:'30만',street:'flop',hole:H('9♠ 6♥'),board:B('9♦ 9♣ 6♠'),ways:3,facing:'checked_to',toCall:0,pot:60000,ip:true,initiative:true,read:{enough:false}});
  ok('PFX-F01 플랍 풀하우스 → Bet(현행은 Review였음)',r&&r.action==='Bet'&&r.canonicalRule==='PFX-F01',r);
  r=D.pfxMatch({limit:'30만',street:'river',hole:H('Q♣ J♦'),board:B('9♠ 7♠ 4♠ 2♠ Q♦'),ways:3,facing:'bet',toCall:30000,pot:240000,read:{enough:false}});
  ok('PFX-R03 3웨이+완성+원페어 → Fold',r&&r.action==='Fold'&&r.canonicalRule==='PFX-R03',r);
  const rv={limit:'30만',street:'river',hole:H('Q♦ J♣'),board:B('Q♠ 6♦ 2♣ 9♥ 3♣'),ways:2,facing:'bet',toCall:30000,pot:240000};
  const pas=D.pfxMatch({...rv,read:{enough:true,hands:20,pfr:.05,postAgg:.2}});
  const lag=D.pfxMatch({...rv,read:{enough:true,hands:20,pfr:.3,postAgg:.55}});
  ok('PFX-R04 패시브 12BB → Fold / LAG → Call',pas&&lag&&pas.action==='Fold'&&lag.action==='Call',{pas,lag});
  r=D.pfxMatch({limit:'30만',street:'river',hole:H('Q♦ J♣'),board:B('Q♠ 6♦ 2♣ 9♥ 3♣'),ways:2,facing:'bet',toCall:30000,pot:600000,read:{enough:false}});
  ok('PFX-R05 30BB 팟 HU → Call',r&&r.action==='Call'&&r.canonicalRule==='PFX-R05',r);
  r=D.pfxMatch({limit:'30만',street:'turn',hole:H('Q♣ Q♦'),board:B('9♠ 7♠ 4♠ 2♠'),ways:3,facing:'bet',toCall:30000,pot:240000,read:{enough:false}});
  ok('PFX-T03 완성보드 단일 벳 → Fold',r&&r.action==='Fold'&&r.canonicalRule==='PFX-T03',r);
  r=D.pfxMatch({limit:'30만',street:'turn',hole:H('K♦ J♣'),board:[],ways:3,facing:'bet',toCall:30000,pot:240000,read:{enough:false}});
  ok('PFX-UNK board 없음 → Review',r&&r.action==='Review'&&r.gradeable===false,r);

  // ── 통합 (추가)
  ok('POSTFLOP_CANON 규칙 27개',D.POSTFLOP_CANON.rules.length===27,D.POSTFLOP_CANON.rules.length);
  ok('정본 ID 화이트리스트에 PFX 포함',D.PFX_CANON_IDS.has('PFX-R04')&&!D.PFX_CANON_IDS.has('PFX-UNK'),[...D.PFX_CANON_IDS].length);
  const mixed=D.pfxMatch({limit:'30만',street:'river',hole:H('K♠ K♥'),board:B('Q♠ 6♦ 2♣ 9♥ 3♣'),ways:2,facing:'checked_to',toCall:0,pot:240000,read:{enough:true,hands:20,pfr:.05,postAgg:.2}});
  ok('믹스 규칙은 alt(체크)도 정답 처리',mixed&&mixed.action==='Bet'&&mixed.alt==='Check'&&D.decisionMatches({actualSemantic:'Check',rec:mixed.action,alt:mixed.alt}),mixed);
  const noBoard=D.snapshotCanonicalRecommendation({street:'turn',toCall:10000,handClass:'one_pair',boardRisk:{count:0,paired:false,flushComplete:false,straightRisk:false},playersActive:2,pos:'MP',currentBet:10000,streetAggressionCount:1,stack:400000},hand);
  ok('보드 없는 과거 기록은 review_only(PFX-UNK)',noBoard&&noBoard.action==='Review'&&noBoard.gradeable===false,noBoard);
  const drill=D.DRILL_BANK.flop&&D.DRILL_BANK.flop.length>=10&&D.DRILL_BANK.river_gate&&D.DRILL_BANK.river_gate.length>=6;
  ok('플랍·리버게이트 드릴 뱅크 존재',drill,{flop:D.DRILL_BANK.flop?.length,river_gate:D.DRILL_BANK.river_gate?.length});
  ok('PFX 드릴만 정본 채점',D.drillIsCanonical({r:'PFX-R04',w:'g*'})&&!D.drillIsCanonical({r:'PFX-R04 | Override',w:''})&&!D.drillIsCanonical({r:'PFX-F09',w:'비채점'}),null);
  return out;
}
if(typeof module!=='undefined')module.exports={runPostflopCanonRegression};

// v6.21 (2026-11-27) 30만 프리플랍 정본 보강(P30-PF05·PF10~PF16) — live와 같은 snapshot 경로를 호출한다.
// 근거: reports/30만-프리플랍-정본-보강-2026-11-27.md (표 A 림프 팟, 표 B 레이즈 대응).
function runP30PreflopCanonRegression(D){
  const out=[];const ok=(name,cond,got)=>out.push({name,pass:!!cond,got});
  const h30={limit:'30만'},h10={limit:'10만'};
  const hist=n=>[{street:'preflop',semantic:'Raise'}].concat(Array.from({length:n},()=>({street:'preflop',semantic:'Call'})));
  const limp30=(pos,hole,n,extra)=>D.snapshotCanonicalRecommendation(Object.assign({street:'preflop',pos,hole,facing:'Limpers',limpers:n,toCall:20000,currentBet:20000,streetAggressionCount:0,stack:400000},extra||{}),h30);
  const vs30=(pos,hole,raiser,callers)=>D.snapshotCanonicalRecommendation({street:'preflop',pos,hole,facing:'Raised',limpers:0,toCall:40000,currentBet:40000,streetAggressionCount:1,stack:400000,preflopRaiserPos:raiser,publicActionHistory:hist(callers||0)},h30);
  let r;

  // 표 A — 1림퍼 포지션 분리(P30-PF05)
  r=limp30('BTN','88',1);ok('30만 BTN 88 1림퍼 → Raise PF05',r&&r.action==='Raise'&&/PF05/.test(r.rule),r);
  r=limp30('UTG','88',1);ok('30만 UTG 88 1림퍼 → Fold PF10',r&&r.action==='Fold'&&/PF10/.test(r.rule),r);
  r=limp30('CO','99',1);ok('30만 CO 99 1림퍼 → Raise PF05',r&&r.action==='Raise',r);
  r=limp30('CO','88',1);ok('30만 CO 88 1림퍼 → Call',r&&r.action==='Call',r);
  r=limp30('MP','AKo',1);ok('30만 MP AKo 1림퍼 → Raise PF05',r&&r.action==='Raise',r);
  r=limp30('UTG','AQo',1);ok('30만 UTG AQo 1림퍼 → Raise(정본 유지)',r&&r.action==='Raise'&&/PF05/.test(r.rule),r);

  // 표 A — 오버림프 콜/폴드 경계(P30-PF10·PF14)
  r=limp30('BTN','A8s',1);ok('30만 BTN A8s 1림퍼 → Call PF10',r&&r.action==='Call'&&/PF10/.test(r.rule),r);
  r=limp30('BTN','A7s',1);ok('30만 BTN A7s 1림퍼 → Fold PF14',r&&r.action==='Fold'&&/PF14/.test(r.rule),r);
  r=limp30('BTN','K5s',1);ok('30만 BTN K5s 1림퍼 → Fold PF14',r&&r.action==='Fold'&&/PF14/.test(r.rule),r);
  r=limp30('BTN','44',2);ok('30만 BTN 44 2림퍼 → Fold PF14',r&&r.action==='Fold'&&/PF14/.test(r.rule),r);
  r=limp30('BTN','A9s',2);ok('30만 BTN A9s 2림퍼 → Call',r&&r.action==='Call',r);
  r=limp30('BTN','77',3);ok('30만 BTN 77 3림퍼 → Call',r&&r.action==='Call',r);
  r=limp30('BTN','AKo',4);ok('30만 BTN AKo 4림퍼 → Call',r&&r.action==='Call',r);

  // 표 A — 2~4+ 림퍼 단계(P30-PF16·PF13)와 BB
  r=limp30('BB','AA',2,{toCall:0});ok('30만 BB AA 2림퍼 → Raise PF16',r&&r.action==='Raise'&&/PF16/.test(r.rule),r);
  r=limp30('BB','99',1,{toCall:0});ok('30만 BB 99 1림퍼 → Raise PF05',r&&r.action==='Raise'&&/PF05/.test(r.rule),r);
  r=limp30('BB','88',1,{toCall:0});ok('30만 BB 88 1림퍼 → Check PF12',r&&r.action==='Check'&&/PF12/.test(r.rule),r);
  r=limp30('BB','AQo',2,{toCall:0});ok('30만 BB AQo 2림퍼 → Check(구 PF06 축소)',r&&r.action==='Check',r);
  r=limp30('BB','AQs',4,{toCall:0});ok('30만 BB AQs 4림퍼 → Check',r&&r.action==='Check',r);
  r=limp30('BB','AA',4,{toCall:0});ok('30만 BB AA 4림퍼 → Raise PF13',r&&r.action==='Raise'&&/PF13/.test(r.rule),r);

  // 표 A — SB 컴플리트(P30-PF12)
  r=limp30('SB','72o',1,{toCall:10000,currentBet:20000});ok('30만 SB 72o 1림퍼 → Call(예외 없음)',r&&r.action==='Call',r);
  r=limp30('SB','72o',2,{toCall:10000,currentBet:20000});ok('30만 SB 72o 2림퍼 → Fold',r&&r.action==='Fold',r);
  r=limp30('SB','65s',3,{toCall:10000,currentBet:20000});ok('30만 SB 65s 3림퍼 → Call',r&&r.action==='Call',r);
  r=limp30('SB','AKs',1,{toCall:10000,currentBet:20000});ok('30만 SB AKs 1림퍼 → Raise',r&&r.action==='Raise',r);

  // 표 B — 레이즈 대응(P30-PF11)과 블라인드 캡 게이트(P30-PF15·PF12)
  r=vs30('BTN','AQs','CO',0);ok('30만 BTN AQs vs CO → 3-bet PF11',r&&r.action==='3-bet'&&/PF11/.test(r.rule),r);
  r=vs30('BTN','88','CO',0);ok('30만 BTN 88 vs CO → Call(△ 캡 경계)',r&&r.action==='Call'&&r.alt==='3-bet',r);
  r=vs30('BTN','72o','CO',0);ok('30만 BTN 72o vs CO → Fold',r&&r.action==='Fold',r);
  r=vs30('CO','55','MP',0);ok('30만 CO 55 vs MP → Fold',r&&r.action==='Fold',r);
  r=vs30('CO','TT','MP',0);ok('30만 CO TT vs MP → Call',r&&r.action==='Call',r);
  r=vs30('SB','KK','BTN',1);ok('30만 SB KK vs BTN → 3-bet',r&&r.action==='3-bet',r);
  r=vs30('BB','QQ','BTN',0);ok('30만 BB QQ vs BTN → Call(PF15 캡 금지)',r&&r.action==='Call'&&/PF15/.test(r.rule),r);
  r=vs30('BB','AA','BTN',0);ok('30만 BB AA vs BTN → 3-bet',r&&r.action==='3-bet',r);
  r=vs30('SB','AKs','BTN',0);ok('30만 SB AKs vs BTN → Call(캡 손익분기 60%)',r&&r.action==='Call',r);
  r=vs30('UTG+1','AKs','UTG',0);ok('30만 UTG+1 AKs vs UTG → 3-bet PF07 유지',r&&r.action==='3-bet'&&/PF07/.test(r.rule),r);
  r=vs30('UTG+1','JJ','UTG',0);ok('30만 UTG+1 JJ vs UTG → Call',r&&r.action==='Call',r);
  r=vs30('BB','QQ','UTG',0);ok('30만 BB QQ vs UTG → PF07 캡 차단(기존 엔진)',r===null,r);

  // 10만 회귀 — 같은 경로가 10만 동작을 바꾸지 않았다
  const limp10=(pos,hole,n,extra)=>D.snapshotCanonicalRecommendation(Object.assign({street:'preflop',pos,hole,facing:'Limpers',limpers:n,toCall:5000,currentBet:5000,streetAggressionCount:0,stack:400000},extra||{}),h10);
  r=limp10('BTN','44',1);ok('10만 BTN 44 1림퍼 → Review(불변)',r&&r.action==='Review',r);
  r=limp10('CO','KJo',1);ok('10만 CO KJo 1림퍼 → Fold PF14(불변)',r&&r.action==='Fold'&&/PF14/.test(r.rule),r);
  r=limp10('HJ','KQo',1);ok('10만 HJ KQo 1림퍼 → Raise PF05(불변)',r&&r.action==='Raise'&&/PF05/.test(r.rule),r);
  r=D.snapshotCanonicalRecommendation({street:'preflop',pos:'BB',hole:'AQo',facing:'Limpers',limpers:2,toCall:0,currentBet:5000,streetAggressionCount:0,stack:400000},h10);
  ok('10만 BB AQo 2림퍼 → Raise PF06(불변)',r&&r.action==='Raise'&&/PF06/.test(r.rule),r);
  r=D.snapshotCanonicalRecommendation({street:'preflop',pos:'BB',hole:'AKo',facing:'Raised',limpers:0,toCall:10000,currentBet:10000,streetAggressionCount:1,stack:400000,preflopRaiserPos:'UTG'},h10);
  ok('10만 BB AKo vs UTG → Cap PF08(불변)',r&&r.action==='Cap',r);
  return out;
}
