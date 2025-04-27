// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  get,
  query,
  orderByChild,
  limitToLast,
  onChildAdded
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, app } from './auth.js';

const db = getDatabase(app);
const parts    = location.pathname.split('/').filter(Boolean);
const repo     = parts[0] ? `/${parts[0]}` : '';
const category = parts[1] || 'default';
const roomId   = parts[2] || parts[1] || 'lobby';

const allRoomsRef = dbRef(db, `rooms`);
const messagesRef = dbRef(db, `rooms/${category}/${roomId}/messages`);

const PAGE_SIZE = 40;
let oldestTs = null, newestTs = null, loadingOlder = false;
let roomList = [];

// — DOM 構築 —
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <h2>ルーム: ${category} / ${roomId}</h2>
    <div id="messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <input id="imgInput" type="file" accept="image/*" style="display:none;" />
      <button id="btnImg" disabled>📷</button>
      <input id="msgInput" type="text" placeholder="メッセージを入力..." disabled />
      <button id="btnSend" disabled>送信</button>
    </div>
    <!-- 転送先選択メニュー -->
    <div id="forwardMenu" class="forward-menu" style="display:none;"></div>
  </div>
`);
const messagesEl = document.getElementById('messages');
const forwardMenu = document.getElementById('forwardMenu');
const imgInput   = document.getElementById('imgInput');
const btnImg     = document.getElementById('btnImg');
const inputEl    = document.getElementById('msgInput');
const btnSend    = document.getElementById('btnSend');

// IME 判定
let isComposing = false;
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証監視
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled    = !ok;
  inputEl.disabled   = !ok;
  btnSend.disabled   = !ok;
  inputEl.placeholder = ok ? 'メッセージを入力...' : 'ログインすると送信できます';
});

// 画像アップロード
btnImg.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', () => {
  const file = imgInput.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    await push(messagesRef, {
      uid:        auth.currentUser.uid,
      user:       auth.currentUser.displayName || auth.currentUser.email,
      text:       '',
      imageBase64: reader.result,
      timestamp:  Date.now()
    });
  };
  reader.readAsDataURL(file);
  imgInput.value = '';
});

// テキスト送信
inputEl.addEventListener('keydown', e => {
  if (e.key==='Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault(); btnSend.click();
  }
});
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim(); if (!text) return;
  inputEl.value = '';
  await push(messagesRef, {
    uid:        auth.currentUser.uid,
    user:       auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp:  Date.now()
  });
});

// 全ルーム一覧取得（転送用）
async function loadRoomList() {
  const snap = await get(allRoomsRef);
  const data = snap.val()||{};
  roomList = [];
  for (const cat of Object.keys(data)) {
    for (const r of Object.keys(data[cat])) {
      roomList.push({ category:cat, id:r, label:`${cat} / ${r}` });
    }
  }
}
loadRoomList();

// メッセージ描画
function renderMessage(msgObj, prepend=false) {
  const {
    key, user, text, imageBase64, timestamp,
    forwardedFromRoom, forwardedCategory, forwardedAt
  } = msgObj;

  function fmt(ts) {
    const d = new Date(ts);
    const Y=d.getFullYear(), M=String(d.getMonth()+1).padStart(2,'0'),
          D=String(d.getDate()).padStart(2,'0'),
          h=String(d.getHours()).padStart(2,'0'),
          m=String(d.getMinutes()).padStart(2,'0');
    return `${Y}/${M}/${D} ${h}:${m}`;
  }

  const el = document.createElement('div');
  el.classList.add('chat-message');

  if (forwardedFromRoom) {
    // 転送ヘッダー
    const hdr = document.createElement('div');
    hdr.classList.add('forwarded-header');
    hdr.textContent = `${user}  ${fmt(timestamp)}`;
    el.appendChild(hdr);
    // 転送本文
    const orig = document.createElement('div');
    orig.classList.add('forwarded-content');
    orig.textContent = text;
    el.appendChild(orig);
    // 転送元行
    const ftr = document.createElement('div');
    ftr.classList.add('forwarded-footer');
    ftr.textContent = `転送元: ${forwardedCategory} / ${forwardedFromRoom}  ${fmt(forwardedAt)}`;
    el.appendChild(ftr);
  } else {
    // 通常ヘッダー（左揃え）
    const header = document.createElement('div');
    header.classList.add('message-header');
    header.innerHTML =
      `<span class="username">${user}</span> ` +
      `<span class="timestamp">${fmt(timestamp)}</span>`;
    el.appendChild(header);
    // 本文
    const body = document.createElement('div');
    body.classList.add('message-text');
    body.textContent = text;
    el.appendChild(body);
  }

  if (imageBase64) {
    const img = document.createElement('img');
    img.src = imageBase64;
    img.classList.add('chat-image');
    el.appendChild(img);
  }

  // 返信・転送ボタン
  const info = document.createElement('div');
  info.classList.add('reply-info');
  const replyBtn = document.createElement('button');
  replyBtn.classList.add('btnReply'); replyBtn.dataset.id = key; replyBtn.textContent = '🗨️';
  info.appendChild(replyBtn);
  const fwdBtn = document.createElement('button');
  fwdBtn.classList.add('btnForward'); fwdBtn.dataset.id = key; fwdBtn.textContent = '⤴️';
  info.appendChild(fwdBtn);
  el.appendChild(info);

  if (prepend) messagesEl.insertBefore(el, messagesEl.firstChild);
  else        messagesEl.appendChild(el);
}

// 初回ロード／新着／古い読み込み
async function loadInitial() {
  const q = query(messagesRef, orderByChild('timestamp'), limitToLast(PAGE_SIZE));
  const snap = await get(q);
  const items = Object.entries(snap.val()||{})
    .map(([k,v])=>({key:k,...v}))
    .sort((a,b)=>a.timestamp-b.timestamp);
  items.forEach(i=>renderMessage(i));
  if (items.length) {
    oldestTs = items[0].timestamp;
    newestTs = items[items.length-1].timestamp;
    listenNewer();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}
function listenNewer() {
  const q2 = query(messagesRef, orderByChild('timestamp'), startAt(newestTs+1));
  onChildAdded(q2, snap=>{
    renderMessage({key:snap.key,...snap.val()});
    newestTs = snap.val().timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
async function loadOlder() {
  if (loadingOlder||oldestTs===null) return;
  loadingOlder=true;
  const q3 = query(messagesRef, orderByChild('timestamp'), endAt(oldestTs-1), limitToLast(PAGE_SIZE));
  const snap = await get(q3);
  const items = Object.entries(snap.val()||{})
    .map(([k,v])=>({key:k,...v}))
    .sort((a,b)=>a.timestamp-b.timestamp);
  if (items.length) {
    const prev = messagesEl.scrollHeight;
    items.forEach(i=>renderMessage(i,true));
    oldestTs = items[0].timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight - prev;
  }
  loadingOlder=false;
}
messagesEl.addEventListener('scroll',()=>{ if(messagesEl.scrollTop===0) loadOlder(); });

// — クリック処理 —  
messagesEl.addEventListener('click', e => {
  const tgt = e.target;
  if (tgt.classList.contains('btnReply')) {
    window.location.href = `${location.origin}${repo}/${category}/${roomId}/thread/?id=${tgt.dataset.id}`;
  }
  if (tgt.classList.contains('btnForward')) {
    // 独自UI表示
    showForwardMenu(tgt, tgt.dataset.id);
  }
});

// 転送メニュー表示・選択処理
function showForwardMenu(button, messageId) {
  // メニュー要素をクリア＆表示
  forwardMenu.innerHTML = '';
  forwardMenu.style.display = 'block';
  // 各ルームをリスト化
  roomList.forEach((r,i) => {
    const item = document.createElement('div');
    item.classList.add('forward-item');
    item.textContent = r.label;
    item.dataset.idx = i;
    forwardMenu.appendChild(item);
  });
  // メニュー位置調整
  const rect = button.getBoundingClientRect();
  forwardMenu.style.top  = `${rect.bottom + window.scrollY}px`;
  forwardMenu.style.left = `${rect.left + window.scrollX}px`;

  // クリックで転送実行
  forwardMenu.onclick = async e => {
    const idx = e.target.dataset.idx;
    if (idx == null) return;
    const tgtRoom = roomList[parseInt(idx,10)];
    const origSnap = await get(dbRef(db, `rooms/${category}/${roomId}/messages/${messageId}`));
    const orig = origSnap.val();
    await push(dbRef(db, `rooms/${tgtRoom.category}/${tgtRoom.id}/messages`), {
      uid: auth.currentUser.uid,
      user: auth.currentUser.displayName||auth.currentUser.email,
      text: orig.text,
      imageBase64: orig.imageBase64||'',
      forwardedFromRoom: roomId,
      forwardedCategory: category,
      forwardedAt: Date.now(),
      timestamp: Date.now()
    });
    forwardMenu.style.display = 'none';
    alert(`メッセージを「${tgtRoom.label}」へ転送しました`);
  };
}

// 画面クリックでメニューを閉じる
document.addEventListener('click', e => {
  if (!forwardMenu.contains(e.target) && !e.target.classList.contains('btnForward')) {
    forwardMenu.style.display = 'none';
  }
});

// 起動
loadInitial();
