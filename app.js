// モジュール読み込み
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 要素取得
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const msgEl   = document.getElementById('message');
const regBtn  = document.getElementById('register-btn');
const logBtn  = document.getElementById('login-btn');

// 登録処理
regBtn.addEventListener('click', async () => {
  const email = emailEl.value;
  const pass  = passEl.value;
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(auth.currentUser);
    msgEl.textContent = '登録成功！認証メールを送信しました。';
  } catch (err) {
    msgEl.textContent = err.message;
  }
});

// ログイン処理
logBtn.addEventListener('click', async () => {
  const email = emailEl.value;
  const pass  = passEl.value;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    if (!userCredential.user.emailVerified) {
      msgEl.textContent = 'メール認証が完了していません。メールボックスを確認してください。';
      return;
    }
    // 認証済みならチャット画面へリダイレクト
    window.location.href = './chat.html';
  } catch (err) {
    msgEl.textContent = err.message;
  }
});

// 認証状態の監視 (オプション)
onAuthStateChanged(auth, user => {
  if (user && user.emailVerified) {
    console.log('ログイン済み:', user.email);
  }
});
