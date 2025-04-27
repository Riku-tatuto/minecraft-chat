// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, logout, app } from './auth.js';

const db     = getDatabase(app);
const parts  = location.pathname.replace(/\/$/, '').split('/');
const roomId = parts[parts.length - 1];

// UI を挿入
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <div id="messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <button id="btnImg" disabled>📷</button>
      <input  id="imgInput" type="file" accept="image/*" style="display:none;" />
      <input  id="msgInput" type="text" placeholder="メッセージを入力..." disabled />
      <button id="btnSend" disabled>送信</button>
    </div>
  </div>
`);

const messagesEl = document.getElementById('messages');
const btnImg     = document.getElementById('btnImg');
const imgInput   = document.getElementById('imgInput');
const inputEl    = document.getElementById('msgInput');
const btnSend    = document.getElementById('btnSend');

let isComposing = false;
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証で送信可否
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled   = !ok;
  inputEl.disabled  = !ok;
  btnSend.disabled  = !ok;
  inputEl.placeholder = ok
    ? 'メッセージを入力...'
    : 'ログインすると送信できます';
});

// 画像アップロード
btnImg.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', async () => {
  const file = imgInput.files[0];
  if (!file) return;
  // Base64 エンコードして push（Storage を使わない方法）
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;  // data:image/…;base64,…
    await push(dbRef(db, `rooms/${roomId}/messages`), {
      uid:         auth.currentUser.uid,
      user:        auth.currentUser.displayName||auth.currentUser.email,
      text:        '',
      imageBase64: base64,
      timestamp:   Date.now()
    });
  };
  reader.readAsDataURL(file);
  imgInput.value = '';
});

// テキスト送信(Enter / ボタン)
inputEl.addEventListener('keydown', e => {
  if (e.key==='Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault();
    btnSend.click();
  }
});
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  await push(dbRef(db, `rooms/${roomId}/messages`), {
    uid:         auth.currentUser.uid,
    user:        auth.currentUser.displayName||auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp:   Date.now()
  });
});

// 受信＆レンダリング（返信機能付き）
onValue(dbRef(db, `rooms/${roomId}/messages`), snapshot => {
  messagesEl.innerHTML = '';
  snapshot.forEach(childSnap => {
    const key = childSnap.key;
    const msg = childSnap.val();
    const time = new Date(msg.timestamp);
    const hh = String(time.getHours()).padStart(2,'0');
    const mm = String(time.getMinutes()).padStart(2,'0');
    const replyObj = msg.replies || {};       // replies があれば取得
    const replyCount = Object.keys(replyObj).length;

    // メッセージ要素作成
    const el = document.createElement('div');
    el.classList.add('chat-message');
    el.innerHTML = `
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    `;
    if (msg.imageBase64) {
      const img = document.createElement('img');
      img.src = msg.imageBase64;
      img.alt = '画像';
      img.classList.add('chat-image');
      el.appendChild(img);
    }

    // 返信カウント＆ボタン
    const info = document.createElement('div');
    info.classList.add('reply-info');
    info.innerHTML = `
      <span class="reply-count" data-id="${key}">${replyCount}件の返信</span>
      <button class="btnReply" data-id="${key}">🗨️ 返信</button>
    `;
    el.appendChild(info);

    messagesEl.appendChild(el);
  });

  // 返信件数リンク＆ボタンにイベント
  document.querySelectorAll('.reply-count, .btnReply')
    .forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.getAttribute('data-id');
        // thread.html へ遷移
        const url = `${location.origin}${location.pathname.replace(/\/[^\/]*$/, '')}/thread.html?room=${roomId}&id=${id}`;
        window.location.href = url;
      });
    });

  messagesEl.scrollTop = messagesEl.scrollHeight;
});
