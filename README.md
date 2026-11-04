# AttendEase — Attendance Management System

A college final-year project for managing student records, daily attendance and attendance reports. The frontend uses **HTML, CSS and vanilla JavaScript**. The backend is **Node.js + Express**, and records are stored in a local **SQLite** database.

## Features

- Admin login with password hashing and session-based authentication
- Dashboard with student and daily attendance totals
- Student management: add, edit, search and delete
- Daily attendance: Present, Absent, Late or Not marked
- Attendance can be edited for a previously selected date
- Date-range reports with attendance percentage
- Export reports as CSV
- SQLite database is created automatically on first run
- Responsive layout for desktop and mobile

## Requirements

- Node.js 18 or newer
- npm (included with Node.js)

## Run locally

1. Download and extract the ZIP.
2. Open a terminal in the extracted `attendance-management` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your environment file:

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and change `SESSION_SECRET` and the admin password.
6. Start the application:

   ```bash
   npm start
   ```

7. Open **http://localhost:3000** in your browser.

### First login

If you have not changed the environment values before the first run:

- Username: `admin`
- Password: `ChangeMe123!`

The first run creates the administrator and `data/attendance.db`. Changing `ADMIN_PASSWORD` after the admin account has already been created does not reset the existing password. To reset a local demo database, stop the server, back up any records you need, and delete `data/attendance.db`; the next start will create a fresh database and admin user.

## Development mode

```bash
npm run dev
```

Node's watch mode restarts the server when backend files change.

## GitHub setup

1. Create a new empty repository on GitHub.
2. Extract this ZIP and open a terminal in the project folder.
3. Run:

   ```bash
   git init
   git add .
   git commit -m "Initial attendance management project"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

4. Do **not** commit `.env`, `node_modules` or your live database. They are excluded by `.gitignore`.

## Deploying

This app needs a Node.js hosting service that supports persistent disk storage because SQLite writes to `data/attendance.db`. Configure the host to run `npm install` and `npm start`, set `NODE_ENV=production`, set a strong `SESSION_SECRET`, and set the admin credentials before the first deployment. Mount persistent storage at the project's `data/` directory. A static-only GitHub Pages deployment will **not** run this backend or SQLite database.

## Project structure

```text
attendance-management/
├── data/                 # SQLite database is created here at runtime
├── public/
│   ├── app.js             # Frontend logic and API calls
│   ├── index.html         # User interface
│   └── styles.css         # Responsive styling
├── .env.example           # Environment variable template
├── .gitignore
├── package.json
├── README.md
└── server.js              # Express API, auth and database setup
```

## Main API routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/login` | Sign in |
| POST | `/api/logout` | Sign out |
| GET | `/api/me` | Current session |
| GET | `/api/dashboard` | Dashboard statistics |
| GET/POST | `/api/students` | List and create students |
| PUT/DELETE | `/api/students/:id` | Update and delete a student |
| GET/POST | `/api/attendance` | Read and save attendance |
| GET | `/api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Attendance report |

## Database design

- `users`: administrator login credentials (bcrypt password hash)
- `students`: roll number, name, course, semester and email
- `attendance`: one status per student per date; a unique constraint prevents duplicate daily entries

## Notes for academic submission

This is a working educational starter project. Before production use, add CSRF protection, login rate limiting, a persistent session store, automated tests, database backups and HTTPS. For a college demonstration, add your institution name/logo and populate it with sample student records through the UI.
