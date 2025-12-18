// middleware/auth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');

exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = await Admin.findById(decoded.id).select('-password');
    if (!user) user = await Teacher.findById(decoded.id).select('-password');
    if (!user) user = await Student.findById(decoded.id);

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    req.user = user;
    req.user.role = user.role || 'student';
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// THIS IS THE ONE THAT WAS MISSING BEFORE
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required: ${roles.join(' or ')}. You are: ${req.user.role}`
      });
    }
    next();
  };
};
