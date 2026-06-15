import React from "react";
import ReactDOM from "react-dom/client";
import { initializeApp } from 'firebase/app';
import App from "./App.jsx";
import "./index.css";

// Firebase configuration - MUST BE BEFORE ReactDOM.render
const firebaseConfig = {
  apiKey: "AIzaSyBaq5Eq8Spt9xt2Pezt49oSgWoLbm-SzIU",
  authDomain: "vortis-ai.vercel.app",
  projectId: "vortis-4eb80",
  storageBucket: "vortis-4eb80.firebasestorage.app",
  messagingSenderId: "163080093012",
  appId: "1:163080093012:web:dc8ea0f123735dac451cc1"
};

// Initialize Firebase - MUST BE BEFORE ReactDOM.render
initializeApp(firebaseConfig);

// THEN render the app
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);