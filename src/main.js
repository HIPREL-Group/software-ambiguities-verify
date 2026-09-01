import "./style.css";
import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

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
    await createUserWithEmailAndPassword(auth, email, password);
    message.textContent = "Account created.";
  } catch (error) {
    message.textContent = error.message;
  }
});

logOutButton.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const isSignedIn = Boolean(user);

  form.hidden = isSignedIn;
  signedInView.hidden = !isSignedIn;
  userEmail.textContent = isSignedIn ? `Signed in as ${user.email}` : "";
});