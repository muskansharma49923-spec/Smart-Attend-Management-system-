require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "attendance.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    course TEXT NOT NULL,
    semester TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, attendance_date)
  );
`);

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
if (!db.prepare("SELECT id FROM users WHERE username = ?").get(adminUsername)) {
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(adminUsername, bcrypt.hashSync(adminPassword, 12));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "attendance.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 *  60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}
function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
function clean(value) { return typeof value === "string" ? value.trim() : ""; }

app.post("/api/login", (req, res) => {
  const username = clean(req.body.username);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.user = { id: user.id, username: user.username };
    res.json({ user: req.session.user });
  });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));

app.get("/api/dashboard", requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalStudents = db.prepare("SELECT COUNT(*) AS n FROM students").get().n;
  const todayCounts = db.prepare("SELECT status, COUNT(*) AS n FROM attendance WHERE attendance_date = ? GROUP BY status").all(today);
  const counts = { Present: 0, Absent: 0, Late: 0 };
  todayCounts.forEach(row => counts[row.status] = row.n);
  const marked = counts.Present + counts.Absent + counts.Late;
  res.json({ totalStudents, today, counts, marked, unmarked: Math.max(0, totalStudents - marked) });
});

app.get("/api/students", requireAuth, (req, res) => {
  const q = `%${clean(req.query.q || "")}%`;
  const rows = db.prepare(`SELECT s.*,
    (SELECT COUNT(*) FROM attendance a WHERE a.student_id=s.id AND a.status='Present') AS present_days,
    (SELECT COUNT(*) FROM attendance a WHERE a.student_id=s.id) AS marked_days
    FROM students s WHERE s.name LIKE ? OR s.roll_no LIKE ? OR s.course LIKE ?
    ORDER BY s.roll_no COLLATE NOCASE`).all(q, q, q);
  res.json(rows);
});
app.post("/api/students", requireAuth, (req, res) => {
  const s = {
    roll_no: clean(req.body.roll_no), name: clean(req.body.name),
    course: clean(req.body.course), semester: clean(req.body.semester),
    email: clean(req.body.email)
  };
  if (!s.roll_no || !s.name || !s.course || !s.semester) return res.status(400).json({ error: "Roll number, name, course and semester are required." });
  try {
    const result = db.prepare("INSERT INTO students (roll_no,name,course,semester,email) VALUES (@roll_no,@name,@course,@semester,@email)").run(s);
    res.status(201).json({ id: result.lastInsertRowid, ...s });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "That roll number already exists." });
    res.status(500).json({ error: "Could not save student." });
  }
});
app.put("/api/students/:id", requireAuth, (req, res) => {
  const s = {
    id: Number(req.params.id), roll_no: clean(req.body.roll_no), name: clean(req.body.name),
    course: clean(req.body.course), semester: clean(req.body.semester), email: clean(req.body.email)
  };
  if (!s.roll_no || !s.name || !s.course || !s.semester) return res.status(400).json({ error: "Roll number, name, course and semester are required." });
  try {
    const result = db.prepare("UPDATE students SET roll_no=@roll_no,name=@name,course=@course,semester=@semester,email=@email WHERE id=@id").run(s);
    if (!result.changes) return res.status(404).json({ error: "Student not found." });
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "That roll number already exists." });
    res.status(500).json({ error: "Could not update student." });
  }
});
app.delete("/api/students/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM students WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Student not found." });
  res.json({ ok: true });
});

app.get("/api/attendance", requireAuth, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) return res.status(400).json({ error: "Use a valid date in YYYY-MM-DD format." });
  const rows = db.prepare(`SELECT s.id,s.roll_no,s.name,s.course,s.semester,a.status
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=?
    ORDER BY s.roll_no COLLATE NOCASE`).all(date);
  res.json({ date, students: rows });
});
app.post("/api/attendance", requireAuth, (req, res) => {
  const date = req.body.date;
  const records = req.body.records;
  if (!validDate(date) || !Array.isArray(records)) return res.status(400).json({ error: "A valid date and attendance records are required." });
  const allowed = new Set(["Present", "Absent", "Late"]);
  const save = db.transaction(items => {
    for (const item of items) {
      const id = Number(item.student_id);
      if (!Number.isInteger(id) || !allowed.has(item.status)) throw new Error("Invalid attendance record.");
      db.prepare(`INSERT INTO attendance (student_id,attendance_date,status) VALUES (?,?,?)
        ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status`).run(id, date, item.status);
    }
  });
  try { save(records); res.json({ ok: true, saved: records.length }); }
  catch (e) { res.status(400).json({ error: e.message || "Could not save attendance." }); }
});
app.get("/api/reports", requireAuth, (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: "Choose a valid date range." });
  const rows = db.prepare(`SELECT s.id,s.roll_no,s.name,s.course,s.semester,
    SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN a.status='Absent' THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN a.status='Late' THEN 1 ELSE 0 END) AS late,
    COUNT(a.id) AS total
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date BETWEEN ? AND ?
    GROUP BY s.id ORDER BY s.roll_no COLLATE NOCASE`).all(from, to);
  res.json(rows.map(r => ({ ...r, percentage: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0 })));
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Attendance Management running at http://localhost:${PORT}`));
