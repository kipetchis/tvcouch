// Configuration et initialisation de Firebase
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
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