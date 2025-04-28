// chat-room.js
import {
  getDatabase,
  ref as dbRef,
  push,
  get,
  query,
  orderByChild,
  limitToLast,
  startAt,
  endAt,
  onChildAdded
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';
import { auth, observeAuth, app } from './auth.js';

const db = getDatabase(app);
const parts    = location.pathname.split('/').filter(Boolean);
const repo     = parts[0] ? `/${parts[0]}` : '';
const category = parts[1] || 'default';
const roomId   = parts[2] || parts[1] || 'lobby';

const allRoomsRef = dbRef(db, `rooms`);
const messagesRef = dbRef(db, `rooms/${category}/${roomId}/messages`);

const PAGE_SIZE = 40;
let oldestTs = null, newestTs = null, loadingOlder = false;
let roomList = [];

// ── 日本語表示用マッピング ──
const categoryNames = { command: 'コマンド関連', maruti: 'マルチ募集' };
function dispCategory(cat) { return categoryNames[cat] || cat; }
function dispRoom(id) {
  if (id.startsWith('heya')) return '部屋' + id.slice(4);
  return id;
}

// ── DOM 構築 ──
document.body.insertAdjacentHTML('beforeend', `
  <div id="chat-container">
    <h2>ルーム: ${dispCategory(category)} / ${dispRoom(roomId)}</h2>
    <div id="messages" class="chat-messages"></div>
    …（略）…
  </div>
  <div id="forwardMenu" class="forward-menu" style="display:none;"></div>
`);
const messagesEl  = document.getElementById('messages');
const forwardMenu = document.getElementById('forwardMenu');
// …（略）…

// ── メッセージ描画 ──
function renderMessage(msgObj, prepend=false) {
  const {
    key, user, text, imageBase64, timestamp,
    forwardedFromRoom, forwardedCategory, forwardedAt
  } = msgObj;

  // 要素にキー属性を付与（スクロールターゲット用）
  const el = document.createElement('div');
  el.classList.add('chat-message');
  el.dataset.key = key;

  function fmt(ts) {
    const d = new Date(ts);
    const Y=d.getFullYear(), M=String(d.getMonth()+1).padStart(2,'0'),
          D=String(d.getDate()).padStart(2,'0'),
          h=String(d.getHours()).padStart(2,'0'),
          m=String(d.getMinutes()).padStart(2,'0');
    return `${Y}/${M}/${D} ${h}:${m}`;
  }

  if (forwardedFromRoom) {
    // ── 転送ヘッダー ──
    const hdr = document.createElement('div');
    hdr.classList.add('forwarded-header','clickable');
    hdr.innerHTML =
      `<span class="username">${user}</span>` +
      `<span class="timestamp">${fmt(timestamp)}</span>`;
    // クリックで該当ルーム＋メッセージへ移動
    hdr.addEventListener('click', () => {
      const targetKey = key;
      const url = `${location.origin}${repo}/${forwardedCategory}/${forwardedFromRoom}?scrollTo=${targetKey}`;
      location.href = url;
    });
    el.appendChild(hdr);

    // ── 転送本文 ──
    const orig = document.createElement('div');
    orig.classList.add('forwarded-content');
    orig.textContent = text;
    el.appendChild(orig);

    // ── 転送元行 ──
    const ftr = document.createElement('div');
    ftr.classList.add('forwarded-footer');
    ftr.innerHTML =
      `転送元: <span class="username">${dispCategory(forwardedCategory)} / ${dispRoom(forwardedFromRoom)}</span>` +
      `<span class="timestamp">${fmt(forwardedAt)}</span>`;
    el.appendChild(ftr);

  } else {
    // ── 通常メッセージ ──
    const header = document.createElement('div');
    header.classList.add('message-header');
    header.innerHTML =
      `<span class="username">${user}</span>` +
      `<span class="timestamp">${fmt(timestamp)}</span>`;
    el.appendChild(header);

    const body = document.createElement('div');
    body.classList.add('message-text');
    body.textContent = text;
    el.appendChild(body);
  }

  // …（略：画像・ボタン追加）…

  if (prepend) messagesEl.insertBefore(el, messagesEl.firstChild);
  else        messagesEl.appendChild(el);
}

// ── 初回ロード後に URL パラメータをチェックしスクロール ──
async function loadInitial() {
  // …（既存のデータ取得・描画）…
  // 描画後、自動スクロール
  const params = new URLSearchParams(location.search);
  const scrollToKey = params.get('scrollTo');
  if (scrollToKey) {
    // 少し遅延して要素が DOM に揃ってからスクロール
    setTimeout(() => {
      const tgt = messagesEl.querySelector(`[data-key="${scrollToKey}"]`);
      if (tgt) {
        tgt.scrollIntoView({ behavior: 'smooth', block: 'center' });  // :contentReference[oaicite:0]{index=0}
      }
    }, 300);
  }
}

// ── 以下、新着 listenNewer／古い読み込み も既存のまま… ──

// 初期化：ルーム一覧取得 → loadInitial
async function init() {
  await loadRoomList();
  loadInitial();
}
init();
