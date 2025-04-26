// chat-room.js
import {
  getDatabase,
  ref,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, logout, app } from './auth.js';

const db = getDatabase(app);

// ルームID を URL 末尾から取得
const parts  = location.pathname.replace(/\/$/, '').split('/');
const roomId = parts[parts.length - 1];

// チャット UI を挿入
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <div id="messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <input id="msgInput" type="text" placeholder="メッセージを入力..." disabled />
      <button id="btnSend" disabled>送信</button>
    </div>
  </div>
`);

const messagesEl = document.getElementById('messages');
const inputEl    = document.getElementById('msgInput');
const btnSend    = document.getElementById('btnSend');

let isComposing = false;  // IME の確定中判定フラグ

// IME 入力開始／終了を監視
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend', () => { isComposing = false; });

// 認証済みユーザーのみ送信可能
observeAuth(user => {
  if (user && user.emailVerified) {
    inputEl.disabled    = false;
    btnSend.disabled    = false;
    inputEl.placeholder = 'メッセージを入力...';
  } else {
    inputEl.disabled    = true;
    btnSend.disabled    = true;
    inputEl.placeholder = 'ログインするとメッセージを送信できます';
  }
});

// Enter キーで送信（IME 確定中は無視）
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault();  // 改行挿入を防ぐ
    btnSend.click();
  }
});

// メッセージ送信：push() で JSON を追加
btnSend.addEventListener('click', () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';  // 送信後に必ずクリア

  const msgRef = ref(db, `rooms/${roomId}/messages`);
  push(msgRef, {
    uid: auth.currentUser.uid,
    user: auth.currentUser.displayName || auth.currentUser.email,
    text,
    timestamp: Date.now()
  });
});

// リアルタイム受信：onValue() で値の変化をリッスン
const messagesRef = ref(db, `rooms/${roomId}/messages`);
onValue(messagesRef, snapshot => {
  const data = snapshot.val() || {};
  const msgs = Object.values(data)
    .sort((a, b) => a.timestamp - b.timestamp);

  messagesEl.innerHTML = '';
  msgs.forEach(msg => {
    const time = new Date(msg.timestamp);
    const hh   = String(time.getHours()).padStart(2, '0');
    const mm   = String(time.getMinutes()).padStart(2, '0');

    const el = document.createElement('div');
    el.classList.add('chat-message');
    el.innerHTML = `
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    `;
    messagesEl.appendChild(el);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
});
