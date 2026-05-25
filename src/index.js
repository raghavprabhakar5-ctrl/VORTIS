import React from "react";
import ReactDOM from "react-dom/client";
import { initializeApp } from 'firebase/app';
import App from "./App.jsx";
import "./index.css";

const firebaseConfig = {
  apiKey: "AIzaSyBaq5Eq8Spt9xt2Pezt49oSgWoLbm-SzIU",
  authDomain: "vortis-4eb80.firebaseapp.com",
  projectId: "vortis-4eb80",
  storageBucket: "vortis-4eb80.firebasestorage.app",
  messagingSenderId: "163080093012",
  appId: "1:163080093012:web:dc8ea0f123735dac451cc1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);