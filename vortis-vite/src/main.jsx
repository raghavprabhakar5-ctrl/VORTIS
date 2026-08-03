import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { initializeApp } from 'firebase/app';
import Privacy from "./Privacy.jsx";
import Terms from "./Terms.jsx";
import NotFound from "./NotFound.jsx";
import "./index.css";

const App = lazy(() => import("./App.jsx"));

// Firebase configuration - MUST BE BEFORE ReactDOM.render
const firebaseConfig = {
  apiKey: "AIzaSyBaq5Eq8Spt9xt2Pezt49oSgWoLbm-SzIU",
  authDomain: "vortis-4eb80.firebaseapp.com",
  projectId: "vortis-4eb80",
  storageBucket: "vortis-4eb80.firebasestorage.app",
  messagingSenderId: "163080093012",
  appId: "1:163080093012:web:dc8ea0f123735dac451cc1"
};

// Initialize Firebase - MUST BE BEFORE ReactDOM.render
initializeApp(firebaseConfig);

// Simple path-based routing (no react-router needed)
function Root() {
  const path = window.location.pathname;

  if (path === "/") {
    return (
      <Suspense fallback={<div style={{ background: '#03030a', height: '100vh' }} />}>
        <App />
      </Suspense>
    );
  }
  if (path === "/privacy") return <Privacy />;
  if (path === "/terms") return <Terms />;

  return <NotFound />;
}

// THEN render the app
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);