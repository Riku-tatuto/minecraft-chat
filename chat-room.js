// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, logout, app } from './auth.js';

const db = getDatabase(app);

// URL 末尾から roomId を取得
const parts  = location.pathname.replace(/\/$/, '').split('/');
const roomId = parts[parts.length - 1];

// UI 挿入
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
const imgInput    = document.getElementById('imgInput');
const btnImg      = document.getElementById('btnImg');
const inputEl     = document.getElementById('msgInput');
const btnSend     = document.getElementById('btnSend');

let isComposing = false;
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証で送信可否を切り替え
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled  = !ok;
  inputEl.disabled = !ok;
  btnSend.disabled = !ok;
  inputEl.placeholder = ok
    ? 'メッセージを入力...'
    : 'ログインすると送信できます';
});

// 📷 ボタンでファイル選択
btnImg.addEventListener('click', () => imgInput.click());

// ファイル選択時に Base64 化して DB に push
imgInput.addEventListener('change', () => {
  const file = imgInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;  // data:image/png;base64,...
    // push
    const msgRef = dbRef(db, `rooms/${roomId}/messages`);
    await push(msgRef, {
      uid:       auth.currentUser.uid,
      user:      auth.currentUser.displayName || auth.currentUser.email,
      text:      '',
      imageBase64: base64,
      timestamp: Date.now()
    });
  };
  reader.readAsDataURL(file);
  imgInput.value = '';
});

// Enterでテキスト送信
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault();
    btnSend.click();
  }
});

// 送信ボタンでテキスト送信
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  const msgRef = dbRef(db, `rooms/${roomId}/messages`);
  await push(msgRef, {
    uid:       auth.currentUser.uid,
    user:      auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp: Date.now()
  });
});

// リアルタイム受信＆表示
const messagesRef = dbRef(db, `rooms/${roomId}/messages`);
onValue(messagesRef, snapshot => {
  const data = snapshot.val() || {};
  const msgs = Object.values(data).sort((a,b)=>a.timestamp-b.timestamp);
  messagesEl.innerHTML = '';
  msgs.forEach(msg => {
    const time = new Date(msg.timestamp);
    const hh   = String(time.getHours()).padStart(2,'0');
    const mm   = String(time.getMinutes()).padStart(2,'0');
    const el = document.createElement('div');
    el.classList.add('chat-message');
    el.innerHTML = `
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    `;
    if (msg.imageBase64) {
      const img = document.createElement('img');
      img.src       = msg.imageBase64;
      img.alt       = '送信された画像';
      img.className = 'chat-image';
      el.appendChild(img);
    }
    messagesEl.appendChild(el);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
});
