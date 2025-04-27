// thread.js
import {
  getDatabase,
  ref as dbRef,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, app } from './auth.js';

const db = getDatabase(app);

// URL から room と messageId を取得
const params  = new URLSearchParams(location.search);
const roomId   = params.get('room');
const messageId= params.get('id');

// 要素取得
const mainEl    = document.getElementById('thread-main');
const repliesEl = document.getElementById('thread-replies');

// 元メッセージを表示
const mainRef = dbRef(db, `rooms/${roomId}/messages/${messageId}`);
onValue(mainRef, snap => {
  const msg = snap.val();
  if (!msg) return;
  const time = new Date(msg.timestamp);
  const hh = String(time.getHours()).padStart(2,'0');
  const mm = String(time.getMinutes()).padStart(2,'0');

  mainEl.innerHTML = `
    <div class="chat-message">
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    </div>
  `;
  if (msg.imageBase64) {
    const img = document.createElement('img');
    img.src = msg.imageBase64;
    img.classList.add('chat-image');
    mainEl.appendChild(img);
  }
});

// 返信用 UI を挿入
mainEl.insertAdjacentHTML('afterend', `
  <div id="reply-input" class="chat-input-area">
    <input id="replyInput" type="text" placeholder="返信を入力..." disabled />
    <button id="btnReplySend" disabled>送信</button>
  </div>
`);

const replyInput = document.getElementById('replyInput');
const btnReplySend = document.getElementById('btnReplySend');

// 認証で有効化
observeAuth(user => {
  const ok = user && user.emailVerified;
  replyInput.disabled   = !ok;
  btnReplySend.disabled = !ok;
  replyInput.placeholder = ok
    ? '返信を入力...'
    : 'ログインすると返信できます';
});

// Enter で送信
replyInput.addEventListener('keydown', e => {
  if (e.key==='Enter' && !replyInput.disabled) {
    e.preventDefault();
    btnReplySend.click();
  }
});

// 返信送信
btnReplySend.addEventListener('click', async () => {
  const text = replyInput.value.trim();
  if (!text) return;
  replyInput.value = '';
  await push(dbRef(db, `rooms/${roomId}/messages/${messageId}/replies`), {
    uid:         auth.currentUser.uid,
    user:        auth.currentUser.displayName||auth.currentUser.email,
    text,
    timestamp:   Date.now()
  });
});

// 返信一覧をリアルタイム表示
onValue(dbRef(db, `rooms/${roomId}/messages/${messageId}/replies`), snap => {
  repliesEl.innerHTML = '';
  snap.forEach(child => {
    const msg = child.val();
    const time = new Date(msg.timestamp);
    const hh = String(time.getHours()).padStart(2,'0');
    const mm = String(time.getMinutes()).padStart(2,'0');
    const el = document.createElement('div');
    el.classList.add('chat-message');
    el.innerHTML = `
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    `;
    repliesEl.appendChild(el);
  });
  repliesEl.scrollTop = repliesEl.scrollHeight;
});
