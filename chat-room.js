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
import { auth, observeAuth, logout, app } from './auth.js';

const db = getDatabase(app);

// ── URL 解析 ──
// location.pathname = "/minecraft-chat-board/command/heya1" など
const parts = location.pathname.split('/').filter(Boolean);
// parts[0] = "minecraft-chat-board", parts[1] = "command", parts[2] = "heya1"
const repo     = parts[0] ? `/${parts[0]}` : '';
const category = parts[1] || 'default';
const roomId   = parts[2] || parts[1] || 'lobby';

// Firebase の参照
const allRoomsRef = dbRef(db, `rooms`);
const messagesRef = dbRef(db, `rooms/${category}/${roomId}/messages`);

const PAGE_SIZE = 40;
let oldestTs = null;
let newestTs = null;
let loadingOlder = false;
let roomList = [];

// ── DOM 挿入 ──
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <div id="sidebar">
      <button id="btnLogout">ログアウト</button>
    </div>
    <div id="main">
      <div id="room-header">ルーム: ${category} / ${roomId}</div>
      <div id="messages" class="chat-messages"></div>
      <div class="chat-input-area">
        <input id="imgInput" type="file" accept="image/*" style="display:none;" />
        <button id="btnImg" disabled>📷</button>
        <input id="msgInput" type="text" placeholder="メッセージを入力..." disabled />
        <button id="btnSend" disabled>送信</button>
      </div>
    </div>
  </div>
`);
const messagesEl = document.getElementById('messages');
const imgInput   = document.getElementById('imgInput');
const btnImg     = document.getElementById('btnImg');
const inputEl    = document.getElementById('msgInput');
const btnSend    = document.getElementById('btnSend');
const btnLogout  = document.getElementById('btnLogout');

// ログアウトボタン
btnLogout.addEventListener('click', () => logout());

// IME 判定
let isComposing = false;
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証監視
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled   = !ok;
  inputEl.disabled  = !ok;
  btnSend.disabled  = !ok;
  inputEl.placeholder = ok ? 'メッセージを入力...' : 'ログインすると送信できます';
});

// 画像アップロード（Base64）
btnImg.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', () => {
  const file = imgInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    await push(messagesRef, {
      uid: auth.currentUser.uid,
      user: auth.currentUser.displayName || auth.currentUser.email,
      text: '',
      imageBase64: reader.result,
      timestamp: Date.now()
    });
  };
  reader.readAsDataURL(file);
  imgInput.value = '';
});

// テキスト送信
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault();
    btnSend.click();
  }
});
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  await push(messagesRef, {
    uid: auth.currentUser.uid,
    user: auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp: Date.now()
  });
});

// ── 全ルームリスト取得（転送用） ──
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
  const { key, user, text, imageBase64, timestamp, replies, forwardedFromRoom } = msgObj;
  const time = new Date(timestamp);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const replyCount = replies ? Object.keys(replies).length : 0;

  const el = document.createElement('div');
  el.classList.add('chat-message');

  // 転送元表示
  if (forwardedFromRoom) {
    const fwd = document.createElement('div');
    fwd.classList.add('forward-info');
    fwd.textContent = `🔄 転送元: ${forwardedFromRoom}`;
    el.appendChild(fwd);
  }

  // テキスト部
  const textSpan = document.createElement('span');
  textSpan.classList.add('message-text');
  textSpan.textContent = `[${hh}:${mm}] ${user}: ${text}`;
  el.appendChild(textSpan);

  // 画像部
  if (imageBase64) {
    const img = document.createElement('img');
    img.src = imageBase64;
    img.alt = '送信された画像';
    img.classList.add('chat-image');
    el.appendChild(img);
  }

  // 返信・転送ボタン部
  const info = document.createElement('div');
  info.classList.add('reply-info');
  // 返信数
  if (replyCount > 0) {
    const countSpan = document.createElement('span');
    countSpan.classList.add('reply-count');
    countSpan.dataset.id = key;
    countSpan.textContent = `${replyCount}件の返信`;
    info.appendChild(countSpan);
  }
  // 返信ボタン
  const replyBtn = document.createElement('button');
  replyBtn.classList.add('btnReply');
  replyBtn.dataset.id = key;
  replyBtn.textContent = '🗨️';
  info.appendChild(replyBtn);
  // 転送ボタン
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
  const data = snap.val() || {};
  const items = Object.entries(data)
    .map(([key,val]) => ({ key, ...val }))
    .sort((a,b) => a.timestamp - b.timestamp);
  items.forEach(item => renderMessage(item));
  if (items.length) {
    oldestTs = items[0].timestamp;
    newestTs = items[items.length - 1].timestamp;
    listenNewer();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// ── 新着リスニング ──
function listenNewer() {
  const qNew = query(messagesRef, orderByChild('timestamp'), startAt(newestTs + 1));
  onChildAdded(qNew, snap => {
    const val = snap.val();
    renderMessage({ key: snap.key, ...val });
    newestTs = val.timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ── 古いメッセージ読み込み ──
async function loadOlder() {
  if (loadingOlder || oldestTs === null) return;
  loadingOlder = true;
  const qOld = query(messagesRef, orderByChild('timestamp'), endAt(oldestTs - 1), limitToLast(PAGE_SIZE));
  const snap = await get(qOld);
  const data = snap.val() || {};
  const items = Object.entries(data)
    .map(([key,val]) => ({ key, ...val }))
    .sort((a,b) => a.timestamp - b.timestamp);
  if (items.length) {
    const prevHeight = messagesEl.scrollHeight;
    items.forEach(item => renderMessage(item, true));
    oldestTs = items[0].timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight - prevHeight;
  }
  loadingOlder = false;
}

// スクロールで古い読み込みトリガー
messagesEl.addEventListener('scroll', () => {
  if (messagesEl.scrollTop === 0) loadOlder();
});

// ── クリック処理：返信・転送 ──
messagesEl.addEventListener('click', async e => {
  const tgt = e.target;
  // 返信
  if (tgt.classList.contains('btnReply') || tgt.classList.contains('reply-count')) {
    const id = tgt.dataset.id;
    window.location.href = `${location.origin}${repo}/${category}/${roomId}/thread/?id=${id}`;
  }
  // 転送
  if (tgt.classList.contains('btnForward')) {
    const id = tgt.dataset.id;
    const origSnap = await get(dbRef(db, `rooms/${category}/${roomId}/messages/${id}`));
    const orig = origSnap.val();
    const listText = roomList.map((r,i) => `${i+1}: ${r.label}`).join('\n');
    const sel = prompt(`転送先番号を入力してください：\n${listText}`);
    const idx = parseInt(sel, 10) - 1;
    if (!roomList[idx]) {
      alert('正しい番号を入力してください');
      return;
    }
    const target = roomList[idx];
    await push(dbRef(db, `rooms/${target.category}/${target.id}/messages`), {
      uid: auth.currentUser.uid,
      user: auth.currentUser.displayName || auth.currentUser.email,
      text: orig.text,
      imageBase64: orig.imageBase64 || '',
      forwardedFromRoom: roomId,
      timestamp: Date.now()
    });
    alert(`メッセージを「${target.label}」へ転送しました`);
  }
});

// ── 初期化実行 ──
loadInitial();
