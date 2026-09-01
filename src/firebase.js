import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-east1");
export const db = getFirestore(app);

if (import.meta.env.DEV) {
  // Point the emulators at this page's own origin rather than at loopback:
  // vite.config.js proxies them, so the app works unchanged whether it is
  // opened on the dev machine, over a forwarded port, or across the network.
  const { origin, hostname, port } = window.location;
  try {
    connectAuthEmulator(auth, origin, { disableWarnings: true });
    connectFunctionsEmulator(functions, hostname, Number(port) || 80);
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {
    // Emulators already connected
  }
}

export default app;
