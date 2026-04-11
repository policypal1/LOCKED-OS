import { useState, useEffect, useCallback, useRef } from "react";

/* ═══ SUPABASE CONFIG ═══ */
const SUPABASE_URL = "https://zlaicyafgrwpznjvnzsn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsYWljeWFmZ3J3cHpuanZuenNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjA1MDYsImV4cCI6MjA5MTQzNjUwNn0.4xXVK4szJjT589kyEoAlhkrKqyNsWaFT5A4nPFOJUaA";

const ALL_KEYS = ["g4-profile","g4-check","g4-daily","g4-dlog","g4-guides","g4-videos","g4-workouts","g4-wolog","g4-goals","g4-mood","g4-water","g4-bible","g4-bnotes","g4-pass","g4-pray","g4-favs","g4-creatine","g4-focus","g4-chall","g4-mindset","g4-prs","g4-lmroutine","g4-lmrlog"];

/* Cloud sync engine — saves all keys as one JSON blob to Supabase */
const cloudSync = {
  _timer: null,
  _dirty: false,

  async pull() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/grind_data?id=eq.default_user&select=data`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      });
      const rows = await res.json();
      if (rows?.[0]?.data && typeof rows[0].data === "object") {
        const cloud = rows[0].data;
        for (const key of ALL_KEYS) {
          if (cloud[key] !== undefined) {
            localStorage.setItem(key, JSON.stringify(cloud[key]));
          }
        }
        return true;
      }
    } catch (e) { console.warn("Cloud pull failed:", e); }
    return false;
  },

  push() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._dirty) return;
      this._dirty = false;
      const blob = {};
      for (const key of ALL_KEYS) {
        try { const v = localStorage.getItem(key); if (v) blob[key] = JSON.parse(v); } catch {}
      }
      fetch(`${SUPABASE_URL}/rest/v1/grind_data?id=eq.default_user`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ data: blob, updated_at: new Date().toISOString() })
      }).catch(e => console.warn("Cloud push failed:", e));
    }, 2000);
  },

  async reset() {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/grind_data?id=eq.default_user`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ data: {}, updated_at: new Date().toISOString() })
      });
    } catch (e) { console.warn("Cloud reset failed:", e); }
  }
};

/* ═══ DATA ═══ */
const PASSCODE = "2009";
const LEVELS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000,5000,6200,7600,9200,11000,13000,15500,18500,22000,26000,31000,37000,44000,52000];
const XP = {task:25,streak:50,daily:20,exercise:15,bible:35,video:10,water:30,mood:10,goal:100,guide:15,note:15,focus:35,creatine:10,pr:50,prayer:15,fav:10,challenge:45,mindset:15,passage:40,workoutLog:40};

const TITLES = [
  [0,"Beginner","🌱"],[2,"Apprentice","⚔️"],[5,"Warrior","🛡️"],[8,"Gladiator","⚡"],
  [12,"Spartan","🔥"],[16,"Conqueror","👑"],[20,"Legend","💎"],[24,"God Mode","☀️"]
];

const REWARDS = [
  [1,"Dashboard quote unlocked","💬"],[3,"Custom themes (soon)","🎨"],
  [5,"Warrior title","🛡️"],[7,"Free streak skip pass","🎟️"],
  [10,"Focus power-ups","⏱️"],[12,"Spartan title","🔥"],
  [15,"Weekly stats unlocked","📊"],[16,"Conqueror title","👑"],
  [20,"Legend title","💎"],[24,"GOD MODE","☀️"]
];

const ACHS = [
  ["first","First Blood","Complete 1 task","🩸",(_,s)=>s.tasks>=1],
  ["s7","Week Warrior","7 day streak","🔥",(p)=>p.streakDays>=7],
  ["s30","Monthly Monster","30 day streak","💀",(p)=>p.streakDays>=30],
  ["s100","Centurion","100 day streak","⚔️",(p)=>p.streakDays>=100],
  ["x1k","XP Grinder","1,000 XP","⚡",(p)=>p.xp>=1000],
  ["x10k","XP Machine","10,000 XP","🔋",(p)=>p.xp>=10000],
  ["x50k","XP God","50,000 XP","☀️",(p)=>p.xp>=50000],
  ["l10","Double Digits","Level 10","🔟",(p)=>getLevel(p.xp)>=10],
  ["b7","Faithful","Bible 7 days","📖",(_,s)=>s.bible>=7],
  ["w10","Gym Rat","10 workouts","💪",(_,s)=>s.workouts>=10],
  ["w50","Iron Addict","50 workouts","🏋️",(_,s)=>s.workouts>=50],
  ["g5","Goal Crusher","5 goals done","🎯",(_,s)=>s.goals>=5],
  ["h7","Hydrated King","Water 7 days","💧",(_,s)=>s.water>=7],
  ["f10","Laser Focus","10 focus sessions","🧠",(_,s)=>s.focus>=10],
];

const SCHEDULE = [
  ["Sunday","Rest Day","rest","😴",[]],
  ["Monday","Legs","gym","🦵",["Squats 4x10","RDLs 4x10","Calf Raises 4x20","Lunges 4x5"]],
  ["Tuesday","Boxing Gym","boxing","🥊",["Boxing"]],
  ["Wednesday","Chest & Shoulders","gym","💪",["DB Chest Press 3x10","Incline DB Chest Press 3x10","Chest Flys 3x10","Lateral Raises 4x10","Rear Deltoid Raises 4x10"]],
  ["Thursday","Boxing Gym","boxing","🥊",["Boxing"]],
  ["Friday","Arms, Back & Triceps","gym","💪",["Pull-ups til failure","Chest Supported Rows 4x10","Lat Pulldown on Bench 3x10","Skull Crushers 3x10","Standing Skull Crushers 3x10","Preacher Curls 3x10","Hammer Curls 3x10"]],
  ["Saturday","Home Boxing","home","🏠",["Home Boxing Practice"]],
];

const QUOTES = [
  ["Stay hard.","David Goggins"],
  ["You are in danger of living a life so comfortable and soft that you will die without ever realizing your potential.","David Goggins"],
  ["Nobody cares what you did yesterday. What have you done today?","David Goggins"],
  ["Motivation is garbage. When you're driven, whatever is in front of you will get destroyed.","David Goggins"],
  ["Can't hurt me.","David Goggins"],
  ["Do the work. Especially when you don't feel like it.","David Goggins"],
  ["Suffering is the true test of life.","David Goggins"],
  ["We live in a world where mediocrity is rewarded.","David Goggins"],
  ["The man who goes to the gym every day regardless of how he feels will always beat the man who goes when he feels like it.","Andrew Tate"],
  ["Your mind must be stronger than your feelings.","Andrew Tate"],
  ["Believe in your potential. Not your excuses.","Andrew Tate"],
  ["Success is always stressful.","Andrew Tate"],
  ["Freedom comes when you no longer trade time for money.","Andrew Tate"],
  ["Discipline is the bridge between your goals and your accomplishments.","Tristan Tate"],
  ["The comfort zone is where dreams go to die.","Tristan Tate"],
  ["Time is the most valuable asset. Waste it and you waste your life.","Tristan Tate"],
  ["With God all things are possible.","Jesus Christ"],
  ["Ask and it will be given to you; seek and you will find.","Jesus Christ"],
  ["Let your light shine before others.","Jesus Christ"],
  ["Be strong and courageous. Do not be afraid.","God"],
  ["I can do all things through Christ who strengthens me.","Philippians 4:13"],
  ["Iron sharpens iron, and one man sharpens another.","Proverbs 27:17"],
  ["Suffering produces perseverance; perseverance, character; character, hope.","Romans 5:3-4"],
];

const CHALLENGES = [
  "Cold shower 2 min","100 push-ups today","No social media til noon","Read 20 pages",
  "Water only today","Wake up at 5 AM","Run 1 mile before breakfast","No complaining 24hr",
  "Stretch 15 min","200 bodyweight squats","Shadow box 15 min","Fast until noon",
  "No processed food","Memorize a Bible verse","Walk 10,000 steps","Do 50 burpees",
  "Go to bed before 10 PM","Clean your space","Plank 3 min total","Pray 15 min",
];

const VERSES = [
  ["Philippians 4:13","I can do all things through Christ who strengthens me."],
  ["Jeremiah 29:11","For I know the plans I have for you, declares the Lord, plans to prosper you."],
  ["Proverbs 3:5-6","Trust in the Lord with all your heart and lean not on your own understanding."],
  ["Isaiah 41:10","Do not fear, for I am with you; do not be dismayed, for I am your God."],
  ["Romans 8:28","In all things God works for the good of those who love him."],
  ["Joshua 1:9","Be strong and courageous. Do not be afraid; do not be discouraged."],
  ["Romans 12:2","Do not conform to this world, but be transformed by the renewing of your mind."],
  ["2 Timothy 1:7","God gave us not timidity, but power, love and self-discipline."],
  ["Colossians 3:23","Whatever you do, work at it with all your heart, as for the Lord."],
  ["Galatians 6:9","Do not grow weary in doing good; at the proper time we will reap."],
  ["1 Corinthians 9:27","I discipline my body like an athlete, training it to do what it should."],
  ["Hebrews 12:11","Discipline is painful, but later produces a harvest of righteousness."],
  ["Isaiah 40:31","Those who hope in the Lord will renew their strength; soar on wings like eagles."],
  ["Ephesians 6:10","Be strong in the Lord and in his mighty power."],
  ["James 1:2-4","Consider it joy when you face trials; testing produces perseverance."],
  ["Matthew 19:26","With man this is impossible, but with God all things are possible."],
  ["Psalm 27:1","The Lord is my light and my salvation — whom shall I fear?"],
  ["Proverbs 27:17","As iron sharpens iron, so one person sharpens another."],
  ["Matthew 6:33","Seek first his kingdom, and all these things will be given to you."],
  ["Psalm 46:10","Be still, and know that I am God."],
];

const PASSAGES = [
  ["The Armor of God","Ephesians 6:10-18","Put on the full armor of God: belt of truth, breastplate of righteousness, shield of faith, helmet of salvation, sword of the Spirit."],
  ["Faith & Works","James 2:14-26","Faith without works is dead. A person is justified by what they do, not by faith alone."],
  ["The Good Fight","2 Timothy 4:7-8","I have fought the good fight, finished the race, kept the faith."],
  ["Renewing Your Mind","Romans 12:1-2","Offer your bodies as a living sacrifice. Be transformed by renewing your mind."],
  ["Strength in Weakness","2 Corinthians 12:9-10","My power is made perfect in weakness. When I am weak, then I am strong."],
  ["Discipline of God","Hebrews 12:1-11","Run with perseverance. Endure hardship as discipline."],
  ["David & Goliath","1 Samuel 17:45-47","I come against you in the name of the Lord Almighty."],
  ["Sermon on the Mount","Matthew 5:1-16","Blessed are the poor in spirit. You are the light of the world."],
  ["Pressing On","Philippians 3:12-14","Forgetting what is behind, I press on toward the goal."],
  ["The Lord is My Shepherd","Psalm 23","The Lord is my shepherd, I lack nothing."],
];

const MOODS = [["😤","Fired Up","#ff6b35"],["😊","Good","#00ffc8"],["😐","Neutral","#ffd700"],["😔","Low","#7b61ff"],["😡","Frustrated","#ff4757"]];

/* ═══ HELPERS ═══ */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const dayIdx = () => new Date().getDay();
const weekday = () => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dayIdx()];
const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);

function getLevel(xp) {
  let l = 0;
  for (let i = 1; i < LEVELS.length; i++) { if (xp >= LEVELS[i]) l = i; else break; }
  return l;
}

function getLp(xp) {
  const l = getLevel(xp);
  const c = LEVELS[l] || 0;
  const n = LEVELS[l + 1] || c + 1000;
  return { level: l, cur: xp - c, need: n - c, total: xp };
}

function getTitle(lvl) {
  let t = TITLES[0];
  for (const ti of TITLES) { if (lvl >= ti[0]) t = ti; }
  return { lvl: t[0], name: t[1], icon: t[2] };
}

function getYtId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
  return m ? m[1] : null;
}

/* ═══ STORAGE HOOK (localStorage + cloud sync) ═══ */
function useS(key, init) {
  const [d, setD] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : init; } catch { return init; }
  });
  const [ok] = useState(true);
  const save = useCallback((val) => {
    const v = typeof val === "function" ? val(d) : val;
    setD(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
    cloudSync.push();
    return v;
  }, [key, d]);
  return [d, save, ok];
}

/* ═══ LOCK SCREEN ═══ */
function Lock({ onUnlock }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hrs = time.getHours();
  const gr = hrs < 12 ? "Good Morning" : hrs < 17 ? "Good Afternoon" : "Good Evening";

  const press = (n) => {
    if (n === "del") return setCode(c => c.slice(0, -1));
    if (code.length >= 4) return;
    const nx = code + n;
    setCode(nx);
    if (nx.length === 4) {
      setTimeout(() => {
        if (nx === PASSCODE) onUnlock();
        else { setErr(true); setCode(""); setTimeout(() => setErr(false), 800); }
      }, 150);
    }
  };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#000", fontFamily: "'Outfit',sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25%,75% { transform: translateX(-8px); } 50% { transform: translateX(8px); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>
      <div style={{ textAlign: "center", animation: "fadeIn .8s ease", zIndex: 1 }}>
        <div style={{ fontSize: "4rem", fontWeight: 200, color: "#fff", letterSpacing: "-2px", marginBottom: 4 }}>
          {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}
        </div>
        <div style={{ fontSize: ".8rem", color: "#ffffff33", letterSpacing: "4px", textTransform: "uppercase", marginBottom: 40 }}>
          {weekday()} — {gr}
        </div>
        <div style={{ fontSize: "1.5rem", marginBottom: 20, animation: "float 3s ease-in-out infinite" }}>🔒</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: "50%",
              background: code.length > i ? "#00ffc8" : "transparent",
              border: `2px solid ${code.length > i ? "#00ffc8" : "#ffffff22"}`,
              boxShadow: code.length > i ? "0 0 10px #00ffc866" : "none",
              animation: err ? "shake .4s ease" : "none", transition: "all .15s"
            }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,68px)", gap: 10, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].map((n, i) => (
            n === null ? <div key={i} /> :
            <button key={i} onClick={() => press(String(n === "del" ? "del" : n))} style={{
              width: 68, height: 68, borderRadius: "50%",
              border: "1px solid #ffffff15",
              background: n === "del" ? "transparent" : "#ffffff08",
              color: "#fff", fontSize: n === "del" ? "1rem" : "1.4rem",
              fontWeight: 300, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {n === "del" ? "⌫" : n}
            </button>
          ))}
        </div>
        {err && <div style={{ color: "#ff4757", fontSize: ".75rem", marginTop: 16 }}>Wrong passcode</div>}
        <div style={{ fontSize: ".6rem", color: "#ffffff15", marginTop: 40, letterSpacing: "3px" }}>GRIND OS</div>
      </div>
    </div>
  );
}

/* ═══ COMMON COMPONENTS ═══ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; scrollbar-width: thin; scrollbar-color: #1e1e3a #0d0d15; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d0d15; }
  ::-webkit-scrollbar-thumb { background: #1e1e3a; border-radius: 3px; }
  @keyframes xpPop { 0% { opacity:1; transform: translate(-50%,-50%) scale(.5); } 50% { transform: translate(-50%,-80%) scale(1.2); } 100% { opacity:0; transform: translate(-50%,-120%) scale(.8); } }
  @keyframes levelPop { 0% { transform: scale(.3); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes glow { 0%,100% { box-shadow: 0 0 8px #00ffc844; } 50% { box-shadow: 0 0 20px #00ffc866; } }
  input, textarea, select { font-family: inherit; }
  .c { background: #0f0f1a; border: 1px solid #1a1a2e; border-radius: 16px; padding: 20px; transition: all .2s; }
  .c:hover { border-color: #2a2a4e; }
  .b { border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: inherit; font-size: .85rem; }
  .b:hover { transform: translateY(-1px); }
  .bp { background: linear-gradient(135deg,#00ffc8,#00b894); color: #080810; }
  .bs { background: #1a1a2e; color: #e0e0e8; border: 1px solid #2a2a4e; }
  .bd { background: #ff4757; color: #fff; }
  .bg { background: transparent; color: #ffffff66; border: 1px solid #1a1a2e; }
  .sm { padding: 6px 14px; font-size: .78rem; border-radius: 8px; }
  .inp { background: #0a0a14; border: 1px solid #1e1e3a; border-radius: 10px; padding: 10px 14px; color: #e0e0e8; font-size: .85rem; width: 100%; outline: none; transition: border .2s; }
  .inp:focus { border-color: #00ffc8; }
  .tag { display: inline-block; background: #1a1a2e; color: #00ffc8; padding: 3px 10px; border-radius: 20px; font-size: .7rem; font-weight: 600; }
  .mh { display: none; }
  @media(max-width:768px) {
    .sb { position: fixed !important; z-index: 1000; transform: translateX(-100%); transition: transform .3s; }
    .sb.open { transform: translateX(0) !important; }
    .mh { display: flex !important; }
    .ov { display: block !important; }
  }
`;

function XpPop({ amount, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 1200); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%,-50%)", zIndex: 9999,
      fontSize: "2.5rem", fontWeight: 900, color: "#00ffc8",
      textShadow: "0 0 30px #00ffc8, 0 0 60px #00ffc866",
      animation: "xpPop .8s ease-out forwards", pointerEvents: "none"
    }}>+{amount} XP</div>
  );
}

function LvlPop({ level, onDone }) {
  const t = getTitle(level);
  useEffect(() => { const ti = setTimeout(onDone, 3000); return () => clearTimeout(ti); }, []);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,.92)", animation: "fadeIn .3s"
    }}>
      <div style={{ textAlign: "center", animation: "levelPop 1s ease-out" }}>
        <div style={{ fontSize: "3rem", marginBottom: 8 }}>👑</div>
        <div style={{ fontSize: "1rem", letterSpacing: "6px", color: "#ffd700", textTransform: "uppercase", marginBottom: 8 }}>Level Up!</div>
        <div style={{ fontSize: "5rem", fontWeight: 900, color: "#ffd700", textShadow: "0 0 40px #ffd70088", lineHeight: 1 }}>{level}</div>
        <div style={{ fontSize: "1rem", color: "#ffffffaa", marginTop: 12 }}>{t.icon} {t.name}</div>
      </div>
    </div>
  );
}

/* ═══ PAGES (defined in PAGES_CFG) ═══ */
const PAGES_CFG = [
  ["dashboard", "⚡", "Command Center"],
  ["looksmaxing", "💎", "Looksmaxing"],
  ["fitness", "🏋️", "Fitness"],
  ["motivation", "🔥", "War Room"],
  ["bible", "✝️", "Bible"],
  ["goals", "🎯", "Goals"],
  ["rewards", "👑", "Rewards"],
];

/* ═══ MAIN APP ═══ */
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [profile, setProfile, pL] = useS("g4-profile", { xp: 0, streakDays: 0, lastActiveDate: null, joinDate: todayStr() });
  const [checklist, setChecklist, cL] = useS("g4-check", []);
  const [dailyTasks, setDailyTasks, dtL] = useS("g4-daily", []);
  const [dailyLog, setDailyLog, dlL] = useS("g4-dlog", {});
  const [guides, setGuides, gL] = useS("g4-guides", []);
  const [videos, setVideos, vL] = useS("g4-videos", []);
  const [workouts, setWorkouts, wL] = useS("g4-workouts", []);
  const [woLog, setWoLog, woLL] = useS("g4-wolog", {});
  const [goals, setGoals, goL] = useS("g4-goals", []);
  const [moodLog, setMoodLog, mL] = useS("g4-mood", {});
  const [waterLog, setWaterLog, waL] = useS("g4-water", {});
  const [bibleLog, setBibleLog, bL] = useS("g4-bible", {});
  const [bibleNotes, setBibleNotes, bnL] = useS("g4-bnotes", []);
  const [passLog, setPassLog, paL] = useS("g4-pass", {});
  const [prayers, setPrayers, prL] = useS("g4-pray", []);
  const [favs, setFavs, fL] = useS("g4-favs", []);
  const [crLog, setCrLog, crLL] = useS("g4-creatine", {});
  const [focLog, setFocLog, foL] = useS("g4-focus", {});
  const [chLog, setChLog, chLL] = useS("g4-chall", {});
  const [mNotes, setMNotes, mnL] = useS("g4-mindset", []);
  const [prs, setPrs, prRL] = useS("g4-prs", []);
  const [lmRoutine, setLmRoutine, lmrL] = useS("g4-lmroutine", []);
  const [lmRoutineLog, setLmRoutineLog, lmrlL] = useS("g4-lmrlog", {});
  const [xpPop, setXpPop] = useState(null);
  const [lvlPop, setLvlPop] = useState(null);
  const [sbOpen, setSbOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState("syncing");
  const hasSynced = useRef(false);

  // Pull cloud data on first unlock
  useEffect(() => {
    if (!unlocked || hasSynced.current) return;
    hasSynced.current = true;
    setSyncStatus("syncing");
    cloudSync.pull().then((pulled) => {
      if (pulled) {
        // Check if cloud actually had meaningful data
        try {
          const cloudProfile = localStorage.getItem("g4-profile");
          if (cloudProfile && JSON.parse(cloudProfile)?.xp > 0) {
            location.reload();
            return;
          }
        } catch {}
      }
      setSyncStatus("synced");
      // Push current local data to cloud on first sync
      cloudSync.push();
    }).catch(() => setSyncStatus("offline"));
  }, [unlocked]);

  // Periodic sync check every 30s
  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(() => {
      setSyncStatus("syncing");
      setTimeout(() => setSyncStatus("synced"), 1000);
    }, 30000);
    return () => clearInterval(interval);
  }, [unlocked]);

  const loaded = pL && cL && dtL && dlL && gL && vL && wL && woLL && goL && mL && waL && bL && bnL && paL && prL && fL && crLL && foL && chLL && mnL && prRL && lmrL && lmrlL;
  const td = todayStr();

  // Streak
  useEffect(() => {
    if (!pL) return;
    if (profile.lastActiveDate !== td) {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const s = profile.lastActiveDate === y ? profile.streakDays + 1 : 1;
      const b = s > 1 ? XP.streak : 0;
      setProfile(p => ({ ...p, lastActiveDate: td, streakDays: s, xp: p.xp + b }));
      if (b) setXpPop(b);
    }
  }, [pL]);

  const addXp = useCallback((amt) => {
    const oL = getLevel(profile.xp);
    const nX = profile.xp + amt;
    const nL = getLevel(nX);
    setProfile(p => ({ ...p, xp: nX }));
    setXpPop(amt);
    if (nL > oL) setTimeout(() => setLvlPop(nL), 900);
  }, [profile.xp, setProfile]);

  const lp = getLp(profile.xp);
  const title = getTitle(lp.level);
  const stats = {
    tasks: checklist.filter(i => i.done).length,
    bible: Object.keys(bibleLog).filter(k => bibleLog[k]).length,
    workouts: workouts.length,
    goals: goals.filter(g => g.done).length,
    water: Object.keys(waterLog).filter(k => waterLog[k] >= 4).length,
    focus: Object.values(focLog).reduce((a, b) => a + (b || 0), 0),
  };

  if (!unlocked) return <Lock onUnlock={() => setUnlocked(true)} />;
  if (!loaded) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#00ffc8", fontFamily: "'Outfit',sans-serif" }}>
      <div style={{ fontSize: "2rem", fontWeight: 900 }}>LOADING...</div>
    </div>
  );

  const ctx = {
    addXp, profile, td, lp, title, stats,
    checklist, setChecklist, dailyTasks, setDailyTasks, dailyLog, setDailyLog,
    guides, setGuides, videos, setVideos, workouts, setWorkouts, woLog, setWoLog,
    goals, setGoals, moodLog, setMoodLog, waterLog, setWaterLog,
    bibleLog, setBibleLog, bibleNotes, setBibleNotes, passLog, setPassLog,
    prayers, setPrayers, favs, setFavs, crLog, setCrLog, focLog, setFocLog,
    chLog, setChLog, mNotes, setMNotes, prs, setPrs,
    lmRoutine, setLmRoutine, lmRoutineLog, setLmRoutineLog,
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#08080d", color: "#e0e0e8", fontFamily: "'Outfit',sans-serif", overflow: "hidden" }}>
      <style>{CSS}</style>

      {xpPop && <XpPop amount={xpPop} onDone={() => setXpPop(null)} />}
      {lvlPop && <LvlPop level={lvlPop} onDone={() => setLvlPop(null)} />}
      {sbOpen && <div className="ov" onClick={() => setSbOpen(false)} style={{ display: "none", position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 999 }} />}

      {/* Mobile header */}
      <div className="mh" style={{ display: "none", position: "fixed", top: 0, left: 0, right: 0, zIndex: 998, height: 56, background: "#0a0a12ee", borderBottom: "1px solid #1a1a2e", alignItems: "center", padding: "0 16px", justifyContent: "space-between" }}>
        <button onClick={() => setSbOpen(true)} style={{ background: "none", border: "none", color: "#e0e0e8", fontSize: "1.4rem", cursor: "pointer" }}>☰</button>
        <span style={{ fontWeight: 800, background: "linear-gradient(135deg,#00ffc8,#7b61ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GRIND OS</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: ".7rem", color: "#ffd700", fontWeight: 700 }}>LV{lp.level}</span>
          <span style={{ fontSize: ".7rem", color: "#ff6b35" }}>🔥{profile.streakDays}</span>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`sb${sbOpen ? " open" : ""}`} style={{ width: 220, minWidth: 220, background: "#0a0a12", borderRight: "1px solid #1a1a2e", display: "flex", flexDirection: "column", padding: "20px 12px", gap: 2, overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900, background: "linear-gradient(135deg,#00ffc8,#7b61ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GRIND OS</div>
          <div style={{ fontSize: ".55rem", color: "#ffffff33", letterSpacing: "2px", textTransform: "uppercase", marginTop: 2 }}>Accountability System</div>
        </div>

        {/* Level card */}
        <div style={{ background: "#0f0f1a", borderRadius: 12, padding: 12, marginBottom: 6, border: "1px solid #1a1a2e" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: ".8rem", color: "#ffd700" }}>{title.icon} {title.name}</span>
            <span style={{ fontSize: "1.4rem", fontWeight: 900, color: "#ffd700" }}>Lv{lp.level}</span>
          </div>
          <div style={{ width: "100%", height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ width: `${(lp.cur / lp.need) * 100}%`, height: "100%", background: "linear-gradient(90deg,#00ffc8,#7b61ff)", borderRadius: 3, transition: "width .5s", animation: "glow 2s infinite" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".55rem", color: "#ffffff33" }}>
            <span>{lp.cur}/{lp.need}</span><span>{lp.total} XP</span>
          </div>
        </div>

        {/* Streak */}
        <div style={{ background: "linear-gradient(135deg,#ff6b3515,#ff4d1a08)", borderRadius: 12, padding: 10, marginBottom: 10, border: "1px solid #ff6b3520", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: "1.3rem" }}>🔥</span>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#ff6b35", lineHeight: 1 }}>{profile.streakDays}</div>
            <div style={{ fontSize: ".5rem", color: "#ff6b35aa", textTransform: "uppercase", letterSpacing: "1px" }}>Day Streak</div>
          </div>
        </div>

        {/* Nav */}
        {PAGES_CFG.map(([id, icon, label]) => (
          <button key={id} onClick={() => { setPage(id); setSbOpen(false); }} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 10, border: "none",
            background: page === id ? "linear-gradient(135deg,#00ffc812,#7b61ff08)" : "transparent",
            color: page === id ? "#00ffc8" : "#ffffff55",
            cursor: "pointer", fontSize: ".8rem", fontWeight: page === id ? 700 : 400,
            fontFamily: "inherit",
            borderLeft: page === id ? "3px solid #00ffc8" : "3px solid transparent",
            textAlign: "left"
          }}>
            <span style={{ fontSize: "1rem", width: 20, textAlign: "center" }}>{icon}</span>{label}
          </button>
        ))}

        <div style={{ flex: 1 }} />
        {/* Sync indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 0", marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: syncStatus === "synced" ? "#00ffc8" : syncStatus === "syncing" ? "#ffd700" : "#ff4757", transition: "background .3s" }} />
          <span style={{ fontSize: ".55rem", color: "#ffffff33" }}>{syncStatus === "synced" ? "Synced" : syncStatus === "syncing" ? "Syncing..." : "Offline"}</span>
        </div>
        <button onClick={() => { setUnlocked(false); setSbOpen(false); }} style={{ background: "none", border: "1px solid #1a1a2e", borderRadius: 8, color: "#ffffff33", fontSize: ".7rem", cursor: "pointer", padding: 8, fontFamily: "inherit", marginBottom: 4 }}>🔒 Lock</button>
        <button onClick={async () => {
          if (confirm("Reset ALL data? This clears all devices.")) {
            for (const k of ALL_KEYS) { try { localStorage.removeItem(k); } catch {} }
            await cloudSync.reset();
            location.reload();
          }
        }} style={{ background: "none", border: "none", color: "#ff475722", fontSize: ".55rem", cursor: "pointer", padding: 4, fontFamily: "inherit" }}>Reset All Data</button>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: 28 }} className="mn">
        <style>{`@media(max-width:768px){ .mn { padding: 14px !important; padding-top: 68px !important; } }`}</style>
        {page === "dashboard" && <Dash {...ctx} />}
        {page === "looksmaxing" && <Looksmax {...ctx} />}
        {page === "fitness" && <Fitness {...ctx} />}
        {page === "motivation" && <WarRoom {...ctx} />}
        {page === "bible" && <BiblePage {...ctx} />}
        {page === "goals" && <GoalsPage {...ctx} />}
        {page === "rewards" && <RewardsPage {...ctx} />}
      </div>
    </div>
  );
}

/* ═══ DASHBOARD ═══ */
function Dash({ checklist, setChecklist, dailyTasks, setDailyTasks, dailyLog, setDailyLog, addXp, profile, td, moodLog, setMoodLog, waterLog, setWaterLog, goals, crLog, setCrLog, focLog, setFocLog, chLog, setChLog, lp, title }) {
  const [newItem, setNewItem] = useState("");
  const [newDaily, setNewDaily] = useState("");
  const [showDF, setShowDF] = useState(false);
  const [focusOn, setFocusOn] = useState(false);
  const [focLeft, setFocLeft] = useState(25 * 60);
  const todayMood = moodLog[td];
  const todayWater = waterLog[td] || 0;
  const todayDL = dailyLog[td] || {};
  const crToday = !!crLog[td];
  const todayFoc = focLog[td] || 0;
  const chDone = !!chLog[td];
  const challenge = CHALLENGES[dayOfYear() % CHALLENGES.length];
  const quote = QUOTES[dayOfYear() % QUOTES.length];
  const tw = SCHEDULE[dayIdx()];
  const ct = checklist.filter(i => i.doneDate === td).length;
  const cr = dailyTasks.filter(r => todayDL[r.id]).length;
  const ag = goals.filter(g => !g.done).length;

  useEffect(() => {
    if (!focusOn) return;
    if (focLeft <= 0) { setFocusOn(false); setFocLog(l => ({ ...l, [td]: (l[td] || 0) + 1 })); addXp(XP.focus); return; }
    const t = setInterval(() => setFocLeft(f => f - 1), 1000);
    return () => clearInterval(t);
  }, [focusOn, focLeft]);

  const fM = Math.floor(focLeft / 60);
  const fS = focLeft % 60;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Command Center</h1>
        <p style={{ color: "#ffffff44", fontSize: ".8rem" }}>Day {Math.max(1, Math.ceil((Date.now() - new Date(profile.joinDate).getTime()) / 86400000))} — {weekday()} — {title.icon} {title.name}</p>
      </div>

      {/* Quote */}
      <div className="c" style={{ marginBottom: 14, background: "linear-gradient(135deg,#0f0f1a,#141428)", borderColor: "#2a2a4e", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, fontSize: "5rem", opacity: .04 }}>💬</div>
        <p style={{ fontSize: ".95rem", fontStyle: "italic", color: "#ffffffcc", lineHeight: 1.6, marginBottom: 6 }}>"{quote[0]}"</p>
        <p style={{ fontSize: ".7rem", color: "#ffffff44" }}>— {quote[1]}</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 14 }}>
        {[["Tasks", ct, "#00ffc8", "✓"], ["Dailies", `${cr}/${dailyTasks.length}`, "#7b61ff", "🔄"], ["Goals", ag, "#ffd700", "🎯"], ["Water", `${todayWater}/4`, "#00b4d8", "💧"], ["Focus", todayFoc, "#ff6b35", "🧠"], ["Level", lp.level, "#ffd700", "👑"], ["XP", profile.xp.toLocaleString(), "#00ffc8", "⚡"], ["Streak", `${profile.streakDays}d`, "#ff6b35", "🔥"]].map(([l, v, c, ic], i) => (
          <div key={i} className="c" style={{ textAlign: "center", padding: 10 }}>
            <div style={{ fontSize: ".85rem" }}>{ic}</div>
            <div style={{ fontSize: "1rem", fontWeight: 900, color: c }}>{v}</div>
            <div style={{ fontSize: ".45rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "1px" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Workout banner */}
      <div className="c" style={{ marginBottom: 12, padding: 12, background: tw[2] === "rest" ? "#0f0f1a" : "linear-gradient(135deg,#ff6b3508,#0f0f1a)", borderColor: tw[2] === "rest" ? "#1a1a2e" : "#ff6b3520" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.3rem" }}>{tw[3]}</span>
          <div>
            <div style={{ fontSize: ".5rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px" }}>Today's Workout</div>
            <div style={{ fontSize: ".95rem", fontWeight: 800, color: tw[2] === "rest" ? "#ffffff44" : "#ff6b35" }}>{tw[1]}</div>
          </div>
        </div>
      </div>

      {/* Quick actions: mood, water, creatine */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div className="c" style={{ padding: 12 }}>
          <div style={{ fontSize: ".5rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6, fontWeight: 600 }}>Mood</div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {MOODS.map(([em, lb, cl]) => (
              <button key={lb} onClick={() => { setMoodLog(m => ({ ...m, [td]: { emoji: em, label: lb } })); if (!todayMood) addXp(XP.mood); }} style={{
                padding: "3px 6px", borderRadius: 6,
                border: `1px solid ${todayMood?.label === lb ? cl + "66" : "#1a1a2e"}`,
                background: todayMood?.label === lb ? cl + "15" : "#0a0a14",
                cursor: "pointer", fontSize: ".6rem", color: todayMood?.label === lb ? cl : "#ffffff44", fontFamily: "inherit"
              }}>{em}</button>
            ))}
          </div>
        </div>
        <div className="c" style={{ padding: 12 }}>
          <div style={{ fontSize: ".5rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6, fontWeight: 600 }}>Water (1L)</div>
          <div style={{ display: "flex", gap: 3 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} onClick={() => { const nw = todayWater + 1; setWaterLog(w => ({ ...w, [td]: nw })); if (nw === 4) addXp(XP.water); }} style={{ width: 16, height: 24, borderRadius: 3, background: i < todayWater ? "#00b4d8" : "#1a1a2e", border: "1px solid " + (i < todayWater ? "#00b4d844" : "#1a1a2e"), cursor: "pointer" }} />
            ))}
          </div>
        </div>
        <div className="c" style={{ padding: 12 }}>
          <div style={{ fontSize: ".5rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 6, fontWeight: 600 }}>Creatine</div>
          <button onClick={() => { if (!crToday) { setCrLog(l => ({ ...l, [td]: true })); addXp(XP.creatine); } }} className={`b sm ${crToday ? "bs" : "bp"}`} style={{ opacity: crToday ? .5 : 1, width: "100%", fontSize: ".7rem" }}>{crToday ? "✓ Taken" : "Take"}</button>
        </div>
      </div>

      {/* Challenge */}
      <div className="c" style={{ marginBottom: 12, background: "linear-gradient(135deg,#ffd70008,#ff6b3508)", borderColor: "#ffd70015", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: ".5rem", color: "#ffd700", textTransform: "uppercase", letterSpacing: "2px", fontWeight: 600 }}>Daily Challenge</div>
            <div style={{ fontSize: ".85rem", fontWeight: 600, marginTop: 4, color: chDone ? "#ffffff44" : "#e0e0e8", textDecoration: chDone ? "line-through" : "none" }}>{challenge}</div>
          </div>
          <button onClick={() => { if (!chDone) { setChLog(l => ({ ...l, [td]: true })); addXp(XP.challenge); } }} className={`b sm ${chDone ? "bs" : "bp"}`} style={{ opacity: chDone ? .5 : 1 }}>{chDone ? "✓" : "Complete"}</button>
        </div>
      </div>

      {/* Focus Timer */}
      <div className="c" style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: ".5rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", fontWeight: 600 }}>Focus Timer</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 900, fontFamily: "monospace", color: focusOn ? "#00ffc8" : "#ffffff55", marginTop: 4 }}>{String(fM).padStart(2, "0")}:{String(fS).padStart(2, "0")}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {!focusOn
              ? <button className="b sm bp" onClick={() => { setFocLeft(25 * 60); setFocusOn(true); }}>Start 25m</button>
              : <button className="b sm bd" onClick={() => setFocusOn(false)}>Stop</button>
            }
            <button className="b sm bs" onClick={() => { setFocLeft(25 * 60); setFocusOn(false); }}>Reset</button>
          </div>
        </div>
        {focusOn && <div style={{ width: "100%", height: 4, background: "#1a1a2e", borderRadius: 2, marginTop: 8, overflow: "hidden" }}><div style={{ width: `${(focLeft / (25 * 60)) * 100}%`, height: "100%", background: "linear-gradient(90deg,#00ffc8,#7b61ff)", transition: "width 1s linear" }} /></div>}
      </div>

      {/* Daily tasks */}
      <div className="c" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div><h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Daily Tasks</h2><p style={{ fontSize: ".5rem", color: "#ffffff33" }}>Resets every day</p></div>
          <button className="b sm bs" onClick={() => setShowDF(!showDF)}>+ Add</button>
        </div>
        {showDF && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="inp" placeholder="e.g. Read 30 min..." value={newDaily} onChange={e => setNewDaily(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (newDaily.trim()) { setDailyTasks(r => [...r, { id: uid(), text: newDaily.trim() }]); setNewDaily(""); setShowDF(false); } })()} />
            <button className="b sm bp" onClick={() => { if (newDaily.trim()) { setDailyTasks(r => [...r, { id: uid(), text: newDaily.trim() }]); setNewDaily(""); setShowDF(false); } }}>Add</button>
          </div>
        )}
        {dailyTasks.length === 0 && <p style={{ color: "#ffffff22", fontSize: ".7rem", textAlign: "center", padding: 10 }}>Add daily tasks</p>}
        {dailyTasks.map(r => {
          const done = !!todayDL[r.id];
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 4, background: done ? "#7b61ff08" : "#0a0a14", borderRadius: 8, border: `1px solid ${done ? "#7b61ff22" : "#1a1a2e"}` }}>
              <button onClick={() => { if (!done) addXp(XP.daily); setDailyLog(l => ({ ...l, [td]: { ...todayDL, [r.id]: !done } })); }} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? "#7b61ff" : "#2a2a4e"}`, background: done ? "#7b61ff" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".5rem", color: "#fff", flexShrink: 0 }}>{done && "✓"}</button>
              <span style={{ flex: 1, fontSize: ".75rem", color: done ? "#ffffff44" : "#e0e0e8", textDecoration: done ? "line-through" : "none" }}>{r.text}</span>
              <button onClick={() => setDailyTasks(t => t.filter(x => x.id !== r.id))} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer", fontSize: ".55rem" }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* Checklist */}
      <div className="c">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Checklist</h2>
          <span className="tag">{ct} done</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input className="inp" placeholder="Add a task..." value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (newItem.trim()) { setChecklist(c => [...c, { id: uid(), text: newItem.trim(), doneDate: null }]); setNewItem(""); } })()} />
          <button className="b bp" onClick={() => { if (newItem.trim()) { setChecklist(c => [...c, { id: uid(), text: newItem.trim(), doneDate: null }]); setNewItem(""); } }}>Add</button>
        </div>
        {checklist.length === 0 && <p style={{ color: "#ffffff22", fontSize: ".7rem", textAlign: "center", padding: 10 }}>No tasks yet</p>}
        {checklist.map(item => {
          const done = item.doneDate === td;
          return (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 4, background: done ? "#00ffc808" : "#0a0a14", borderRadius: 8, border: `1px solid ${done ? "#00ffc822" : "#1a1a2e"}` }}>
              <button onClick={() => { const w = item.doneDate === td; if (!w) addXp(XP.task); setChecklist(c => c.map(i => i.id === item.id ? { ...i, doneDate: w ? null : td } : i)); }} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? "#00ffc8" : "#2a2a4e"}`, background: done ? "#00ffc8" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".5rem", color: "#080810", flexShrink: 0 }}>{done && "✓"}</button>
              <span style={{ flex: 1, fontSize: ".75rem", textDecoration: done ? "line-through" : "none", color: done ? "#ffffff44" : "#e0e0e8" }}>{item.text}</span>
              <button onClick={() => setChecklist(c => c.filter(i => i.id !== item.id))} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer", fontSize: ".55rem" }}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══ LOOKSMAXING ═══ */
function Looksmax({ guides, setGuides, videos, setVideos, addXp, lmRoutine, setLmRoutine, lmRoutineLog, setLmRoutineLog, td }) {
  const [tab, setTab] = useState("routine");
  const [sf, setSf] = useState(false);
  const [form, setForm] = useState({ title: "", category: "skincare", content: "" });
  const [view, setView] = useState(null);
  const [filter, setFilter] = useState("all");
  const [vu, setVu] = useState("");
  const [vt, setVt] = useState("");
  const [vc, setVc] = useState("skincare");
  const [playing, setPlaying] = useState(null);
  const [newStep, setNewStep] = useState("");
  const [showAddStep, setShowAddStep] = useState(false);
  const cats = ["skincare", "hair", "style", "grooming", "diet", "mewing", "teeth", "other"];
  const list = filter === "all" ? (tab === "guides" ? guides : videos) : (tab === "guides" ? guides : videos).filter(g => g.category === filter);
  const todayRoutine = lmRoutineLog[td] || {};
  const routineDone = lmRoutine.filter((_, i) => todayRoutine[i]).length;

  const addStep = () => {
    if (!newStep.trim()) return;
    setLmRoutine(r => [...r, { id: uid(), text: newStep.trim() }]);
    setNewStep("");
    setShowAddStep(false);
  };

  const toggleStep = (i) => {
    const was = !!todayRoutine[i];
    if (!was) addXp(XP.exercise);
    setLmRoutineLog(l => ({ ...l, [td]: { ...todayRoutine, [i]: !was } }));
  };

  const removeStep = (idx) => {
    setLmRoutine(r => r.filter((_, i) => i !== idx));
  };

  if (view) {
    const g = guides.find(x => x.id === view);
    if (!g) { setView(null); return null; }
    return (
      <div>
        <button className="b sm bs" onClick={() => setView(null)} style={{ marginBottom: 16 }}>← Back</button>
        <div className="c">
          <span className="tag" style={{ marginBottom: 12, display: "inline-block" }}>{g.category}</span>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 4 }}>{g.title}</h2>
          <div style={{ whiteSpace: "pre-wrap", fontSize: ".88rem", lineHeight: 1.7, color: "#ffffffcc", marginTop: 12 }}>{g.content}</div>
          <button className="b sm bd" onClick={() => { setGuides(gg => gg.filter(x => x.id !== g.id)); setView(null); }} style={{ marginTop: 16 }}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Looksmaxing</h1>
        {tab === "guides" && <button className="b bp" onClick={() => setSf(!sf)}>+ Guide</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["routine", "guides", "videos"].map(t => (
          <button key={t} onClick={() => { setTab(t); setFilter("all"); }} className="b sm" style={{ background: tab === t ? "#00ffc815" : "#0f0f1a", color: tab === t ? "#00ffc8" : "#ffffff44", border: tab === t ? "1px solid #00ffc833" : "1px solid #1a1a2e" }}>
            {t === "routine" ? "🪞 Daily Routine" : t === "guides" ? "📖 Guides" : "🎬 Videos"}
          </button>
        ))}
      </div>

      {/* DAILY ROUTINE TAB */}
      {tab === "routine" && (
        <div>
          <div className="c" style={{ marginBottom: 14, background: "linear-gradient(135deg,#7b61ff08,#00ffc808)", borderColor: "#7b61ff22" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Daily Glow-Up Routine</h2>
                <p style={{ fontSize: ".55rem", color: "#ffffff33" }}>Resets every day — check off each step</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {lmRoutine.length > 0 && <span style={{ fontSize: ".65rem", color: routineDone === lmRoutine.length ? "#00ffc8" : "#ffffff44" }}>{routineDone}/{lmRoutine.length}</span>}
                <button className="b sm bs" onClick={() => setShowAddStep(!showAddStep)}>+ Step</button>
              </div>
            </div>

            {showAddStep && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input className="inp" placeholder="e.g. Wash face, Apply moisturizer, Mew 10 min..." value={newStep} onChange={e => setNewStep(e.target.value)} onKeyDown={e => e.key === "Enter" && addStep()} />
                <button className="b sm bp" onClick={addStep}>Add</button>
              </div>
            )}

            {lmRoutine.length === 0 && <p style={{ color: "#ffffff22", fontSize: ".75rem", textAlign: "center", padding: 16 }}>Add your daily looksmaxing steps — skincare, mewing, grooming, etc.</p>}

            {lmRoutine.length > 0 && (
              <div style={{ width: "100%", height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ width: `${lmRoutine.length ? (routineDone / lmRoutine.length) * 100 : 0}%`, height: "100%", background: "linear-gradient(90deg,#7b61ff,#00ffc8)", borderRadius: 3, transition: "width .5s" }} />
              </div>
            )}

            {lmRoutine.map((step, i) => {
              const done = !!todayRoutine[i];
              return (
                <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginBottom: 4, background: done ? "#00ffc808" : "#0a0a14", borderRadius: 8, border: `1px solid ${done ? "#00ffc822" : "#1a1a2e"}`, cursor: "pointer" }} onClick={() => toggleStep(i)}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? "#00ffc8" : "#2a2a4e"}`, background: done ? "#00ffc8" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".5rem", color: "#080810", flexShrink: 0 }}>{done && "✓"}</div>
                  <span style={{ flex: 1, fontSize: ".78rem", color: done ? "#ffffff44" : "#e0e0e8", textDecoration: done ? "line-through" : "none" }}>{step.text}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeStep(i); }} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer", fontSize: ".55rem" }}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTER (only for guides/videos) */}
      {tab !== "routine" && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
          {["all", ...cats].map(c => (
            <button key={c} onClick={() => setFilter(c)} className="b sm" style={{ background: filter === c ? "#00ffc815" : "transparent", color: filter === c ? "#00ffc8" : "#ffffff44", border: filter === c ? "1px solid #00ffc833" : "1px solid transparent", fontSize: ".65rem" }}>
              {c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      )}

      {sf && tab === "guides" && (
        <div className="c" style={{ marginBottom: 12 }}>
          <input className="inp" placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ marginBottom: 8 }} />
          <select className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ marginBottom: 8 }}>
            {cats.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>
          <textarea className="inp" rows={5} placeholder="Guide content..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="b bp" onClick={() => { if (form.title.trim()) { setGuides(g => [{ id: uid(), ...form, date: todayStr() }, ...g]); setForm({ title: "", category: "skincare", content: "" }); setSf(false); addXp(XP.guide); } }}>Save</button>
            <button className="b bs" onClick={() => setSf(false)}>Cancel</button>
          </div>
        </div>
      )}

      {tab === "videos" && (
        <div className="c" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: ".55rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 8, fontWeight: 600 }}>Add YouTube Video</div>
          <input className="inp" placeholder="YouTube URL" value={vu} onChange={e => setVu(e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="inp" placeholder="Title" value={vt} onChange={e => setVt(e.target.value)} />
            <select className="inp" style={{ width: "auto", minWidth: 100 }} value={vc} onChange={e => setVc(e.target.value)}>
              {cats.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <button className="b bp" onClick={() => { const yt = getYtId(vu); if (yt && vt.trim()) { setVideos(v => [{ id: uid(), ytId: yt, title: vt.trim(), category: vc, date: todayStr() }, ...v]); setVu(""); setVt(""); addXp(XP.video); } }}>Add</button>
        </div>
      )}

      {tab === "guides" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {list.length === 0 && <p style={{ color: "#ffffff22", gridColumn: "1/-1", textAlign: "center", padding: 40 }}>No guides yet</p>}
          {list.map(g => (
            <div key={g.id} className="c" style={{ cursor: "pointer", padding: 14 }} onClick={() => setView(g.id)}>
              <span className="tag" style={{ marginBottom: 6, display: "inline-block" }}>{g.category}</span>
              <h3 style={{ fontSize: ".85rem", fontWeight: 700, marginBottom: 4 }}>{g.title}</h3>
              <p style={{ fontSize: ".65rem", color: "#ffffff33", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.content}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "videos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {list.length === 0 && <p style={{ color: "#ffffff22", gridColumn: "1/-1", textAlign: "center", padding: 40 }}>No videos yet</p>}
          {list.map(v => (
            <div key={v.id} className="c" style={{ padding: 0, overflow: "hidden" }}>
              {playing === v.id ? (
                <div style={{ position: "relative", paddingTop: "56.25%" }}>
                  <iframe src={`https://www.youtube.com/embed/${v.ytId}?autoplay=1`} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} allow="autoplay;encrypted-media" allowFullScreen />
                </div>
              ) : (
                <div onClick={() => setPlaying(v.id)} style={{ position: "relative", paddingTop: "56.25%", cursor: "pointer", background: `url(https://img.youtube.com/vi/${v.ytId}/hqdefault.jpg) center/cover` }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)" }}>
                    <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(255,0,0,.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", color: "#fff" }}>▶</div>
                  </div>
                </div>
              )}
              <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="tag" style={{ marginBottom: 4, display: "inline-block" }}>{v.category}</span>
                  <h3 style={{ fontSize: ".78rem", fontWeight: 600 }}>{v.title}</h3>
                </div>
                <button onClick={() => setVideos(vs => vs.filter(x => x.id !== v.id))} style={{ background: "none", border: "none", color: "#ff475733", cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ FITNESS ═══ */
function Fitness({ workouts, setWorkouts, addXp, td, woLog, setWoLog, prs, setPrs, crLog, setCrLog }) {
  const [sf, setSf] = useState(false);
  const [form, setForm] = useState({ name: "", exercises: "", notes: "", date: todayStr() });
  const [vw, setVw] = useState(null);
  const [prF, setPrF] = useState({ exercise: "", weight: "", reps: "" });
  const [showPR, setShowPR] = useState(false);
  const ts = SCHEDULE[dayIdx()];
  const woChecks = woLog[td] || {};
  const crDone = !!crLog[td];
  const allExDone = ts[4].length > 0 && ts[4].every((_, i) => woChecks[i]);
  const exDoneCount = ts[4].filter((_, i) => woChecks[i]).length;
  const toggleEx = (i) => {
    const was = !!woChecks[i];
    if (!was) addXp(XP.exercise);
    setWoLog(l => ({ ...l, [td]: { ...woChecks, [i]: !was } }));
  };

  if (vw) {
    const w = workouts.find(x => x.id === vw);
    if (!w) { setVw(null); return null; }
    return (
      <div>
        <button className="b sm bs" onClick={() => setVw(null)} style={{ marginBottom: 16 }}>← Back</button>
        <div className="c">
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>{w.name}</h2>
          <p style={{ color: "#ffffff44", fontSize: ".7rem", marginBottom: 12 }}>{w.date}</p>
          <div style={{ whiteSpace: "pre-wrap", fontSize: ".88rem", lineHeight: 1.7, color: "#ffffffcc" }}>{w.exercises || "—"}</div>
          {w.notes && <div style={{ marginTop: 12, padding: 12, background: "#0a0a14", borderRadius: 8 }}><p style={{ fontSize: ".8rem", color: "#ffffffaa" }}>{w.notes}</p></div>}
          <button className="b sm bd" onClick={() => { setWorkouts(ww => ww.filter(x => x.id !== w.id)); setVw(null); }} style={{ marginTop: 16 }}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Fitness</h1>
        <button className="b bp" onClick={() => setSf(!sf)}>+ Log Workout</button>
      </div>

      {/* Schedule */}
      <div className="c" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: ".55rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 10, fontWeight: 600 }}>Weekly Schedule</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 6 }}>
          {SCHEDULE.map((w, i) => {
            const it = dayIdx() === i;
            return (
              <div key={i} style={{ padding: 8, borderRadius: 10, background: it ? "linear-gradient(135deg,#00ffc810,#7b61ff08)" : "#0a0a14", border: `1px solid ${it ? "#00ffc833" : "#1a1a2e"}`, textAlign: "center" }}>
                <div style={{ fontSize: ".5rem", color: it ? "#00ffc8" : "#ffffff33", textTransform: "uppercase", fontWeight: 600 }}>{w[0].slice(0, 3)}</div>
                <div style={{ fontSize: "1.1rem", margin: "3px 0" }}>{w[3]}</div>
                <div style={{ fontSize: ".6rem", fontWeight: it ? 700 : 400, color: it ? "#e0e0e8" : "#ffffff44" }}>{w[1]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today */}
      <div className="c" style={{ marginBottom: 14, background: ts[2] === "rest" ? "#0f0f1a" : "linear-gradient(135deg,#ff6b3508,#0f0f1a)", borderColor: ts[2] === "rest" ? "#1a1a2e" : "#ff6b3520" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ts[4].length ? 10 : 0 }}>
          <div><span style={{ fontSize: "1.2rem", marginRight: 8 }}>{ts[3]}</span><span style={{ fontSize: "1rem", fontWeight: 800 }}>{ts[1]}</span></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {ts[4].length > 0 && <span style={{ fontSize: ".65rem", color: allExDone ? "#00ffc8" : "#ffffff44" }}>{exDoneCount}/{ts[4].length}</span>}
            <button onClick={() => { if (!crDone) { setCrLog(l => ({ ...l, [td]: true })); addXp(XP.creatine); } }} className={`b sm ${crDone ? "bs" : "bg"}`} style={{ opacity: crDone ? .5 : 1, fontSize: ".7rem" }}>{crDone ? "✓ Creatine" : "💊 Creatine"}</button>
          </div>
        </div>
        {ts[4].length > 0 && ts[4].map((e, i) => {
          const done = !!woChecks[i];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: done ? "#00ffc808" : "#0a0a14", borderRadius: 6, border: `1px solid ${done ? "#00ffc822" : "#1a1a2e"}`, marginBottom: 3, cursor: "pointer" }} onClick={() => toggleEx(i)}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? "#00ffc8" : "#2a2a4e"}`, background: done ? "#00ffc8" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".5rem", color: "#080810", flexShrink: 0 }}>{done && "✓"}</div>
              <span style={{ fontSize: ".75rem", color: done ? "#ffffff44" : "#ffffffaa", textDecoration: done ? "line-through" : "none" }}>{e}</span>
            </div>
          );
        })}
        {ts[2] === "rest" && <p style={{ color: "#ffffff33", fontSize: ".8rem" }}>Recovery day. Rest up, king.</p>}
      </div>

      {/* PRs */}
      <div className="c" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Personal Records</h2>
          <button className="b sm bs" onClick={() => setShowPR(!showPR)}>+ PR</button>
        </div>
        {showPR && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input className="inp" placeholder="Exercise" value={prF.exercise} onChange={e => setPrF(f => ({ ...f, exercise: e.target.value }))} style={{ flex: 2, minWidth: 120 }} />
            <input className="inp" placeholder="Weight" value={prF.weight} onChange={e => setPrF(f => ({ ...f, weight: e.target.value }))} style={{ flex: 1, minWidth: 70 }} />
            <input className="inp" placeholder="Reps" value={prF.reps} onChange={e => setPrF(f => ({ ...f, reps: e.target.value }))} style={{ flex: 1, minWidth: 50 }} />
            <button className="b sm bp" onClick={() => { if (prF.exercise.trim()) { setPrs(p => [{ id: uid(), ...prF, date: todayStr() }, ...p]); setPrF({ exercise: "", weight: "", reps: "" }); setShowPR(false); addXp(XP.pr); } }}>Save</button>
          </div>
        )}
        {prs.length === 0 && <p style={{ color: "#ffffff22", fontSize: ".7rem", textAlign: "center", padding: 10 }}>No PRs yet</p>}
        {prs.map(pr => (
          <div key={pr.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "#0a0a14", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 4 }}>
            <span style={{ fontSize: ".8rem", fontWeight: 600 }}>{pr.exercise}</span>
            <span style={{ fontSize: ".75rem", color: "#ffd700" }}>{pr.weight}{pr.weight && pr.reps ? " × " : ""}{pr.reps}{pr.reps ? " reps" : ""}</span>
          </div>
        ))}
      </div>

      {/* Log form */}
      {sf && (
        <div className="c" style={{ marginBottom: 14 }}>
          <input className="inp" placeholder="Workout name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ marginBottom: 8 }} />
          <input className="inp" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ marginBottom: 8 }} />
          <textarea className="inp" rows={4} placeholder="Exercises (one per line)" value={form.exercises} onChange={e => setForm(f => ({ ...f, exercises: e.target.value }))} style={{ marginBottom: 8 }} />
          <textarea className="inp" rows={2} placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="b bp" onClick={() => { if (form.name.trim()) { setWorkouts(w => [{ id: uid(), ...form }, ...w]); setForm({ name: "", exercises: "", notes: "", date: todayStr() }); setSf(false); addXp(XP.workoutLog); } }}>Save</button>
            <button className="b bs" onClick={() => setSf(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* History */}
      {workouts.map(w => (
        <div key={w.id} className="c" style={{ cursor: "pointer", padding: "10px 14px", marginBottom: 6 }} onClick={() => setVw(w.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><h3 style={{ fontSize: ".82rem", fontWeight: 700 }}>{w.name}</h3><p style={{ fontSize: ".6rem", color: "#ffffff44" }}>{w.exercises.split("\n").filter(Boolean).length} exercises</p></div>
            <span style={{ fontSize: ".6rem", color: "#ffffff33" }}>{w.date}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══ WAR ROOM ═══ */
function WarRoom({ addXp, mNotes, setMNotes, chLog, setChLog, td }) {
  const [qi, setQi] = useState(Math.floor(Math.random() * QUOTES.length));
  const [nn, setNn] = useState("");
  const q = QUOTES[qi];
  const ch = CHALLENGES[dayOfYear() % CHALLENGES.length];
  const cd = !!chLog[td];

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>War Room</h1><p style={{ color: "#ffffff44", fontSize: ".8rem" }}>Forge your mindset</p></div>

      <div className="c" style={{ marginBottom: 14, background: "linear-gradient(135deg,#141428,#1a0a2e)", borderColor: "#7b61ff33", textAlign: "center", padding: 28 }}>
        <p style={{ fontSize: "1.2rem", fontWeight: 300, fontStyle: "italic", color: "#ffffffdd", lineHeight: 1.6, marginBottom: 12, maxWidth: 600, margin: "0 auto 12px" }}>"{q[0]}"</p>
        <p style={{ fontSize: ".8rem", color: "#7b61ff" }}>— {q[1]}</p>
        <button className="b sm bg" onClick={() => setQi(i => (i + 1) % QUOTES.length)} style={{ marginTop: 16 }}>Next Quote →</button>
      </div>

      <div className="c" style={{ marginBottom: 14, background: "linear-gradient(135deg,#ffd70008,#ff6b3508)", borderColor: "#ffd70015", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: ".5rem", color: "#ffd700", textTransform: "uppercase", letterSpacing: "2px", fontWeight: 600 }}>Daily Challenge</div>
            <div style={{ fontSize: ".85rem", fontWeight: 600, marginTop: 4, color: cd ? "#ffffff44" : "#e0e0e8", textDecoration: cd ? "line-through" : "none" }}>{ch}</div>
          </div>
          <button onClick={() => { if (!cd) { setChLog(l => ({ ...l, [td]: true })); addXp(XP.challenge); } }} className={`b sm ${cd ? "bs" : "bp"}`} style={{ opacity: cd ? .5 : 1 }}>{cd ? "✓" : "Complete"}</button>
        </div>
      </div>

      <div className="c" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 12 }}>Quote Library ({QUOTES.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 8, maxHeight: 350, overflow: "auto" }}>
          {QUOTES.map((q, i) => (
            <div key={i} style={{ padding: 10, background: "#0a0a14", borderRadius: 10, border: "1px solid #1a1a2e" }}>
              <p style={{ fontSize: ".72rem", fontStyle: "italic", color: "#ffffffaa", lineHeight: 1.5, marginBottom: 4 }}>"{q[0]}"</p>
              <p style={{ fontSize: ".6rem", color: "#ffffff44" }}>— {q[1]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="c">
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>Mindset Notes</h2>
        <p style={{ fontSize: ".6rem", color: "#ffffff33", marginBottom: 12 }}>Log realizations, lessons learned</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="inp" placeholder="What clicked today?" value={nn} onChange={e => setNn(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && nn.trim()) { setMNotes(n => [{ id: uid(), text: nn.trim(), date: todayStr() }, ...n]); setNn(""); addXp(XP.mindset); } }} />
          <button className="b bp" onClick={() => { if (nn.trim()) { setMNotes(n => [{ id: uid(), text: nn.trim(), date: todayStr() }, ...n]); setNn(""); addXp(XP.mindset); } }}>Add</button>
        </div>
        {mNotes.length === 0 && <p style={{ color: "#ffffff22", fontSize: ".7rem", textAlign: "center", padding: 14 }}>No notes yet</p>}
        {mNotes.map(n => (
          <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "#0a0a14", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 5 }}>
            <span style={{ color: "#ff6b35" }}>💭</span>
            <div style={{ flex: 1 }}><p style={{ fontSize: ".78rem", color: "#ffffffcc" }}>{n.text}</p><p style={{ fontSize: ".5rem", color: "#ffffff33", marginTop: 4 }}>{n.date}</p></div>
            <button onClick={() => setMNotes(ns => ns.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer", fontSize: ".55rem" }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ BIBLE ═══ */
function BiblePage({ bibleLog, setBibleLog, bibleNotes, setBibleNotes, addXp, td, passLog, setPassLog, prayers, setPrayers, favs, setFavs }) {
  const [tab, setTab] = useState("today");
  const [nf, setNf] = useState({ verse: "", content: "" });
  const [snf, setSnf] = useState(false);
  const [np, setNp] = useState("");
  const dv = VERSES[dayOfYear() % VERSES.length];
  const dp = PASSAGES[dayOfYear() % PASSAGES.length];
  const rt = !!bibleLog[td];
  const pt = !!passLog[td];
  const rd = Object.keys(bibleLog).filter(k => bibleLog[k]).length;
  const isF = (ref) => favs.some(v => v[0] === ref);
  const togF = (v) => { if (isF(v[0])) setFavs(f => f.filter(x => x[0] !== v[0])); else { setFavs(f => [...f, v]); addXp(XP.fav); } };

  const tabs = [["today", "✝️ Today"], ["passage", "📜 Passage"], ["verses", "📖 Verses"], ["favorites", "⭐ Saved"], ["notes", "📝 Notes"], ["prayers", "🙏 Prayers"]];

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Bible</h1></div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 8, marginBottom: 14 }}>
        {[["📖", "Read", rd, "#ffd700"], ["📝", "Notes", bibleNotes.length, "#7b61ff"], ["🙏", "Prayers", prayers.length, "#00ffc8"], ["⭐", "Saved", favs.length, "#ffd700"]].map(([ic, l, v, c], i) => (
          <div key={i} className="c" style={{ textAlign: "center", padding: 10 }}>
            <div style={{ fontSize: ".85rem" }}>{ic}</div>
            <div style={{ fontSize: "1rem", fontWeight: 900, color: c }}>{v}</div>
            <div style={{ fontSize: ".45rem", color: "#ffffff44", textTransform: "uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="b sm" style={{ background: tab === k ? "#00ffc815" : "#0f0f1a", color: tab === k ? "#00ffc8" : "#ffffff44", border: tab === k ? "1px solid #00ffc833" : "1px solid #1a1a2e", fontSize: ".68rem" }}>{l}</button>
        ))}
      </div>

      {tab === "today" && (
        <div className="c" style={{ background: "linear-gradient(135deg,#0f0f1a,#0a1420)", borderColor: "#ffd70022", textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: ".55rem", color: "#ffd700", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 14, fontWeight: 600 }}>Today's Verse</div>
          <p style={{ fontSize: "1.05rem", fontStyle: "italic", color: "#ffffffdd", lineHeight: 1.7, maxWidth: 500, margin: "0 auto 10px" }}>"{dv[1]}"</p>
          <p style={{ fontSize: ".82rem", color: "#ffd700", fontWeight: 600, marginBottom: 16 }}>— {dv[0]}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className={`b ${rt ? "bs" : "bp"}`} onClick={() => { if (!rt) { setBibleLog(l => ({ ...l, [td]: true })); addXp(XP.bible); } }} style={{ opacity: rt ? .5 : 1 }}>{rt ? "✓ Read" : "Mark Read"}</button>
            <button className={`b ${isF(dv[0]) ? "bg" : "bs"}`} onClick={() => togF(dv)}>{isF(dv[0]) ? "⭐" : "☆ Save"}</button>
          </div>
        </div>
      )}

      {tab === "passage" && (
        <div className="c" style={{ background: "linear-gradient(135deg,#0f0f1a,#0a1420)", borderColor: "#ffd70022", padding: 24 }}>
          <div style={{ fontSize: ".55rem", color: "#ffd700", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 8, fontWeight: 600 }}>Today's Passage</div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: 4 }}>{dp[0]}</h2>
          <p style={{ fontSize: ".78rem", color: "#ffd700", marginBottom: 14 }}>{dp[1]}</p>
          <p style={{ fontSize: ".88rem", color: "#ffffffcc", lineHeight: 1.7, marginBottom: 18 }}>{dp[2]}</p>
          <button className={`b ${pt ? "bs" : "bp"}`} onClick={() => { if (!pt) { setPassLog(l => ({ ...l, [td]: true })); addXp(XP.passage); } }} style={{ opacity: pt ? .5 : 1 }}>{pt ? "✓ Read" : "Mark Read"}</button>
        </div>
      )}

      {tab === "verses" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 8 }}>
          {VERSES.map((v, i) => (
            <div key={i} className="c" style={{ padding: 12 }}>
              <p style={{ fontSize: ".72rem", fontStyle: "italic", color: "#ffffffaa", lineHeight: 1.5, marginBottom: 4 }}>"{v[1]}"</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: ".65rem", color: "#ffd700", fontWeight: 600 }}>{v[0]}</p>
                <button onClick={() => togF(v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".8rem" }}>{isF(v[0]) ? "⭐" : "☆"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "favorites" && (
        <div>
          {favs.length === 0 && <p style={{ color: "#ffffff22", textAlign: "center", padding: 40 }}>No favorites yet</p>}
          {favs.map((v, i) => (
            <div key={i} className="c" style={{ padding: 12, marginBottom: 8 }}>
              <p style={{ fontSize: ".78rem", fontStyle: "italic", color: "#ffffffcc", lineHeight: 1.5, marginBottom: 4 }}>"{v[1]}"</p>
              <p style={{ fontSize: ".68rem", color: "#ffd700", fontWeight: 600 }}>{v[0]}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div>
          <button className="b sm bp" onClick={() => setSnf(!snf)} style={{ marginBottom: 12 }}>+ Note</button>
          {snf && (
            <div className="c" style={{ marginBottom: 12 }}>
              <input className="inp" placeholder="Verse reference" value={nf.verse} onChange={e => setNf(f => ({ ...f, verse: e.target.value }))} style={{ marginBottom: 8 }} />
              <textarea className="inp" rows={4} placeholder="Reflection..." value={nf.content} onChange={e => setNf(f => ({ ...f, content: e.target.value }))} style={{ marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="b bp" onClick={() => { if (nf.content.trim()) { setBibleNotes(n => [{ id: uid(), ...nf, date: td }, ...n]); setNf({ verse: "", content: "" }); setSnf(false); addXp(XP.note); } }}>Save</button>
                <button className="b bs" onClick={() => setSnf(false)}>Cancel</button>
              </div>
            </div>
          )}
          {bibleNotes.length === 0 && <p style={{ color: "#ffffff22", textAlign: "center", padding: 40 }}>No notes yet</p>}
          {bibleNotes.map(n => (
            <div key={n.id} className="c" style={{ padding: 12, marginBottom: 6, position: "relative" }}>
              {n.verse && <span className="tag" style={{ marginBottom: 6, display: "inline-block" }}>{n.verse}</span>}
              <p style={{ fontSize: ".8rem", color: "#ffffffcc", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.content}</p>
              <p style={{ fontSize: ".5rem", color: "#ffffff33", marginTop: 6 }}>{n.date}</p>
              <button onClick={() => setBibleNotes(ns => ns.filter(x => x.id !== n.id))} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "#ff475722", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {tab === "prayers" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input className="inp" placeholder="Prayer request..." value={np} onChange={e => setNp(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && np.trim()) { setPrayers(p => [{ id: uid(), text: np.trim(), answered: false, date: td }, ...p]); setNp(""); addXp(XP.prayer); } }} />
            <button className="b bp" onClick={() => { if (np.trim()) { setPrayers(p => [{ id: uid(), text: np.trim(), answered: false, date: td }, ...p]); setNp(""); addXp(XP.prayer); } }}>Add</button>
          </div>
          {prayers.length === 0 && <p style={{ color: "#ffffff22", textAlign: "center", padding: 40 }}>No prayers yet</p>}
          {prayers.map(p => (
            <div key={p.id} className="c" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, opacity: p.answered ? .5 : 1 }}>
              <button onClick={() => setPrayers(ps => ps.map(x => x.id === p.id ? { ...x, answered: !x.answered } : x))} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${p.answered ? "#ffd700" : "#2a2a4e"}`, background: p.answered ? "#ffd700" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".55rem", color: "#080810", flexShrink: 0 }}>{p.answered && "✓"}</button>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: ".8rem", color: p.answered ? "#ffffff44" : "#ffffffcc", textDecoration: p.answered ? "line-through" : "none" }}>{p.text}</p>
                <p style={{ fontSize: ".5rem", color: "#ffffff33" }}>{p.date}{p.answered ? " — Answered 🙏" : ""}</p>
              </div>
              <button onClick={() => setPrayers(ps => ps.filter(x => x.id !== p.id))} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ GOALS ═══ */
function GoalsPage({ goals, setGoals, addXp }) {
  const [sf, setSf] = useState(false);
  const [form, setForm] = useState({ title: "", desc: "", deadline: "", cat: "personal" });
  const cats = ["personal", "fitness", "career", "financial", "spiritual", "social"];
  const active = goals.filter(g => !g.done);
  const done = goals.filter(g => g.done);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Goals</h1>
        <button className="b bp" onClick={() => setSf(!sf)}>+ Goal</button>
      </div>

      {sf && (
        <div className="c" style={{ marginBottom: 14 }}>
          <input className="inp" placeholder="Goal" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ marginBottom: 8 }} />
          <textarea className="inp" rows={2} placeholder="Why this matters" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="inp" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            <select className="inp" value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}>
              {cats.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="b bp" onClick={() => { if (form.title.trim()) { setGoals(g => [{ id: uid(), ...form, done: false, date: todayStr() }, ...g]); setForm({ title: "", desc: "", deadline: "", cat: "personal" }); setSf(false); } }}>Save</button>
            <button className="b bs" onClick={() => setSf(false)}>Cancel</button>
          </div>
        </div>
      )}

      {active.map(g => (
        <div key={g.id} className="c" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 14, marginBottom: 8 }}>
          <button onClick={() => { addXp(XP.goal); setGoals(gs => gs.map(x => x.id === g.id ? { ...x, done: true } : x)); }} style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid #ffd70066", background: "transparent", cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}><span className="tag">{g.cat}</span>{g.deadline && <span style={{ fontSize: ".5rem", color: "#ffffff33" }}>Due {g.deadline}</span>}</div>
            <h3 style={{ fontSize: ".85rem", fontWeight: 700 }}>{g.title}</h3>
            {g.desc && <p style={{ fontSize: ".68rem", color: "#ffffff55", marginTop: 4 }}>{g.desc}</p>}
          </div>
          <button onClick={() => setGoals(gs => gs.filter(x => x.id !== g.id))} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer" }}>✕</button>
        </div>
      ))}

      {done.length > 0 && (
        <div>
          <div style={{ fontSize: ".55rem", color: "#ffffff44", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 8, marginTop: 16, fontWeight: 600 }}>Completed ({done.length})</div>
          {done.map(g => (
            <div key={g.id} className="c" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 6, opacity: .5 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid #00ffc8", background: "#00ffc8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".5rem", color: "#080810" }}>✓</div>
              <span style={{ flex: 1, fontSize: ".8rem", textDecoration: "line-through", color: "#ffffff44" }}>{g.title}</span>
              <button onClick={() => setGoals(gs => gs.filter(x => x.id !== g.id))} style={{ background: "none", border: "none", color: "#ff475722", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {goals.length === 0 && <p style={{ color: "#ffffff22", textAlign: "center", padding: 40 }}>No goals yet</p>}
    </div>
  );
}

/* ═══ REWARDS ═══ */
function RewardsPage({ profile, lp, title, stats }) {
  const ua = ACHS.filter(a => a[4](profile, stats));

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#e0e0e8,#ffffff55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Rewards & Level</h1></div>

      {/* Hero */}
      <div className="c" style={{ marginBottom: 20, textAlign: "center", padding: 28, background: "linear-gradient(135deg,#141428,#1a0a2e)", borderColor: "#ffd70033" }}>
        <div style={{ fontSize: "3.5rem", marginBottom: 4 }}>{title.icon}</div>
        <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#ffd700" }}>{title.name}</div>
        <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "#ffd700", textShadow: "0 0 40px #ffd70044", margin: "6px 0" }}>Level {lp.level}</div>
        <div style={{ maxWidth: 280, margin: "0 auto" }}>
          <div style={{ width: "100%", height: 8, background: "#1a1a2e", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ width: `${(lp.cur / lp.need) * 100}%`, height: "100%", background: "linear-gradient(90deg,#ffd700,#ff6b35)", borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".65rem", color: "#ffffff44" }}><span>{lp.cur}/{lp.need} XP</span><span>{lp.total} total</span></div>
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
          {[["XP", profile.xp.toLocaleString(), "#00ffc8"], ["Streak", `${profile.streakDays}d`, "#ff6b35"], ["Achievements", `${ua.length}/${ACHS.length}`, "#7b61ff"]].map(([l, v, c], i) => (
            <div key={i}><div style={{ fontSize: "1.1rem", fontWeight: 900, color: c }}>{v}</div><div style={{ fontSize: ".5rem", color: "#ffffff44", textTransform: "uppercase" }}>{l}</div></div>
          ))}
        </div>
      </div>

      {/* Titles */}
      <div className="c" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 10 }}>Title Progression</h2>
        {TITLES.map((t, i) => {
          const u = lp.level >= t[0];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: u ? "#ffd70008" : "#0a0a14", borderRadius: 8, border: `1px solid ${u ? "#ffd70022" : "#1a1a2e"}`, opacity: u ? 1 : .35, marginBottom: 5 }}>
              <span style={{ fontSize: "1rem" }}>{t[2]}</span>
              <span style={{ fontSize: ".8rem", fontWeight: u ? 700 : 400, color: u ? "#ffd700" : "#ffffff44" }}>{t[1]}</span>
              <span style={{ marginLeft: "auto", fontSize: ".6rem", color: "#ffffff33" }}>Lv{t[0]}</span>
              {u && <span style={{ fontSize: ".55rem", color: "#00ffc8" }}>✓</span>}
            </div>
          );
        })}
      </div>

      {/* Rewards */}
      <div className="c" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 10 }}>Rewards</h2>
        {REWARDS.map((r, i) => {
          const u = lp.level >= r[0];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: u ? "#00ffc808" : "#0a0a14", borderRadius: 8, border: `1px solid ${u ? "#00ffc822" : "#1a1a2e"}`, opacity: u ? 1 : .35, marginBottom: 5 }}>
              <span style={{ fontSize: "1.1rem" }}>{r[2]}</span>
              <div style={{ flex: 1 }}><p style={{ fontSize: ".78rem", fontWeight: 600, color: u ? "#e0e0e8" : "#ffffff44" }}>{r[1]}</p><p style={{ fontSize: ".5rem", color: u ? "#00ffc8" : "#ffffff33" }}>Level {r[0]}</p></div>
              {u ? <span style={{ color: "#00ffc8", fontSize: ".65rem" }}>✓</span> : <span style={{ fontSize: ".55rem", color: "#ffffff22" }}>🔒</span>}
            </div>
          );
        })}
      </div>

      {/* Achievements */}
      <div className="c">
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 10 }}>Achievements ({ua.length}/{ACHS.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
          {ACHS.map((a, i) => {
            const u = a[4](profile, stats);
            return (
              <div key={i} style={{ padding: 10, background: u ? "#ffd70008" : "#0a0a14", borderRadius: 10, border: `1px solid ${u ? "#ffd70022" : "#1a1a2e"}`, opacity: u ? 1 : .3, textAlign: "center" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 2 }}>{a[3]}</div>
                <div style={{ fontSize: ".72rem", fontWeight: 700, color: u ? "#ffd700" : "#ffffff44" }}>{a[1]}</div>
                <div style={{ fontSize: ".55rem", color: "#ffffff33", marginTop: 2 }}>{a[2]}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
