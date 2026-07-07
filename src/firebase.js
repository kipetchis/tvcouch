// Configuration et initialisation de Firebase
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAi2OSCF8epgxaQRESX7mZm9TXhkS4sL8w",
  authDomain: "tvcouch-9cb7e.firebaseapp.com",
  projectId: "tvcouch-9cb7e",
  storageBucket: "tvcouch-9cb7e.firebasestorage.app",
  messagingSenderId: "363125620768",
  appId: "1:363125620768:web:97cf2614fe72e690c1fc45",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// ─── Authentification par email / mot de passe ──────
export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// Traduit les codes d'erreur Firebase en messages clairs (FR)
export function authErrorMessage(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Adresse email invalide.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email ou mot de passe incorrect.";
    case "auth/email-already-in-use":
      return "Un compte existe déjà avec cet email.";
    case "auth/weak-password":
      return "Le mot de passe doit contenir au moins 6 caractères.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez plus tard.";
    case "auth/missing-password":
      return "Veuillez saisir un mot de passe.";
    default:
      return "Une erreur est survenue. Réessayez.";
  }
}

// ─── Suppression de compte ──────────────────────────
// Supprime le compte Firebase Auth. Peut nécessiter une reconnexion récente.
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error("no-user");
  await deleteUser(user);
}

// Détermine si l'utilisateur s'est connecté par Google ou par email
export function getAuthProvider() {
  const user = auth.currentUser;
  if (!user || !user.providerData || user.providerData.length === 0) return null;
  return user.providerData[0].providerId; // "google.com" ou "password"
}

// Ré-authentifie l'utilisateur (nécessaire avant suppression si connexion ancienne)
export async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user) throw new Error("no-user");
  const providerId = getAuthProvider();
  if (providerId === "google.com") {
    await reauthenticateWithPopup(user, googleProvider);
  } else {
    // Email/mot de passe : on a besoin du mot de passe
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  }
}
