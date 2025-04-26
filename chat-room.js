// chat-room.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';
import { auth, observeAuth, logout } from './auth.js';

// Firebase 初期化（auth.js と同じ設定を貼り付け）
const firebaseConfig = {
  apiKey: "AIzaSyA1GqU0-xO_f3Wq6yGOs8nf9ZVFLG-Z4dU",
  authDomain: "minecraft-chat-board.firebaseapp.com",
  projectId: "minecraft-chat-board",
  databaseURL: "https://minecraft-chat-board-default-rtdb.firebaseio.com/",  // ← 追加
  storageBucket: "minecraft-chat-board.firebasestorage.app",
  messagingSenderId: "394340520586",
  appId: "1:394340520586:web:d822713f8d7357104b9373"
};
initializeApp(firebaseConfig);
const db = getFirestore();

// URL 末尾をルーム ID として取得
const parts = location.pathname.split('/');
const roomId = parts[parts.length - 1];  // "heya1" など

// UI 要素を動的に作成
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

// 認証状態によって送信可能／不可を切り替え
observeAuth(user => {
  if (user && user.emailVerified) {
    inputEl.disabled = false;
    btnSend.disabled = false;
  } else {
    inputEl.disabled = true;
    btnSend.disabled = true;
  }
});

// メッセージ送信
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  await addDoc(collection(db, `messages_${roomId}`), {
    uid: auth.currentUser.uid,
    user: auth.currentUser.displayName || auth.currentUser.email,
    text,
    timestamp: serverTimestamp()
  });
});

// リアルタイム受信（onSnapshot でリッスン） :contentReference[oaicite:0]{index=0}
const q = query(
  collection(db, `messages_${roomId}`),
  orderBy('timestamp', 'asc')
);
onSnapshot(q, snap => {
  messagesEl.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const el = document.createElement('div');
    el.classList.add('chat-message');
    el.innerHTML = `<strong>${d.user}</strong>: ${d.text}`;
    messagesEl.appendChild(el);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
});
