// models/Attendance.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late'],
      required: true,
    },
    subjectCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    subjectName: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// CRITICAL: Remove conflicting unique indexes — keep only ONE strategy

// STRATEGY 1: Per-subject attendance (COLLEGE STYLE - RECOMMENDED)
attendanceSchema.index(
  { student: 1, date: 1, subjectCode: 1 },
  {
    unique: true,
    partialFilterExpression: { subjectCode: { $exists: true, $ne: null } },
  }
);

// STRATEGY 2: Daily attendance (SCHOOL STYLE) — COMMENT OUT IF USING COLLEGE
// attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

// Useful compound indexes
attendanceSchema.index({ createdBy: 1, date: -1 }); // Teacher's history
attendanceSchema.index({ date: -1 });               // Daily reports
attendanceSchema.index({ student: 1, date: -1 });   // Student timeline

// Normalize date to midnight (removes time part)
attendanceSchema.pre('save', function (next) {
  if (this.date) {
    this.date.setHours(0, 0, 0, 0);
  }
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);
