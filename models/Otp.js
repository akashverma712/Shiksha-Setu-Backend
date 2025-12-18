const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, default: Date.now, expires: 600 } // 10 minutes
});

module.exports = mongoose.model('Otp', otpSchema);
