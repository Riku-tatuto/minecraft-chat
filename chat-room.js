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

// URL の最後２セグメントを使って「カテゴリ／部屋ID」を作る
// 例）/command/heya1/ → ['command','heya1'] → category='command', roomId='heya1'
const parts = location.pathname
  .split('/')
  .filter(seg => seg !== '');
const len = parts.length;
const category = len >= 2 ? parts[len - 2] : 'default';
const roomId    = parts[len - 1];

// Firebase 上の参照もネストさせる
// rooms/{category}/{roomId}/messages を使う
const roomRef     = dbRef(db, `rooms/${category}`);
const messagesRef = dbRef(db, `rooms/${category}/${roomId}/messages`);

const PAGE_SIZE = 40;
let oldestTs = null;
let newestTs = null;
let loadingOlder = false;
let roomList = [];

// DOM 挿入
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
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

// IME 判定
let isComposing = false;
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証監視
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled  = !ok;
  inputEl.disabled = !ok;
  btnSend.disabled = !ok;
  inputEl.placeholder = ok
    ? 'メッセージを入力...'
    : 'ログインすると送信できます';
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

// 利用可能なサブ部屋一覧を取得（転送先リスト用）
async function loadRoomList() {
  const snap = await get(roomRef);
  const data = snap.val() || {};
  roomList = Object.keys(data);
}
loadRoomList();

// メッセージ描画
function renderMessage(msgObj, prepend = false) {
  const { key, user, text, imageBase64, timestamp, replies, forwardedFromRoom } = msgObj;
  const time = new Date(timestamp);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const replyCount = replies ? Object.keys(replies).length : 0;

  const el = document.createElement('div');
  el.classList.add('chat-message');

  if (forwardedFromRoom) {
    const fwd = document.createElement('div');
    fwd.classList.add('forward-info');
    fwd.textContent = `🔄 転送元: ${forwardedFromRoom}`;
    el.appendChild(fwd);
  }

  el.insertAdjacentHTML('beforeend', `
    <span class="timestamp">[${hh}:${mm}]</span>
    <span class="username">${user}</span>:
    <span class="message-text">${text}</span>
  `);
  if (imageBase64) {
    const img = document.createElement('img');
    img.src = imageBase64;
    img.alt = '送信された画像';
    img.classList.add('chat-image');
    el.appendChild(img);
  }

  // 返信・転送ボタン
  const info = document.createElement('div');
  info.classList.add('reply-info');
  if (replyCount > 0) {
    const countSpan = document.createElement('span');
    countSpan.classList.add('reply-count');
    countSpan.dataset.id = key;
    countSpan.textContent = `${replyCount}件の返信`;
    info.appendChild(countSpan);
  }
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

// 初回ロード
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

// 新着リスニング
function listenNewer() {
  const qNew = query(messagesRef, orderByChild('timestamp'), startAt(newestTs + 1));
  onChildAdded(qNew, snap => {
    const val = snap.val();
    renderMessage({ key: snap.key, ...val });
    newestTs = val.timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// 古いメッセージ読み込み
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
messagesEl.addEventListener('scroll', () => {
  if (messagesEl.scrollTop === 0) loadOlder();
});

// 返信・転送のクリック処理
messagesEl.addEventListener('click', async e => {
  const tgt = e.target;
  if (tgt.classList.contains('btnReply') || tgt.classList.contains('reply-count')) {
    const id = tgt.dataset.id;
    window.location.href = `${location.origin}/${category}/${roomId}/thread/?id=${id}`;
  }
  if (tgt.classList.contains('btnForward')) {
    const id = tgt.dataset.id;
    const origSnap = await get(dbRef(db, `rooms/${category}/${roomId}/messages/${id}`));
    const orig = origSnap.val();
    const target = prompt(
      `転送先のルームを入力してください。\n利用可能: ${roomList.join(', ')}`
    );
    if (!target || !roomList.includes(target)) {
      alert('正しいルーム名を入力してください。');
      return;
    }
    await push(dbRef(db, `rooms/${category}/${target}/messages`), {
      uid: auth.currentUser.uid,
      user: auth.currentUser.displayName || auth.currentUser.email,
      text: orig.text,
      imageBase64: orig.imageBase64 || '',
      forwardedFromRoom: roomId,
      timestamp: Date.now()
    });
    alert(`メッセージを ${target} へ転送しました。`);
  }
});

// 初期化
loadInitial();
