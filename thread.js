// thread.js
import {
  getDatabase,
  ref as dbRef,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, app } from './auth.js';

const db = getDatabase(app);

// URL 解析：["", "リポ名", "category", "roomId", "thread"]
const segs = location.pathname.replace(/\/$/, '').split('/');
const category  = segs[2];       // 例 "command" または "maruti"
const roomId    = segs[3];       // 例 "heya1"
const params    = new URLSearchParams(location.search);
const messageId = params.get('id');

const mainEl    = document.getElementById('thread-main');
const repliesEl = document.getElementById('thread-replies');

// 元メッセージ表示
const mainRef = dbRef(db, `rooms/${category}/${roomId}/messages/${messageId}`);
onValue(mainRef, snap => {
  const msg = snap.val();
  if (!msg) return;
  const t = new Date(msg.timestamp);
  const hh = String(t.getHours()).padStart(2,'0');
  const mm = String(t.getMinutes()).padStart(2,'0');
  mainEl.innerHTML = `
    <div class="chat-message">
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    </div>`;
  if (msg.imageBase64) {
    const img = document.createElement('img');
    img.src = msg.imageBase64;
    img.classList.add('chat-image');
    mainEl.appendChild(img);
  }
});

// 返信入力エリア
mainEl.insertAdjacentHTML('afterend', `
  <div id="reply-input" class="chat-input-area">
    <input type="text" id="replyInput" placeholder="返信を入力..." disabled />
    <button id="btnReplySend" disabled>送信</button>
  </div>
`);
const replyInput   = document.getElementById('replyInput');
const btnReplySend = document.getElementById('btnReplySend');
let isComposing = false;
replyInput.addEventListener('compositionstart', () => { isComposing = true; });
replyInput.addEventListener('compositionend',   () => { isComposing = false; });

// 認証監視
observeAuth(user => {
  const ok = user && user.emailVerified;
  replyInput.disabled   = !ok;
  btnReplySend.disabled = !ok;
  replyInput.placeholder = ok ? '返信を入力...' : 'ログインすると返信できます';
});

// Enter で送信
replyInput.addEventListener('keydown', e => {
  if (e.key==='Enter' && !isComposing && !btnReplySend.disabled) {
    e.preventDefault();
    btnReplySend.click();
  }
});

// 返信送信
btnReplySend.addEventListener('click', async () => {
  const text = replyInput.value.trim();
  if (!text) return;
  replyInput.value = '';
  await push(
    dbRef(db, `rooms/${category}/${roomId}/messages/${messageId}/replies`),
    {
      uid: auth.currentUser.uid,
      user: auth.currentUser.displayName || auth.currentUser.email,
      text,
      timestamp: Date.now()
    }
  );
});

// 返信一覧表示
onValue(
  dbRef(db, `rooms/${category}/${roomId}/messages/${messageId}/replies`),
  snap => {
    repliesEl.innerHTML = '';
    snap.forEach(child => {
      const msg = child.val();
      const t = new Date(msg.timestamp);
      const hh = String(t.getHours()).padStart(2,'0');
      const mm = String(t.getMinutes()).padStart(2,'0');
      const el = document.createElement('div');
      el.classList.add('chat-message');
      el.innerHTML = `
        <span class="timestamp">[${hh}:${mm}]</span>
        <span class="username">${msg.user}</span>:
        <span class="message-text">${msg.text}</span>`;
      repliesEl.appendChild(el);
    });
    repliesEl.scrollTop = repliesEl.scrollHeight;
  }
);
