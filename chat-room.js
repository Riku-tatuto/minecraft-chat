// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js';
import { auth, observeAuth, logout, app } from './auth.js';

// Realtime Database インスタンス
const db = getDatabase(app);
// Storage インスタンス
const storage = getStorage(app);

// URL末尾から roomId を取得 (例: "heya1")
const parts  = location.pathname.replace(/\/$/, '').split('/');
const roomId = parts[parts.length - 1];

// チャット UI を挿入
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <div id="messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <input id="imgInput" type="file" accept="image/*" style="display:none;" />
      <button id="btnImg">📷</button>
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

let isComposing = false;  // IME 判定

// IME 入力中フラグ管理
inputEl.addEventListener('compositionstart', () => { isComposing = true; });
inputEl.addEventListener('compositionend',   () => { isComposing = false; });

// 認証状態で送信可否／プレースホルダーを切り替え
observeAuth(user => {
  if (user && user.emailVerified) {
    btnImg.disabled      = false;
    inputEl.disabled     = false;
    btnSend.disabled     = false;
    inputEl.placeholder  = 'メッセージを入力...';
  } else {
    btnImg.disabled      = true;
    inputEl.disabled     = true;
    btnSend.disabled     = true;
    inputEl.placeholder  = 'ログインすると送信できます';
  }
});

// 📷 ボタンでファイル選択ダイアログを開く
btnImg.addEventListener('click', () => {
  imgInput.click();
});

// ファイル選択時のアップロード処理
imgInput.addEventListener('change', async () => {
  const file = imgInput.files[0];
  if (!file) return;
  // 一時的にボタンを無効化
  btnImg.disabled = true;

  // Storage のパスを rooms/{roomId}/images/{timestamp}-{ファイル名}
  const path = `rooms/${roomId}/images/${Date.now()}-${file.name}`;
  const sRef = storageRef(storage, path);

  try {
    // アップロード
    await uploadBytes(sRef, file);
    // ダウンロード URL を取得
    const url = await getDownloadURL(sRef);

    // Database に流す
    const msgRef = dbRef(db, `rooms/${roomId}/messages`);
    await push(msgRef, {
      uid:       auth.currentUser.uid,
      user:      auth.currentUser.displayName || auth.currentUser.email,
      imageURL:  url,
      text:      '',                // テキストは空
      timestamp: Date.now()
    });
  } catch (e) {
    console.error('画像アップロードエラー:', e);
    alert('画像のアップロードに失敗しました。');
  } finally {
    // リセット＆ボタン再有効化
    imgInput.value  = '';
    btnImg.disabled = false;
  }
});

// Enterキーでメッセージ送信
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !isComposing && !btnSend.disabled) {
    e.preventDefault();
    btnSend.click();
  }
});

// 送信ボタン：テキストメッセージ
btnSend.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';

  const msgRef = dbRef(db, `rooms/${roomId}/messages`);
  await push(msgRef, {
    uid:       auth.currentUser.uid,
    user:      auth.currentUser.displayName || auth.currentUser.email,
    text,
    imageURL:  '',
    timestamp: Date.now()
  });
});

// リアルタイム受信＆レンダリング
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
    // タイムスタンプ＋ユーザー名
    el.innerHTML = `
      <span class="timestamp">[${hh}:${mm}]</span>
      <span class="username">${msg.user}</span>:
      <span class="message-text">${msg.text}</span>
    `;
    // 画像があれば下に表示
    if (msg.imageURL) {
      const imgEl = document.createElement('img');
      imgEl.src = msg.imageURL;
      imgEl.alt = '送信された画像';
      imgEl.classList.add('chat-image');
      el.appendChild(imgEl);
    }
    messagesEl.appendChild(el);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
});
