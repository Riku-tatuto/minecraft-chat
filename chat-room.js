// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, logout, app } from './auth.js';

const db = getDatabase(app);

// ルームID を URL 末尾から取得（例: "heya1"）
const parts  = location.pathname.replace(/\/$/, '').split('/');
const roomId = parts[parts.length - 1];

// チャット UI を動的に挿入
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <div id="messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <input id="imgInput" type="file" accept="image/*" style="display:none;" />
      <button id="btnImg" disabled>📷</button>
      <input  id="msgInput" type="text" placeholder="メッセージを入力..." disabled />
      <button id="btnSend" disabled>送信</button>
    </div>
  </div>
`);

const messagesEl = document.getElementById('messages');
const imgInput    = document.getElementById('imgInput');
const btnImg      = document.getElementById('btnImg');
const inputEl     = document.getElementById('msgInput');
const btnSend     = document.getElementById('btnSend');

let isComposing = false;  // IME 判定フラグ
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証済みユーザーのみ送信可能
observeAuth(user => {
  const ok = user && user.emailVerified;
  btnImg.disabled      = !ok;
  inputEl.disabled     = !ok;
  btnSend.disabled     = !ok;
  inputEl.placeholder  = ok
    ? 'メッセージを入力...'
    : 'ログインすると送信できます';
});

// 画像アップロード（Base64版）
btnImg.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', () => {
  const file = imgInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;
    await push(dbRef(db, `rooms/${roomId}/messages`), {
      uid:         auth.currentUser.uid,
      user:        auth.currentUser.displayName || auth.currentUser.email,
      text:        '',
      imageBase64: base64,
      timestamp:   Date.now()
    });
  };
  reader.readAsDataURL(file);
  imgInput.value = '';
});

// Enterキーでテキスト送信
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
  await push(dbRef(db, `rooms/${roomId}/messages`), {
    uid:         auth.currentUser.uid,
    user:        auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageBase64: '',
    timestamp:   Date.now()
  });
});

// リアルタイム受信＆レンダリング（返信機能付き）
onValue(dbRef(db, `rooms/${roomId}/messages`), snapshot => {
  messagesEl.innerHTML = '';
  snapshot.forEach(childSnap => {
    const key    = childSnap.key;
    const msg    = childSnap.val();
    const time   = new Date(msg.timestamp);
    const hh     = String(time.getHours()).padStart(2,'0');
    const mm     = String(time.getMinutes()).padStart(2,'0');
    const replies    = msg.replies || {};
    const replyCount = Object.keys(replies).length;

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
      img.alt = '送信された画像';
      img.classList.add('chat-image');
      el.appendChild(img);
    }

    // 返信情報
    const info = document.createElement('div');
    info.classList.add('reply-info');
    // 返信件数（0件は表示しない）
    if (replyCount > 0) {
      const countSpan = document.createElement('span');
      countSpan.classList.add('reply-count');
      countSpan.dataset.id = key;
      countSpan.textContent = `${replyCount}件の返信`;
      info.appendChild(countSpan);
    }
    // 返信ボタン（常に存在）
    const btn = document.createElement('button');
    btn.classList.add('btnReply');
    btn.dataset.id = key;
    btn.textContent = '🗨️';
    info.appendChild(btn);

    el.appendChild(info);
    messagesEl.appendChild(el);
  });

  // 返信リンク／ボタン（ルーム内 thread フォルダへ）
  document.querySelectorAll('.reply-count, .btnReply').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.currentTarget.getAttribute('data-id');
      const segments = location.pathname.split('/');
      const repo = segments[1] ? `/${segments[1]}` : '';
      // /command/{roomId}/thread/ へ遷移
      window.location.href = `${location.origin}${repo}/command/${roomId}/thread/?id=${id}`;
    });
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
});
