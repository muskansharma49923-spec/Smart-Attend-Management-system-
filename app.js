const $ = (selector) => document.querySelector(selector);
const today = new Date().toISOString().slice(0, 10);
let reportRows = [];

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function showApp(user) {
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#sideUsername").textContent = user.username;
  $("#todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday:"short", day:"numeric", month:"short", year:"numeric" });
  $("#attendanceDate").value = today; $("#reportFrom").value = today.slice(0, 8) + "01"; $("#reportTo").value = today;
  navigate("dashboard");
}
function showLogin() { $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden"); }
function navigate(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  $(`#${page}Page`).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = { dashboard:["CAMPUS OVERVIEW","Good to see you"], students:["STUDENT DIRECTORY","Students"], attendance:["DAILY REGISTER","Attendance"], reports:["ANALYTICS & INSIGHTS","Reports"] };
  $("#pageEyebrow").textContent = titles[page][0]; $("#pageTitle").textContent = titles[page][1];
  if (page === "dashboard") loadDashboard();
  if (page === "students") loadStudents();
  if (page === "attendance") loadAttendance();
  if (page === "reports") loadReports();
}
document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.go)));

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#loginError").textContent = "";
  const form = new FormData(e.currentTarget);
  try { const result = await api("/api/login", { method:"POST", body:JSON.stringify(Object.fromEntries(form)) }); showApp(result.user); }
  catch (err) { $("#loginError").textContent = err.message; }
});
$("#logoutBtn").addEventListener("click", async () => { await api("/api/logout", { method:"POST" }); showLogin(); });
async function loadDashboard() {
  try {
    const d = await api("/api/dashboard");
    $("#totalStudents").textContent = d.totalStudents;
    $("#presentCount").textContent = d.counts.Present;
    $("#absentCount").textContent = d.counts.Absent;
    $("#unmarkedCount").textContent = d.unmarked;
  } catch (e) { toast(e.message); }
}
async function loadStudents() {
  try {
    const rows = await api(`/api/students?q=${encodeURIComponent($("#studentSearch").value)}`);
    $("#studentTotal").textContent = `${rows.length} student${rows.length === 1 ? "" : "s"}`;
    $("#studentsBody").innerHTML = rows.length ? rows.map(s => {
      const pct = s.marked_days ? Math.round(s.present_days / s.marked_days * 100) : 0;
      return `<tr><td><b>${escapeHtml(s.roll_no)}</b></td><td><div class="student-name"><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.email || "No email added")}</small></div></td><td>${escapeHtml(s.course)}</td><td>${escapeHtml(s.semester)}</td><td><span class="progress"><i style="width:${pct}%"></i></span>${pct}%</td><td><div class="row-actions"><button class="text-btn" data-edit="${s.id}">Edit</button><button class="text-btn delete-btn" data-delete="${s.id}">Delete</button></div></td></tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">No students found. Add your first student to get started.</td></tr>`;
    $("#studentsBody").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openStudent(rows.find(s => s.id == b.dataset.edit))));
    $("#studentsBody").querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deleteStudent(b.dataset.delete)));
  } catch (e) { toast(e.message); }
}
$("#studentSearch").addEventListener("input", loadStudents);
function openStudent(student = null) {
  const form = $("#studentForm"); form.reset(); $("#studentFormError").textContent = "";
  $("#modalTitle").textContent = student ? "Edit student" : "Add student";
  form.elements.id.value = student?.id || "";
  ["roll_no","name","course","semester","email"].forEach(k => form.elements[k].value = student?.[k] || "");
  $("#studentDialog").showModal();
}
$("#addStudentBtn").addEventListener("click", () => openStudent());
$("#closeModal").addEventListener("click", () => $("#studentDialog").close());
$("#cancelModal").addEventListener("click", () => $("#studentDialog").close());
$("#studentForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
  const id = data.id; delete data.id;
  try {
    await api(id ? `/api/students/${id}` : "/api/students", { method:id ? "PUT" : "POST", body:JSON.stringify(data) });
    $("#studentDialog").close(); toast(id ? "Student updated." : "Student added."); loadStudents(); loadDashboard();
  } catch (err) { $("#studentFormError").textContent = err.message; }
});
async function deleteStudent(id) {
  if (!confirm("Delete this student and their attendance records? This cannot be undone.")) return;
  try { await api(`/api/students/${id}`, { method:"DELETE" }); toast("Student deleted."); loadStudents(); loadDashboard(); }
  catch (e) { toast(e.message); }
}
async function loadAttendance() {
  try {
    const result = await api(`/api/attendance?date=${$("#attendanceDate").value}`);
    $("#attendanceBody").innerHTML = result.students.length ? result.students.map(s => `<tr data-student="${s.id}"><td><b>${escapeHtml(s.roll_no)}</b></td><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.course)}</td><td><select class="status-select" aria-label="Attendance status for ${escapeHtml(s.name)}"><option value="">Not marked</option><option ${s.status==="Present"?"selected":""}>Present</option><option ${s.status==="Absent"?"selected":""}>Absent</option><option ${s.status==="Late"?"selected":""}>Late</option></select></td></tr>`).join("") : `<tr><td colspan="4" class="empty">No students registered yet. Add students first.</td></tr>`;
    $("#attendanceBody").querySelectorAll("select").forEach(s => s.addEventListener("change", updateAttendanceCounts));
    updateAttendanceCounts();
  } catch (e) { toast(e.message); }
}
function updateAttendanceCounts() {
  const values = [...$("#attendanceBody").querySelectorAll("select")].map(s => s.value);
  $("#attPresent").textContent = values.filter(v => v==="Present").length;
  $("#attAbsent").textContent = values.filter(v => v==="Absent").length;
  $("#attLate").textContent = values.filter(v => v==="Late").length;
  $("#attUnmarked").textContent = values.filter(v => !v).length;
}
$("#attendanceDate").addEventListener("change", loadAttendance);
$("#saveAttendanceBtn").addEventListener("click", async () => {
  const rows = [...$("#attendanceBody").querySelectorAll("tr[data-student]")];
  const records = rows.filter(r => r.querySelector("select").value).map(r => ({ student_id:Number(r.dataset.student), status:r.querySelector("select").value }));
  try {
    const result = await api("/api/attendance", { method:"POST", body:JSON.stringify({ date:$("#attendanceDate").value, records }) });
    toast(`${result.saved} attendance record(s) saved.`); loadAttendance(); loadDashboard();
  } catch (e) { toast(e.message); }
});
async function loadReports() {
  try {
    reportRows = await api(`/api/reports?from=${$("#reportFrom").value}&to=${$("#reportTo").value}`);
    $("#reportsBody").innerHTML = reportRows.length ? reportRows.map(r => `<tr><td><b>${escapeHtml(r.roll_no)}</b></td><td><b>${escapeHtml(r.name)}</b></td><td>${r.present}</td><td>${r.absent}</td><td>${r.late}</td><td>${r.total}</td><td><span class="progress"><i style="width:${r.percentage}%"></i></span>${r.percentage}%</td></tr>`).join("") : `<tr><td colspan="7" class="empty">No student records found.</td></tr>`;
  } catch (e) { toast(e.message); }
}
$("#runReportBtn").addEventListener("click", loadReports);
$("#exportBtn").addEventListener("click", () => {
  const header = ["Roll No","Name","Course","Semester","Present","Absent","Late","Marked","Attendance %"];
  const rows = reportRows.map(r => [r.roll_no,r.name,r.course,r.semester,r.present,r.absent,r.late,r.total,r.percentage]);
  const csv = [header,...rows].map(row => row.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = "attendance-report.csv"; a.click(); URL.revokeObjectURL(url);
});
(async function init() {
  try { const result = await api("/api/me"); if (result.user) showApp(result.user); else showLogin(); }
  catch { showLogin(); }
})();
