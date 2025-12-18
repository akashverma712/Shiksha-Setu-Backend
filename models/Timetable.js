// models/Timetable.js
const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  day: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
  period: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },
  subjectCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  subjectName: {
    type: String,
    trim: true,
  },
  semester: {
    type: Number,
    required: true,
  },
  section: {
    type: String,
    required: true,
    uppercase: true,
  },
  batch: {
    type: String,
    trim: true,
  },
  time: {
    type: String, // e.g., "9:00 AM - 10:00 AM"
  },
  room: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for fast lookup
timetableSchema.index({ teacher: 1, day: 1 });
timetableSchema.index({ day: 1, semester: 1, section: 1 });
timetableSchema.index({ subjectCode: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);
