// client/src/App.jsx
import { useState, useEffect } from 'react';
import { api, saveToken, clearToken } from './api.js';
import FlowDeskUI from './FlowDeskUI.jsx';

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
  const [status, setStatus] = useState(null);
  const [user,   setUser]   = useState(null);

  useEffect(() => {
    api.status()
      .then(s => {
        setStatus(s);
        const token = localStorage.getItem('fd_token');
        if (!token) return null;
        return api.me().catch(() => { clearToken(); return null; });
      })
      .then(me => { if (me) setUser(me); })
      .catch(() => setStatus({ hasTeamLead: false }));
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

  return (
    <FlowDeskUI
      serverStatus={status}
      currentUser={user}
      onLogin={handleLogin}
      onLogout={handleLogout}
    />
  );
}
