// auth.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getAuth,                // ← 追加
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

// ── ここに Firebase コンソールで取得した設定を丸ごと貼り付け ──
const firebaseConfig = {
  apiKey: "AIzaSyA1GqU0-xO_f3Wq6yGOs8nf9ZVFLG-Z4dU",
  authDomain: "minecraft-chat-board.firebaseapp.com",
  projectId: "minecraft-chat-board",
  storageBucket: "minecraft-chat-board.firebasestorage.app",
  messagingSenderId: "394340520586",
  appId: "1:394340520586:web:d822713f8d7357104b9373"
};
// ────────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ログイン状態の変化を監視
export function observeAuth(onUserChanged) {
  onAuthStateChanged(auth, user => {
    onUserChanged(user);
  });
}

// メール＆パスワードでログイン
export async function loginWithEmail(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

// 新規登録（登録後に認証メール送信）
export async function registerWithEmail(email, password) {
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(userCred.user);
  return userCred;
}

// メール認証の再送信
export async function resendVerificationEmail() {
  if (!auth.currentUser) {
    throw new Error('ログイン状態が正しくありません。');
  }
  await sendEmailVerification(auth.currentUser);
}

// ログアウト
export async function logout() {
  await signOut(auth);
}

// ユーザー名（displayName）を Firebase に設定
export async function setUsername(displayName) {
  if (!auth.currentUser) {
    throw new Error('ログイン状態が正しくありません。');
  }
  await updateProfile(auth.currentUser, { displayName });
}
