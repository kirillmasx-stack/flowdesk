// client/src/FlowDeskUI.jsx
import { useState, useRef, useEffect } from "react";
import { api, saveToken, clearToken } from "./api.js";

// ── KEITARO CAMPAIGN NAME PARSER ─────────────────────────────────────────────
// Format: GEO | OFFER NAME | OFFER ID | SOURCE | LANDING SIGN | BUYER-INFO | ANTIC ID | BUYERNAME
// • GEO          — 2-char geo code (UA, PL, DE …)
// • OFFER NAME   — offer display name
// • OFFER ID     — numeric offer id
// • SOURCE       — traffic source (Facebook, Google …)
// • LANDING SIGN — landing marker / theme
// • BUYER-INFO   — free buyer notes, dash-separated
// • ANTIC ID     — antidetect profile name
// • BUYERNAME    — unique buyer alias in tracker
// Tolerates any amount of spaces around | in any position
function parseCampaignName(name = "") {
  const parts = name.split("|").map(s => s.trim().replace(/\s+/g, " "));
  const get = (i) => (i < parts.length && parts[i]) ? parts[i] : "—";
  return {
    geo:         get(0),
    offerName:   get(1),
    offerId:     parts[2] ? Number(parts[2].trim()) || parts[2].trim() : null,
    source:      get(3),
    landingSign: get(4),
    buyerInfo:   get(5),
    anticId:     get(6),
    buyerName:   get(7),
    // Display label used everywhere: GEO | Offer Name | Offer ID
    label: parts.length >= 3
      ? `${get(0)} | ${get(1)} | ${parts[2].trim()}`
      : name,
  };
}

// ── SEED DATA ─────────────────────────────────────────────────────────────────
// Roles: teamlead | buyer | assistant
// assistant has parentId → the buyer they're assigned under

const INIT_USERS = [
  { id: "tl1",  name: "Артём Ковальчук", login: "teamlead", pass: "tl123", role: "teamlead",  team: "Alpha", registered: "2024-10-01", status: "active", telegram: "@artem_tl" },
  { id: "b1",   name: "Максим Петров",   login: "maxpetrov", pass: "123",  role: "buyer",     team: "Alpha", registered: "2024-11-10", status: "active", telegram: "@maxpetrov" },
  { id: "b2",   name: "Дарья Семёнова",  login: "dashasem",  pass: "123",  role: "buyer",     team: "Alpha", registered: "2024-12-03", status: "active", telegram: "@dasha_sem" },
  { id: "b3",   name: "Иван Лысенко",    login: "ivanlys",   pass: "123",  role: "buyer",     team: "Alpha", registered: "2025-01-17", status: "active", telegram: "@ivan_lys" },
  { id: "a1",   name: "Олег Горенко",    login: "oleggor",   pass: "123",  role: "assistant", team: "Alpha", registered: "2025-02-01", status: "active", parentId: "b1", telegram: "@oleg_gor" },
];

// Pending invite tokens: { token, role, parentId?, createdBy, createdAt, used }
const INIT_INVITES = [
  { token: "inv-demo-001", role: "buyer",     parentId: null, createdBy: "tl1", createdAt: "2025-05-20", used: false },
  { token: "inv-demo-002", role: "assistant", parentId: "b2", createdBy: "tl1", createdAt: "2025-05-25", used: false },
];

// Caps now use offerId (numeric) + full Keitaro-format campaignName for display
const INIT_CAPS = [
  { id:"c1",  buyerId:"b1", campaignName:"UA | Nutra Slim | 1021 | Facebook | lp1-slim | info-cpa-v1 | chrome-01 | maxpetrov",         daily:500, current:499 },
  { id:"c2",  buyerId:"b1", campaignName:"PL | Gambling Revshare | 2034 | Google | lp2-casino | info-rev-pl | chrome-02 | maxpetrov",   daily:200, current:201 },
  { id:"c3",  buyerId:"b2", campaignName:"DE | Crypto Lead Pro | 3078 | TikTok | lp1-crypto | info-ld-de | chrome-03 | dashasem",       daily:300, current:145 },
  { id:"c4",  buyerId:"b3", campaignName:"UA | Betting CPA | 4012 | Facebook | lp3-bet | info-cpa-ua | chrome-04 | ivanlys",            daily:400, current:399 },
  { id:"c5",  buyerId:"b2", campaignName:"UA | Weight Loss | 1089 | Push | lp1-wl | info-wl-ua | chrome-05 | dashasem",                 daily:350, current:318 },
  { id:"c6",  buyerId:"b1", campaignName:"BY | Casino Revshare | 2091 | Facebook | lp1-cs | info-rev-by | chrome-06 | maxpetrov",       daily:150, current:80  },
  { id:"c7",  buyerId:"b3", campaignName:"DE | Finance Pro | 5091 | Native | lp1-fin | info-fin-de | chrome-07 | ivanlys",              daily:250, current:60  },
  { id:"c8",  buyerId:"b1", campaignName:"PL | Nutra Slim | 1021 | Facebook | lp2-slim | info-cpa-pl | chrome-08 | maxpetrov",          daily:300, current:274 },
  { id:"c9",  buyerId:"b2", campaignName:"KZ | Sports Betting | 4067 | Push | lp1-sp | info-bet-kz | chrome-09 | dashasem",             daily:200, current:30  },
  { id:"c10", buyerId:"b3", campaignName:"US | Dating PPL | 6012 | Facebook | lp2-dt | info-ppl-us | chrome-10 | ivanlys",              daily:500, current:455 },
  { id:"c11", buyerId:"b1", campaignName:"DE | Forex CPA | 5034 | Native | lp2-fx | info-fx-de | chrome-11 | maxpetrov",                daily:100, current:92  },
  { id:"c12", buyerId:"b2", campaignName:"UA | CBD Oil | 1102 | Google | lp1-cbd | info-cbd-ua | chrome-12 | dashasem",                 daily:180, current:45  },
  { id:"c13", buyerId:"b3", campaignName:"PL | Keto Diet | 1078 | Facebook | lp3-kt | info-keto-pl | chrome-13 | ivanlys",              daily:220, current:196 },
  { id:"c14", buyerId:"b1", campaignName:"US | VPN Premium | 7023 | Google | lp1-vpn | info-vpn-us | chrome-14 | maxpetrov",            daily:400, current:112 },
  { id:"c15", buyerId:"b2", campaignName:"UA | Survey Plus | 8011 | Push | lp1-sv | info-sv-ua | chrome-15 | dashasem",                 daily:600, current:20  },
  { id:"c16", buyerId:"b3", campaignName:"BY | Casino Revshare | 2091 | Push | lp2-cs | info-rev2-by | chrome-16 | ivanlys",            daily:175, current:158 },
];

const INIT_RES = [
  { id: "r1", buyerId: "b1", type: "accounts", platform: "Facebook",    qty: 10, status: "issued",  date: "2025-05-01", note: "FP акки, BM включены" },
  { id: "r2", buyerId: "b1", type: "proxy",    platform: "Residential", qty: 5,  status: "issued",  date: "2025-05-10", note: "" },
  { id: "r3", buyerId: "b2", type: "accounts", platform: "TikTok",      qty: 8,  status: "issued",  date: "2025-05-15", note: "" },
  { id: "r4", buyerId: "b3", type: "accounts", platform: "Facebook",    qty: 6,  status: "pending", date: "2025-05-20", note: "Ждёт выдачи" },
  { id: "r5", buyerId: "b2", type: "creatives",platform: "Adobe",       qty: 15, status: "issued",  date: "2025-04-28", note: "Пакет нутра" },
];

const fmt    = (n) => Number(n).toLocaleString("ru-RU");
const fmtUSD = (n) => "$" + fmt(n);

const genHistory = () => Array.from({ length: 90 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (89 - i));
  return {
    date: d.toISOString().split("T")[0],
    clicks: Math.floor(Math.random() * 8000 + 2000),
    conversions: Math.floor(Math.random() * 300 + 50),
    revenue: Math.floor(Math.random() * 15000 + 3000),
    spend: Math.floor(Math.random() * 8000 + 1500),
  };
});

const BS = {
  b1: { history: genHistory(), totalRevenue: 287450, totalSpend: 134200, conversions: 2341 },
  b2: { history: genHistory(), totalRevenue: 198760, totalSpend: 89300, conversions: 1680 },
  b3: { history: genHistory(), totalRevenue: 143200, totalSpend: 71100, conversions: 1020 },
};


// ── STYLES ─────────────────────────────────────────────────────────────────────
const S = {
  app: { display: "flex", minHeight: "100vh", background: "#0a0c10", color: "#e8eaf0", fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 14 },
  sidebar: { width: 220, background: "#111318", borderRight: "1px solid #1e2330", display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0 },
  logo: { padding: "0 20px 24px", fontSize: 20, fontWeight: 800, letterSpacing: -0.5, borderBottom: "1px solid #1e2330" },
  logoAccent: { color: "#00e5ff" },
  navSection: { padding: "12px 16px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a5168" },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 9, padding: "9px 20px", fontSize: 13, fontWeight: 600,
    color: active ? "#00e5ff" : "#7a8299", cursor: "pointer",
    borderLeft: `2px solid ${active ? "#00e5ff" : "transparent"}`,
    background: active ? "rgba(0,229,255,0.06)" : "transparent",
    transition: "all 0.15s",
  }),
  sidebarUser: { marginTop: "auto", padding: "14px 20px", borderTop: "1px solid #1e2330" },
  avatar: (size = 32) => ({
    width: size, height: size, borderRadius: "50%",
    background: "linear-gradient(135deg,#00e5ff,#7c3aed)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.38, fontWeight: 700, color: "#000", flexShrink: 0,
  }),
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { background: "#111318", borderBottom: "1px solid #1e2330", padding: "0 28px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  content: { padding: "24px 28px", flex: 1, overflowY: "auto" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 },
  statCard: (color) => ({
    background: "#111318", border: "1px solid #1e2330", borderRadius: 10, padding: "16px 20px",
    borderTop: `2px solid ${color}`,
  }),
  tableWrap: { background: "#111318", border: "1px solid #1e2330", borderRadius: 10, overflow: "hidden" },
  th: { padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5168", background: "#181c24", borderBottom: "1px solid #1e2330" },
  td: { padding: "12px 14px", borderBottom: "1px solid #1e2330", verticalAlign: "middle" },
  pill: (color, bg) => ({ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color }),
  btn: (variant = "default") => ({
    background: variant === "accent" ? "#00e5ff" : "#181c24",
    border: `1px solid ${variant === "accent" ? "#00e5ff" : "#252d3d"}`,
    color: variant === "accent" ? "#000" : "#e8eaf0",
    fontFamily: "inherit", fontWeight: 600, fontSize: 12,
    padding: "7px 14px", borderRadius: 7, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
  }),
  input: { width: "100%", background: "#181c24", border: "1px solid #252d3d", borderRadius: 7, padding: "10px 12px", color: "#e8eaf0", fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box" },
  label: { display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a8299", marginBottom: 6 },
  modal: { background: "#111318", border: "1px solid #252d3d", borderRadius: 14, padding: 28, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  progress: (pct, over) => ({
    height: 6, borderRadius: 3,
    background: over ? "#ff4566" : pct > 80 ? "#f5c842" : "linear-gradient(90deg,#00e5ff,#7c3aed)",
    width: pct + "%", transition: "width 0.4s ease",
  }),
};

// ── SORT HOOK + SORTABLE TH ───────────────────────────────────────────────────
function useSortable(defaultKey, defaultDir = "desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const toggle = (key) => {
    if (key === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sort = (arr) => [...arr].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    if (av == null) return 1; if (bv == null) return -1;
    if (typeof av === "string") return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
  return { sortKey, sortDir, toggle, sort };
}

const SortableTh = ({ label, sortKey, active, dir, onToggle, style: extraStyle }) => (
  <th
    onClick={() => sortKey && onToggle(sortKey)}
    style={{
      padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.1em", textTransform: "uppercase",
      background: active ? "rgba(0,229,255,0.06)" : "#181c24",
      color: active ? "#00e5ff" : "#4a5168",
      borderBottom: "1px solid #1e2330",
      cursor: sortKey ? "pointer" : "default",
      userSelect: "none", whiteSpace: "nowrap",
      transition: "background 0.15s, color 0.15s",
      ...extraStyle,
    }}
  >
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {label}
      {sortKey && (
        <span style={{
          fontSize: 9, opacity: active ? 1 : 0.2,
          color: active ? "#00e5ff" : "#7a8299",
          display: "inline-block",
          transform: active && dir === "asc" ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}>↓</span>
      )}
    </span>
  </th>
);

// ── SMALL COMPONENTS ───────────────────────────────────────────────────────────
const Pill = ({ children, variant }) => {
  const map = { green: ["#00c896", "rgba(0,200,150,0.12)"], red: ["#ff4566", "rgba(255,69,102,0.12)"], yellow: ["#f5c842", "rgba(245,200,66,0.12)"], cyan: ["#00e5ff", "rgba(0,229,255,0.1)"], purple: ["#a78bfa", "rgba(124,58,237,0.2)"] };
  const [c, bg] = map[variant] || map.cyan;
  return <span style={S.pill(c, bg)}>{children}</span>;
};

const StatCard = ({ label, val, color, sub }) => (
  <div style={S.statCard(color)}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a8299", marginBottom: 8 }}>{label}</div>
    <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 500, color }}>{val}</div>
    {sub && <div style={{ fontSize: 11, color: "#4a5168", marginTop: 4, fontFamily: "monospace" }}>{sub}</div>}
  </div>
);

const BarChart = ({ rows }) => {
  const maxVal = Math.max(...rows.map(r => r.val));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <div style={{ width: 70, color: "#7a8299", textAlign: "right", fontFamily: "monospace", flexShrink: 0 }}>{r.label}</div>
          <div style={{ flex: 1, height: 18, background: "#181c24", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: Math.round(r.val / maxVal * 100) + "%", background: "linear-gradient(90deg,#00e5ff,#7c3aed)", borderRadius: 3 }} />
          </div>
          <div style={{ width: 68, textAlign: "right", fontFamily: "monospace", color: "#e8eaf0" }}>{fmtUSD(r.val)}</div>
        </div>
      ))}
    </div>
  );
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={S.label}>{label}</label>
    {children}
  </div>
);


// ── ONBOARDING LANDING ────────────────────────────────────────────────────────
function OnboardingLanding({ onCreateTeam }) {
  const [screen, setScreen] = useState("landing"); // "landing" | "register"
  const [form, setForm] = useState({ name:"", email:"", pass:"", pass2:"", telegram:"" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = () => {
    if (!form.name.trim())  return setErr("Введи имя");
    if (!form.email.trim() || !form.email.includes("@")) return setErr("Введи корректный email");
    if (form.pass.length < 6)  return setErr("Пароль минимум 6 символов");
    if (form.pass !== form.pass2) return setErr("Пароли не совпадают");
    setLoading(true);
    setTimeout(() => {
      const tl = {
        id: "tl1",
        name: form.name.trim(),
        login: form.email.trim(),
        pass: form.pass,
        email: form.email.trim(),
        telegram: form.telegram.trim() || "",
        role: "teamlead",
        team: "Alpha",
        registered: new Date().toISOString().split("T")[0],
        status: "active",
      };
      onCreateTeam(tl);
    }, 600);
  };

  const FEATURES = [
    { icon:"▦", title:"Дашборд команды",    desc:"Revenue, ROI, конверсии по каждому баеру в реальном времени" },
    { icon:"⊡", title:"Управление капами",  desc:"Мониторинг залитости с алертами на 75%, 90%, 100%" },
    { icon:"◑", title:"История офферов",    desc:"3 месяца аналитики по всем офферам, гео и источникам" },
    { icon:"◈", title:"Команда и инвайты",  desc:"Баеры, помощники, invite-ссылки, дерево структуры" },
    { icon:"⊕", title:"Keitaro интеграция", desc:"Авто-синхронизация кампаний по названию GEO|Оффер|ID" },
    { icon:"✈", title:"Telegram бот",       desc:"Алерты о заливе, ежечасный дайджест баерам и тимлиду" },
  ];

  if (screen === "register") return (
    <div style={{ minHeight:"100vh", background:"#0a0c10", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:440 }}>
        {/* Back */}
        <button onClick={() => { setScreen("landing"); setErr(""); }}
          style={{ background:"none", border:"none", color:"#7a8299", fontFamily:"inherit", fontSize:13, cursor:"pointer", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>
          ← Назад
        </button>

        <div style={{ background:"#111318", border:"1px solid #252d3d", borderRadius:16, padding:36 }}>
          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:28, fontWeight:800, letterSpacing:-1 }}>Flow<span style={{ color:"#00e5ff" }}>Desk</span></div>
            <div style={{ fontSize:13, color:"#7a8299", marginTop:6 }}>Создание команды</div>
          </div>

          {/* Progress dots */}
          <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:28 }}>
            {["Данные","Аккаунт","Telegram"].map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                  background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)", fontSize:11, fontWeight:700, color:"#00e5ff" }}>{i+1}</div>
                <span style={{ fontSize:11, color:"#4a5168" }}>{s}</span>
                {i < 2 && <span style={{ color:"#252d3d", fontSize:10 }}>›</span>}
              </div>
            ))}
          </div>

          <Field label="Полное имя">
            <input style={S.input} value={form.name} onChange={e => { setForm({...form, name:e.target.value}); setErr(""); }}
              placeholder="Артём Ковальчук" autoFocus />
          </Field>
          <Field label="Email (будет логином)">
            <input style={S.input} type="email" value={form.email} onChange={e => { setForm({...form, email:e.target.value}); setErr(""); }}
              placeholder="artem@company.com" />
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Пароль">
              <input style={S.input} type="password" value={form.pass} onChange={e => { setForm({...form, pass:e.target.value}); setErr(""); }}
                placeholder="Мин. 6 символов" />
            </Field>
            <Field label="Повторите пароль">
              <input style={S.input} type="password" value={form.pass2} onChange={e => { setForm({...form, pass2:e.target.value}); setErr(""); }}
                placeholder="••••••" />
            </Field>
          </div>
          <Field label="Telegram (необязательно)">
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#4a5168", fontSize:14 }}>@</span>
              <input style={{ ...S.input, paddingLeft:26 }} value={form.telegram.replace(/^@/,"")}
                onChange={e => { setForm({...form, telegram:e.target.value}); setErr(""); }}
                placeholder="username" />
            </div>
          </Field>

          {err && <div style={{ color:"#ff4566", fontSize:12, marginBottom:14, textAlign:"center" }}>{err}</div>}

          <button
            style={{ ...S.btn("accent"), width:"100%", padding:"14px", fontSize:15, justifyContent:"center",
              opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}
            onClick={submit} disabled={loading}>
            {loading ? "Создаём команду…" : "🚀 Создать команду"}
          </button>

          <div style={{ marginTop:16, fontSize:11, color:"#4a5168", textAlign:"center", lineHeight:1.6 }}>
            Ты станешь тимлидом. Баеров добавишь через<br/>invite-ссылки из раздела «Команда».
          </div>
        </div>
      </div>
    </div>
  );

  // ── LANDING ──
  return (
    <div style={{ minHeight:"100vh", background:"#0a0c10", color:"#e8eaf0", fontFamily:"'Segoe UI', system-ui, sans-serif", overflow:"hidden" }}>

      {/* Gradient bg */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }}>
        <div style={{ position:"absolute", top:"-20%", left:"50%", transform:"translateX(-50%)", width:800, height:600,
          background:"radial-gradient(ellipse, rgba(0,229,255,0.07) 0%, transparent 70%)", borderRadius:"50%" }} />
        <div style={{ position:"absolute", bottom:"-10%", right:"-10%", width:600, height:600,
          background:"radial-gradient(ellipse, rgba(124,58,237,0.06) 0%, transparent 70%)", borderRadius:"50%" }} />
      </div>

      <div style={{ position:"relative", zIndex:1 }}>
        {/* Nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 48px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5 }}>Flow<span style={{ color:"#00e5ff" }}>Desk</span></div>
          <button onClick={() => setScreen("register")}
            style={{ ...S.btn("accent"), padding:"9px 20px", fontSize:13 }}>
            Создать команду →
          </button>
        </div>

        {/* Hero */}
        <div style={{ textAlign:"center", padding:"80px 24px 60px" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.2)", borderRadius:20, padding:"5px 14px", fontSize:12, color:"#00e5ff", fontWeight:600, marginBottom:24 }}>
            ✦ Media Buying Management Platform
          </div>
          <h1 style={{ fontSize:"clamp(36px, 5vw, 64px)", fontWeight:800, lineHeight:1.15, letterSpacing:-2, margin:"0 0 20px", maxWidth:800, marginLeft:"auto", marginRight:"auto" }}>
            Управляй командой баеров<br/>
            <span style={{ color:"#00e5ff" }}>без хаоса в таблицах</span>
          </h1>
          <p style={{ fontSize:18, color:"#7a8299", maxWidth:560, margin:"0 auto 40px", lineHeight:1.6 }}>
            Один дашборд для тимлида — капы, отлив, ресурсы, Keitaro и Telegram-алерты в реальном времени
          </p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={() => setScreen("register")}
              style={{ ...S.btn("accent"), padding:"14px 32px", fontSize:16, borderRadius:10 }}>
              🚀 Создать команду — бесплатно
            </button>
            <button onClick={() => onCreateTeam({ ...INIT_USERS[0], _loadDemoTeam: true })}
              style={{ ...S.btn(), padding:"14px 28px", fontSize:16, borderRadius:10, color:"#00e5ff", borderColor:"rgba(0,229,255,0.3)" }}>
              Посмотреть демо →
            </button>
          </div>
          {/* Social proof */}
          <div style={{ marginTop:32, display:"flex", gap:24, justifyContent:"center", flexWrap:"wrap" }}>
            {[["⚡","Моментальные алерты"],["🔒","Invite-ссылки для баеров"],["📊","Keitaro интеграция"]].map(([e,t]) => (
              <div key={t} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#4a5168" }}>
                <span>{e}</span><span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Features grid */}
        <div style={{ padding:"0 48px 80px", maxWidth:1100, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{ fontSize:28, fontWeight:700, letterSpacing:-0.5, marginBottom:8 }}>Всё что нужно тимлиду</div>
            <div style={{ fontSize:15, color:"#7a8299" }}>в одном месте</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:16 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:12, padding:"24px 22px",
                transition:"border-color 0.2s", cursor:"default" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="#00e5ff30"}
                onMouseLeave={e => e.currentTarget.style.borderColor="#1e2330"}>
                <div style={{ width:40, height:40, borderRadius:10, background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.15)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:14 }}>{f.icon}</div>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>{f.title}</div>
                <div style={{ fontSize:13, color:"#7a8299", lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div style={{ background:"#111318", borderTop:"1px solid #1e2330", borderBottom:"1px solid #1e2330", padding:"60px 48px" }}>
          <div style={{ maxWidth:800, margin:"0 auto" }}>
            <div style={{ textAlign:"center", fontSize:26, fontWeight:700, marginBottom:40 }}>Как это работает</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:24 }}>
              {[
                { n:"1", title:"Создай команду",   desc:"Регистрируешься как тимлид — занимает 30 секунд" },
                { n:"2", title:"Пригласи баеров",  desc:"Генеришь invite-токен, баер регистрируется по ссылке" },
                { n:"3", title:"Настрой Keitaro",  desc:"Вставляешь API ключ — данные синхронизируются автоматически" },
                { n:"4", title:"Следи за капами",  desc:"Telegram-алерты при заливе, ежечасный дайджест команде" },
              ].map((s, i) => (
                <div key={i} style={{ textAlign:"center" }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", background:"rgba(0,229,255,0.1)",
                    border:"2px solid rgba(0,229,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:20, fontWeight:800, color:"#00e5ff", margin:"0 auto 14px" }}>{s.n}</div>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>{s.title}</div>
                  <div style={{ fontSize:12, color:"#7a8299", lineHeight:1.6 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign:"center", padding:"70px 24px 80px" }}>
          <div style={{ fontSize:32, fontWeight:800, marginBottom:12 }}>Готов начать?</div>
          <div style={{ fontSize:16, color:"#7a8299", marginBottom:32 }}>Создай команду за 30 секунд — никаких карточек</div>
          <button onClick={() => setScreen("register")}
            style={{ ...S.btn("accent"), padding:"16px 40px", fontSize:17, borderRadius:10 }}>
            🚀 Создать команду
          </button>
        </div>

        {/* Footer */}
        <div style={{ borderTop:"1px solid #1e2330", padding:"20px 48px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:16, fontWeight:800 }}>Flow<span style={{ color:"#00e5ff" }}>Desk</span></div>
          <div style={{ fontSize:12, color:"#4a5168" }}>Media Buying Management Platform</div>
        </div>
      </div>
    </div>
  );
}

// ── AUTH ───────────────────────────────────────────────────────────────────────
function Auth({ allUsers, setAllUsers, invites, setInvites, onLogin }) {
  const [mode, setMode] = useState("login");   // "login" | "register"
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  // Register form
  const [token, setToken] = useState("");
  const [regName, setRegName] = useState("");
  const [regLogin, setRegLogin] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");
  const [regStep, setRegStep] = useState(1); // 1=validate token, 2=fill details

  const foundInvite = regStep === 2 ? invites.find(i => i.token === token && !i.used) : null;

  const submitLogin = () => {
    const u = allUsers.find(x => x.login === login && x.pass === pass && x.status === "active");
    if (u) onLogin(u); else setErr("Неверный логин или пароль");
  };

  const validateToken = () => {
    const inv = invites.find(i => i.token === token.trim() && !i.used);
    if (inv) { setRegStep(2); setErr(""); }
    else setErr("Invite-токен не найден или уже использован");
  };

  const submitRegister = () => {
    if (!regName.trim()) return setErr("Введи имя");
    if (!regLogin.trim()) return setErr("Введи логин");
    if (allUsers.find(u => u.login === regLogin.trim())) return setErr("Логин уже занят");
    if (regPass.length < 4) return setErr("Пароль минимум 4 символа");
    if (regPass !== regPass2) return setErr("Пароли не совпадают");
    const inv = invites.find(i => i.token === token && !i.used);
    if (!inv) return setErr("Токен недействителен");
    const newUser = {
      id: "u" + Date.now(),
      name: regName.trim(),
      login: regLogin.trim(),
      pass: regPass,
      role: inv.role,
      team: "Alpha",
      parentId: inv.parentId || null,
      registered: new Date().toISOString().split("T")[0],
      status: "active",
    };
    setAllUsers(p => [...p, newUser]);
    setInvites(p => p.map(i => i.token === token ? { ...i, used: true } : i));
    if (newUser.role === "buyer") BS[newUser.id] = { history: genHistory(), totalRevenue: 0, totalSpend: 0, conversions: 0 };
    onLogin(newUser);
  };

  const ROLE_LABELS = { buyer: "Баер", assistant: "Помощник баера" };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0c10", width: "100%" }}>
      <div style={{ background: "#111318", border: "1px solid #252d3d", borderRadius: 16, padding: 40, width: "100%", maxWidth: 400 }}>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Flow<span style={{ color: "#00e5ff" }}>Desk</span></div>
        <div style={{ color: "#7a8299", fontSize: 12, marginBottom: 28 }}>Media Buying Management Platform</div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 2, background: "#181c24", borderRadius: 8, padding: 3, marginBottom: 28 }}>
          {[["login","Войти"],["register","Регистрация"]].map(([m,l]) => (
            <div key={m} onClick={() => { setMode(m); setErr(""); setRegStep(1); }}
              style={{ flex:1, textAlign:"center", padding:"8px", borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer",
                background: mode===m ? "#111318" : "transparent", color: mode===m ? "#e8eaf0" : "#7a8299" }}>{l}</div>
          ))}
        </div>

        {mode === "login" ? (
          <>
            <Field label="Логин"><input style={S.input} value={login} onChange={e => { setLogin(e.target.value); setErr(""); }} onKeyDown={e => e.key==="Enter" && submitLogin()} placeholder="Введите логин" /></Field>
            <Field label="Пароль"><input style={S.input} type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} onKeyDown={e => e.key==="Enter" && submitLogin()} placeholder="••••••" /></Field>
            <button style={{ ...S.btn("accent"), width:"100%", padding:"12px", fontSize:14, justifyContent:"center", marginTop:4 }} onClick={submitLogin}>Войти</button>
            <div style={{ marginTop:16, fontSize:11, color:"#4a5168", textAlign:"center" }}>teamlead / tl123 · maxpetrov / 123</div>
          </>
        ) : (
          <>
            {regStep === 1 ? (
              <>
                <div style={{ fontSize:13, color:"#7a8299", marginBottom:18, lineHeight:1.6 }}>
                  Для регистрации нужен invite-токен от тимлида.<br/>
                  Пример: <span style={{ fontFamily:"monospace", color:"#00e5ff" }}>inv-demo-001</span>
                </div>
                <Field label="Invite-токен">
                  <input style={S.input} value={token} onChange={e => { setToken(e.target.value); setErr(""); }} placeholder="inv-xxxxxxxx" />
                </Field>
                <button style={{ ...S.btn("accent"), width:"100%", padding:"12px", fontSize:14, justifyContent:"center" }} onClick={validateToken}>Проверить токен</button>
              </>
            ) : (
              <>
                {/* Token info banner */}
                <div style={{ background:"rgba(0,229,255,0.06)", border:"1px solid rgba(0,229,255,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:20 }}>
                  <div style={{ fontSize:11, color:"#4a5168", marginBottom:3 }}>РОЛЬ ПО ИНВАЙТУ</div>
                  <div style={{ fontWeight:700, color:"#00e5ff", fontSize:14 }}>{ROLE_LABELS[foundInvite?.role] || foundInvite?.role}</div>
                  {foundInvite?.parentId && (
                    <div style={{ fontSize:11, color:"#7a8299", marginTop:3 }}>
                      Назначен к: {allUsers.find(u=>u.id===foundInvite.parentId)?.name || foundInvite.parentId}
                    </div>
                  )}
                </div>
                <Field label="Полное имя"><input style={S.input} value={regName} onChange={e => { setRegName(e.target.value); setErr(""); }} placeholder="Иван Иванов" /></Field>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <Field label="Логин"><input style={S.input} value={regLogin} onChange={e => { setRegLogin(e.target.value); setErr(""); }} placeholder="ivan" /></Field>
                  <Field label="Пароль"><input style={S.input} type="password" value={regPass} onChange={e => { setRegPass(e.target.value); setErr(""); }} /></Field>
                </div>
                <Field label="Повторите пароль"><input style={S.input} type="password" value={regPass2} onChange={e => { setRegPass2(e.target.value); setErr(""); }} /></Field>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...S.btn(), flex:1, justifyContent:"center" }} onClick={() => { setRegStep(1); setErr(""); }}>← Назад</button>
                  <button style={{ ...S.btn("accent"), flex:2, justifyContent:"center", padding:"10px" }} onClick={submitRegister}>Зарегистрироваться</button>
                </div>
              </>
            )}
          </>
        )}
        {err && <div style={{ color:"#ff4566", fontSize:12, marginTop:12, textAlign:"center" }}>{err}</div>}
      </div>
    </div>
  );
}

// ── OFFER SEED PER BUYER (Keitaro naming: GEO|Offer-name|Offer-id|Source|Landing|Advertiser|Aff-name|Buyer)
const BUYER_OFFERS = {
  b1: [
    { campaignName: "UA | Nutra Slim | 1021 | Facebook | lp1-slim | info-cpa-v1 | chrome-profile-01 | maxpetrov",       clicks: 4812, conv: 187, revenue: 5610, spend: 2100 },
    { campaignName: "PL | Gambling Revshare | 2034 | Google | lp2-casino | info-rev-pl | chrome-profile-02 | maxpetrov",       clicks: 3240, conv: 112, revenue: 8920, spend: 2890 },
    { campaignName: "DE | Crypto Lead Pro | 3078 | TikTok | lp1-crypto | info-lead-de | chrome-profile-03 | maxpetrov",  clicks: 4428, conv: 88,  revenue: 3740, spend: 1210 },
  ],
  b2: [
    { campaignName: "UA | Nutra Slim | 1021 | Facebook | lp2-slim | info-cpa-v2 | chrome-profile-05 | dashasem",       clicks: 2910, conv: 95,  revenue: 3850, spend: 1540 },
    { campaignName: "UA | Betting CPA | 4012 | Push | lp1-bet | info-cpa-push | chrome-profile-06 | dashasem",                clicks: 5430, conv: 204, revenue: 7640, spend: 3060 },
  ],
  b3: [
    { campaignName: "UA | Betting CPA | 4012 | Facebook | lp3-bet | info-cpa-ua | chrome-profile-04 | ivanlys",              clicks: 6100, conv: 220, revenue: 6600, spend: 2640 },
    { campaignName: "DE | Finance Pro | 5091 | Native | lp1-fin | info-fin-de | chrome-profile-07 | ivanlys",               clicks: 5100, conv: 179, revenue: 5370, spend: 2860 },
  ],
};

// ── MONTHLY OFFER DATA ────────────────────────────────────────────────────────
const MONTHLY_OFFERS = [
  { offer:"Nutra CPA",         geo:"UA", network:"AdCombo",    leads:3840, sales:1344, spend:28400, revenue:67200 },
  { offer:"Gambling Revshare", geo:"PL", network:"Everad",     leads:2910, sales:874,  spend:43100, revenue:98700 },
  { offer:"Betting CPA",       geo:"UA", network:"AffPapa",    leads:5200, sales:1820, spend:36800, revenue:72800 },
  { offer:"Crypto Lead",       geo:"DE", network:"CryptoLeads",leads:1640, sales:492,  spend:21300, revenue:41000 },
  { offer:"Finance",           geo:"DE", network:"LeadGid",    leads:2100, sales:630,  spend:18700, revenue:37800 },
  { offer:"Nutra CPA",         geo:"PL", network:"AdCombo",    leads:1980, sales:594,  spend:14200, revenue:29700 },
  { offer:"Weight Loss",       geo:"UA", network:"Everad",     leads:1450, sales:435,  spend:12800, revenue:26100 },
  { offer:"Casino Revshare",   geo:"BY", network:"PIN-UP",     leads:870,  sales:261,  spend:9100,  revenue:22500 },
  { offer:"Forex CPA",         geo:"DE", network:"Finaff",     leads:720,  sales:216,  spend:8400,  revenue:19800 },
  { offer:"CBD Oil",           geo:"UA", network:"AdCombo",    leads:1120, sales:336,  spend:7600,  revenue:16800 },
  { offer:"Keto Diet",         geo:"PL", network:"Everad",     leads:980,  sales:294,  spend:6900,  revenue:14700 },
  { offer:"Trading Signals",   geo:"RO", network:"TradeDesk",  leads:640,  sales:192,  spend:6200,  revenue:13400 },
  { offer:"Sports Betting",    geo:"KZ", network:"BetAffs",    leads:1340, sales:402,  spend:10100, revenue:20200 },
  { offer:"Insurance CPA",     geo:"DE", network:"Financer",   leads:520,  sales:156,  spend:5800,  revenue:11700 },
  { offer:"Loans CPA",         geo:"UA", network:"LeadGid",    leads:890,  sales:267,  spend:7200,  revenue:14400 },
  { offer:"Dating PPL",        geo:"US", network:"MaxBounty",  leads:4200, sales:1260, spend:22000, revenue:37800 },
  { offer:"VPN CPS",           geo:"US", network:"ClickDealer",leads:3100, sales:930,  spend:15500, revenue:27900 },
  { offer:"Antivirus CPS",     geo:"DE", network:"Admitad",    leads:1750, sales:525,  spend:8900,  revenue:16800 },
  { offer:"E-commerce",        geo:"PL", network:"TradeTracker",leads:2600,sales:780,  spend:18200, revenue:31200 },
  { offer:"Survey CPA",        geo:"UA", network:"AdCombo",    leads:6100, sales:1830, spend:24400, revenue:42700 },
].map((o, i) => ({ ...o, id: i+1, roi: Math.round((o.revenue - o.spend) / o.spend * 100) }));

// ── DATE HELPERS ───────────────────────────────────────────────────────────────
const toISO = (d) => d.toISOString().split("T")[0];
const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// ── TOP OFFERS COMPONENT ─────────────────────────────────────────────────────
function TopOffers() {
  const [limit, setLimit] = useState(5);
  const { sortKey, sortDir, toggle, sort } = useSortable("revenue");

  const GEO_COLORS = { UA:"#00e5ff", PL:"#a78bfa", DE:"#f5c842", US:"#00c896", BY:"#ff9f43", KZ:"#ff4566", RO:"#fd79a8" };
  const geoColor = (g) => GEO_COLORS[g] || "#7a8299";

  const visible = sort(MONTHLY_OFFERS).slice(0, limit);
  const maxRev = visible[0]?.revenue || 1;

  return (
    <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, overflow:"hidden", marginTop:24 }}>
      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid #1e2330", flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14 }}>Офферы месяца</div>
          <div style={{ fontSize:11, color:"#7a8299", marginTop:2 }}>Клик по заголовку столбца — сортировка · май 2025</div>
        </div>
        <div style={{ display:"flex", gap:2, background:"#181c24", borderRadius:7, padding:3 }}>
          {[5,10,15,20].map(n => (
            <button key={n} onClick={() => setLimit(n)} style={{
              padding:"5px 11px", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit",
              background: limit===n ? "#00e5ff" : "transparent",
              color: limit===n ? "#000" : "#7a8299",
            }}>ТОП {n}</button>
          ))}
        </div>
      </div>

      {/* table */}
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th style={S.th}>#</th>
            {[
              { label:"Оффер",      key:"offer"   },
              { label:"Гео",        key:"geo"     },
              { label:"Партнёрка",  key:"network" },
              { label:"Лиды",       key:"leads"   },
              { label:"Продажи",    key:"sales"   },
              { label:"Spend",      key:"spend"   },
              { label:"Доход",      key:"revenue" },
              { label:"ROI",        key:"roi"     },
              { label:"Доля",       key:null      },
            ].map(c => (
              <SortableTh key={c.label} label={c.label} sortKey={c.key}
                active={sortKey === c.key} dir={sortDir} onToggle={toggle} />
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((o, i) => {
            const revPct = Math.round(o.revenue / maxRev * 100);
            const medal = i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : null;
            return (
              <tr key={o.id} style={{ background: i < 3 ? "rgba(0,229,255,0.015)" : "transparent" }}>
                <td style={{ ...S.td, width:40, textAlign:"center", fontFamily:"monospace", color:"#4a5168", fontWeight:700 }}>
                  {medal ? <span style={{ fontSize:14 }}>{medal}</span> : <span style={{ color:"#4a5168" }}>{i+1}</span>}
                </td>
                <td style={{ ...S.td, fontWeight:600, fontSize:13 }}>{o.offer}</td>
                <td style={S.td}>
                  <span style={{ fontSize:11, fontWeight:700, color: geoColor(o.geo), background:`${geoColor(o.geo)}18`, padding:"2px 7px", borderRadius:4 }}>{o.geo}</span>
                </td>
                <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{o.network}</td>
                <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color: sortKey==="leads"?"#00e5ff":"inherit", fontWeight: sortKey==="leads"?700:400 }}>{fmt(o.leads)}</td>
                <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#a78bfa", fontWeight: sortKey==="sales"?700:400 }}>{fmt(o.sales)}</td>
                <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#ff4566", fontWeight: sortKey==="spend"?700:400 }}>{fmtUSD(o.spend)}</td>
                <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#00c896", fontWeight: sortKey==="revenue"?700:400 }}>{fmtUSD(o.revenue)}</td>
                <td style={S.td}><Pill variant={o.roi>80?"green":o.roi>40?"yellow":"red"}>{o.roi}%</Pill></td>
                <td style={{ ...S.td, width:110 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ flex:1, height:5, background:"#181c24", borderRadius:3 }}>
                      <div style={{ height:"100%", width:revPct+"%", borderRadius:3, background: i===0?"#00e5ff":i===1?"#a78bfa":i===2?"#f5c842":"#252d3d", transition:"width 0.4s" }} />
                    </div>
                    <span style={{ fontSize:10, fontFamily:"monospace", color:"#7a8299", width:28, textAlign:"right" }}>{revPct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── CAPS FILL MONITOR ────────────────────────────────────────────────────────
function CapsFillMonitor({ caps }) {
  const [limit, setLimit] = useState(10);

  const enriched = caps.map(c => {
    const p = parseCampaignName(c.campaignName);
    const pct = c.daily > 0 ? Math.round(c.current / c.daily * 100) : 0;
    return { ...c, ...p, pct, remaining: Math.max(0, c.daily - c.current) };
  }).sort((a, b) => b.pct - a.pct);

  const visible = enriched.slice(0, limit === "all" ? enriched.length : limit);

  const zone = (pct) => {
    if (pct >= 100) return { color:"#ff4566", bg:"rgba(255,69,102,0.08)", label:"🔴 Перелив",  border:"rgba(255,69,102,0.35)" };
    if (pct >= 90)  return { color:"#ff4566", bg:"rgba(255,69,102,0.05)", label:"🚨 Критично", border:"rgba(255,69,102,0.2)"  };
    if (pct >= 75)  return { color:"#f5c842", bg:"rgba(245,200,66,0.05)", label:"⚠️ Скоро",    border:"rgba(245,200,66,0.2)"  };
    if (pct >= 50)  return { color:"#f5c842", bg:"transparent",           label:"〰 В пути",   border:"transparent"           };
    return               { color:"#00c896", bg:"transparent",             label:"✓ Ок",        border:"transparent"           };
  };

  const ov = enriched.filter(c => c.pct >= 100).length;
  const cr = enriched.filter(c => c.pct >= 90 && c.pct < 100).length;
  const wa = enriched.filter(c => c.pct >= 75 && c.pct < 90).length;

  return (
    <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, overflow:"hidden", marginTop:24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #1e2330", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>Залитость капов</div>
            <div style={{ fontSize:11, color:"#7a8299", marginTop:2 }}>Отсортировано по % — самые опасные наверху</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {ov > 0 && <div style={{ background:"rgba(255,69,102,0.12)", border:"1px solid rgba(255,69,102,0.3)", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#ff4566" }}>🔴 {ov} перелив{ov > 1 ? "а" : ""}</div>}
            {cr > 0 && <div style={{ background:"rgba(255,69,102,0.07)", border:"1px solid rgba(255,69,102,0.2)", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#ff7f9a" }}>🚨 {cr} крит.</div>}
            {wa > 0 && <div style={{ background:"rgba(245,200,66,0.08)", border:"1px solid rgba(245,200,66,0.2)", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#f5c842" }}>⚠️ {wa} скоро</div>}
          </div>
        </div>
        <div style={{ display:"flex", gap:2, background:"#181c24", borderRadius:7, padding:3 }}>
          {[5, 10, 15, "all"].map(n => (
            <button key={n} onClick={() => setLimit(n)} style={{
              padding:"4px 10px", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit",
              background: limit === n ? "#00e5ff" : "transparent",
              color:      limit === n ? "#000"    : "#7a8299",
            }}>{n === "all" ? "Все" : `ТОП ${n}`}</button>
          ))}
        </div>
      </div>

      <div>
        {visible.length === 0 && <div style={{ padding:32, textAlign:"center", color:"#4a5168", fontSize:13 }}>Нет капов</div>}
        {visible.map((c, i) => {
          const z = zone(c.pct);
          return (
            <div key={c.id} style={{
              display:"flex", alignItems:"center", gap:14, padding:"12px 20px",
              borderBottom: i === visible.length - 1 ? "none" : "1px solid #181c24",
              background: z.bg,
              borderLeft: `3px solid ${z.border || "transparent"}`,
            }}>
              <div style={{ width:20, flexShrink:0, fontFamily:"monospace", fontSize:11, color:"#4a5168", textAlign:"right" }}>{i+1}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:5 }}>
                  <span style={{ background:`${z.color}18`, color:z.color, fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:3 }}>{c.geo}</span>
                  <span style={{ fontWeight:600, fontSize:13, color: c.pct >= 90 ? z.color : "#e8eaf0" }}>{c.offerName}</span>
                  <span style={{ fontSize:10, color:"#4a5168", fontFamily:"monospace" }}>#{c.offerId}</span>
                  <span style={{ fontSize:10, background:"rgba(124,58,237,0.12)", color:"#a78bfa", padding:"1px 5px", borderRadius:3 }}>{c.source}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ flex:1, height:7, background:"#181c24", borderRadius:4, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:4, transition:"width 0.4s ease",
                      width: Math.min(c.pct, 100) + "%",
                      background: c.pct >= 90 ? "#ff4566" : c.pct >= 75 ? "#f5c842" : "linear-gradient(90deg,#00e5ff,#7c3aed)",
                      boxShadow: c.pct >= 90 ? `0 0 8px ${z.color}66` : "none",
                    }} />
                  </div>
                  <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:z.color, width:40, textAlign:"right", flexShrink:0 }}>{c.pct}%</span>
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0, minWidth:90 }}>
                <div style={{ fontFamily:"monospace", fontSize:13, fontWeight:600, color: c.pct >= 90 ? z.color : "#e8eaf0" }}>
                  {fmt(c.current)}<span style={{ color:"#4a5168" }}>/{fmt(c.daily)}</span>
                </div>
                <div style={{ fontSize:10, color:"#4a5168", marginTop:2 }}>
                  {c.pct >= 100 ? "⚡ перелив!" : `осталось ${fmt(c.remaining)}`}
                </div>
              </div>
              <div style={{ flexShrink:0, width:90, textAlign:"right" }}>
                <span style={{ fontSize:11, fontWeight:700, color:z.color }}>{z.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TL DASHBOARD ───────────────────────────────────────────────────────────────
function TLDash({ buyers, caps, allUsers }) {
  const [preset, setPreset] = useState("today");
  const [dateFrom, setDateFrom] = useState(toISO(today0()));
  const [dateTo, setDateTo]     = useState(toISO(today0()));
  const [showCal, setShowCal]   = useState(false);
  const [expanded, setExpanded] = useState({});

  // Apply preset
  const applyPreset = (p) => {
    setPreset(p);
    const t = today0();
    if (p === "today")   { setDateFrom(toISO(t)); setDateTo(toISO(t)); }
    if (p === "yesterday"){ const y = addDays(t,-1); setDateFrom(toISO(y)); setDateTo(toISO(y)); }
    if (p === "3d")      { setDateFrom(toISO(addDays(t,-2))); setDateTo(toISO(t)); }
    if (p === "7d")      { setDateFrom(toISO(addDays(t,-6))); setDateTo(toISO(t)); }
    if (p === "custom")  { setShowCal(true); }
  };

  // Filter history by date range
  const filterHistory = (history) =>
    history.filter(d => d.date >= dateFrom && d.date <= dateTo);

  // Aggregate filtered data per buyer
  const buyerRows = buyers.map(b => {
    const st = BS[b.id]; if (!st) return null;
    const rows = filterHistory(st.history);
    const clicks      = rows.reduce((s,d) => s + d.clicks, 0);
    const conversions = rows.reduce((s,d) => s + d.conversions, 0);
    const revenue     = rows.reduce((s,d) => s + d.revenue, 0);
    const spend       = rows.reduce((s,d) => s + d.spend, 0);
    const sales       = Math.round(conversions * 0.35); // simulated sales ≈ 35% of convs
    const roi         = spend > 0 ? Math.round((revenue - spend) / spend * 100) : 0;
    const offers      = BUYER_OFFERS[b.id] || [];
    return { ...b, clicks, conversions, revenue, spend, sales, roi, offers };
  }).filter(Boolean);

  const totals = buyerRows.reduce((s,r) => ({
    clicks: s.clicks + r.clicks, conversions: s.conversions + r.conversions,
    revenue: s.revenue + r.revenue, spend: s.spend + r.spend,
  }), { clicks:0, conversions:0, revenue:0, spend:0 });
  const totalRoi = totals.spend > 0 ? Math.round((totals.revenue - totals.spend) / totals.spend * 100) : 0;

  const PRESETS = [
    { id:"today", label:"Сегодня" },
    { id:"yesterday", label:"Вчера" },
    { id:"3d", label:"3 дня" },
    { id:"7d", label:"7 дней" },
    { id:"custom", label:"Период ▾" },
  ];

  const presetBarStyle = { display:"flex", gap:2, background:"#181c24", borderRadius:8, padding:3, flexWrap:"wrap" };
  const presetBtnStyle = (active) => ({
    padding:"6px 13px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer",
    background: active ? "#00e5ff" : "transparent",
    color: active ? "#000" : "#7a8299",
    border:"none", fontFamily:"inherit",
  });

  const labelStr = preset === "custom"
    ? (dateFrom === dateTo ? dateFrom : `${dateFrom} — ${dateTo}`)
    : PRESETS.find(p=>p.id===preset)?.label || "";

  const buyerSort = useSortable("revenue");

  return (
    <div>
      {/* ── DATE RANGE BAR ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <div style={presetBarStyle}>
          {PRESETS.map(p => (
            <button key={p.id} style={presetBtnStyle(preset===p.id)} onClick={() => applyPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize:12, color:"#7a8299", fontFamily:"monospace" }}>
          {labelStr}
        </div>
      </div>

      {/* ── CALENDAR MODAL ── */}
      {showCal && (
        <div style={S.overlay} onClick={e => e.target===e.currentTarget && setShowCal(false)}>
          <div style={{ ...S.modal, maxWidth:340 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:20 }}>Выбор периода</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={S.label}>От</label>
                <input style={S.input} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>До</label>
                <input style={S.input} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button style={S.btn()} onClick={()=>setShowCal(false)}>Отмена</button>
              <button style={S.btn("accent")} onClick={()=>{ setPreset("custom"); setShowCal(false); }}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {/* ── STAT CARDS ── */}
      {/* Data source indicator */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, fontSize:12 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background: useApiData ? "#00c896" : "#f5c842",
          boxShadow: useApiData ? "0 0 6px #00c896" : "none" }} />
        {apiLoading ? <span style={{ color:"#7a8299" }}>Загрузка данных…</span>
          : useApiData ? <span style={{ color:"#00c896" }}>Реальные данные из Keitaro</span>
          : <span style={{ color:"#f5c842" }}>Демо-данные — подключите Keitaro для реальной статистики</span>}
      </div>
      <div style={S.statGrid}>
        <StatCard label="Revenue" val={fmtUSD(totals.revenue)} color="#00e5ff" sub={labelStr} />
        <StatCard label="Spend"   val={fmtUSD(totals.spend)}   color="#a78bfa" />
        <StatCard label="ROI"     val={totalRoi+"%"}            color="#00c896" />
        <StatCard label="Конверсии" val={fmt(totals.conversions)} color="#ff4566" />
      </div>

      {/* ── TOP OFFERS MONTH ── */}
      <TopOffers />

      {/* ── CAPS FILL MONITOR ── */}
      <CapsFillMonitor caps={caps} />

      {/* ── EXPANDABLE BUYER TABLE ── */}
      <div style={{ fontWeight:700, marginBottom:12, marginTop:28 }}>Сводка по баерам · {labelStr}</div>
      <div style={S.tableWrap}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={S.th} />
              {[
                { label:"Баер",       key:"name"        },
                { label:"Клики",      key:"clicks"      },
                { label:"Конверсии",  key:"conversions" },
                { label:"Продажи",    key:"sales"       },
                { label:"Доход",      key:"revenue"     },
                { label:"Spend",      key:"spend"       },
                { label:"ROI",        key:"roi"         },
              ].map(c => (
                <SortableTh key={c.label} label={c.label} sortKey={c.key}
                  active={buyerSort.sortKey === c.key} dir={buyerSort.sortDir}
                  onToggle={buyerSort.toggle} />
              ))}
            </tr>
          </thead>
          <tbody>
            {buyerSort.sort(buyerRows).map(r => {
              const isOpen = !!expanded[r.id];
              return (
                <>
                  {/* ── BUYER ROW ── */}
                  <tr key={r.id}
                    onClick={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))}
                    style={{ cursor:"pointer", background: isOpen ? "rgba(0,229,255,0.03)" : "transparent" }}
                  >
                    <td style={{ ...S.td, width:32, textAlign:"center", color:"#7a8299", fontSize:10 }}>
                      <span style={{ display:"inline-block", transition:"transform 0.2s", transform: isOpen ? "rotate(90deg)":"rotate(0deg)" }}>▶</span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={S.avatar(26)}>{r.name[0]}</div>
                        <b>{r.name}</b>
                      </div>
                    </td>
                    <td style={{ ...S.td, fontFamily:"monospace" }}>{fmt(r.clicks)}</td>
                    <td style={{ ...S.td, fontFamily:"monospace" }}>{fmt(r.conversions)}</td>
                    <td style={{ ...S.td, fontFamily:"monospace", color:"#a78bfa" }}>{fmt(r.sales)}</td>
                    <td style={{ ...S.td, fontFamily:"monospace", color:"#00c896" }}>{fmtUSD(r.revenue)}</td>
                    <td style={{ ...S.td, fontFamily:"monospace", color:"#ff4566" }}>{fmtUSD(r.spend)}</td>
                    <td style={S.td}>
                      <Pill variant={r.roi>50?"green":r.roi>0?"yellow":"red"}>{r.roi}%</Pill>
                    </td>
                  </tr>

                  {/* ── OFFER ROWS (expanded) ── */}
                  {isOpen && r.offers.map((o, oi) => {
                    const p = parseCampaignName(o.campaignName);
                    const roi = Math.round((o.revenue - o.spend) / Math.max(o.spend, 1) * 100);
                    return (
                      <tr key={r.id+"-o"+oi} style={{ background:"#0d1016" }}>
                        <td style={{ ...S.td, borderBottom:"1px solid #181c24" }} />
                        <td style={{ ...S.td, borderBottom:"1px solid #181c24", paddingLeft:36 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                            <span style={{ width:6, height:6, borderRadius:"50%", background:"#00e5ff", flexShrink:0, opacity:0.5 }} />
                            <span style={{ background:"rgba(0,229,255,0.08)", color:"#00e5ff", fontSize:10, fontWeight:700, padding:"1px 5px", borderRadius:3 }}>{p.geo}</span>
                            <span style={{ fontWeight:600, fontSize:12 }}>{p.offerName}</span>
                            <span style={{ fontSize:10, color:"#4a5168", fontFamily:"monospace" }}>#{p.offerId}</span>
                            <span style={{ fontSize:10, background:"rgba(124,58,237,0.15)", color:"#a78bfa", padding:"1px 6px", borderRadius:4 }}>{p.source}</span>
                            <span style={{ fontSize:10, color:"#7a8299" }}>{p.anticId}</span>
                          </div>
                        </td>
                        <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#7a8299", borderBottom:"1px solid #181c24" }}>{fmt(o.clicks)}</td>
                        <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#7a8299", borderBottom:"1px solid #181c24" }}>{fmt(o.conv)}</td>
                        <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#a78bfa", borderBottom:"1px solid #181c24" }}>{fmt(Math.round(o.conv*0.35))}</td>
                        <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#00c896", borderBottom:"1px solid #181c24" }}>{fmtUSD(o.revenue)}</td>
                        <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#ff4566", borderBottom:"1px solid #181c24" }}>{fmtUSD(o.spend)}</td>
                        <td style={{ ...S.td, borderBottom:"1px solid #181c24" }}>
                          <Pill variant={roi>50?"green":roi>0?"yellow":"red"}>{roi}%</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}



// ── ORG TREE (mindmap-style SVG) ──────────────────────────────────────────────
function OrgTree({ allUsers }) {
  const [hovered, setHovered] = useState(null);

  const tl        = allUsers.find(u => u.role === "teamlead");
  const buyers    = allUsers.filter(u => u.role === "buyer" && u.status !== "deleted");
  const assistants= allUsers.filter(u => u.role === "assistant" && u.status !== "deleted");

  const ROLE_COLORS = { teamlead: "#f5c842", buyer: "#00e5ff", assistant: "#a78bfa" };
  const STATUS_OP   = (u) => u.status === "inactive" ? 0.4 : 1;

  // Layout constants
  const NODE_W = 160, NODE_H = 52, H_GAP = 40, V_GAP = 80;
  const TL_X = 0, TL_Y = 0;

  // Position buyers in a row below TL
  const totalBuyerW = buyers.length * NODE_W + (buyers.length - 1) * H_GAP;
  const buyerStartX = TL_X - totalBuyerW / 2 + NODE_W / 2;

  const buyerPos = buyers.map((b, i) => ({
    ...b,
    x: buyerStartX + i * (NODE_W + H_GAP),
    y: TL_Y + NODE_H + V_GAP,
  }));

  // Position assistants below their parent buyer
  // Group assistants by parentId
  const assistantsByParent = {};
  assistants.forEach(a => {
    if (!assistantsByParent[a.parentId]) assistantsByParent[a.parentId] = [];
    assistantsByParent[a.parentId].push(a);
  });

  const assistantPos = [];
  buyerPos.forEach(bp => {
    const children = assistantsByParent[bp.id] || [];
    const totalW = children.length * NODE_W + (children.length - 1) * (H_GAP * 0.6);
    const startX = bp.x - totalW / 2 + NODE_W / 2;
    children.forEach((a, i) => {
      assistantPos.push({
        ...a,
        x: startX + i * (NODE_W + H_GAP * 0.6),
        y: bp.y + NODE_H + V_GAP,
      });
    });
  });

  const allNodes = [
    { ...tl, x: TL_X, y: TL_Y },
    ...buyerPos,
    ...assistantPos,
  ];

  // Compute SVG viewBox
  const xs = allNodes.map(n => n.x - NODE_W / 2);
  const ys = allNodes.map(n => n.y);
  const xe = allNodes.map(n => n.x + NODE_W / 2);
  const ye = allNodes.map(n => n.y + NODE_H);
  const pad = 32;
  const vx = Math.min(...xs) - pad;
  const vy = Math.min(...ys) - pad;
  const vw = Math.max(...xe) - Math.min(...xs) + pad * 2;
  const vh = Math.max(...ye) - Math.min(...ys) + pad * 2;

  // Build edges: TL → buyers, buyers → their assistants
  const edges = [];
  buyerPos.forEach(bp => {
    edges.push({ x1: TL_X, y1: TL_Y + NODE_H, x2: bp.x, y2: bp.y });
  });
  assistantPos.forEach(ap => {
    const parent = buyerPos.find(b => b.id === ap.parentId);
    if (parent) edges.push({ x1: parent.x, y1: parent.y + NODE_H, x2: ap.x, y2: ap.y });
  });

  const renderNode = (node) => {
    const color = ROLE_COLORS[node.role] || "#7a8299";
    const isHov = hovered === node.id;
    const op = STATUS_OP(node);
    const nx = node.x - NODE_W / 2;
    const ny = node.y;
    const ROLE_LABEL = { teamlead: "Team Lead", buyer: "Баер", assistant: "Помощник" };

    return (
      <g key={node.id} opacity={op}
        onMouseEnter={() => setHovered(node.id)}
        onMouseLeave={() => setHovered(null)}
        style={{ cursor: "default" }}>
        {/* Card background */}
        <rect x={nx} y={ny} width={NODE_W} height={NODE_H} rx={8}
          fill={isHov ? "#1e2535" : "#181c24"}
          stroke={isHov ? color : "#252d3d"}
          strokeWidth={isHov ? 1.5 : 1} />
        {/* Left accent bar */}
        <rect x={nx} y={ny + 6} width={3} height={NODE_H - 12} rx={1.5} fill={color} />
        {/* Role badge */}
        <rect x={nx + 10} y={ny + 7} width={60} height={14} rx={4}
          fill={color} fillOpacity={0.12} />
        <text x={nx + 40} y={ny + 18} textAnchor="middle"
          fill={color} fontSize={9} fontWeight="700" fontFamily="monospace"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {ROLE_LABEL[node.role] || node.role}
        </text>
        {/* Name */}
        <text x={nx + NODE_W / 2} y={ny + 36} textAnchor="middle"
          fill={isHov ? "#e8eaf0" : "#c8cad4"} fontSize={12} fontWeight="600"
          fontFamily="'Segoe UI', system-ui, sans-serif">
          {node.name.length > 16 ? node.name.slice(0, 15) + "…" : node.name}
        </text>
        {/* Telegram hover badge */}
        {isHov && node.telegram && (
          <text x={nx + NODE_W / 2} y={ny + NODE_H + 16} textAnchor="middle"
            fill="#29b6f6" fontSize={10} fontFamily="monospace">{node.telegram}</text>
        )}
        {/* Inactive indicator */}
        {node.status === "inactive" && (
          <text x={nx + NODE_W - 8} y={ny + 14} textAnchor="end"
            fill="#ff4566" fontSize={9} fontWeight="700">✕ OFF</text>
        )}
      </g>
    );
  };

  const renderEdge = (e, i) => {
    // Bezier curve: mid point for smooth S-curve
    const mx = (e.x1 + e.x2) / 2;
    const my1 = e.y1 + (e.y2 - e.y1) * 0.4;
    const my2 = e.y1 + (e.y2 - e.y1) * 0.6;
    const d = `M ${e.x1} ${e.y1} C ${e.x1} ${my1}, ${e.x2} ${my2}, ${e.x2} ${e.y2}`;
    return <path key={i} d={d} fill="none" stroke="#252d3d" strokeWidth={1.5} />;
  };

  return (
    <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, overflow:"hidden", marginTop:20 }}>
      <div style={{ padding:"16px 20px", borderBottom:"1px solid #1e2330", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14 }}>Структура команды</div>
          <div style={{ fontSize:11, color:"#7a8299", marginTop:2 }}>Наведи на карточку чтобы увидеть Telegram</div>
        </div>
        <div style={{ display:"flex", gap:12, fontSize:11 }}>
          {[["#f5c842","Team Lead"],["#00e5ff","Баер"],["#a78bfa","Помощник"]].map(([c,l]) => (
            <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:c }} />
              <span style={{ color:"#7a8299" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ overflowX:"auto", padding:"8px 0" }}>
        <svg viewBox={`${vx} ${vy} ${vw} ${vh}`}
          width={Math.max(vw, 500)} height={vh + 20}
          style={{ display:"block", margin:"0 auto" }}>
          {/* Grid dots background */}
          <defs>
            <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#1e2330" />
            </pattern>
          </defs>
          <rect x={vx} y={vy} width={vw} height={vh} fill="url(#dots)" />
          {/* Edges first (behind nodes) */}
          {edges.map(renderEdge)}
          {/* Nodes */}
          {allNodes.map(renderNode)}
        </svg>
      </div>
    </div>
  );
}

// ── TEAM PAGE ─────────────────────────────────────────────────────────────────
function TeamPage({ allUsers, setAllUsers, invites, setInvites, onSelect }) {
  const [tab, setTab] = useState("members");
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [invForm, setInvForm] = useState({ role: "buyer", parentId: "" });
  const [editForm, setEditForm] = useState({});
  const [copiedToken, setCopiedToken] = useState("");

  const ms = useSortable("name");
  const is = useSortable("createdAt", "desc");

  const buyers     = allUsers.filter(u => u.role === "buyer");
  const assistants = allUsers.filter(u => u.role === "assistant");
  const activeInvites = invites.filter(i => !i.used);

  const ROLE_LABELS  = { buyer: "Баер", assistant: "Помощник", teamlead: "Тимлид" };
  const ROLE_COLORS  = { buyer: "cyan", assistant: "purple", teamlead: "yellow" };
  const STATUS_COLORS = { active: "green", inactive: "red", pending: "yellow" };

  const genToken = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return "inv-" + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const createInvite = () => {
    if (invForm.role === "assistant" && !invForm.parentId) return;
    const token = genToken();
    setInvites(p => [...p, {
      token, role: invForm.role,
      parentId: invForm.role === "assistant" ? invForm.parentId : null,
      createdBy: "tl1", createdAt: new Date().toISOString().split("T")[0], used: false,
    }]);
    setShowInvite(false);
    setInvForm({ role: "buyer", parentId: "" });
  };

  const revokeInvite = (token) => setInvites(p => p.filter(i => i.token !== token));

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ name: u.name, login: u.login, role: u.role, team: u.team, status: u.status, parentId: u.parentId || "", telegram: u.telegram || "" });
    setShowEdit(true);
  };

  const saveEdit = () => {
    setAllUsers(p => p.map(u => u.id === editUser.id ? { ...u, ...editForm } : u));
    setShowEdit(false);
  };

  const deactivate = (id) => setAllUsers(p => p.map(u => u.id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u));

  const copyToken = (t) => {
    navigator.clipboard?.writeText(t).catch(() => {});
    setCopiedToken(t);
    setTimeout(() => setCopiedToken(""), 2000);
  };

  const enriched = allUsers
    .filter(u => u.role !== "teamlead")
    .map(u => ({
      ...u,
      parentName: u.parentId ? (allUsers.find(p => p.id === u.parentId)?.name || "—") : "—",
    }));

  return (
    <div>
      {/* Header stats */}
      <div style={S.statGrid}>
        <StatCard label="Баеры" val={String(buyers.length)} color="#00e5ff" sub="в команде" />
        <StatCard label="Помощники" val={String(assistants.length)} color="#a78bfa" sub="назначено" />
        <StatCard label="Активных" val={String(allUsers.filter(u => u.status === "active" && u.role !== "teamlead").length)} color="#00c896" />
        <StatCard label="Ожид. инвайтов" val={String(activeInvites.length)} color="#f5c842" sub="не использованы" />
      </div>

      {/* Tabs + actions */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", gap:2, background:"#181c24", borderRadius:8, padding:3 }}>
          {[["members","Участники"],["invites","Инвайты"],["tree","Структура"]].map(([id,label]) => (
            <div key={id} onClick={() => setTab(id)}
              style={{ padding:"7px 16px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer",
                background: tab===id ? "#111318":"transparent", color: tab===id ? "#e8eaf0":"#7a8299" }}>{label}
              {id==="invites" && activeInvites.length > 0 &&
                <span style={{ marginLeft:6, background:"rgba(245,200,66,0.2)", color:"#f5c842", fontSize:10, fontWeight:700, padding:"1px 5px", borderRadius:10 }}>{activeInvites.length}</span>}
            </div>
          ))}
        </div>
        <button style={S.btn("accent")} onClick={() => setShowInvite(true)}>+ Создать инвайт</button>
      </div>

      {/* Members tab */}
      {tab === "members" && (
        <div style={{ ...S.tableWrap, overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
            <thead><tr>
              {[
                { label:"Имя",       key:"name"       },
                { label:"Логин",     key:"login"      },
                { label:"Роль",      key:"role"       },
                { label:"Привязан к",key:"parentName" },
                { label:"Команда",   key:"team"       },
                { label:"Рег.",      key:"registered" },
                { label:"Telegram",  key:"telegram"   },
                { label:"Статус",    key:"status"     },
                { label:"",          key:null         },
              ].map(c => (
                <SortableTh key={c.label||"act"} label={c.label} sortKey={c.key}
                  active={ms.sortKey===c.key} dir={ms.sortDir} onToggle={ms.toggle} />
              ))}
            </tr></thead>
            <tbody>
              {ms.sort(enriched).map(u => (
                <tr key={u.id}>
                  <td style={S.td}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ ...S.avatar(28), opacity: u.status === "inactive" ? 0.4 : 1 }}>{u.name[0]}</div>
                      <span style={{ fontWeight:600, color: u.status === "inactive" ? "#4a5168" : "#e8eaf0" }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ ...S.td, fontFamily:"monospace", color:"#7a8299", fontSize:12 }}>{u.login}</td>
                  <td style={S.td}><Pill variant={ROLE_COLORS[u.role] || "cyan"}>{ROLE_LABELS[u.role] || u.role}</Pill></td>
                  <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{u.parentName}</td>
                  <td style={S.td}>
                    <span style={{ background:"rgba(0,229,255,0.08)", color:"#00e5ff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4 }}>{u.team}</span>
                  </td>
                  <td style={{ ...S.td, fontSize:12, color:"#7a8299", whiteSpace:"nowrap" }}>{u.registered}</td>
                  <td style={S.td}>
                    {u.telegram
                      ? <a href={`https://t.me/${u.telegram.replace("@","")}`} target="_blank" rel="noreferrer"
                          style={{ color:"#29b6f6", fontFamily:"monospace", fontSize:12, textDecoration:"none", whiteSpace:"nowrap" }}>{u.telegram}</a>
                      : <span style={{ color:"#4a5168", fontSize:12 }}>—</span>}
                  </td>
                  <td style={S.td}><Pill variant={STATUS_COLORS[u.status]}>{u.status === "active" ? "Активен" : "Отключён"}</Pill></td>
                  <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      {u.role === "buyer" && (
                        <button style={{ ...S.btn(), padding:"5px 10px", fontSize:11 }} onClick={() => onSelect(u)}>Детали</button>
                      )}
                      {u.telegram && (
                        <a href={`https://t.me/${u.telegram.replace("@","")}`} target="_blank" rel="noreferrer"
                          style={{ ...S.btn(), padding:"5px 10px", fontSize:11, textDecoration:"none", color:"#29b6f6", borderColor:"rgba(41,182,246,0.3)" }}>
                          ✈ TG
                        </a>
                      )}
                      <button style={{ ...S.btn(), padding:"5px 8px", fontSize:13 }} onClick={() => openEdit(u)} title="Редактировать">✎</button>
                      <button style={{ ...S.btn(), padding:"5px 8px", fontSize:11,
                        color: u.status === "active" ? "#ff4566" : "#00c896",
                        borderColor: u.status === "active" ? "rgba(255,69,102,0.3)" : "rgba(0,200,150,0.3)" }}
                        onClick={() => deactivate(u.id)}>
                        {u.status === "active" ? "Откл." : "Вкл."}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invites tab */}
      {tab === "invites" && (
        <div style={S.tableWrap}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              {[
                { label:"Токен",     key:"token"     },
                { label:"Роль",      key:"role"      },
                { label:"Для баера", key:"parentId"  },
                { label:"Создан",    key:"createdAt" },
                { label:"Статус",    key:null        },
                { label:"",          key:null        },
              ].map(c => (
                <SortableTh key={c.label||"act"} label={c.label} sortKey={c.key}
                  active={is.sortKey===c.key} dir={is.sortDir} onToggle={is.toggle} />
              ))}
            </tr></thead>
            <tbody>
              {is.sort(invites).map(inv => (
                <tr key={inv.token} style={{ opacity: inv.used ? 0.45 : 1 }}>
                  <td style={S.td}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <code style={{ fontFamily:"monospace", fontSize:12, color: inv.used ? "#4a5168" : "#00e5ff",
                        background:"rgba(0,229,255,0.05)", padding:"2px 8px", borderRadius:4 }}>{inv.token}</code>
                      {!inv.used && (
                        <button onClick={() => copyToken(inv.token)} style={{ ...S.btn(), fontSize:10, padding:"3px 8px",
                          color: copiedToken===inv.token ? "#00c896":"#7a8299" }}>
                          {copiedToken===inv.token ? "✓ Скопировано" : "Копировать"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={S.td}><Pill variant={ROLE_COLORS[inv.role]}>{ROLE_LABELS[inv.role] || inv.role}</Pill></td>
                  <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>
                    {inv.parentId ? (allUsers.find(u => u.id === inv.parentId)?.name || inv.parentId) : "—"}
                  </td>
                  <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{inv.createdAt}</td>
                  <td style={S.td}>
                    {inv.used
                      ? <Pill variant="green">Использован</Pill>
                      : <Pill variant="yellow">Ожидает</Pill>}
                  </td>
                  <td style={S.td}>
                    {!inv.used && (
                      <button style={{ ...S.btn(), color:"#ff4566", borderColor:"rgba(255,69,102,0.3)", fontSize:11 }}
                        onClick={() => revokeInvite(inv.token)}>Отозвать</button>
                    )}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr><td colSpan={6} style={{ ...S.td, textAlign:"center", color:"#4a5168", padding:32 }}>Нет инвайтов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tree tab */}
      {tab === "tree" && <OrgTree allUsers={allUsers} />}

      {/* Create invite modal */}
      {showInvite && (
        <div style={S.overlay} onClick={e => e.target===e.currentTarget && setShowInvite(false)}>
          <div style={{ ...S.modal, maxWidth:400 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>Создать инвайт-ссылку</div>
            <Field label="Роль">
              <select style={S.input} value={invForm.role} onChange={e => setInvForm({ ...invForm, role: e.target.value, parentId:"" })}>
                <option value="buyer">Баер</option>
                <option value="assistant">Помощник баера</option>
              </select>
            </Field>
            {invForm.role === "assistant" && (
              <Field label="Назначить под баера">
                <select style={S.input} value={invForm.parentId} onChange={e => setInvForm({ ...invForm, parentId: e.target.value })}>
                  <option value="">— выбери баера —</option>
                  {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            )}
            <div style={{ background:"#0a0c10", borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#4a5168", marginBottom:6 }}>ИНСТРУКЦИЯ ДЛЯ БАЕРА</div>
              <div style={{ fontSize:12, color:"#7a8299", lineHeight:1.7 }}>
                1. Открой FlowDesk<br/>
                2. Нажми «Регистрация»<br/>
                3. Вставь токен (сгенерируется после создания)<br/>
                4. Заполни имя, логин и пароль
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={S.btn()} onClick={() => setShowInvite(false)}>Отмена</button>
              <button style={S.btn("accent")}
                disabled={invForm.role === "assistant" && !invForm.parentId}
                onClick={createInvite}>Создать токен</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {showEdit && editUser && (
        <div style={S.overlay} onClick={e => e.target===e.currentTarget && setShowEdit(false)}>
          <div style={{ ...S.modal, maxWidth:440 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>Редактировать: {editUser.name}</div>
            <Field label="Полное имя">
              <input style={S.input} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field label="Логин">
                <input style={S.input} value={editForm.login} onChange={e => setEditForm({ ...editForm, login: e.target.value })} />
              </Field>
              <Field label="Команда">
                <select style={S.input} value={editForm.team} onChange={e => setEditForm({ ...editForm, team: e.target.value })}>
                  {["Alpha","Beta","Gamma","Delta"].map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Роль">
              <select style={S.input} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                <option value="buyer">Баер</option>
                <option value="assistant">Помощник баера</option>
              </select>
            </Field>
            {editForm.role === "assistant" && (
              <Field label="Назначен под баера">
                <select style={S.input} value={editForm.parentId} onChange={e => setEditForm({ ...editForm, parentId: e.target.value })}>
                  <option value="">— не назначен —</option>
                  {buyers.filter(b => b.id !== editUser.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Telegram (@username)">
              <input style={S.input} value={editForm.telegram || ""} onChange={e => setEditForm({ ...editForm, telegram: e.target.value })} placeholder="@username" />
            </Field>
            <Field label="Статус">
              <select style={S.input} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="active">Активен</option>
                <option value="inactive">Отключён</option>
              </select>
            </Field>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button style={S.btn()} onClick={() => setShowEdit(false)}>Отмена</button>
              <button style={S.btn("accent")} onClick={saveEdit}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BUYERS LIST ────────────────────────────────────────────────────────────────
function BuyersList({ buyers, setBuyers, onSelect }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", login: "", pass: "", team: "Alpha" });
  const bs = useSortable("name");
  const add = () => {
    if (!form.name || !form.login || !form.pass) return;
    const nb = { id: "b" + Date.now(), ...form, role: "buyer", registered: new Date().toISOString().split("T")[0] };
    BS[nb.id] = { history: genHistory(), totalRevenue: 0, totalSpend: 0, conversions: 0 };
    setBuyers(p => [...p, nb]);
    setForm({ name: "", login: "", pass: "", team: "Alpha" });
    setShow(false);
  };

  const enriched = buyers.map(b => {
    const st = BS[b.id];
    const totalRevenue = st?.totalRevenue || 0;
    const totalSpend   = st?.totalSpend   || 0;
    const roi = st ? Math.round((totalRevenue - totalSpend) / Math.max(totalSpend, 1) * 100) : 0;
    return { ...b, totalRevenue, roi };
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <b>Баеры команды</b>
        <button style={S.btn("accent")} onClick={() => setShow(true)}>+ Добавить</button>
      </div>
      <div style={S.tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {[
              { label:"Имя",            key:"name"         },
              { label:"Логин",          key:"login"        },
              { label:"Команда",        key:"team"         },
              { label:"Revenue",        key:"totalRevenue" },
              { label:"ROI",            key:"roi"          },
              { label:"Зарегистрирован",key:"registered"   },
              { label:"",               key:null           },
            ].map(c => (
              <SortableTh key={c.label||"act"} label={c.label} sortKey={c.key}
                active={bs.sortKey===c.key} dir={bs.sortDir} onToggle={bs.toggle} />
            ))}
          </tr></thead>
          <tbody>
            {bs.sort(enriched).map(b => (
              <tr key={b.id}>
                <td style={S.td}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={S.avatar(26)}>{b.name[0]}</div><b>{b.name}</b></div></td>
                <td style={{ ...S.td, fontFamily: "monospace", color: "#7a8299" }}>{b.login}</td>
                <td style={S.td}><span style={{ background: "rgba(0,229,255,0.08)", color: "#00e5ff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{b.team}</span></td>
                <td style={{ ...S.td, fontFamily: "monospace", color: "#00c896" }}>{b.totalRevenue ? fmtUSD(b.totalRevenue) : "—"}</td>
                <td style={S.td}><Pill variant={b.roi > 50 ? "green" : b.roi > 0 ? "yellow" : "red"}>{b.roi}%</Pill></td>
                <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{b.registered}</td>
                <td style={S.td}><button style={S.btn()} onClick={() => onSelect(b)}>Детали →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShow(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Добавить баера</div>
            <Field label="Имя"><input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Иван Иванов" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Логин"><input style={S.input} value={form.login} onChange={e => setForm({ ...form, login: e.target.value })} /></Field>
              <Field label="Пароль"><input style={S.input} value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} /></Field>
            </div>
            <Field label="Команда">
              <select style={S.input} value={form.team} onChange={e => setForm({ ...form, team: e.target.value })}>
                {["Alpha", "Beta", "Gamma"].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={S.btn()} onClick={() => setShow(false)}>Отмена</button>
              <button style={S.btn("accent")} onClick={add}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BUYER DETAIL ───────────────────────────────────────────────────────────────
function BuyerDetail({ buyer, onBack, caps, resources }) {
  const st = BS[buyer.id] || { history: [], totalRevenue: 0, totalSpend: 0, conversions: 0 };
  const roi = Math.round((st.totalRevenue - st.totalSpend) / Math.max(st.totalSpend, 1) * 100);
  const last7 = st.history.slice(-7);
  const myCaps = caps.filter(c => c.buyerId === buyer.id);
  const myRes = resources.filter(r => r.buyerId === buyer.id);

  return (
    <div>
      <button style={{ ...S.btn(), marginBottom: 16 }} onClick={onBack}>← Назад</button>
      <div style={{ background: "#111318", border: "1px solid #1e2330", borderRadius: 10, padding: 20, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={S.avatar(52)}>{buyer.name[0]}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{buyer.name}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
            <Pill variant="cyan">Баер</Pill>
            <span style={{ fontSize: 12, color: "#7a8299" }}>@{buyer.login}</span>
            <span style={{ fontSize: 12, color: "#7a8299" }}>С {buyer.registered}</span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#4a5168", marginBottom: 4 }}>REVENUE</div>
            <div style={{ fontFamily: "monospace", fontSize: 20, color: "#00c896" }}>{fmtUSD(st.totalRevenue)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#4a5168", marginBottom: 4 }}>ROI</div>
            <div style={{ fontFamily: "monospace", fontSize: 20, color: roi > 50 ? "#00c896" : "#f5c842" }}>{roi}%</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#111318", border: "1px solid #1e2330", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5168", marginBottom: 14 }}>Revenue · 7 дней</div>
          <BarChart rows={last7.map(d => ({ label: d.date.slice(5), val: d.revenue }))} />
        </div>
        <div style={{ background: "#111318", border: "1px solid #1e2330", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5168", marginBottom: 14 }}>Капы</div>
          {myCaps.length === 0 ? <div style={{ color: "#4a5168", fontSize: 13 }}>Нет капов</div> : myCaps.map(c => {
            const pct = Math.min(100, Math.round(c.current / c.daily * 100));
            return (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                  <b>{c.offer}</b><span style={{ color: "#7a8299" }}>{c.geo} · {c.current}/{c.daily}</span>
                </div>
                <div style={{ height: 6, background: "#181c24", borderRadius: 3 }}><div style={S.progress(pct, c.current >= c.daily)} /></div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontWeight: 700, marginBottom: 12 }}>Выданные ресурсы</div>
      <div style={S.tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Тип", "Платформа", "Кол-во", "Дата", "Статус", "Примечание"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {myRes.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#4a5168" }}>Нет ресурсов</td></tr> :
              myRes.map(r => (
                <tr key={r.id}>
                  <td style={{ ...S.td, textTransform: "capitalize" }}>{r.type}</td>
                  <td style={S.td}>{r.platform}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{r.qty}</td>
                  <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{r.date}</td>
                  <td style={S.td}><Pill variant={r.status === "issued" ? "green" : "yellow"}>{r.status === "issued" ? "Выдано" : "Ожидание"}</Pill></td>
                  <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{r.note || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CAPS PAGE ──────────────────────────────────────────────────────────────────
function CapsPage({ buyers, caps, setCaps }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ buyerId: buyers[0]?.id || "", campaignName: "", daily: 300 });
  const add = () => {
    if (!form.campaignName) return;
    setCaps(p => [...p, { id: "c" + Date.now(), buyerId: form.buyerId, campaignName: form.campaignName, daily: +form.daily, current: 0 }]);
    setShow(false);
  };
  const bName = id => buyers.find(b => b.id === id)?.name || id;
  const cs = useSortable("offerName");

  // Enrich caps with parsed fields
  const enrichedCaps = caps.map(c => {
    const p = parseCampaignName(c.campaignName);
    return { ...c, ...p, buyerName: bName(c.buyerId), pct: Math.min(100, Math.round(c.current / c.daily * 100)) };
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <b>Управление капами</b>
        <button style={S.btn("accent")} onClick={() => setShow(true)}>+ Добавить кап</button>
      </div>
      <div style={S.tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {[
              { label:"Баер",             key:"buyerName" },
              { label:"GEO | Оффер | ID", key:"offerName" },
              { label:"Источник",         key:"source"    },
              { label:"Лендинг",          key:"landingSign"},
              { label:"Buyer Info",       key:"buyerInfo" },
              { label:"Antidetect",       key:"anticId"   },
              { label:"Лимит",            key:"daily"     },
              { label:"Текущий",          key:"current"   },
              { label:"Прогресс",         key:"pct"       },
              { label:"Статус",           key:null        },
            ].map(c => (
              <SortableTh key={c.label} label={c.label} sortKey={c.key}
                active={cs.sortKey===c.key} dir={cs.sortDir} onToggle={cs.toggle} />
            ))}
          </tr></thead>
          <tbody>
            {cs.sort(enrichedCaps).map(c => (
              <tr key={c.id}>
                <td style={{ ...S.td, fontWeight: 600 }}>{c.buyerName}</td>
                <td style={S.td}>
                  <div style={{ lineHeight: 1.5 }}>
                    <span style={{ background:"rgba(0,229,255,0.08)", color:"#00e5ff", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:3, marginRight:5 }}>{c.geo}</span>
                    <span style={{ fontWeight:600, fontSize:13 }}>{c.offerName}</span>
                    <span style={{ marginLeft:5, fontSize:10, color:"#4a5168", fontFamily:"monospace" }}>#{c.offerId}</span>
                  </div>
                </td>
                <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{c.source}</td>
                <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{c.landingSign}</td>
                <td style={{ ...S.td, fontSize:12, color:"#4a5168", fontFamily:"monospace" }}>{c.buyerInfo}</td>
                <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{c.anticId}</td>
                <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(c.daily)}</td>
                <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(c.current)}</td>
                <td style={{ ...S.td, width: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: "#181c24", borderRadius: 3 }}><div style={S.progress(c.pct, c.current >= c.daily)} /></div>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#7a8299", width: 34, textAlign: "right" }}>{c.pct}%</span>
                  </div>
                </td>
                <td style={S.td}><Pill variant={c.current >= c.daily ? "red" : c.current / c.daily > 0.8 ? "yellow" : "green"}>{c.current >= c.daily ? "Заполнен" : c.current / c.daily > 0.8 ? "Почти" : "Ок"}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShow(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Добавить кап</div>
            <Field label="Баер">
              <select style={S.input} value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })}>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Название кампании (GEO | Offer-name | Offer-id | Source | Landing | Advertiser | Aff-name | Buyer)">
              <input style={S.input} value={form.campaignName} onChange={e => setForm({ ...form, campaignName: e.target.value })}
                placeholder="UA | Nutra Slim | 1021 | Facebook | lp1-slim | info-cpa-v1 | chrome-01 | maxpetrov" />
            </Field>
            {form.campaignName && (() => {
              const p = parseCampaignName(form.campaignName);
              return (
                <div style={{ background:"#0a0c10", borderRadius:7, padding:"10px 14px", marginBottom:14, fontSize:12, lineHeight:1.8 }}>
                  <div style={{ color:"#4a5168", fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Предпросмотр парсинга</div>
                  {[["GEO", p.geo],["Оффер", p.offerName],["Offer ID", p.offerId],["Источник", p.source],["Лендинг", p.landingSign],["Buyer Info", p.buyerInfo],["Antidetect", p.anticId],["Buyer Name", p.buyerName]].map(([k,v]) => (
                    <div key={k} style={{ display:"flex", gap:8 }}>
                      <span style={{ color:"#4a5168", width:90 }}>{k}:</span>
                      <span style={{ color:"#e8eaf0", fontWeight:600 }}>{v || "—"}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              <Field label="Дневной лимит"><input style={S.input} type="number" value={form.daily} onChange={e => setForm({ ...form, daily: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={S.btn()} onClick={() => setShow(false)}>Отмена</button>
              <button style={S.btn("accent")} onClick={add}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KEITARO PAGE ───────────────────────────────────────────────────────────────
function KeitaroPage() {
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState(null);
  const [error,    setError]    = useState(null);
  const [interval, setInterval_] = useState(15);
  const [configured, setConfigured] = useState(false);
  const [history,  setHistory]  = useState([]);
  const ks = useSortable("revenue");

  // Load config on mount
  useEffect(() => {
    fetch('/api/keitaro/config', { headers: { Authorization: `Bearer ${localStorage.getItem('fd_token')}` } })
      .then(r => r.json())
      .then(c => { setConfigured(c.configured); setInterval_(c.interval || 15); })
      .catch(() => {});
    fetch('/api/keitaro/history', { headers: { Authorization: `Bearer ${localStorage.getItem('fd_token')}` } })
      .then(r => r.json())
      .then(rows => setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  const sync = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/keitaro/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('fd_token')}` },
        body: JSON.stringify({ interval: 'today' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Sync failed');
      setData(d);
      // Reload history
      fetch('/api/keitaro/history', { headers: { Authorization: `Bearer ${localStorage.getItem('fd_token')}` } })
        .then(r => r.json()).then(rows => setHistory(Array.isArray(rows) ? rows : [])).catch(() => {});
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const saveInterval = async (val) => {
    setInterval_(val);
    await fetch('/api/keitaro/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('fd_token')}` },
      body: JSON.stringify({ interval: val }),
    }).catch(() => {});
  };

  const total = data ? data.campaigns.reduce((s, c) => ({ clicks: s.clicks + c.clicks, conv: s.conv + c.conv, revenue: s.revenue + c.revenue, spend: s.spend + c.spend }), { clicks: 0, conv: 0, revenue: 0, spend: 0 }) : null;

  return (
    <div>
      <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:20, marginBottom:18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:700, marginBottom:3 }}>Интеграция Keitaro</div>
            <div style={{ fontSize:12, color:"#7a8299" }}>API ключ задаётся в переменных Railway (KEITARO_URL, KEITARO_API_KEY)</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:configured?"#00c896":"#4a5168", boxShadow:configured?"0 0 6px #00c896":"none" }} />
            {configured ? "Подключено" : "Не настроено"}
          </div>
        </div>

        {!configured && (
          <div style={{ background:"rgba(245,200,66,0.07)", border:"1px solid rgba(245,200,66,0.2)", borderRadius:8, padding:"12px 14px", marginBottom:14, fontSize:12, color:"#f5c842" }}>
            ⚠️ Добавь в Railway Variables:<br/>
            <code style={{ fontFamily:"monospace" }}>KEITARO_URL=https://твой-кейтаро.com</code><br/>
            <code style={{ fontFamily:"monospace" }}>KEITARO_API_KEY=твой-ключ</code>
          </div>
        )}

        <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div>
            <label style={S.label}>Авто-синк каждые</label>
            <div style={{ display:"flex", gap:4 }}>
              {[5,15,30,60].map(n => (
                <button key={n} onClick={() => saveInterval(n)} style={{
                  ...S.btn(interval===n?"accent":"default"), padding:"6px 12px", fontSize:12
                }}>{n} мин</button>
              ))}
            </div>
          </div>
          <button style={{ ...S.btn("accent"), height:40, paddingLeft:20, paddingRight:20 }}
            onClick={sync} disabled={loading || !configured}>
            {loading ? "Синхронизация…" : "⟳ Синхронизировать сейчас"}
          </button>
        </div>
        {error && <div style={{ marginTop:10, color:"#ff4566", fontSize:12 }}>Ошибка: {error}</div>}
      </div>

      {/* Sync history */}
      {history.length > 0 && (
        <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:16, marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#4a5168", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>История синхронизаций</div>
          {history.slice(0,5).map((h,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom: i<4?"1px solid #181c24":"none", fontSize:12 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:h.status==="ok"?"#00c896":"#ff4566", flexShrink:0 }} />
              <span style={{ color:"#7a8299", fontFamily:"monospace" }}>{new Date(h.synced_at).toLocaleString("ru-RU")}</span>
              <span style={{ color:h.status==="ok"?"#00c896":"#ff4566" }}>{h.status==="ok"?"Успешно":h.error_msg||"Ошибка"}</span>
            </div>
          ))}
        </div>
      )}
      {data && (
        <>
          <div style={S.statGrid}>
            <StatCard label="Клики"      val={fmt(total.clicks)}      color="#00e5ff" />
            <StatCard label="Конверсии"  val={fmt(total.conv)}        color="#a78bfa" />
            <StatCard label="Revenue"    val={fmtUSD(total.revenue)}  color="#00c896" />
            <StatCard label="Spend"      val={fmtUSD(total.spend)}    color="#ff4566" />
          </div>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Кампании</div>
          <div style={S.tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {[
                  { label:"GEO | Оффер | ID", key:"name"       },
                  { label:"Источник",          key:"source"     },
                  { label:"Лендинг",           key:"landing"    },
                  { label:"Лендинг",            key:"landingSign" },
                  { label:"Buyer Info",         key:"buyerInfo"  },
                  { label:"Antidetect",         key:"anticId"    },
                  { label:"Buyer Name",         key:"buyerName"  },
                  { label:"Клики",             key:"clicks"     },
                  { label:"Конверсии",         key:"conv"       },
                  { label:"Revenue",           key:"revenue"    },
                  { label:"Spend",             key:"spend"      },
                  { label:"ROI",               key:"roi"        },
                ].map(c => (
                  <SortableTh key={c.label} label={c.label} sortKey={c.key}
                    active={ks.sortKey===c.key} dir={ks.sortDir} onToggle={ks.toggle} />
                ))}
              </tr></thead>
              <tbody>
                {ks.sort(data.campaigns.map(c => ({ ...c, ...parseCampaignName(c.name) }))).map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      <div style={{ lineHeight: 1.4 }}>
                        <span style={{ color:"#00e5ff", fontSize:10, fontWeight:700, background:"rgba(0,229,255,0.08)", padding:"1px 6px", borderRadius:3, marginRight:5 }}>{c.geo}</span>
                        <span style={{ fontSize: 13 }}>{c.offerName}</span>
                        <span style={{ marginLeft:6, fontSize:10, color:"#4a5168", fontFamily:"monospace" }}>#{c.offerId}</span>
                      </div>
                    </td>
                    <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{c.source}</td>
                    <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{c.landingSign}</td>
                    <td style={{ ...S.td, fontSize:11, color:"#4a5168", fontFamily:"monospace" }}>{c.buyerInfo}</td>
                    <td style={{ ...S.td, fontSize:12, color:"#7a8299" }}>{c.anticId}</td>
                    <td style={{ ...S.td, fontSize:12, fontWeight:600 }}>{c.buyerName}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(c.clicks)}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(c.conv)}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: "#00c896" }}>{fmtUSD(c.revenue)}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: "#ff4566" }}>{fmtUSD(c.spend)}</td>
                    <td style={S.td}><Pill variant={c.roi > 100 ? "green" : "yellow"}>{c.roi}%</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}


// ── RESOURCES PAGE ─────────────────────────────────────────────────────────────
function ResourcesPage({ buyers, resources, setResources }) {
  const [tab, setTab] = useState("all");
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ buyerId: buyers[0]?.id || "", type: "accounts", platform: "Facebook", qty: 10, note: "", status: "issued" });
  const fileRef = useRef();

  const add = () => {
    setResources(p => [...p, { id: "r" + Date.now(), ...form, qty: +form.qty, date: new Date().toISOString().split("T")[0] }]);
    setShow(false);
  };
  const bName = id => buyers.find(b => b.id === id)?.name || id;
  const summary = buyers.map(b => {
    const rs = resources.filter(r => r.buyerId === b.id);
    return { ...b, accs: rs.filter(r => r.type === "accounts").reduce((s, r) => s + r.qty, 0), proxy: rs.filter(r => r.type === "proxy").reduce((s, r) => s + r.qty, 0), total: rs.length };
  });
  const rs = useSortable("date", "desc");
  const ss = useSortable("name");
  const enrichedRes = resources.map(r => ({ ...r, buyerName: bName(r.buyerId) }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 2, background: "#181c24", borderRadius: 8, padding: 3 }}>
          {[["all", "Все запросы"], ["summary", "Сводка"], ["import", "Импорт"]].map(([id, label]) => (
            <div key={id} onClick={() => setTab(id)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: tab === id ? "#111318" : "transparent", color: tab === id ? "#e8eaf0" : "#7a8299" }}>{label}</div>
          ))}
        </div>
        {tab === "all" && <button style={S.btn("accent")} onClick={() => setShow(true)}>+ Выдать ресурс</button>}
      </div>

      {tab === "all" && (
        <div style={S.tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {[
                { label:"Баер",       key:"buyerName" },
                { label:"Тип",        key:"type"      },
                { label:"Платформа",  key:"platform"  },
                { label:"Кол-во",     key:"qty"       },
                { label:"Дата",       key:"date"      },
                { label:"Статус",     key:"status"    },
                { label:"Примечание", key:null        },
              ].map(c => (
                <SortableTh key={c.label} label={c.label} sortKey={c.key}
                  active={rs.sortKey===c.key} dir={rs.sortDir} onToggle={rs.toggle} />
              ))}
            </tr></thead>
            <tbody>
              {rs.sort(enrichedRes).map(r => (
                <tr key={r.id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{r.buyerName}</td>
                  <td style={{ ...S.td, textTransform: "capitalize" }}>{r.type}</td>
                  <td style={S.td}>{r.platform}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{r.qty}</td>
                  <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{r.date}</td>
                  <td style={S.td}><Pill variant={r.status === "issued" ? "green" : "yellow"}>{r.status === "issued" ? "Выдано" : "Ожидание"}</Pill></td>
                  <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "summary" && (
        <div style={S.tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {[
                { label:"Баер",           key:"name"  },
                { label:"Аккаунтов",      key:"accs"  },
                { label:"Прокси",         key:"proxy" },
                { label:"Всего позиций",  key:"total" },
              ].map(c => (
                <SortableTh key={c.label} label={c.label} sortKey={c.key}
                  active={ss.sortKey===c.key} dir={ss.sortDir} onToggle={ss.toggle} />
              ))}
            </tr></thead>
            <tbody>
              {ss.sort(summary).map(s => (
                <tr key={s.id}>
                  <td style={S.td}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={S.avatar(26)}>{s.name[0]}</div><b>{s.name}</b></div></td>
                  <td style={{ ...S.td, fontFamily: "monospace", color: "#00e5ff" }}>{s.accs}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{s.proxy}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "import" && (
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={e => { alert(`Файл "${e.target.files[0]?.name}" принят. В продакшене — парсинг и импорт.`); }} />
          <div onClick={() => fileRef.current.click()} style={{ border: "2px dashed #252d3d", borderRadius: 10, padding: 40, textAlign: "center", cursor: "pointer", background: "#181c24" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Перетащите файл или нажмите для выбора</div>
            <div style={{ fontSize: 12, color: "#7a8299" }}>Excel (.xlsx, .xls) или CSV</div>
          </div>
          <div style={{ marginTop: 14, background: "#111318", border: "1px solid #1e2330", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4a5168", marginBottom: 8 }}>ОЖИДАЕМЫЕ КОЛОНКИ</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["buyer_login", "type", "platform", "qty", "status", "date", "note"].map(c => (
                <span key={c} style={{ background: "rgba(0,229,255,0.08)", color: "#00e5ff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace" }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {show && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShow(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Выдать ресурс</div>
            <Field label="Баер"><select style={S.input} value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })}>{buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Тип"><select style={S.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {["accounts", "proxy", "creatives", "domains"].map(t => <option key={t} value={t}>{t}</option>)}
              </select></Field>
              <Field label="Платформа"><input style={S.input} value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Кол-во"><input style={S.input} type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
              <Field label="Статус"><select style={S.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="issued">Выдано</option><option value="pending">Ожидание</option>
              </select></Field>
            </div>
            <Field label="Примечание"><input style={S.input} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Необязательно" /></Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={S.btn()} onClick={() => setShow(false)}>Отмена</button>
              <button style={S.btn("accent")} onClick={add}>Выдать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HISTORICAL OFFER DATA (3 months) ─────────────────────────────────────────
const genOfferHistory = () => {
  const rows = [];
  const templates = [
    { campaignName:"UA | Nutra Slim | 1021 | Facebook | lp1-slim | info-cpa-v1 | chrome-profile-01 | maxpetrov",       vertical:"Nutra"    },
    { campaignName:"PL | Gambling Revshare | 2034 | Google | lp2-casino | info-rev-pl | chrome-profile-02 | maxpetrov",       vertical:"Gambling" },
    { campaignName:"UA | Betting CPA | 4012 | Facebook | lp3-bet | info-cpa-ua | chrome-profile-04 | ivanlys",             vertical:"Betting"  },
    { campaignName:"DE | Crypto Lead Pro | 3078 | TikTok | lp1-crypto | info-lead-de | chrome-profile-03 | maxpetrov",  vertical:"Crypto"   },
    { campaignName:"DE | Finance Pro | 5091 | Native | lp1-fin | info-fin-de | chrome-profile-07 | ivanlys",              vertical:"Finance"  },
    { campaignName:"PL | Nutra Slim | 1021 | Facebook | lp2-slim | info-cpa-pl | chrome-profile-08 | dashasem",       vertical:"Nutra"    },
    { campaignName:"UA | Weight Loss Max | 1089 | Push | lp1-wl | info-wl-ua | chrome-profile-09 | dashasem",          vertical:"Nutra"    },
    { campaignName:"BY | Casino Revshare | 2091 | Facebook | lp1-casino | info-rev-by | chrome-profile-10 | ivanlys",     vertical:"Gambling" },
    { campaignName:"DE | Forex CPA | 5034 | Native | lp2-forex | info-forex-de | chrome-profile-11 | maxpetrov",               vertical:"Finance"  },
    { campaignName:"UA | CBD Oil Pro | 1102 | Google | lp1-cbd | info-cbd-ua | chrome-profile-12 | dashasem",          vertical:"Nutra"    },
    { campaignName:"PL | Keto Diet | 1078 | Facebook | lp3-keto | info-keto-pl | chrome-profile-13 | ivanlys",              vertical:"Nutra"    },
    { campaignName:"KZ | Sports Betting | 4067 | Push | lp1-sports | info-bet-kz | chrome-profile-14 | maxpetrov",              vertical:"Betting"  },
    { campaignName:"US | Dating PPL | 6012 | Facebook | lp2-date | info-ppl-us | chrome-profile-15 | dashasem",        vertical:"Dating"   },
    { campaignName:"US | VPN Premium | 7023 | Google | lp1-vpn | info-vpn-us | chrome-profile-16 | ivanlys",         vertical:"Software" },
    { campaignName:"UA | Survey Plus | 8011 | Push | lp1-survey | info-surv-ua | chrome-profile-17 | maxpetrov",             vertical:"Other"    },
  ];
  const buyerIds = ["b1","b2","b3"];
  for (let d = 89; d >= 0; d--) {
    const date = new Date(); date.setDate(date.getDate() - d);
    const iso = date.toISOString().split("T")[0];
    const count = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const tmpl   = templates[Math.floor(Math.random() * templates.length)];
      const parsed = parseCampaignName(tmpl.campaignName);
      const buyer  = buyerIds[Math.floor(Math.random() * buyerIds.length)];
      const clicks  = Math.floor(Math.random() * 3000 + 500);
      const leads   = Math.floor(clicks * (0.03 + Math.random() * 0.08));
      const sales   = Math.floor(leads  * (0.25 + Math.random() * 0.35));
      const spend   = Math.floor(clicks * (0.3  + Math.random() * 0.5));
      const revenue = Math.floor(sales  * (18   + Math.random() * 40));
      rows.push({ campaignName: tmpl.campaignName, vertical: tmpl.vertical,
        geo: parsed.geo, offerName: parsed.offerName, offerId: parsed.offerId,
        source: parsed.source, landing: parsed.landing,
        advertiser: parsed.advertiser, affName: parsed.affName,
        date: iso, buyerId: buyer, clicks, leads, sales, spend, revenue });
    }
  }
  return rows;
};
const OFFER_HISTORY = genOfferHistory();

// ── OFFERS HISTORY PAGE ───────────────────────────────────────────────────────
function OffersHistory({ buyers }) {
  const [preset, setPreset] = useState("month");
  const [dateFrom, setDateFrom] = useState(() => { const d=new Date(); d.setDate(d.getDate()-29); return d.toISOString().split("T")[0]; });
  const [dateTo,   setDateTo]   = useState(() => new Date().toISOString().split("T")[0]);
  const [showCal,  setShowCal]  = useState(false);
  const [sortBy,   setSortBy]   = useState("revenue");
  const [sortDir,  setSortDir]  = useState("desc");
  const [filterGeo,      setFilterGeo]      = useState("all");
  const [filterVertical, setFilterVertical] = useState("all");
  const [filterBuyer,    setFilterBuyer]    = useState("all");
  const [filterNetwork,  setFilterNetwork]  = useState("all");
  const [search,   setSearch]   = useState("");
  const [showColPicker, setShowColPicker] = useState(false);

  // All columns with their keys and default visibility
  const ALL_COLS = [
    { key:"offerName",   label:"GEO | Оффер | ID",  always:true  },
    { key:"vertical",    label:"Вертикаль",           always:false },
    { key:"source",      label:"Источник",            always:false },
    { key:"landingSign", label:"Лендинг",             always:false },
    { key:"buyerInfo",   label:"Buyer Info",          always:false },
    { key:"anticId",     label:"Antidetect",          always:false },
    { key:"days",        label:"Дней",                always:false },
    { key:"clicks",      label:"Клики",               always:false },
    { key:"leads",       label:"Лиды",                always:true  },
    { key:"cr",          label:"CR%",                 always:false },
    { key:"sales",       label:"Продажи",             always:true  },
    { key:"spend",       label:"Spend",               always:true  },
    { key:"revenue",     label:"Доход",               always:true  },
    { key:"roi",         label:"ROI",                 always:true  },
    { key:"share",       label:"Доля",                always:false },
  ];
  const [visibleCols, setVisibleCols] = useState(
    () => Object.fromEntries(ALL_COLS.map(c => [c.key, c.always || ["leads","sales","spend","revenue","roi","clicks","source","vertical"].includes(c.key)]))
  );
  const toggleCol = (key) => setVisibleCols(p => ({ ...p, [key]: !p[key] }));
  const visibleColList = ALL_COLS.filter(c => c.always || visibleCols[c.key]);

  const PRESETS = [
    { id:"7d",    label:"7 дней",   days:6  },
    { id:"month", label:"Месяц",    days:29 },
    { id:"2m",    label:"2 месяца", days:59 },
    { id:"3m",    label:"3 месяца", days:89 },
    { id:"custom",label:"Период ▾", days:0  },
  ];

  const applyPreset = (p) => {
    setPreset(p);
    if (p === "custom") { setShowCal(true); return; }
    const info = PRESETS.find(x => x.id===p);
    const t = new Date(); t.setHours(0,0,0,0);
    const f = new Date(t); f.setDate(f.getDate() - info.days);
    setDateFrom(f.toISOString().split("T")[0]);
    setDateTo(t.toISOString().split("T")[0]);
  };

  const [apiRows,   setApiRows]   = useState(null); // null = not loaded yet
  const [apiLoading, setApiLoading] = useState(false);

  // Load from API (real Keitaro data)
  useEffect(() => {
    const token = localStorage.getItem('fd_token');
    if (!token) return;
    setApiLoading(true);
    const params = new URLSearchParams({ from: dateFrom, to: dateTo });
    if (filterGeo !== "all")      params.set('geo', filterGeo);
    if (filterBuyer !== "all")    params.set('buyer_name', filterBuyer);
    if (search)                   params.set('search', search);
    fetch(`/api/keitaro/stats/aggregate?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(rows => { setApiRows(Array.isArray(rows) ? rows : null); })
      .catch(() => setApiRows(null))
      .finally(() => setApiLoading(false));
  }, [dateFrom, dateTo, filterGeo, filterBuyer, search]);

  // Use API data if available, otherwise fall back to demo data
  const useApiData = apiRows && apiRows.length > 0;

  // Filter raw rows by date + filters (demo fallback)
  const filtered = OFFER_HISTORY.filter(r => {
    if (r.date < dateFrom || r.date > dateTo) return false;
    if (filterGeo !== "all" && r.geo !== filterGeo) return false;
    if (filterVertical !== "all" && r.vertical !== filterVertical) return false;
    if (filterBuyer !== "all" && r.buyerId !== filterBuyer) return false;
    if (filterNetwork !== "all" && r.buyerName !== filterNetwork) return false;
    if (search && !r.offerName.toLowerCase().includes(search.toLowerCase()) &&
        !String(r.offerId).includes(search)) return false;
    return true;
  });

  // Use API aggregated rows or fall back to demo aggregation
  let rows;
  if (useApiData) {
    rows = apiRows.map(r => ({
      offerId:     r.offer_id    || "—",
      offerName:   r.offer_name  || "—",
      geo:         r.geo         || "—",
      source:      r.source      || "—",
      landingSign: r.landing_sign|| "—",
      buyerInfo:   r.buyer_info  || "—",
      anticId:     r.antic_id    || "—",
      vertical:    "—",
      days:        parseInt(r.days) || 0,
      clicks:      parseInt(r.clicks) || 0,
      leads:       parseInt(r.leads)  || 0,
      sales:       Math.round((parseInt(r.leads)||0) * 0.35),
      spend:       parseFloat(r.spend)   || 0,
      revenue:     parseFloat(r.revenue) || 0,
      roi:         parseInt(r.roi) || 0,
      cr:          r.leads > 0 ? Math.round(r.leads * 0.35 / r.leads * 100) : 0,
    }));
    // Apply remaining filters client-side
    if (filterVertical !== "all") rows = rows.filter(r => r.vertical === filterVertical);
  } else {
    // Demo aggregation
    const agg = {};
    filtered.forEach(r => {
      const key = `${r.offerId}||${r.geo}||${r.buyerName}`;
      if (!agg[key]) agg[key] = {
        offerId: r.offerId, offerName: r.offerName, geo: r.geo,
        source: r.source, landingSign: r.landingSign, buyerInfo: r.buyerInfo,
        anticId: r.anticId, vertical: r.vertical,
        clicks:0, leads:0, sales:0, spend:0, revenue:0, days: new Set(),
      };
      agg[key].clicks  += r.clicks;
      agg[key].leads   += r.leads;
      agg[key].sales   += r.sales;
      agg[key].spend   += r.spend;
      agg[key].revenue += r.revenue;
      agg[key].days.add(r.date);
    });
    rows = Object.values(agg).map(r => ({
      ...r, days: r.days.size,
      roi: r.spend > 0 ? Math.round((r.revenue - r.spend) / r.spend * 100) : 0,
      cr:  r.leads  > 0 ? Math.round(r.sales / r.leads * 100) : 0,
    }));
  }

  rows = [...rows].sort((a, b) => {
    const TEXT_COLS = ["offerName","vertical","geo","source","landingSign","buyerInfo","anticId","buyerName"];
    const dir = sortDir === "asc" ? 1 : -1;
    if (TEXT_COLS.includes(sortBy)) return dir * (a[sortBy]||"").localeCompare(b[sortBy]||"");
    return dir * ((a[sortBy] || 0) - (b[sortBy] || 0));
  });

  const totals = rows.reduce((s,r) => ({
    clicks:s.clicks+r.clicks, leads:s.leads+r.leads, sales:s.sales+r.sales,
    spend:s.spend+r.spend, revenue:s.revenue+r.revenue,
  }), { clicks:0, leads:0, sales:0, spend:0, revenue:0 });
  const totalRoi = totals.spend > 0 ? Math.round((totals.revenue-totals.spend)/totals.spend*100) : 0;

  // Distinct values for filter dropdowns (use parsed fields)
  const geos       = [...new Set(OFFER_HISTORY.map(r=>r.geo))].sort();
  const verticals  = [...new Set(OFFER_HISTORY.map(r=>r.vertical))].sort();
  const networks   = [...new Set(OFFER_HISTORY.map(r=>r.buyerName))].sort();

  const GEO_COLORS = { UA:"#00e5ff", PL:"#a78bfa", DE:"#f5c842", US:"#00c896", BY:"#ff9f43", KZ:"#ff4566", RO:"#fd79a8" };
  const geoColor = g => GEO_COLORS[g] || "#7a8299";

  const VERT_COLORS = { Nutra:"#00c896", Gambling:"#a78bfa", Betting:"#f5c842", Crypto:"#00e5ff", Finance:"#ff9f43", Dating:"#fd79a8", Software:"#74b9ff", Other:"#7a8299" };
  const vertColor = v => VERT_COLORS[v] || "#7a8299";

  const [limit, setLimit] = useState(10);

  const SORT_COLS = [
    { id:"revenue", label:"Доход"    },
    { id:"leads",   label:"Лиды"     },
    { id:"sales",   label:"Продажи"  },
    { id:"spend",   label:"Spend"    },
    { id:"roi",     label:"ROI"      },
    { id:"clicks",  label:"Клики"    },
  ];

  const presetBtnSt = (active) => ({
    padding:"6px 12px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", border:"none", fontFamily:"inherit",
    background: active ? "#00e5ff" : "transparent",
    color: active ? "#000" : "#7a8299",
  });
  const filterSelSt = { ...S.input, width:"auto", padding:"7px 10px", fontSize:12 };
  const labelStr = preset==="custom"
    ? (dateFrom===dateTo ? dateFrom : `${dateFrom} — ${dateTo}`)
    : PRESETS.find(p=>p.id===preset)?.label||"";

  const maxRev = rows[0]?.revenue || 1;

  return (
    <div>
      {/* ── TOP STAT CARDS ── */}
      <div style={S.statGrid}>
        <StatCard label="Revenue"    val={fmtUSD(totals.revenue)} color="#00e5ff" sub={`${rows.length} офферов`}/>
        <StatCard label="Spend"      val={fmtUSD(totals.spend)}   color="#a78bfa" />
        <StatCard label="ROI"        val={totalRoi+"%"}            color="#00c896" />
        <StatCard label="Лиды / Продажи" val={`${fmt(totals.leads)} / ${fmt(totals.sales)}`} color="#ff4566" />
      </div>

      {/* ── DATE + FILTERS BAR ── */}
      <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
        {/* Row 1: presets */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:2, background:"#181c24", borderRadius:8, padding:3 }}>
            {PRESETS.map(p => <button key={p.id} style={presetBtnSt(preset===p.id)} onClick={()=>applyPreset(p.id)}>{p.label}</button>)}
          </div>
          <span style={{ fontSize:12, color:"#7a8299", fontFamily:"monospace" }}>{labelStr}</span>

          {/* search */}
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Поиск оффера..."
            style={{ ...S.input, width:180, padding:"7px 10px", fontSize:12, marginLeft:"auto" }}
          />
        </div>
        {/* Row 2: filters */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:10, fontWeight:700, color:"#4a5168", textTransform:"uppercase", letterSpacing:"0.08em" }}>Фильтры:</span>
          <select style={filterSelSt} value={filterGeo}      onChange={e=>setFilterGeo(e.target.value)}>
            <option value="all">Все гео</option>
            {geos.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          <select style={filterSelSt} value={filterVertical} onChange={e=>setFilterVertical(e.target.value)}>
            <option value="all">Все вертикали</option>
            {verticals.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
          <select style={filterSelSt} value={filterNetwork}  onChange={e=>setFilterNetwork(e.target.value)}>
            <option value="all">Все партнёрки</option>
            {networks.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <select style={filterSelSt} value={filterBuyer}    onChange={e=>setFilterBuyer(e.target.value)}>
            <option value="all">Все баеры</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {(filterGeo!=="all"||filterVertical!=="all"||filterNetwork!=="all"||filterBuyer!=="all"||search) &&
            <button style={{ ...S.btn(), fontSize:11, padding:"5px 10px", color:"#ff4566", borderColor:"rgba(255,69,102,0.3)" }}
              onClick={()=>{setFilterGeo("all");setFilterVertical("all");setFilterNetwork("all");setFilterBuyer("all");setSearch("");}}>
              × Сбросить
            </button>}
        </div>
      </div>

      {/* ── CALENDAR MODAL ── */}
      {showCal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowCal(false)}>
          <div style={{...S.modal, maxWidth:340}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:20}}>Выбор периода</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={S.label}>От</label><input style={S.input} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
              <div><label style={S.label}>До</label><input style={S.input} type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button style={S.btn()} onClick={()=>setShowCal(false)}>Отмена</button>
              <button style={S.btn("accent")} onClick={()=>{setPreset("custom");setShowCal(false);}}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SORT BAR + TABLE ── */}
      <div style={{...S.tableWrap, position:"relative"}}>
        {/* limit + columns header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderBottom:"1px solid #1e2330", background:"#181c24", flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:"#4a5168", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>Показать:</span>
          <div style={{ display:"flex", gap:2, background:"#0a0c10", borderRadius:7, padding:3 }}>
            {[5,10,20,"All"].map(n => (
              <button key={n} onClick={() => setLimit(n === "All" ? Infinity : n)} style={{
                padding:"4px 10px", borderRadius:5, fontSize:11, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit",
                background: limit === (n === "All" ? Infinity : n) ? "#00e5ff" : "transparent",
                color:      limit === (n === "All" ? Infinity : n) ? "#000"    : "#7a8299",
              }}>{n === "All" ? "Все" : `ТОП ${n}`}</button>
            ))}
          </div>
          <span style={{ fontSize:11, color:"#4a5168", fontFamily:"monospace" }}>
            {limit === Infinity ? rows.length : Math.min(limit, rows.length)}/{rows.length}
          </span>
          <span style={{ marginLeft:"auto", fontSize:11, color:"#4a5168" }}>↓ Клик по заголовку — сортировка</span>
          <button onClick={() => setShowColPicker(p => !p)} style={{ ...S.btn(), fontSize:11, padding:"4px 10px",
            color: showColPicker ? "#00e5ff" : "#7a8299",
            borderColor: showColPicker ? "rgba(0,229,255,0.3)" : "#252d3d" }}>
            ⊞ Столбцы
          </button>
        </div>

        {/* Column picker dropdown */}
        {showColPicker && (
          <div style={{ position:"absolute", top:46, right:0, zIndex:50, background:"#111318", border:"1px solid #252d3d",
            borderRadius:10, padding:16, minWidth:220, boxShadow:"0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#4a5168", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>Видимость столбцов</div>
            {ALL_COLS.map(c => (
              <label key={c.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"6px 8px", borderRadius:6, cursor: c.always ? "default" : "pointer",
                background: visibleCols[c.key] ? "rgba(0,229,255,0.04)" : "transparent",
                marginBottom:2, opacity: c.always ? 0.4 : 1 }}>
                <span style={{ fontSize:12, color: visibleCols[c.key] ? "#e8eaf0" : "#7a8299" }}>{c.label}</span>
                <input type="checkbox" checked={!!visibleCols[c.key]} disabled={c.always}
                  onChange={() => !c.always && toggleCol(c.key)}
                  style={{ accentColor:"#00e5ff", width:14, height:14 }} />
              </label>
            ))}
            <div style={{ marginTop:10, display:"flex", gap:6 }}>
              <button style={{ ...S.btn(), flex:1, fontSize:10, justifyContent:"center" }}
                onClick={() => setVisibleCols(Object.fromEntries(ALL_COLS.map(c => [c.key, true])))}>
                Все
              </button>
              <button style={{ ...S.btn(), flex:1, fontSize:10, justifyContent:"center" }}
                onClick={() => setVisibleCols(Object.fromEntries(ALL_COLS.map(c => [c.key, c.always || ["leads","sales","spend","revenue","roi"].includes(c.key)])))}>
                Сбросить
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:Math.max(600, visibleColList.length * 110) }}>
          <thead>
            <tr>
              <th style={S.th}>#</th>
              {visibleColList.map(col => (
                <th key={col.key}
                  onClick={() => { if(col.key==="share") return; if(sortBy===col.key) setSortDir(d=>d==="desc"?"asc":"desc"); else{setSortBy(col.key);setSortDir("desc");} }}
                  style={{ ...S.th, cursor:col.key!=="share"?"pointer":"default", userSelect:"none", whiteSpace:"nowrap",
                    color:sortBy===col.key?"#00e5ff":"#4a5168", background:sortBy===col.key?"rgba(0,229,255,0.06)":"#181c24" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                    {col.label}
                    {col.key && col.key!=="share" && <span style={{ fontSize:9, opacity:sortBy===col.key?1:0.2, color:sortBy===col.key?"#00e5ff":"#7a8299", display:"inline-block", transform:sortBy===col.key&&sortDir==="asc"?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}>↓</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={visibleColList.length+1} style={{...S.td, textAlign:"center", color:"#4a5168", padding:40}}>Нет данных за выбранный период</td></tr>
            ) : rows.slice(0, limit === Infinity ? rows.length : limit).map((r, i) => {
              const revPct = Math.round(r.revenue / maxRev * 100);
              const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
              const cellMap = {
                offerName: <td key="offerName" style={{...S.td,fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}><div style={{lineHeight:1.5}}><span style={{background:`${geoColor(r.geo)}18`,color:geoColor(r.geo),fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,marginRight:5}}>{r.geo}</span>{r.offerName}<span style={{marginLeft:5,fontSize:10,color:"#4a5168",fontFamily:"monospace"}}>#{r.offerId}</span></div></td>,
                vertical:    <td key="vertical"    style={S.td}><span style={{fontSize:10,fontWeight:700,color:vertColor(r.vertical),background:`${vertColor(r.vertical)}18`,padding:"2px 7px",borderRadius:4}}>{r.vertical}</span></td>,
                source:      <td key="source"      style={{...S.td,fontSize:12,color:"#7a8299",whiteSpace:"nowrap"}}>{r.source}</td>,
                landingSign: <td key="landingSign" style={{...S.td,fontSize:12,color:"#7a8299"}}>{r.landingSign}</td>,
                buyerInfo:   <td key="buyerInfo"   style={{...S.td,fontSize:11,color:"#4a5168",fontFamily:"monospace"}}>{r.buyerInfo}</td>,
                anticId:     <td key="anticId"     style={{...S.td,fontSize:12,color:"#7a8299"}}>{r.anticId}</td>,
                days:        <td key="days"        style={{...S.td,fontFamily:"monospace",fontSize:12,color:"#4a5168"}}>{r.days}д</td>,
                clicks:      <td key="clicks"      style={{...S.td,fontFamily:"monospace",fontSize:12,fontWeight:sortBy==="clicks"?700:400}}>{fmt(r.clicks)}</td>,
                leads:       <td key="leads"       style={{...S.td,fontFamily:"monospace",fontSize:12,color:sortBy==="leads"?"#00e5ff":"inherit",fontWeight:sortBy==="leads"?700:400}}>{fmt(r.leads)}</td>,
                cr:          <td key="cr"          style={{...S.td,fontFamily:"monospace",fontSize:12,color:"#7a8299"}}>{r.cr}%</td>,
                sales:       <td key="sales"       style={{...S.td,fontFamily:"monospace",fontSize:12,color:"#a78bfa",fontWeight:sortBy==="sales"?700:400}}>{fmt(r.sales)}</td>,
                spend:       <td key="spend"       style={{...S.td,fontFamily:"monospace",fontSize:12,color:"#ff4566",fontWeight:sortBy==="spend"?700:400}}>{fmtUSD(r.spend)}</td>,
                revenue:     <td key="revenue"     style={{...S.td,fontFamily:"monospace",fontSize:12,color:"#00c896",fontWeight:sortBy==="revenue"?700:400}}>{fmtUSD(r.revenue)}</td>,
                roi:         <td key="roi"         style={S.td}><Pill variant={r.roi>100?"green":r.roi>50?"yellow":"red"}>{r.roi}%</Pill></td>,
                share: <td key="share" style={{...S.td,width:100}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{flex:1,height:5,background:"#181c24",borderRadius:3}}><div style={{height:"100%",width:revPct+"%",borderRadius:3,background:i===0?"#00e5ff":i===1?"#a78bfa":i===2?"#f5c842":"#252d3d",transition:"width 0.4s"}}/></div><span style={{fontSize:10,fontFamily:"monospace",color:"#7a8299",width:26,textAlign:"right"}}>{revPct}%</span></div></td>,
              };
              return (
                <tr key={i} style={{ background:i<3?"rgba(0,229,255,0.015)":"transparent" }}>
                  <td style={{...S.td,width:36,textAlign:"center",fontFamily:"monospace",color:"#4a5168",fontWeight:700}}>
                    {medal?<span style={{fontSize:14}}>{medal}</span>:<span>{i+1}</span>}
                  </td>
                  {visibleColList.map(col => cellMap[col.key])}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
                  {rows.length > 0 && (() => {
            const vis = rows.slice(0, limit === Infinity ? rows.length : limit);
            const vTot = vis.reduce((s,r)=>({clicks:s.clicks+r.clicks,leads:s.leads+r.leads,sales:s.sales+r.sales,spend:s.spend+r.spend,revenue:s.revenue+r.revenue}),{clicks:0,leads:0,sales:0,spend:0,revenue:0});
            const vRoi = vTot.spend>0?Math.round((vTot.revenue-vTot.spend)/vTot.spend*100):0;
            return (
              <tfoot>
                <tr style={{background:"#181c24"}}>
                  <td colSpan={7} style={{...S.td, fontWeight:700, fontSize:11, color:"#7a8299", textTransform:"uppercase", letterSpacing:"0.08em"}}>
                    Итого {limit===Infinity?"все":`топ ${Math.min(limit,rows.length)}`}
                  </td>
                  <td style={{...S.td, fontFamily:"monospace", fontWeight:700}}>{fmt(vTot.clicks)}</td>
                  <td style={{...S.td, fontFamily:"monospace", fontWeight:700, color:"#00e5ff"}}>{fmt(vTot.leads)}</td>
                  <td style={{...S.td, fontFamily:"monospace", color:"#7a8299"}}>{vTot.leads>0?Math.round(vTot.sales/vTot.leads*100):0}%</td>
                  <td style={{...S.td, fontFamily:"monospace", fontWeight:700, color:"#a78bfa"}}>{fmt(vTot.sales)}</td>
                  <td style={{...S.td, fontFamily:"monospace", fontWeight:700, color:"#ff4566"}}>{fmtUSD(vTot.spend)}</td>
                  <td style={{...S.td, fontFamily:"monospace", fontWeight:700, color:"#00c896"}}>{fmtUSD(vTot.revenue)}</td>
                  <td style={S.td}><Pill variant={vRoi>100?"green":vRoi>50?"yellow":"red"}>{vRoi}%</Pill></td>
                  <td style={S.td}/>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    </div>
  );
}

// ── BUYER PAGES ────────────────────────────────────────────────────────────────
function MyStats({ user }) {
  const st = BS[user.id] || { history: genHistory(), totalRevenue: 0, totalSpend: 0, conversions: 0 };
  const roi = Math.round((st.totalRevenue - st.totalSpend) / Math.max(st.totalSpend, 1) * 100);
  return (
    <div>
      <div style={S.statGrid}>
        <StatCard label="Revenue" val={fmtUSD(st.totalRevenue)} color="#00e5ff" />
        <StatCard label="Spend" val={fmtUSD(st.totalSpend)} color="#a78bfa" />
        <StatCard label="ROI" val={roi + "%"} color="#00c896" />
        <StatCard label="Конверсии" val={fmt(st.conversions)} color="#ff4566" />
      </div>
      <div style={{ background: "#111318", border: "1px solid #1e2330", borderRadius: 10, padding: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5168", marginBottom: 14 }}>Revenue · последние 7 дней</div>
        <BarChart rows={st.history.slice(-7).map(d => ({ label: d.date.slice(5), val: d.revenue }))} />
      </div>
    </div>
  );
}

function MyRequest({ user, setResources }) {
  const [form, setForm] = useState({ type: "accounts", platform: "Facebook", qty: 5, note: "" });
  const [sent, setSent] = useState(false);
  const submit = () => {
    setResources(p => [...p, { id: "r" + Date.now(), buyerId: user.id, ...form, qty: +form.qty, status: "pending", date: new Date().toISOString().split("T")[0] }]);
    setSent(true); setTimeout(() => setSent(false), 3000);
  };
  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ background: "#111318", border: "1px solid #1e2330", borderRadius: 10, padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 20 }}>Запросить ресурсы у тимлида</div>
        <Field label="Тип ресурса"><select style={S.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          {["accounts", "proxy", "creatives", "domains"].map(t => <option key={t} value={t}>{t}</option>)}
        </select></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Платформа"><input style={S.input} value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} /></Field>
          <Field label="Количество"><input style={S.input} type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
        </div>
        <Field label="Комментарий"><input style={S.input} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Для кампании..." /></Field>
        <button style={{ ...S.btn("accent"), width: "100%", justifyContent: "center", padding: "12px" }} onClick={submit}>Отправить запрос</button>
        {sent && <div style={{ color: "#00c896", fontSize: 13, marginTop: 10 }}>✓ Запрос отправлен тимлиду</div>}
      </div>
    </div>
  );
}

// ── APP ────────────────────────────────────────────────────────────────────────
export default function App({ serverStatus, currentUser, onLogin: _onLoginProp, onLogout: _onLogoutProp }) {
  const [user, setUser] = useState(currentUser);
  useEffect(() => { setUser(currentUser); }, [currentUser?.id]);
  const [page, setPage] = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [botSettings, setBotSettings] = useState({
    token: "",
    enabled: false,
    // Alert thresholds
    alertAt75: true,
    alertAt90: true,
    alertAt100: true,
    // Hourly digest
    digestEnabled: true,
    digestInterval: 60,      // minutes
    buyerTopN: 5,            // 5 | 7 | 10
    tlTopN: 10,              // 5 | 10
    // Per-user chat_ids: { userId: "chat_id" }
    chatIds: {
      tl1: "",
      b1: "", b2: "", b3: "",
    },
  });
  const [caps, setCaps] = useState([]);
  const [resources, setResources] = useState([]);

  const buyers = allUsers.filter(u => u.role === "buyer");
  const isTL = user?.role === "teamlead";
  const isAssistant = user?.role === "assistant";
  const isBuyer = user?.role === "buyer";

  // Determine effective buyer for assistants (they see their parent buyer's data)
  const effectiveBuyerId = isAssistant ? user.parentId : user?.id;

  // First-run: no teamlead exists → show onboarding landing
  const hasTeamLead = allUsers.some(u => u.role === "teamlead");
  if (!hasTeamLead) return (
    <OnboardingLanding onCreateTeam={tl => {
      if (tl._loadDemoTeam) {
        // Load full demo team
        setAllUsers(INIT_USERS);
        setUser(INIT_USERS[0]);
      } else {
        setAllUsers([tl]);
        setUser(tl);
      }
      setPage("dashboard");
    }} />
  );

  if (!user) return <Auth
    allUsers={allUsers} setAllUsers={setAllUsers}
    invites={invites} setInvites={setInvites}
    onLogin={u => { setUser(u); setPage(u.role === "teamlead" ? "dashboard" : "my-stats"); }}
  />;

  const tlNav = [
    { id: "dashboard",     icon: "▦", label: "Дашборд"      },
    { id: "team",          icon: "◈", label: "Команда"       },
    { id: "offers-history",icon: "◑", label: "Офферы"        },
    { id: "caps",          icon: "⊡", label: "Капы"          },
    { id: "keitaro",       icon: "⊕", label: "Keitaro"       },
    { id: "resources",     icon: "⊞", label: "Ресурсы"       },
    { id: "bot",          icon: "✈", label: "Telegram Бот"  },
  ];
  const buyerNav = [
    { id: "my-stats",     icon: "▦", label: "Мои показатели" },
    { id: "my-caps",      icon: "⊡", label: "Мои капы"       },
    { id: "my-resources", icon: "⊞", label: "Мои ресурсы"    },
    { id: "request",      icon: "⊕", label: "Запрос ресурсов"},
  ];
  const assistantNav = [
    { id: "my-stats",     icon: "▦", label: "Показатели"     },
    { id: "my-caps",      icon: "⊡", label: "Капы"           },
    { id: "my-resources", icon: "⊞", label: "Ресурсы"        },
  ];
  const nav = isTL ? tlNav : isAssistant ? assistantNav : buyerNav;
  const titles = { dashboard: "Дашборд", bot: "Telegram Бот", team: "Команда", "buyer-detail": selected?.name || "", "offers-history": "История офферов", caps: "Капы", keitaro: "Keitaro", resources: "Ресурсы", "my-stats": "Мои показатели", "my-caps": "Мои капы", "my-resources": "Мои ресурсы", request: "Запрос ресурсов" };

  const myCaps = caps.filter(c => c.buyerId === effectiveBuyerId);
  const myRes = resources.filter(r => r.buyerId === effectiveBuyerId);

  return (
    <div style={S.app}>
      {/* SIDEBAR */}
      <div style={S.sidebar}>
        <div style={S.logo}>Flow<span style={S.logoAccent}>Desk</span></div>
        <div style={S.navSection}>Навигация</div>
        {nav.map(n => (
          <div key={n.id} style={S.navItem(page === n.id)} onClick={() => setPage(n.id)}>
            <span style={{ width: 16, textAlign: "center" }}>{n.icon}</span>{n.label}
          </div>
        ))}
        <div style={S.sidebarUser}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <div style={S.avatar(30)}>{user.name[0]}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
              <div style={{ fontSize: 11, color: "#7a8299" }}>{isTL ? "Team Lead" : isAssistant ? "Помощник" : "Баер"}</div>
            </div>
          </div>
          <button onClick={() => { setUser(null); setPage("dashboard"); }} style={{ width: "100%", background: "none", border: "1px solid #252d3d", borderRadius: 6, color: "#7a8299", fontFamily: "inherit", fontSize: 11, padding: "6px", cursor: "pointer" }}>Выйти</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={S.main}>
        <div style={S.topbar}>
          <b style={{ fontSize: 15 }}>{titles[page]}</b>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Pill variant={isTL ? "purple" : "cyan"}>{isTL ? "Team Lead" : "Баер"}</Pill>
            <span style={{ fontSize: 13, color: "#7a8299", fontWeight: 600 }}>{user.name}</span>
          </div>
        </div>
        <div style={S.content}>
          {isTL && page === "dashboard" && <TLDash buyers={buyers} caps={caps} allUsers={allUsers} />}
          {isTL && page === "team" && <TeamPage allUsers={allUsers} setAllUsers={setAllUsers} invites={invites} setInvites={setInvites} onSelect={b => { setSelected(b); setPage("buyer-detail"); }} />}
          {isTL && page === "buyer-detail" && selected && <BuyerDetail buyer={selected} onBack={() => setPage("team")} caps={caps} resources={resources} />}
          {isTL && page === "offers-history" && <OffersHistory buyers={buyers} />}
          {isTL && page === "caps" && <CapsPage buyers={buyers} caps={caps} setCaps={setCaps} />}
          {isTL && page === "keitaro" && <KeitaroPage />}
          {isTL && page === "resources" && <ResourcesPage buyers={buyers} resources={resources} setResources={setResources} />}
          {isTL && page === "bot" && <BotPage botSettings={botSettings} setBotSettings={setBotSettings} allUsers={allUsers} caps={caps} buyers={buyers} />}

          {!isTL && page === "my-stats" && <MyStats user={user} />}
          {!isTL && page === "my-caps" && (
            <div>
              <b style={{ display: "block", marginBottom: 14 }}>Мои капы</b>
              <div style={S.tableWrap}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Оффер", "Гео", "Лимит", "Текущий", "Прогресс"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {myCaps.length === 0 ? <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", color: "#4a5168" }}>Нет капов</td></tr> :
                      myCaps.map(c => {
                        const pct = Math.min(100, Math.round(c.current / c.daily * 100));
                        return <tr key={c.id}>
                          <td style={{ ...S.td, fontWeight: 600 }}>{c.offer}</td>
                          <td style={S.td}><span style={{ background: "rgba(0,229,255,0.08)", color: "#00e5ff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{c.geo}</span></td>
                          <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(c.daily)}</td>
                          <td style={{ ...S.td, fontFamily: "monospace" }}>{fmt(c.current)}</td>
                          <td style={{ ...S.td, width: 180 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 6, background: "#181c24", borderRadius: 3 }}><div style={S.progress(pct, c.current >= c.daily)} /></div>
                              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#7a8299" }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>;
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!isTL && page === "my-resources" && (
            <div>
              <b style={{ display: "block", marginBottom: 14 }}>Выданные мне ресурсы</b>
              <div style={S.tableWrap}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Тип", "Платформа", "Кол-во", "Дата", "Статус", "Примечание"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {myRes.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#4a5168" }}>Нет ресурсов</td></tr> :
                      myRes.map(r => <tr key={r.id}>
                        <td style={{ ...S.td, textTransform: "capitalize" }}>{r.type}</td>
                        <td style={S.td}>{r.platform}</td>
                        <td style={{ ...S.td, fontFamily: "monospace" }}>{r.qty}</td>
                        <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{r.date}</td>
                        <td style={S.td}><Pill variant={r.status === "issued" ? "green" : "yellow"}>{r.status === "issued" ? "Выдано" : "Ожидание"}</Pill></td>
                        <td style={{ ...S.td, fontSize: 12, color: "#7a8299" }}>{r.note || "—"}</td>
                      </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!isTL && page === "request" && <MyRequest user={user} setResources={setResources} />}
        </div>
      </div>
    </div>
  );
}

// ── BOT PAGE ──────────────────────────────────────────────────────────────────
function BotPage({ botSettings, setBotSettings, allUsers, caps, buyers }) {
  const [tab, setTab] = useState("setup");
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const set = (key, val) => setBotSettings(p => ({ ...p, [key]: val }));
  const setChatId = (uid, val) => setBotSettings(p => ({ ...p, chatIds: { ...p.chatIds, [uid]: val } }));

  // ── Message preview generators ─────────────────────────────────────────────
  const tl = allUsers.find(u => u.role === "teamlead");

  const previewCapAlert = (pct) => {
    const c = caps[0]; if (!c) return "";
    const p = parseCampaignName(c.campaignName);
    const emoji = pct >= 100 ? "🔴" : pct >= 90 ? "🚨" : "⚠️";
    const status = pct >= 100 ? "ПЕРЕЛИВ" : pct >= 90 ? "Критично" : "Скоро";
    return `${emoji} <b>Залитость капа — ${status}</b>\n\n` +
      `🌍 <b>${p.geo}</b> | ${p.offerName} <code>#${p.offerId}</code>\n` +
      `📊 Источник: ${p.source}\n` +
      `📈 Залито: <b>${c.current}/${c.daily}</b> (${pct}%)\n` +
      `⏱ ${new Date().toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"})}`;
  };

  const previewBuyerDigest = (buyer) => {
    const buyerCaps = caps.filter(c => c.buyerId === buyer.id)
      .map(c => {
        const p = parseCampaignName(c.campaignName);
        const pct = Math.round(c.current / c.daily * 100);
        const bar = "█".repeat(Math.floor(pct/10)) + "░".repeat(10 - Math.floor(pct/10));
        const em = pct >= 100 ? "🔴" : pct >= 90 ? "🚨" : pct >= 75 ? "⚠️" : "✅";
        return `${em} <b>${p.geo} | ${p.offerName}</b> <code>#${p.offerId}</code>\n` +
               `   ${bar} ${pct}%  (${c.current}/${c.daily})`;
      })
      .slice(0, botSettings.buyerTopN)
      .join("\n\n");
    const now = new Date();
    return `📊 <b>Твой дайджест капов</b>\n` +
      `${now.toLocaleDateString("ru-RU")} ${now.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}\n\n` +
      (buyerCaps || "Нет активных капов") +
      `\n\n💡 Следующая отправка через ${botSettings.digestInterval} мин`;
  };

  const previewTLDigest = () => {
    const enriched = caps
      .map(c => { const p = parseCampaignName(c.campaignName); const pct = Math.round(c.current/c.daily*100); return {...c,...p,pct}; })
      .sort((a,b) => b.pct - a.pct)
      .slice(0, botSettings.tlTopN);
    const rows = enriched.map(c => {
      const em = c.pct >= 100 ? "🔴" : c.pct >= 90 ? "🚨" : c.pct >= 75 ? "⚠️" : "✅";
      return `${em} <b>${c.geo} | ${c.offerName}</b>\n   ${c.current}/${c.daily} — <b>${c.pct}%</b>`;
    }).join("\n\n");
    const now = new Date();
    return `👁 <b>Дайджест команды — ТОП ${botSettings.tlTopN}</b>\n` +
      `${now.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}\n\n` +
      rows;
  };

  // ── Simulate test send ────────────────────────────────────────────────────
  const testSend = (type) => {
    if (!botSettings.token) { setTestResult({ ok:false, msg:"Введи Bot Token" }); return; }
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      setTestResult({ ok: true, msg:`${type} отправлен (симуляция). В продакшене — реальный POST на api.telegram.org/bot${botSettings.token.slice(0,8)}…/sendMessage` });
    }, 1200);
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = [["setup","Настройка"],["users","Chat ID"],["alerts","Алерты"],["digest","Дайджест"],["code","Код бота"]];

  const codeSnippet = [
    "// FlowDesk Telegram Bot",
    "// npm install node-telegram-bot-api node-cron",
    "",
    "const TOKEN = '" + (botSettings.token || "YOUR_BOT_TOKEN") + "';",
    "const bot = new TelegramBot(TOKEN, { polling: true });",
    "",
    "// Chat IDs",
    "const CHAT_IDS = {",
    "  teamlead: '" + (botSettings.chatIds?.tl1 || "TL_CHAT_ID") + "',",
    "};",
    "",
    "// Alerts + digest cron — see DEPLOY-RAILWAY.md",
  ].join("\n")

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:"flex", gap:2, background:"#181c24", borderRadius:8, padding:3, marginBottom:20, flexWrap:"wrap" }}>
        {TABS.map(([id,label]) => (
          <div key={id} onClick={() => setTab(id)}
            style={{ padding:"7px 14px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer",
              background: tab===id ? "#111318":"transparent", color: tab===id ? "#e8eaf0":"#7a8299" }}>
            {label}
          </div>
        ))}
      </div>

      {/* ── SETUP TAB ── */}
      {tab === "setup" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Подключение бота</div>
            <div style={{ fontSize:12, color:"#7a8299", marginBottom:20, lineHeight:1.6 }}>
              1. Открой <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color:"#29b6f6" }}>@BotFather</a> в Telegram<br/>
              2. Напиши <code style={{ background:"#181c24", padding:"1px 5px", borderRadius:3, color:"#00e5ff" }}>/newbot</code><br/>
              3. Получи токен и вставь ниже
            </div>
            <Field label="Bot Token">
              <input style={S.input} value={botSettings.token}
                onChange={e => set("token", e.target.value)}
                placeholder="1234567890:AAF..." />
            </Field>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:6 }}>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
                <input type="checkbox" checked={botSettings.enabled}
                  onChange={e => set("enabled", e.target.checked)}
                  style={{ width:16, height:16, accentColor:"#00e5ff" }} />
                <span style={{ color: botSettings.enabled ? "#00e5ff" : "#7a8299", fontWeight:600 }}>
                  {botSettings.enabled ? "✅ Бот включён" : "Включить бота"}
                </span>
              </label>
            </div>
            <div style={{ marginTop:16, padding:"10px 14px", borderRadius:8,
              background: botSettings.token ? "rgba(0,229,255,0.05)" : "#181c24",
              border: `1px solid ${botSettings.token ? "rgba(0,229,255,0.2)" : "#252d3d"}` }}>
              <div style={{ fontSize:11, color:"#4a5168", marginBottom:4 }}>СТАТУС ПОДКЛЮЧЕНИЯ</div>
              <div style={{ fontSize:13, fontWeight:600, color: botSettings.token ? "#00e5ff" : "#4a5168" }}>
                {botSettings.token ? `Токен введён · ${botSettings.token.slice(0,10)}…` : "Токен не введён"}
              </div>
            </div>
          </div>

          <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Как получить chat_id</div>
            <div style={{ fontSize:12, color:"#7a8299", marginBottom:16, lineHeight:1.7 }}>
              После создания бота каждый участник должен:<br/>
              1. Найти бота по имени в Telegram<br/>
              2. Нажать <code style={{ background:"#181c24", padding:"1px 5px", borderRadius:3, color:"#00e5ff" }}>/start</code><br/>
              3. Бот ответит их chat_id<br/>
              4. Передать chat_id тимлиду для вставки в таб «Chat ID»
            </div>
            <div style={{ background:"#0a0c10", borderRadius:8, padding:14, fontFamily:"monospace", fontSize:12 }}>
              <div style={{ color:"#4a5168", marginBottom:6, fontSize:10 }}>ПРИМЕР ОТВЕТА БОТА</div>
              <div style={{ color:"#e8eaf0" }}>Твой chat_id:</div>
              <div style={{ color:"#00e5ff", fontSize:16, marginTop:4 }}>123456789</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT IDS TAB ── */}
      {tab === "users" && (
        <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:22 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>Chat ID участников</div>
          <div style={{ fontSize:12, color:"#7a8299", marginBottom:20 }}>Каждый вводит /start боту и присылает тебе свой chat_id</div>
          {[tl, ...buyers].filter(Boolean).map(u => {
            const cid = botSettings.chatIds?.[u.id] || "";
            const roleLabel = u.role === "teamlead" ? "Team Lead" : "Баер";
            const roleColor = u.role === "teamlead" ? "#f5c842" : "#00e5ff";
            return (
              <div key={u.id} style={{ display:"grid", gridTemplateColumns:"200px 1fr auto", gap:12, alignItems:"center", marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={S.avatar(28)}>{u.name[0]}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{u.name}</div>
                    <div style={{ fontSize:10, color:roleColor, fontWeight:700 }}>{roleLabel}</div>
                  </div>
                </div>
                <input style={{ ...S.input, fontFamily:"monospace" }}
                  value={cid}
                  onChange={e => setChatId(u.id, e.target.value)}
                  placeholder="123456789" />
                <div style={{ width:14, height:14, borderRadius:"50%",
                  background: cid ? "#00c896" : "#252d3d",
                  boxShadow: cid ? "0 0 6px #00c896" : "none",
                  flexShrink:0 }} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── ALERTS TAB ── */}
      {tab === "alerts" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:18 }}>Пороги алертов</div>
            {[
              { key:"alertAt75", pct:75, label:"75% — Предупреждение", color:"#f5c842", emoji:"⚠️" },
              { key:"alertAt90", pct:90, label:"90% — Критично",       color:"#ff7f9a", emoji:"🚨" },
              { key:"alertAt100",pct:100,label:"100% — Перелив",       color:"#ff4566", emoji:"🔴" },
            ].map(({ key, label, color, emoji }) => (
              <label key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"12px 14px", borderRadius:8, marginBottom:8, cursor:"pointer",
                background: botSettings[key] ? `${color}08` : "#181c24",
                border: `1px solid ${botSettings[key] ? color + "30" : "#252d3d"}` }}>
                <span style={{ fontSize:13, color: botSettings[key] ? color : "#7a8299", fontWeight:600 }}>
                  {emoji} {label}
                </span>
                <input type="checkbox" checked={!!botSettings[key]}
                  onChange={e => set(key, e.target.checked)}
                  style={{ width:16, height:16, accentColor:color }} />
              </label>
            ))}
            <div style={{ marginTop:16 }}>
              <button style={{ ...S.btn("accent"), width:"100%" }}
                onClick={() => testSend("Тестовый алерт")} disabled={testing}>
                {testing ? "Отправка…" : "⚡ Тест — отправить алерт"}
              </button>
            </div>
          </div>

          <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"#7a8299", textTransform:"uppercase", letterSpacing:"0.08em" }}>Превью сообщения</div>
            <div style={{ background:"#0a0c10", borderRadius:8, padding:14, fontFamily:"monospace", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.7, color:"#e8eaf0", border:"1px solid #252d3d" }}>
              {previewCapAlert(92).replace(/<[^>]+>/g, "")}
            </div>
            {testResult && (
              <div style={{ marginTop:12, padding:"10px 14px", borderRadius:8, fontSize:12, lineHeight:1.5,
                background: testResult.ok ? "rgba(0,200,150,0.08)" : "rgba(255,69,102,0.08)",
                color: testResult.ok ? "#00c896" : "#ff4566",
                border: `1px solid ${testResult.ok ? "rgba(0,200,150,0.2)" : "rgba(255,69,102,0.2)"}` }}>
                {testResult.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DIGEST TAB ── */}
      {tab === "digest" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:22 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:18 }}>Настройки дайджеста</div>

            <label style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, cursor:"pointer" }}>
              <input type="checkbox" checked={!!botSettings.digestEnabled}
                onChange={e => set("digestEnabled", e.target.checked)}
                style={{ width:16, height:16, accentColor:"#00e5ff" }} />
              <span style={{ fontSize:13, fontWeight:600, color: botSettings.digestEnabled ? "#00e5ff" : "#7a8299" }}>
                Ежечасная рассылка включена
              </span>
            </label>

            <Field label="Интервал (минуты)">
              <div style={{ display:"flex", gap:6 }}>
                {[30,60,120].map(n => (
                  <button key={n} onClick={() => set("digestInterval", n)} style={{
                    ...S.btn(botSettings.digestInterval===n ? "accent" : "default"),
                    flex:1, justifyContent:"center"
                  }}>{n} мин</button>
                ))}
              </div>
            </Field>

            <Field label={`Топ офферов для баера`}>
              <div style={{ display:"flex", gap:6 }}>
                {[5,7,10].map(n => (
                  <button key={n} onClick={() => set("buyerTopN", n)} style={{
                    ...S.btn(botSettings.buyerTopN===n ? "accent" : "default"),
                    flex:1, justifyContent:"center"
                  }}>ТОП {n}</button>
                ))}
              </div>
            </Field>

            <Field label={`Топ офферов для тимлида`}>
              <div style={{ display:"flex", gap:6 }}>
                {[5,10].map(n => (
                  <button key={n} onClick={() => set("tlTopN", n)} style={{
                    ...S.btn(botSettings.tlTopN===n ? "accent" : "default"),
                    flex:1, justifyContent:"center"
                  }}>ТОП {n}</button>
                ))}
              </div>
            </Field>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
              <button style={{ ...S.btn("accent"), justifyContent:"center" }}
                onClick={() => testSend("Дайджест баеру")} disabled={testing}>
                📊 Тест баеру
              </button>
              <button style={{ ...S.btn("accent"), justifyContent:"center" }}
                onClick={() => testSend("Дайджест тимлиду")} disabled={testing}>
                👁 Тест тимлиду
              </button>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:18 }}>
              <div style={{ fontSize:10, color:"#4a5168", fontWeight:700, letterSpacing:"0.1em", marginBottom:10 }}>ПРЕВЬЮ — БАЕР</div>
              <div style={{ background:"#0a0c10", borderRadius:8, padding:12, fontFamily:"monospace", fontSize:11, whiteSpace:"pre-wrap", lineHeight:1.7, color:"#e8eaf0" }}>
                {buyers[0] ? previewBuyerDigest(buyers[0]).replace(/<[^>]+>/g,"") : "Нет баеров"}
              </div>
            </div>
            <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, padding:18 }}>
              <div style={{ fontSize:10, color:"#4a5168", fontWeight:700, letterSpacing:"0.1em", marginBottom:10 }}>ПРЕВЬЮ — ТИМЛИД</div>
              <div style={{ background:"#0a0c10", borderRadius:8, padding:12, fontFamily:"monospace", fontSize:11, whiteSpace:"pre-wrap", lineHeight:1.7, color:"#e8eaf0" }}>
                {previewTLDigest().replace(/<[^>]+>/g,"")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CODE TAB ── */}
      {tab === "code" && (
        <div style={{ background:"#111318", border:"1px solid #1e2330", borderRadius:10, overflow:"hidden" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #1e2330" }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Готовый код бота</div>
              <div style={{ fontSize:11, color:"#7a8299", marginTop:2 }}>Node.js · токен и настройки подставлены из формы выше</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ fontSize:11, color:"#7a8299", padding:"5px 10px", background:"#181c24", borderRadius:6, fontFamily:"monospace" }}>
                npm install node-telegram-bot-api node-cron
              </div>
              <button style={S.btn()} onClick={() => { navigator.clipboard?.writeText(codeSnippet); }}>
                Копировать
              </button>
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <pre style={{ margin:0, padding:"20px 24px", fontFamily:"monospace", fontSize:12, lineHeight:1.7,
              color:"#e8eaf0", background:"#0a0c10", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
              <code>{codeSnippet}</code>
            </pre>
          </div>
          <div style={{ padding:"14px 20px", borderTop:"1px solid #1e2330", background:"#111318" }}>
            <div style={{ fontSize:11, color:"#4a5168" }}>
              💡 Для продакшена: разверни на VPS, интегрируй с базой данных FlowDesk через REST API, и используй webhook вместо polling.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}