const express = require('express');
const router = express.Router();
const {
  registerAdmin,
  adminLogin,
  registerTeacher,
  teacherLogin,
  registerStudent,
  sendStudentOtp,
  studentLoginWithOtp
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

// Public Routes
router.post('/admin/register', registerAdmin);        // First admin only
router.post('/admin/login', adminLogin);
router.post('/teacher/login', teacherLogin);
router.post('/student/send-otp', sendStudentOtp);
router.post('/student/verify-otp', studentLoginWithOtp);

// Protected Routes – Only Admin
router.post('/teacher/register', protect, authorize('Admin'), registerTeacher);
router.post('/student/register', protect, authorize('Admin'), registerStudent);

module.exports = router;
