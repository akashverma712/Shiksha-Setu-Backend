// models/Admin.js
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  department: { type: String, required: true },
  role: { type: String, enum: ['Admin'], default: 'Admin' }
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);
