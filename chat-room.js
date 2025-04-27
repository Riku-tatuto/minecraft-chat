// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  get,
  query,
  orderByChild,
  limitToLast,
  endAt,
  startAt,
  onChildAdded
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, app } from './auth.js';  // logout はもう使わないので除外

const db = getDatabase(app);

// ── URL 解析 ──
const parts    = location.pathname.split('/').filter(Boolean);
// parts[0] = リポジトリ名, parts[1] = category, parts[2] = roomId
const repo     = parts[0] ? `/${parts[0]}` : '';
const category = parts[1] || 'default';
const roomId   = parts[2] || parts[1] || 'lobby';

// Firebase 参照
const allRoomsRef = dbRef(db, `rooms`);
const messagesRef = dbRef(db, `rooms/${category}/${roomId}/messages`);

const PAGE_SIZE = 40;
let oldestTs = null, newestTs = null, loadingOlder = false;
let roomList = [];

// ── DOM 挿入 ──
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
  </div>
`);
const messagesEl = document.getElementById('messages');
const imgInput   = document.getElementById('imgInput');
const btnImg     = document.getElementById('btnImg');
const inputEl    = document.getElementById('msgInput');
const btnSend    = document.getElementById('btnSend');

// ── IME 判定 ──
let isComposing = false;
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// ── 認証監視 ──
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled    = !ok;
  inputEl.disabled   = !ok;
  btnSend.disabled   = !ok;
  inputEl.placeholder = ok ? 'メッセージを入力...' : 'ログインすると送信できます';
});

// ── 画像アップロード ──
btnImg.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', () => {
  const file = imgInput.files[0];
  if (!file) return;
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

// ── テキスト送信 ──
inputEl.addEventListener('keydown', e => {
  if (e.key==='Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault();
    btnSend.click();
  }
});
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  await push(messagesRef, {
    uid:        auth.currentUser.uid,
    user:       auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp:  Date.now()
  });
});

// ── 全ルーム一覧取得（転送先リスト） ──
async function loadRoomList() {
  const snap = await get(allRoomsRef);
  const data = snap.val() || {};
  roomList = [];
  for (const cat of Object.keys(data)) {
    for (const r of Object.keys(data[cat])) {
      roomList.push({ category: cat, id: r, label: `${cat} / ${r}` });
    }
  }
}
loadRoomList();

// ── メッセージ描画 ──
function renderMessage(msgObj, prepend = false) {
  const {
    key, user, text, imageBase64, timestamp,
    replies, forwardedFromRoom, forwardedCategory, forwardedAt
  } = msgObj;

  function fmt(ts) {
    const d = new Date(ts);
    const Y = d.getFullYear();
    const M = String(d.getMonth()+1).padStart(2,'0');
    const D = String(d.getDate()).padStart(2,'0');
    const h = String(d.getHours()).padStart(2,'0');
    const m = String(d.getMinutes()).padStart(2,'0');
    return `${Y}/${M}/${D} ${h}:${m}`;
  }

  const el = document.createElement('div');
  el.classList.add('chat-message');

  if (forwardedFromRoom) {
    // 転送ヘッダー
    const hdr = document.createElement('div');
    hdr.classList.add('forwarded-header');
    hdr.textContent = `${user}  ${fmt(timestamp)}\n転送元: ${forwardedCategory} / ${forwardedFromRoom}`;
    el.appendChild(hdr);
    // オリジナル淡色
    const orig = document.createElement('div');
    orig.classList.add('forwarded-content');
    orig.textContent = text;
    el.appendChild(orig);
    // 転送フッター
    const ftr = document.createElement('div');
    ftr.classList.add('forwarded-footer');
    ftr.textContent = fmt(forwardedAt);
    el.appendChild(ftr);
  } else {
    // 通常メッセージ
    const line = document.createElement('div');
    line.innerHTML = `<span class="username">${user}</span> <span class="timestamp">${fmt(timestamp)}</span>`;
    el.appendChild(line);
    const msg = document.createElement('div');
    msg.classList.add('message-text');
    msg.textContent = text;
    el.appendChild(msg);
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
  replyBtn.classList.add('btnReply');
  replyBtn.dataset.id = key;
  replyBtn.textContent = '🗨️';
  info.appendChild(replyBtn);
  const fwdBtn = document.createElement('button');
  fwdBtn.classList.add('btnForward');
  fwdBtn.dataset.id = key;
  fwdBtn.textContent = '⤴️';
  info.appendChild(fwdBtn);
  el.appendChild(info);

  if (prepend) messagesEl.insertBefore(el, messagesEl.firstChild);
  else        messagesEl.appendChild(el);
}

// ── 初回ロード ──
async function loadInitial() {
  const q = query(messagesRef, orderByChild('timestamp'), limitToLast(PAGE_SIZE));
  const snap = await get(q);
  const items = Object.entries(snap.val()||{})
    .map(([k,v]) => ({ key:k, ...v }))
    .sort((a,b)=>a.timestamp-b.timestamp);
  items.forEach(item=>renderMessage(item));
  if (items.length) {
    oldestTs = items[0].timestamp;
    newestTs = items[items.length-1].timestamp;
    listenNewer();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// ── 新着リスニング ──
function listenNewer() {
  const q2 = query(messagesRef, orderByChild('timestamp'), startAt(newestTs+1));
  onChildAdded(q2, snap => {
    renderMessage({ key:snap.key, ...snap.val() });
    newestTs = snap.val().timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ── 古い読み込み ──
async function loadOlder() {
  if (loadingOlder || oldestTs===null) return;
  loadingOlder = true;
  const q3 = query(messagesRef, orderByChild('timestamp'), endAt(oldestTs-1), limitToLast(PAGE_SIZE));
  const snap = await get(q3);
  const items = Object.entries(snap.val()||{})
    .map(([k,v]) => ({ key:k, ...v }))
    .sort((a,b)=>a.timestamp-b.timestamp);
  if (items.length) {
    const prev = messagesEl.scrollHeight;
    items.forEach(i=>renderMessage(i, true));
    oldestTs = items[0].timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight - prev;
  }
  loadingOlder = false;
}
messagesEl.addEventListener('scroll',()=>{ if(messagesEl.scrollTop===0) loadOlder(); });

// ── クリック処理 ──
messagesEl.addEventListener('click', async e => {
  const tgt = e.target;
  if (tgt.classList.contains('btnReply')) {
    const id = tgt.dataset.id;
    window.location.href = `${location.origin}${repo}/${category}/${roomId}/thread/?id=${id}`;
  }
  if (tgt.classList.contains('btnForward')) {
    const id = tgt.dataset.id;
    const origSnap = await get(dbRef(db, `rooms/${category}/${roomId}/messages/${id}`));
    const orig = origSnap.val();
    const listText = roomList.map((r,i)=>`${i+1}: ${r.label}`).join('\n');
    const sel = prompt(`転送先番号を入力してください：\n${listText}`);
    const idx = parseInt(sel,10)-1;
    if (!roomList[idx]) { alert('正しい番号を入力してください'); return; }
    const tgtRoom = roomList[idx];
    await push(dbRef(db, `rooms/${tgtRoom.category}/${tgtRoom.id}/messages`), {
      uid:        auth.currentUser.uid,
      user:       auth.currentUser.displayName || auth.currentUser.email,
      text:       orig.text,
      imageBase64: orig.imageBase64||'',
      forwardedFromRoom: roomId,
      forwardedCategory: category,
      forwardedAt: Date.now(),
      timestamp:  Date.now()
    });
    alert(`メッセージを「${tgtRoom.label}」へ転送しました`);
  }
});

// ── 起動 ──
loadInitial();
