// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyA835NIEP6JviqiS54DyVZP3peYcd17xe4",
    authDomain: "software-ambi.firebaseapp.com",
    projectId: "software-ambi",
    storageBucket: "software-ambi.firebasestorage.app",
    messagingSenderId: "567168952202",
    appId: "1:567168952202:web:100104feb83aed5fae4a73",
    measurementId: "G-ZRY0ZL0K72"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);