// お知らせ表示（シフト未提出・差戻し、打刻修正・休暇申請の却下）
// 打刻画面を開いたときに GAS の getStaffNotices を呼び、打刻ボタンの上に表示する。
// 却下のお知らせは「閉じる」で非表示にでき、閉じた記録はこの端末（localStorage）に残す。
(function(){
  'use strict';

  var DISMISS_KEY = 'kintaiDismissedNotices';
  var seq = 0;

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function getDismissed(){try{return JSON.parse(localStorage.getItem(DISMISS_KEY)||'{}')||{};}catch(e){return {};}}
  function dismiss(id){var d=getDismissed();d[id]=Date.now();
    // 30日より古い記録は掃除する
    var limit=Date.now()-30*24*60*60*1000;Object.keys(d).forEach(function(k){if(d[k]<limit)delete d[k];});
    try{localStorage.setItem(DISMISS_KEY,JSON.stringify(d));}catch(e){}}

  function injectStyle(){
    if(document.getElementById('noticeExtStyle'))return;
    var st=document.createElement('style');st.id='noticeExtStyle';
    st.textContent='\
      .staff-notices{margin:0 0 14px;}\
      .staff-notice{position:relative;border-radius:12px;padding:12px 40px 12px 14px;margin-bottom:8px;font-size:14px;font-weight:700;line-height:1.55;text-align:left;}\
      .staff-notice small{display:block;font-size:12px;font-weight:400;margin-top:3px;}\
      .staff-notice .why{display:block;font-size:12px;font-weight:700;margin-top:5px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.7);}\
      .staff-notice.shift{background:#fff4e5;color:#9a5b00;border:1px solid #f4d39b;}\
      .staff-notice.shift.returned{background:#fdecee;color:#b3261e;border:1px solid #f3c1c6;}\
      .staff-notice.rejected{background:#fdecee;color:#b3261e;border:1px solid #f3c1c6;}\
      .staff-notice.tap{cursor:pointer;}\
      .staff-notice .x{position:absolute;top:6px;right:6px;border:none;background:transparent;color:inherit;font-size:18px;line-height:1;padding:6px;cursor:pointer;}\
    ';
    document.head.appendChild(st);
  }

  function ensureBox(boxId, beforeId){
    var box=document.getElementById(boxId);if(box)return box;
    var before=document.getElementById(beforeId);if(!before)return null;
    box=document.createElement('div');box.id=boxId;box.className='staff-notices hidden';
    before.parentNode.insertBefore(box,before);return box;
  }

  function shiftText(n, kiosk){
    var returned=n.status==='差戻し';
    var head='⚠ '+esc(n.label)+'分のシフトが'+(returned?'差戻しされました。再提出してください。':'まだ提出されていません。');
    var sub='<small>'+(n.deadline?'提出締切：'+esc(n.deadline):'')+(n.requiredDays!=null?(n.deadline?' ／ ':'')+'必要シフト休 '+esc(n.requiredDays)+'日':'')+'</small>';
    if(kiosk) return head+sub+'<small>本人のスマホから提出してください。</small>';
    var why=(returned&&n.reason)?'<span class="why">差戻し理由：'+esc(n.reason)+'</span>':'';
    return head+sub+why+'<small>ここをタップするとシフト画面を開きます。</small>';
  }

  function rejectedText(n){
    var what=n.kind==='休暇'?('休暇申請'+(n.category?'（'+esc(n.category)+'）':'')):esc(n.kind||'申請');
    return '✗ '+what+'が却下されました'+
      '<small>対象日：'+esc(n.target)+' ／ 処理日時：'+esc(n.processedAt)+'</small>'+
      (n.reason?'<span class="why">理由：'+esc(n.reason)+'</span>':'')+
      '<small>内容を確認し、必要なら申請し直してください。</small>';
  }

  function render(box, notices, kiosk){
    var dismissed=getDismissed();
    var list=(notices||[]).filter(function(n){
      if(kiosk) return n.type==='shift';          // 共用端末では却下理由などの個人情報を出さない
      return !(n.type==='rejected' && dismissed[n.id]);
    });
    box.innerHTML='';
    if(!list.length){box.classList.add('hidden');return;}
    list.forEach(function(n){
      var el=document.createElement('div');
      if(n.type==='shift'){
        el.className='staff-notice shift'+(n.status==='差戻し'?' returned':'')+(kiosk?'':' tap');
        el.innerHTML=shiftText(n,kiosk);
        if(!kiosk && typeof window.openShiftPage==='function') el.onclick=function(){window.openShiftPage();};
      } else {
        el.className='staff-notice rejected';
        el.innerHTML=rejectedText(n)+'<button type="button" class="x" aria-label="閉じる">×</button>';
        el.querySelector('.x').onclick=function(ev){ev.stopPropagation();dismiss(n.id);el.parentNode&&el.parentNode.removeChild(el);if(!box.children.length)box.classList.add('hidden');};
      }
      box.appendChild(el);
    });
    box.classList.remove('hidden');
  }

  function load(staffId, boxId, beforeId, kiosk){
    var box=ensureBox(boxId,beforeId);if(!box||!staffId)return;
    var my=++seq;
    box.classList.add('hidden');box.innerHTML='';
    window.google.script.run
      .withSuccessHandler(function(r){if(my!==seq)return;render(box,r&&r.success?r.notices:[],kiosk);})
      .withFailureHandler(function(){if(my!==seq)return;box.classList.add('hidden');})
      .getStaffNotices(staffId);
  }

  function init(){
    injectStyle();
    if(typeof window.enterMobile==='function'){
      var originalMobile=window.enterMobile;
      window.enterMobile=function(staffId){originalMobile(staffId);load(staffId,'mobileStaffNotices','mobileResult',false);};
    }
    if(typeof window.openKioskPunch==='function'){
      var originalKiosk=window.openKioskPunch;
      window.openKioskPunch=function(staff){originalKiosk(staff);if(staff&&staff.id)load(staff.id,'kioskStaffNotices','kioskResult',true);};
    }
    // 読み込み前にすでにスマホ画面が開いていた場合（ログイン状態の復元）も表示する
    var mv=document.getElementById('mobilePunchView');
    if(mv && !mv.classList.contains('hidden') && window.currentAccount && window.currentAccount.staffId){
      load(window.currentAccount.staffId,'mobileStaffNotices','mobileResult',false);
    }
  }

  if(document.readyState==='complete') init(); else window.addEventListener('load',init);
})();
