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

const db         = getDatabase(app);
const messagesRef = dbRef(db, `rooms`);

// ページあたりの読み込み数
const PAGE_SIZE = 40;

// 現在表示中のルームID とタイムスタンプ境界
const parts       = location.pathname.replace(/\/$/, '').split('/');
const roomId      = parts[parts.length - 1];
const roomRef     = dbRef(db, `rooms/${roomId}/messages`);
let oldestTs = null;
let newestTs = null;
let loadingOlder = false;

// DOM 要素
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

// メッセージ要素を作る関数
function renderMessage(msgObj, prepend = false) {
  const { key, user, text, imageBase64, timestamp, replies } = msgObj;
  const time = new Date(timestamp);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
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

  // 返信情報コンテナ
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

  if (prepend) {
    messagesEl.insertBefore(el, messagesEl.firstChild);
  } else {
    messagesEl.appendChild(el);
  }
}

// 初回ロード：直近 PAGE_SIZE 件を取得
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
    newestTs = items[items.length - 1].timestamp;
    // 新着リスナー登録
    listenNewer();
    // 最下部へスクロール
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// 新規メッセージのリスニング
function listenNewer() {
  const qNew = query(roomRef, orderByChild('timestamp'), startAt(newestTs + 1));
  onChildAdded(qNew, snap => {
    const val = snap.val();
    const msg = { key: snap.key, ...val };
    renderMessage(msg);
    newestTs = val.timestamp;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// 古いメッセージを追加取得
async function loadOlder() {
  if (loadingOlder || oldestTs === null) return;
  loadingOlder = true;
  const qOld = query(
    roomRef,
    orderByChild('timestamp'),
    endAt(oldestTs - 1),
    limitToLast(PAGE_SIZE)
  );
  const snap = await get(qOld);
  const data = snap.val() || {};
  const items = Object.entries(data)
    .map(([key,val]) => ({ key, ...val }))
    .sort((a,b) => a.timestamp - b.timestamp);

  if (items.length) {
    const previousHeight = messagesEl.scrollHeight;
    items.forEach(item => renderMessage(item, true));
    oldestTs = items[0].timestamp;
    // スクロール位置をキープ
    messagesEl.scrollTop = messagesEl.scrollHeight - previousHeight;
  }
  loadingOlder = false;
}

// スクロールイベント：上端で古いメッセージを読み込む
messagesEl.addEventListener('scroll', () => {
  if (messagesEl.scrollTop === 0) {
    loadOlder();
  }
});

// 返信ボタン・件数クリックの遷移設定
messagesEl.addEventListener('click', e => {
  const tgt = e.target;
  if (tgt.classList.contains('reply-count') || tgt.classList.contains('btnReply')) {
    const id = tgt.dataset.id;
    const segments = location.pathname.split('/');
    const repo     = segments[1] ? `/${segments[1]}` : '';
    window.location.href = `${location.origin}${repo}/command/${roomId}/thread/?id=${id}`;
  }
});

// 初期化
loadInitial();
