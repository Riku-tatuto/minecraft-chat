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

const db      = getDatabase(app);
const roomId  = location.pathname.replace(/\/$/, '').split('/').pop();
const roomRef = dbRef(db, `rooms/${roomId}/messages`);
const PAGE_SIZE = 40;

// state
let oldestTs = null;
let newestTs = null;
let loadingOlder = false;
let hasMore = true;
const loadedKeys = new Set();

// DOM
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

// IME フラグ
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
    await push(roomRef, {
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
  await push(roomRef, {
    uid: auth.currentUser.uid,
    user: auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp: Date.now()
  });
});

// メッセージ表示
function renderMessage(item, prepend = false) {
  if (loadedKeys.has(item.key)) return;
  loadedKeys.add(item.key);

  const { key, user, text, imageBase64, timestamp, replies } = item;
  const time = new Date(timestamp);
  const hh = String(time.getHours()).padStart(2,'0');
  const mm = String(time.getMinutes()).padStart(2,'0');
  const replyCount = replies ? Object.keys(replies).length : 0;

  const el = document.createElement('div');
  el.classList.add('chat-message');
  el.innerHTML = `
    <span class="timestamp">[${hh}:${mm}]</span>
    <span class="username">${user}</span>:
    <span class="message-text">${text}</span>
  `;
  if (imageBase64) {
    const img = document.createElement('img');
    img.src = imageBase64;
    img.alt = '送信された画像';
    img.classList.add('chat-image');
    el.appendChild(img);
  }

  const info = document.createElement('div');
  info.classList.add('reply-info');
  if (replyCount > 0) {
    const countSpan = document.createElement('span');
    countSpan.classList.add('reply-count');
    countSpan.dataset.id = key;
    countSpan.textContent = `${replyCount}件の返信`;
    info.appendChild(countSpan);
  }
  const btn = document.createElement('button');
  btn.classList.add('btnReply');
  btn.dataset.id = key;
  btn.textContent = '🗨️';
  info.appendChild(btn);

  el.appendChild(info);

  if (prepend) messagesEl.insertBefore(el, messagesEl.firstChild);
  else           messagesEl.appendChild(el);
}

// 初回ロード
async function loadInitial() {
  const q = query(roomRef, orderByChild('timestamp'), limitToLast(PAGE_SIZE));
  const snap = await get(q);
  const data = snap.val() || {};
  const items = Object.entries(data)
    .map(([key,val]) => ({ key, ...val }))
    .sort((a,b) => a.timestamp - b.timestamp);

  items.forEach(item => renderMessage(item));
  if (items.length) {
    oldestTs = items[0].timestamp;
    newestTs = items[items.length-1].timestamp;
    listenNewer();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// 新着リスニング
function listenNewer() {
  const qNew = query(roomRef, orderByChild('timestamp'), startAt(newestTs + 1));
  onChildAdded(qNew, snap => {
    const val = snap.val();
    const item = { key: snap.key, ...val };
    renderMessage(item);
    newestTs = val.timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// 古いメッセージ読み込み
async function loadOlder() {
  if (loadingOlder || !hasMore || oldestTs === null) return;
  loadingOlder = true;

  const qOld = query(
    roomRef,
    orderByChild('timestamp'),
    endAt(oldestTs),
    limitToLast(PAGE_SIZE)
  );
  const snap = await get(qOld);
  const data = snap.val() || {};
  const items = Object.entries(data)
    .map(([key,val]) => ({ key, ...val }))
    .sort((a,b) => a.timestamp - b.timestamp);

  // 重複を排除してレンダー
  const newItems = items.filter(item => !loadedKeys.has(item.key));
  newItems.forEach(item => renderMessage(item, true));

  if (newItems.length) {
    oldestTs = newItems[0].timestamp;
  }
  // newItems 件数が PAGE_SIZE 未満ならこれ以上なし
  if (items.length < PAGE_SIZE) {
    hasMore = false;
  }

  // スクロール位置調整
  //  
  // 先に記録しておいた scrollHeight の差分だけ維持
  loadingOlder = false;
}

// スクロールでトリガー（上端 50px以内）
messagesEl.addEventListener('scroll', () => {
  if (messagesEl.scrollTop <= 50) {
    loadOlder();
  }
});

// 返信遷移
messagesEl.addEventListener('click', e => {
  const tgt = e.target;
  if (tgt.classList.contains('reply-count') || tgt.classList.contains('btnReply')) {
    const id = tgt.dataset.id;
    const repo = location.pathname.split('/')[1] || '';
    window.location.href =
      `${location.origin}/${repo}/command/${roomId}/thread/?id=${id}`;
  }
});

// 実行
loadInitial();
