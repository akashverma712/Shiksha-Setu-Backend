// routes/teacher.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Timetable = require('../models/Timetable');
const Attendance = require('../models/Attendance');
const sendSMS = require('../utils/sendSMS');

// GET /api/teachers/me → Get logged-in teacher's full details + subjects
router.get('/me', protect, async (req, res) => {
	try {
		const teacherId = req.user.id;

		// 1. Get teacher profile
		const teacher = await Teacher.findById(teacherId).select('-password').populate('registeredBy', 'name');

		if (!teacher) {
			return res.status(404).json({ success: false, message: 'Teacher not found' });
		}

		// 2. Today info
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];

		// 3. Total students (by subjects taught)
		const semesters = [...new Set(teacher.subjects.map((s) => s.semester))];
		const sections = [...new Set(teacher.subjects.map((s) => s.section))];

		const totalStudents = await Student.countDocuments({
			department: teacher.department,
			semester: { $in: semesters },
			section: { $in: sections },
		});

		// 4. Today's classes
		const todayClasses = await Timetable.find({
			teacher: teacherId,
			day: dayName,
		}).select('subjectCode subjectName time');

		// 5. Already marked today
		const markedToday = await Attendance.distinct('subjectCode', {
			createdBy: teacherId,
			date: { $gte: today },
		});

		// 6. Low attendance students
		const lowAttendanceCount = await Student.countDocuments({
			department: teacher.department,
			semester: { $in: semesters },
			attendancePercentage: { $lt: 75 },
		});

		// 7. Pending to mark
		const pendingMarking = todayClasses.length - markedToday.length;

		// 8. Student breakdown by section (PURE JS)
		const studentBreakdown = {};
		for (const sub of teacher.subjects) {
			const key = `Semester ${sub.semester} - Section ${sub.section}`;
			if (!studentBreakdown[key]) {
				studentBreakdown[key] = await Student.countDocuments({
					department: teacher.department,
					semester: sub.semester,
					section: sub.section,
				});
			}
		}

		// FINAL RESPONSE
		res.json({
			success: true,
			teacher: {
				id: teacher._id,
				name: teacher.name,
				employeeId: teacher.employeeId,
				email: teacher.email,
				department: teacher.department,
				role: teacher.role,
				phone: teacher.phone || null,
				designation: teacher.designation || null,
				subjects: teacher.subjects,
				registeredBy: teacher.registeredBy?.name || 'Admin',
				createdAt: teacher.createdAt,

				// Dashboard stats
				totalStudents,
				classesToday: todayClasses.length,
				markedToday: markedToday.length,
				pendingMarking: Math.max(0, pendingMarking),
				lowAttendanceCount,
				studentBreakdown,
				todaySchedule: todayClasses.map((cls) => ({
					subjectCode: cls.subjectCode,
					subjectName: cls.subjectName || cls.subjectCode,
					time: cls.time || 'Not set',
				})),
			},
		});
	} catch (err) {
		console.error('Teacher /me error:', err);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: err.message,
		});
	}
});
router.get('/my-students', protect, async (req, res) => {
	try {
		const teacher = await Teacher.findById(req.user.id).select('subjects department name');

		if (!teacher) {
			return res.status(404).json({ success: false, message: 'Teacher not found' });
		}

		// Extract all unique (semester, section, batch) combinations teacher teaches
		const teachingClasses = teacher.subjects.map((sub) => ({
			semester: sub.semester,
			section: sub.section,
			batch: sub.batch,
		}));

		// Find students in these classes
		const students = await Student.find({
			$or: teachingClasses.map((cls) => ({
				semester: cls.semester,
				section: cls.section,
				batch: cls.batch,
			})),
		})
			.select('name rollNo email cgpa attendancePercentage riskScore riskLevel currentBacklogs feePending warnings')
			.sort({ rollNo: 1 });

		// Get latest semester marks for each student
		const studentsWithMarks = students.map((student) => {
			const latestSem = student.academics?.sort((a, b) => b.semester - a.semester)[0];

			const latestSgpa = latestSem?.sgpa || null;
			const subjects = latestSem?.subjects || [];

			return {
				_id: student._id,
				name: student.name,
				rollNo: student.rollNo,
				email: student.email,
				cgpa: student.cgpa?.toFixed(2) || 'N/A',
				sgpa: latestSgpa?.toFixed(2) || 'N/A',
				attendance: Math.round(student.attendancePercentage || 0),
				riskScore: student.riskScore || 0,
				riskLevel: student.riskLevel || 'Low',
				backlogs: student.currentBacklogs || 0,
				feePending: student.feePending || false,
				warnings: student.warnings?.length || 0,
				totalSubjects: subjects.length,
				failedSubjects: subjects.filter((s) => ['F', 'Ab'].includes(s.grade)).length,
			};
		});

		res.json({
			success: true,
			message: `Found ${studentsWithMarks.length} students in your classes`,
			classInfo: {
				teacherName: teacher.name,
				department: teacher.department,
				totalClasses: teacher.subjects.length,
			},
			students: studentsWithMarks,
		});
	} catch (err) {
		console.error('My Students Error:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});
router.get('/students/:studentId', protect, async (req, res) => {
	try {
		const teacher = await Teacher.findById(req.user.id).select('subjects department');

		if (!teacher) {
			return res.status(404).json({ success: false, message: 'Teacher not found' });
		}

		// Get the student
		const student = await Student.findById(req.params.studentId).select('-password -otp -otpExpires -__v').populate('warnings.givenBy', 'name').populate('registeredBy', 'name');

		if (!student) {
			return res.status(404).json({ success: false, message: 'Student not found' });
		}

		// Check if teacher teaches this student
		const teachesStudent = teacher.subjects.some((subject) => subject.semester === student.semester && subject.section === student.section && student.department === teacher.department);

		if (!teachesStudent && req.user.role !== 'Admin' && req.user.role !== 'HOD') {
			return res.status(403).json({
				success: false,
				message: 'Access denied. You do not teach this student.',
			});
		}

		// Get attendance summary from Attendance model
		const attendanceSummary = await Attendance.aggregate([
			{ $match: { student: student._id } },
			{
				$group: {
					_id: null,
					present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
					absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
					late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
					total: { $sum: 1 },
				},
			},
		]);

		// Format response
		const formattedStudent = {
			_id: student._id,
			name: student.name,
			email: student.email,
			rollNo: student.rollNo,
			department: student.department,
			semester: student.semester,
			section: student.section,
			batch: student.batch,
			cgpa: student.cgpa?.toFixed(2) || 'N/A',
			currentBacklogs: student.currentBacklogs || 0,
			attendancePercentage: student.attendancePercentage || 0,
			riskScore: student.riskScore || 0,
			riskLevel: student.riskLevel || 'Low',
			isAtRisk: student.isAtRisk || false,
			feePending: student.feePending || false,
			warnings:
				student.warnings?.map((warning) => ({
					reason: warning.reason,
					givenBy: warning.givenBy?.name || 'Unknown',
				})) || [],
			attendanceSummary: attendanceSummary[0] || { present: 0, absent: 0, late: 0, total: 0 },
		};

		res.json({
			success: true,
			message: 'Student details retrieved successfully',
			student: formattedStudent,
		});
	} catch (err) {
		console.error('Get student details error:', err);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: err.message,
		});
	}
});
// POST /api/teachers/assign-mentor/:studentId
// Only teachers can assign mentors
router.put('/assign-mentor/:studentId', protect, authorize('Teacher'), async (req, res) => {
	const { studentId } = req.params;
	const { name, phone } = req.body;

	// Basic validation
	if (!name || !phone) {
		return res.status(400).json({
			success: false,
			message: 'Please provide mentor name and phone',
		});
	}

	try {
		// Find the student
		const student = await Student.findById(studentId);
		if (!student) {
			return res.status(404).json({
				success: false,
				message: 'Student not found',
			});
		}

		// Optional: Check if teacher actually teaches this student
		const teacher = await Teacher.findById(req.user.id);
		const teachesThisStudent = teacher.subjects.some((sub) => sub.semester === student.semester && sub.section === student.section && teacher.department === student.department);

		if (!teachesThisStudent && req.user.role !== 'Admin' && req.user.role !== 'HOD') {
			return res.status(403).json({
				success: false,
				message: 'You can only assign mentors to students you teach',
			});
		}

		// Update mentor
		student.mentor = { name: name.trim(), phone: phone.trim() };
		await student.save();

		res.json({
			success: true,
			message: 'Mentor assigned successfully',
			student: {
				_id: student._id,
				name: student.name,
				rollNo: student.rollNo,
				mentor: student.mentor,
			},
		});
	} catch (err) {
		console.error('Assign mentor error:', err);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: err.message,
		});
	}
});
// SPECIAL ROUTE: Teacher → Send SMS ONLY to +917479676602 (for testing/demo)
router.post('/send-test-sms', protect, authorize('Teacher'), async (req, res) => {
	const { message } = req.body;

	if (!message || !message.trim()) {
		return res.status(400).json({
			success: false,
			message: 'Message is required',
		});
	}

	try {
		const result = await sendSMS('+917479676602', `[From ${req.user.name}]: ${message.trim()}`);

		if (!result.success) {
			return res.status(500).json({
				success: false,
				message: 'Failed to send SMS',
				error: result.error,
			});
		}

		res.json({
			success: true,
			message: 'SMS sent to +917479676602',
			sid: result.sid,
		});
	} catch (err) {
		console.error('Test SMS Error:', err);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: err.message,
		});
	}
});
module.exports = router;
