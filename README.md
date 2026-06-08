# Shiksha-Setu Backend

> **AI-powered college management system** with dropout risk prediction, attendance tracking, academic records, and real-time notifications.

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![XGBoost](https://img.shields.io/badge/ML-XGBoost-FF6600)](https://xgboost.readthedocs.io)
[![License](https://img.shields.io/badge/License-ISC-blue)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [API Reference](#api-reference)
- [ML Prediction System](#ml-prediction-system)
- [Authentication Flow](#authentication-flow)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Known Issues & Roadmap](#known-issues--roadmap)
- [Contributing](#contributing)

---

## Overview

Shiksha-Setu is a **dual-service backend** designed for higher education institutions to:

- Manage students, teachers, and admins with role-based access control
- Track per-subject attendance in real time with MongoDB transactions
- Upload semester marks and auto-calculate CGPA/SGPA
- **Predict student dropout risk** using an XGBoost ML model combined with rule-based scoring
- Send OTP-based login emails and SMS alerts via Twilio

The system consists of:
| Service | Runtime | Port |
|---------|---------|------|
| **Main API** | Node.js + Express | `5000` |
| **ML Prediction API** | Python + FastAPI | `8000` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client / Frontend                     │
└────────────────┬───────────────────────┬────────────────────┘
                 │ REST (JWT)             │ REST
                 ▼                        ▼
    ┌────────────────────┐   ┌────────────────────────┐
    │  Node.js API       │   │  FastAPI ML Service    │
    │  Express 5.x       │   │  Python 3.10+          │
    │  Port: 5000        │   │  Port: 8000            │
    │                    │   │                        │
    │  ├ /api/auth       │   │  ├ POST /predict       │
    │  ├ /api/students   │   │  └ POST /predict/batch │
    │  ├ /api/teachers   │   │                        │
    │  ├ /api/attendance │   │  XGBoost + Rule Engine │
    │  └ /api/marks      │   │  Calibrated (sigmoid)  │
    └─────────┬──────────┘   └───────────┬────────────┘
              │                           │
              ▼                           ▼
    ┌─────────────────────────────────────────────────┐
    │              MongoDB Atlas                      │
    │                                                 │
    │  collections: students · teachers · admins      │
    │               attendance · otps · timetables    │
    │               predictions                       │
    └─────────────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │  External Services │
    │  ├ Gmail (OTP)     │
    │  └ Twilio (SMS)    │
    └───────────────────┘
```

---

## Tech Stack

### Node.js Service

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 5.x |
| ODM | Mongoose 9 |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Email | Nodemailer (Gmail SMTP) |
| SMS | Twilio REST SDK |
| Config | `dotenv` |
| Dev | `nodemon` |

### Python ML Service

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI + Uvicorn |
| ML | XGBoost + scikit-learn (`CalibratedClassifierCV`) |
| Data | pandas, joblib |
| DB | pymongo |
| Validation | pydantic |

---

## Features

### Role-Based Access Control

Three roles with strict middleware enforcement:

| Role | Capabilities |
|------|-------------|
| `Admin` | Register teachers & students, view all data |
| `Teacher` / `HOD` | Upload marks & attendance, view students, assign mentors, send SMS |
| `student` | View own marks, attendance history, mentor info |

### Attendance System

- **Bulk upload** — teachers submit an array of `{studentId, status, subjectCode, date}` in a single request
- **Atomic transactions** — uses MongoDB sessions to guarantee `Student` counter updates and `Attendance` document inserts either both succeed or both roll back
- **Per-subject deduplication** — partial unique index prevents double-marking for the same student + date + subject
- **Rich history** — students can query their attendance grouped by date with subject-level breakdown and a monthly trend for charting

### Academics & Grading

- Semester-wise marks upload via `rollNo` (no ObjectId required)
- Automatic SGPA calculation: `Σ(gradePoints × credits) / Σ(credits)`
- Idempotent — re-uploading a semester replaces the previous record
- Grade scale: O(10) · A+(9) · A(8) · B+(7) · B(6) · C(5) · F(0) · Ab(0)

### Student Risk Dashboard

Each student carries live-computed risk fields:

```
riskScore    → 0-100 composite score
riskLevel    → Low | Medium | High | Critical
isAtRisk     → boolean flag
cgpa         → running CGPA across all semesters
currentBacklogs → count of active F/Ab grades
```

### OTP Authentication (Students)

Students log in passwordlessly:
1. `POST /api/auth/student/send-otp` → 6-digit OTP emailed (valid 10 min, TTL index auto-cleans)
2. `POST /api/auth/student/verify-otp` → validates and returns JWT

### Dropout Prediction (ML Service)

See [ML Prediction System](#ml-prediction-system) for full details.

---

## Project Structure

```
Shiksha-Setu-Backend/
│
├── server.js                   # Express app entry point
├── start.js                    # Minimal debug server (dev only)
├── package.json
│
├── config/
│   └── db.js                   # Mongoose connection
│
├── models/
│   ├── Admin.js                # Singleton admin schema
│   ├── Teacher.js              # Staff with subjects & permissions
│   ├── Student.js              # Rich schema: academics, risk, warnings
│   ├── Attendance.js           # Per-subject attendance records
│   ├── Otp.js                  # TTL-indexed OTP store
│   └── Timetable.js            # Teacher schedule
│
├── controllers/
│   ├── authController.js       # Register/login for all roles
│   └── attendanceController.js # Assignment CRUD (⚠ see Known Issues)
│
├── middleware/
│   └── auth.js                 # JWT protect + role authorize
│
├── routes/
│   ├── auth.js                 # /api/auth/*
│   ├── student.js              # /api/students/*
│   ├── teacher.js              # /api/teachers/*
│   ├── attendance.js           # /api/attendance/*
│   ├── marks.js                # /api/marks/*
│   └── getMyMentor.js          # Mentor lookup (⚠ not wired to server)
│
├── utils/
│   ├── gradePoints.js          # Grade → GPA points map
│   ├── sendEmail.js            # Nodemailer wrapper
│   └── sendSMS.js              # Twilio wrapper
│
└── ML model/
    ├── main.py                 # FastAPI service
    ├── trainmodel.py           # XGBoost training script
    ├── model_utils2.py         # Rule-based risk scoring
    └── dropout_model_xgb.pkl   # Trained model artifact (not in repo)
```

---

## Data Models

### Student

```js
{
  name, email, rollNo,          // Core identity
  department, program, batch,   // Academic placement
  semester, section,

  // Attendance counters (denormalized for speed)
  totalClasses, attendedClasses,
  presentCount, lateCount, absentCount,
  attendancePercentage,

  // Academics
  academics: [{
    semester,
    subjects: [{ subjectName, subjectCode, credits, grade, gradePoints, marks }],
    sgpa, totalCredits, earnedCredits, backlogsThisSem
  }],

  // Risk profile
  cgpa, currentBacklogs, totalBacklogsEver,
  riskScore, riskLevel,         // Low | Medium | High | Critical
  isAtRisk, feePending,

  // People
  mentor: { name, phone },
  warnings: [{ reason, givenBy, date }],
  registeredBy                  // Admin ObjectId ref
}
```

### Teacher

```js
{
  employeeId, name, email, password,
  department, designation, role,   // Teacher | HOD
  phone, profileImage,

  subjects: [{
    subjectCode, subjectName,
    semester, section, batch, program,
    totalStudents
  }],

  canUploadMarks, canTakeAttendance, isActive,
  atRiskStudentsCount,
  lastLogin, loginCount,
  registeredBy
}
```

### Attendance

```js
{
  student,      // ref Student
  date,         // normalized to midnight via pre-save hook
  status,       // present | absent | late
  subjectCode,
  subjectName,
  createdBy     // ref Teacher
}
// Unique index: { student, date, subjectCode } where subjectCode exists
```

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/admin/register` | Public | Create first admin (one-time only) |
| `POST` | `/admin/login` | Public | Admin login → JWT |
| `POST` | `/teacher/login` | Public | Teacher login → JWT |
| `POST` | `/student/send-otp` | Public | Email OTP to student |
| `POST` | `/student/verify-otp` | Public | Verify OTP → JWT |
| `POST` | `/teacher/register` | Admin | Register a new teacher |
| `POST` | `/student/register` | Admin | Register a new student |

**Admin login request:**
```json
{ "employeeId": "ADM001", "password": "secret" }
```

**Student OTP flow:**
```json
// Step 1
POST /api/auth/student/send-otp
{ "email": "student@college.edu" }

// Step 2
POST /api/auth/student/verify-otp
{ "email": "student@college.edu", "code": "482931" }
// → { "token": "eyJ...", "user": { ... } }
```

---

### Students — `/api/students`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/all` | Teacher/Admin/HOD | Paginated list with search |
| `GET` | `/me` | student | Own profile |
| `GET` | `/class` | Any auth | Filter by `?semester=5&section=A&department=CS` |
| `GET` | `/risk` | Teacher/Admin | At-risk students sorted by riskScore |
| `PATCH` | `/:id/attendance` | Teacher | Increment attendance counters |
| `PATCH` | `/:id/warning` | Teacher | Add warning or set risk flag |

**Query params for `/all`:**
```
?page=1&limit=20&search=arjun
```

---

### Attendance — `/api/attendance`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload` | Teacher/HOD | Bulk attendance upload (array) |
| `GET` | `/my-history` | student | Own attendance history |

**Bulk upload request:**
```json
[
  {
    "studentId": "64a1f2...",
    "status": "present",
    "subjectCode": "CS301",
    "subjectName": "Data Structures",
    "date": "2025-03-15"
  },
  {
    "studentId": "64a1f3...",
    "status": "absent",
    "subjectCode": "CS301",
    "subjectName": "Data Structures"
  }
]
```

**My-history response shape:**
```json
{
  "summary": {
    "overall": { "attendedClasses": 42, "totalClasses": 50, "attendancePercentage": 84 }
  },
  "monthlyTrend": [{ "month": "2025-01", "percentage": 88 }],
  "dailyHistory": [
    {
      "date": "2025-03-15",
      "total": 3,
      "present": 2,
      "absent": 1,
      "subjects": [...]
    }
  ]
}
```

---

### Marks — `/api/marks`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload` | Teacher/HOD | Upload semester marks by `rollNo` |
| `GET` | `/me` | student | Own academic records |
| `GET` | `/:studentId` | Teacher/HOD/Admin | Any student's marks |

**Upload request:**
```json
{
  "rollNo": "22CS042",
  "semester": 5,
  "subjects": [
    { "subjectName": "Algorithms", "subjectCode": "CS401", "credits": 4, "grade": "A+", "marks": 87 },
    { "subjectName": "DBMS",       "subjectCode": "CS402", "credits": 3, "grade": "O",  "marks": 94 }
  ]
}
```

---

### Teachers — `/api/teachers`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/me` | Teacher | Dashboard: profile + stats + today's schedule |
| `GET` | `/my-students` | Teacher | All students across assigned classes |
| `GET` | `/students/:studentId` | Teacher/HOD/Admin | Detailed student profile |
| `PUT` | `/assign-mentor/:studentId` | Teacher | Assign mentor `{name, phone}` |
| `POST` | `/send-test-sms` | Teacher | Test Twilio SMS (demo only) |

---

## ML Prediction System

The Python FastAPI service exposes two endpoints for **dropout risk prediction**.

### How It Works

Risk is computed as a blend of two signals:

```
final_score = ((ml_probability + rule_score) / 2) × 100
```

**Rule engine** (`model_utils2.py`) — deterministic weighted scoring:

| Feature | Weight | Formula |
|---------|--------|---------|
| Attendance | 40% | 0 if ≥90%, 1 if ≤40%, linear between |
| CGPA | 35% | 0 if ≥8.0, 1 if ≤4.0, linear between |
| Fee default | 15% | 0→0.4→0.7→1.0 for 0/1/2/3+ months unpaid |
| CGPA drop | 5% | Per-semester CGPA decline (if available) |
| Backlogs | 5% | `min(backlogs / 4, 1)` |

**ML model** (`dropout_model_xgb.pkl`) — calibrated XGBoost:
- Features: `[attendance, avg_cgpa, fee_weight, rule_score]`
- Training labels: auto-generated (`rule_score ≥ 0.6 → dropout = 1`)
- Calibration: `CalibratedClassifierCV(cv=5, method="sigmoid")` for probability accuracy
- Class imbalance handled via `scale_pos_weight = neg / pos`

**Risk zones:**
```
≥ 65  →  🔴 Red Zone (high intervention needed)
25–64 →  🟡 Yellow Zone (monitor closely)
< 25  →  🟢 Green Zone (on track)
```

### Endpoints

**`POST /predict`** — accepts live MongoDB data as JSON:
```json
{
  "attendance": [
    { "student": "<ObjectId>", "status": "present", "date": "2025-03-01" }
  ],
  "marks": [
    { "rollNo": "22CS042", "semester": "5", "cgpa": 7.4 }
  ],
  "fees": [
    { "rollNo": "22CS042", "status": "pending", "outstanding_months": 2 }
  ]
}
```
Response:
```json
{ "predictions": { "22CS042": 52.3 }, "count": 1 }
```

**`POST /predict/batch`** — CSV upload (multipart form):
- `attendance_csv`: columns `student_id, attendance`
- `cgpa_csv`: columns `student_id, cgpa_sem1, cgpa_sem2, ...` or `student_id, avg_cgpa`
- `fees_csv`: columns `student_id, outstanding_months`

### Training Your Own Model

```bash
cd "ML model"
pip install -r requirements.txt   # xgboost scikit-learn pandas joblib
python trainmodel.py              # reads attendance.csv, cgpa.csv, fees.csv
# → saves dropout_model_xgb.pkl
```

---

## Authentication Flow

```
1. Admin registers (one-time, enforced by Admin.countDocuments() == 0)
2. Admin logs in → receives JWT (7d expiry by default)
3. Admin registers Teachers and Students (protected route)

4. Teacher logs in with employeeId + password → JWT
5. Student requests OTP → email sent → verifies OTP → JWT

All protected routes:
  Authorization: Bearer <token>

Middleware chain:
  protect()  →  decode JWT  →  lookup Admin | Teacher | Student
  authorize('Teacher', 'HOD')  →  check req.user.role
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# MongoDB
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/shiksha_db

# JWT
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRE=7d

# Gmail (for OTP emails)
EMAIL_USER=yourapp@gmail.com
EMAIL_PASS=your_app_password     # Use Gmail App Password, not account password

# Twilio (for SMS alerts)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+12186950036
ADMIN_NUMBER=+91XXXXXXXXXX

# Server
PORT=5000

# ML Service (Python)
DB_NAME=shiksha_db
COLLECTION_NAME=predictions
```

> **Note:** Never commit `.env` to version control. Add it to `.gitignore`.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB Atlas account (or local MongoDB 6+)

### Node.js API

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Production
npm start
```

### Python ML Service

```bash
cd "ML model"

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pymongo python-dotenv pandas joblib xgboost scikit-learn

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Health Check

```bash
curl http://localhost:5000/        # → "API Running"
curl http://localhost:8000/docs    # → FastAPI Swagger UI
```

---

## Known Issues & Roadmap

### Current Issues

| Issue | File | Severity |
|-------|------|----------|
| `attendanceController.js` contains Assignment/AssignmentSubmission logic but those models don't exist | `controllers/attendanceController.js` | 🔴 Runtime crash |
| `getMyMentor.js` not mounted in `server.js` | `routes/getMyMentor.js` | 🟡 Silently unreachable |
| `sendSMS` util signature is `(message)` but route calls `sendSMS(phone, message)` | `utils/sendSMS.js` | 🔴 Runtime error |
| `attendancePercentage` field stored but not auto-calculated (no pre-save hook) | `models/Student.js` | 🟡 Always 0 |
| Typo: `student.currentBackloads` in marks upload response | `routes/marks.js:L100` | 🟡 `undefined` in response |
| Hardcoded phone number in production code | `utils/sendSMS.js`, `routes/teacher.js` | 🟡 Clean before deploy |

### Roadmap

- [ ] Add `Assignment` and `AssignmentSubmission` models to complete the assignment flow
- [ ] Pre-save hook on `Student` to auto-compute `attendancePercentage`, `cgpa`, `currentBacklogs`, `riskScore`
- [ ] Mount `getMyMentor` route and fix `Student` import
- [ ] Fix `sendSMS` signature mismatch
- [ ] Rate limiting on OTP endpoint (prevent OTP flooding)
- [ ] Request validation middleware (Joi or Zod)
- [ ] Unit and integration tests (Jest + Supertest)
- [ ] Docker Compose for local full-stack development
- [ ] CI/CD pipeline (GitHub Actions)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/assignment-model`
3. Commit with conventional commits: `git commit -m "feat: add Assignment mongoose model"`
4. Push and open a Pull Request

Please fix any listed Known Issues before adding new features.

---


