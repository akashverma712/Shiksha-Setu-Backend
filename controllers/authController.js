const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Otp = require('../models/Otp');
const sendEmail = require('../utils/sendEmail');

const generateToken = (id) => {
	return jwt.sign({ id }, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRE || '7d',
	});
};

// 1. Register First Admin (Open Route – One time only)
exports.registerAdmin = async (req, res) => {
	const { employeeId, name, email, password, department } = req.body;

	try {
		if ((await Admin.countDocuments()) > 0) {
			return res.status(400).json({
				success: false,
				message: 'Admin already exists. Only one admin allowed.',
			});
		}

		const existing = await Admin.findOne({ $or: [{ email }, { employeeId }] });
		if (existing) return res.status(400).json({ success: false, message: 'Admin already exists' });

		const salt = await bcrypt.genSalt(10);
		const hashed = await bcrypt.hash(password, salt);

		const admin = await Admin.create({
			employeeId,
			name,
			email,
			password: hashed,
			department,
		});

		res.status(201).json({
			success: true,
			message: 'Admin registered successfully',
			user: { id: admin._id, name: admin.name, role: 'Admin' },
		});
	} catch (err) {
		res.status(500).json({ success: false, message: err.message });
	}
};

// 2. Admin Login
exports.adminLogin = async (req, res) => {
	const { employeeId, password } = req.body;
	if (!employeeId || !password) return res.status(400).json({ success: false, message: 'Provide Employee ID & password' });

	try {
		const admin = await Admin.findOne({ employeeId }).select('+password');
		if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' });

		const match = await bcrypt.compare(password, admin.password);
		if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

		res.json({
			success: true,
			token: generateToken(admin._id),
			user: { id: admin._id, name: admin.name, role: 'Admin', employeeId },
		});
	} catch (err) {
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

// 3. Admin Registers Teacher
exports.registerTeacher = async (req, res) => {
	const {
		employeeId,
		name,
		email,
		password,
		department,
		role,
		phone,
		designation,
		subjects, // array of subjects they teach
	} = req.body;

	// REQUIRED FIELDS CHECK
	if (!employeeId || !name || !email || !password || !department) {
		return res.status(400).json({
			success: false,
			message: 'Please fill all required fields: employeeId, name, email, password, department',
		});
	}

	try {
		// Check if teacher already exists
		const existingTeacher = await Teacher.findOne({
			$or: [{ email: email.toLowerCase() }, { employeeId: employeeId.toUpperCase() }],
		});

		if (existingTeacher) {
			return res.status(400).json({
				success: false,
				message: 'Teacher with this email or employee ID already exists',
			});
		}

		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Create teacher with all details
		const teacher = await Teacher.create({
			employeeId: employeeId.toUpperCase().trim(),
			name: name.trim(),
			email: email.toLowerCase().trim(),
			password: hashedPassword,
			department,
			role: role || 'Teacher', // Teacher or HOD
			phone: phone?.trim() || null,
			designation: designation || 'Assistant Professor',
			subjects: Array.isArray(subjects) ? subjects : [],
			registeredBy: req.user.id, // Admin who registered
			isActive: true,
		});

		res.status(201).json({
			success: true,
			message: 'Teacher registered successfully!',
			teacher: {
				id: teacher._id,
				employeeId: teacher.employeeId,
				name: teacher.name,
				email: teacher.email,
				department: teacher.department,
				role: teacher.role,
				designation: teacher.designation,
				phone: teacher.phone,
				totalSubjects: teacher.subjects.length,
				registeredBy: req.user.name || 'Admin',
			},
		});
	} catch (err) {
		console.error('Register Teacher Error:', err);
		res.status(500).json({
			success: false,
			message: 'Server error. Please try again.',
		});
	}
};

// 4. Teacher Login (Same as before)
exports.teacherLogin = async (req, res) => {
	const { employeeId, password } = req.body;
	if (!employeeId || !password) return res.status(400).json({ success: false, message: 'Provide Employee ID & password' });

	try {
		const teacher = await Teacher.findOne({ employeeId }).select('+password');
		if (!teacher) return res.status(401).json({ success: false, message: 'Invalid credentials' });

		const match = await bcrypt.compare(password, teacher.password);
		if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

		res.json({
			success: true,
			token: generateToken(teacher._id),
			user: { id: teacher._id, name: teacher.name, role: teacher.role, employeeId },
		});
	} catch (err) {
		res.status(500).json({ success: false, message: 'Server error' });
	}
};

// 5. Admin Registers Student
// exports.registerStudent = async (req, res) => {
//   const { name, email, rollNo, department, semester } = req.body;

//   try {
//     if (await Student.findOne({ $or: [{ email }, { rollNo }] })) {
//       return res.status(400).json({ success: false, message: 'Student already exists' });
//     }

//     const student = await Student.create({
//       name, email, rollNo, department, semester,
//       registeredBy: req.user.id
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Student registered successfully',
//       student: { name, email, rollNo }
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
// In controllers/authController.js → replace registerStudent
exports.registerStudent = async (req, res) => {
	const { name, email, rollNo, registrationNo, phone, department, program, batch, semester, section, familyIncome, distanceFromCollege, scholarship } = req.body;

	try {
		const exists = await Student.findOne({
			$or: [{ email }, { rollNo }],
		});
		if (exists) {
			return res.status(400).json({
				success: false,
				message: 'Student with this email/rollNo already exists',
			});
		}

		const student = await Student.create({
			name,
			email,
			rollNo,
			registrationNo,
			phone,
			department,
			program,
			batch,
			semester,
			section,
			familyIncome,
			distanceFromCollege,
			scholarship: scholarship || false,
			registeredBy: req.user.id,
		});

		res.status(201).json({
			success: true,
			message: 'Student registered successfully',
			student: {
				name: student.name,
				email: student.email,
				rollNo: student.rollNo,
				batch: student.batch,
				riskLevel: student.riskLevel,
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, message: err.message });
	}
};
// 6. Send OTP to Student (Public)
exports.sendStudentOtp = async (req, res) => {
	const { email } = req.body;
	if (!email) return res.status(400).json({ success: false, message: 'Email required' });

	try {
		const student = await Student.findOne({ email });
		if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

		const code = Math.floor(100000 + Math.random() * 900000).toString();
		await Otp.deleteOne({ email });
		await Otp.create({ email, code });

		await sendEmail(
			email,
			'Your Login OTP – Dropout AI',
			`<div style="font-family: sans-serif; text-align: center; padding: 30px; background: #f4f4f4; border-radius: 12px;">
        <h1>Dropout AI</h1>
        <h2 style="font-size: 42px; letter-spacing: 10px; background: #333; color: white; padding: 20px; border-radius: 10px;">${code}</h2>
        <p>Valid for 10 minutes</p>
      </div>`
		);

		res.json({ success: true, message: 'OTP sent successfully' });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, message: 'Failed to send OTP' });
	}
};

// 7. Student Login with OTP
exports.studentLoginWithOtp = async (req, res) => {
	const { email, code } = req.body;

	try {
		const otpRecord = await Otp.findOne({ email, code });
		if (!otpRecord) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

		const student = await Student.findOne({ email });
		if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

		await Otp.deleteOne({ _id: otpRecord._id });

		res.json({
			success: true,
			token: generateToken(student._id),
			user: {
				id: student._id,
				name: student.name,
				email: student.email,
				rollNo: student.rollNo,
				role: 'student',
			},
		});
	} catch (err) {
		res.status(500).json({ success: false, message: 'Server error' });
	}
};
