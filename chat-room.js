// chat-room.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getDatabase,    // Realtime Database 用
  ref,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';  // :contentReference[oaicite:0]{index=0}
import { auth, observeAuth, logout } from './auth.js';

// ── Firebase 初期化 ────────────────────────────────────────
// Firebase コンソールからコピーした設定に databaseURL を追加
const firebaseConfig = {
  apiKey: "AIzaSyA1GqU0-xO_f3Wq6yGOs8nf9ZVFLG-Z4dU",
  authDomain: "minecraft-chat-board.firebaseapp.com",
  databaseURL: "https://minecraft-chat-board-default-rtdb.firebaseio.com",  // ← 追加 :contentReference[oaicite:1]{index=1}
  projectId: "minecraft-chat-board",
  storageBucket: "minecraft-chat-board.firebasestorage.app",
  messagingSenderId: "394340520586",
  appId: "1:394340520586:web:d822713f8d7357104b9373"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);    // Realtime Database インスタンス取得 :contentReference[oaicite:2]{index=2}
// ────────────────────────────────────────────────────────

// ルームID を URL 末尾から取得（例 "heya1"）
const parts  = location.pathname.split('/');
const roomId = parts[parts.length - 1];

// チャット UI を動的に挿入
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

// 認証済みユーザーのみ送信可能
observeAuth(user => {
  if (user && user.emailVerified) {
    inputEl.disabled = false;
    btnSend.disabled = false;
  }
});

// メッセージ送信：push() で JSON を追加
btnSend.addEventListener('click', () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  const msgRef = ref(db, `rooms/${roomId}/messages`);
  push(msgRef, {
    uid: auth.currentUser.uid,
    user: auth.currentUser.displayName || auth.currentUser.email,
    text,
    timestamp: Date.now()
  });
});

// リアルタイム受信：onValue() で値の変化をリッスン :contentReference[oaicite:3]{index=3}
const messagesRef = ref(db, `rooms/${roomId}/messages`);
onValue(messagesRef, snapshot => {
  const data = snapshot.val() || {};
  messagesEl.innerHTML = '';
  Object.values(data).forEach(msg => {
    const el = document.createElement('div');
    el.classList.add('chat-message');
    el.innerHTML = `<strong>${msg.user}</strong>: ${msg.text}`;
    messagesEl.appendChild(el);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
});
