// client/src/api.js
// Centralised API client — all requests go through here

const BASE = '/api';

function getToken() {
  return localStorage.getItem('fd_token');
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  status:            ()          => req('GET',   '/auth/status'),
  login:             (b)         => req('POST',  '/auth/login', b),
  registerTL:        (b)         => req('POST',  '/auth/register-teamlead', b),
  register:          (b)         => req('POST',  '/auth/register', b),
  me:                ()          => req('GET',   '/auth/me'),
  validateInvite:    (token)     => req('GET',   `/team/invites/validate/${token}`),

  // Team
  getUsers:          ()          => req('GET',   '/team/users'),
  updateUser:        (id, b)     => req('PATCH', `/team/users/${id}`, b),
  getInvites:        ()          => req('GET',   '/team/invites'),
  createInvite:      (b)         => req('POST',  '/team/invites', b),
  deleteInvite:      (token)     => req('DELETE',`/team/invites/${token}`),

  // Caps
  getCaps:           ()          => req('GET',   '/caps'),
  createCap:         (b)         => req('POST',  '/caps', b),
  updateCap:         (id, b)     => req('PATCH', `/caps/${id}`, b),
  deleteCap:         (id)        => req('DELETE',`/caps/${id}`),
  bulkUpdateCaps:    (updates)   => req('POST',  '/caps/bulk-update', { updates }),

  // Resources
  getResources:      ()          => req('GET',   '/resources'),
  createResource:    (b)         => req('POST',  '/resources', b),
  updateResource:    (id, b)     => req('PATCH', `/resources/${id}`, b),
  deleteResource:    (id)        => req('DELETE',`/resources/${id}`),

  // Keitaro
  keitaroSync:       ()          => req('POST',  '/keitaro/sync'),
  keitaroConfig:     ()          => req('GET',   '/keitaro/config'),
  keitaroHistory:    ()          => req('GET',   '/keitaro/history'),

  // Bot
  getBotSettings:    ()          => req('GET',   '/bot/settings'),
  saveBotSettings:   (b)         => req('PATCH', '/bot/settings', b),
  testAlert:         (b)         => req('POST',  '/bot/test-alert', b),
  sendDigestNow:     ()          => req('POST',  '/bot/send-digest-now'),
};

export function saveToken(t) { localStorage.setItem('fd_token', t); }
export function clearToken()  { localStorage.removeItem('fd_token'); }
