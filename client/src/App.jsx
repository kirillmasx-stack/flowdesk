// client/src/App.jsx
// This file wires the real API to the FlowDesk UI.
// The full UI component is imported from FlowDeskUI.jsx
// which is a direct copy of the artifact (teamlead-crm.jsx)
// with the mock data replaced by API calls.

import { useState, useEffect } from 'react';
import { api, saveToken, clearToken } from './api.js';

// ── Loading screen ───────────────────────────────────────
function Loading() {
  return (
    <div style={{ minHeight:'100vh', background:'#0a0c10', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'#4a5168' }}>
        <div style={{ fontSize:28, fontWeight:800, marginBottom:12 }}>Flow<span style={{ color:'#00e5ff' }}>Desk</span></div>
        <div style={{ fontSize:13 }}>Загрузка…</div>
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null); // null = loading, {hasTeamLead}
  const [user,   setUser]   = useState(null);

  // ── On mount: check server status + restore session ────
  useEffect(() => {
    Promise.all([
      api.status().catch(() => ({ hasTeamLead: true })),
      api.me().catch(() => null),
    ]).then(([s, me]) => {
      setStatus(s);
      if (me) setUser(me);
    });
  }, []);

  const handleLogin = (token, userData) => {
    saveToken(token);
    setUser(userData);
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
  };

  if (status === null) return <Loading />;

  // Lazy-load the full UI (it's large)
  const FlowDeskUI = require('./FlowDeskUI.jsx').default;

  return (
    <FlowDeskUI
      serverStatus={status}
      currentUser={user}
      onLogin={handleLogin}
      onLogout={handleLogout}
    />
  );
}
