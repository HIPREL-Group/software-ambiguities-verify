import "./style.css";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

const form = document.querySelector("#auth-form");
const signUpButton = document.querySelector("#sign-up-button");
const logOutButton = document.querySelector("#log-out-button");
const signedInView = document.querySelector("#signed-in-view");
const userEmail = document.querySelector("#user-email");
const message = document.querySelector("#message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = form.email.value;
  const password = form.password.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  }
});

signUpButton.addEventListener("click", async () => {
  const email = form.email.value;
  const password = form.password.value;

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      displayName: "",
      createdAt: serverTimestamp(),
    });

    message.textContent = "Account created.";
  } catch (error) {
    message.textContent = error.message;
  }
});

logOutButton.addEventListener("click", () => signOut(auth));

async function loadUserProfile(userId) {
  const profileRef = doc(db, "users", userId);
  const profileSnapshot = await getDoc(profileRef);

  if (!profileSnapshot.exists()) {
    return null;
  }

  return profileSnapshot.data();
}

onAuthStateChanged(auth, async (user) => {
  const isSignedIn = Boolean(user);

  form.hidden = isSignedIn;
  signedInView.hidden = !isSignedIn;

  if (!user) {
    userEmail.textContent = "";
    return;
  }

  userEmail.textContent = "Loading profile...";

  try {
    const profile = await loadUserProfile(user.uid);

    if (!profile) {
      userEmail.textContent = "Signed in, but no profile was found.";
      return;
    }

    const name = profile.displayName || "No display name yet";
    userEmail.textContent = `Signed in as ${name} (${user.email})`;
  } catch (error) {
    userEmail.textContent = `Could not load your profile.`;
    console.error(error);
  }

  userEmail.textContent = isSignedIn ? `Signed in as ${user.email}` : "";
});
