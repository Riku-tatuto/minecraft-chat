import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const msgEl   = document.getElementById('message');
const regBtn  = document.getElementById('register-btn');
const logBtn  = document.getElementById('login-btn');

regBtn.addEventListener('click', async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailEl.value, passEl.value);
    await sendEmailVerification(auth.currentUser);
    msgEl.textContent = '登録成功！認証メールを送信しました。';
  } catch (err) {
    msgEl.textContent = err.message;
  }
});

logBtn.addEventListener('click', async () => {
  try {
    const userCred = await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
    if (!userCred.user.emailVerified) {
      msgEl.textContent = 'メール認証が完了していません。メールを確認してください。';
      return;
    }
    window.location.href = './chat.html';
  } catch (err) {
    msgEl.textContent = err.message;
  }
});

onAuthStateChanged(auth, user => {
  if (user && user.emailVerified) console.log('ログイン中:', user.email);
});
