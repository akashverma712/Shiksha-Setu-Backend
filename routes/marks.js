// routes/marks.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const gradeToPoints = require('../utils/gradePoints');

// POST /api/marks/upload
// router.post('/upload', protect, authorize('Teacher', 'HOD'), async (req, res) => {
// 	const { studentId, semester, subjects } = req.body;

// 	if (!studentId || !semester || !Array.isArray(subjects) || subjects.length === 0) {
// 		return res.status(400).json({ success: false, message: 'studentId, semester and subjects are required' });
// 	}

// 	try {
// 		const student = await Student.findById(studentId);
// 		if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

// 		// Normalize inputs and validate subjects
// 		const processedSubjects = [];
// 		let semTotalCredits = 0;
// 		let totalPoints = 0;
// 		let backlogs = 0;
// 		let earnedCredits = 0;

// 		for (const s of subjects) {
// 			if (!s.subjectName || !s.subjectCode || typeof s.credits !== 'number') {
// 				return res.status(400).json({ success: false, message: 'Each subject must have subjectName, subjectCode and numeric credits' });
// 			}

// 			const grade = s.grade || null;
// 			const gp = grade && gradeToPoints.hasOwnProperty(grade) ? gradeToPoints[grade] : 0;

// 			processedSubjects.push({
// 				subjectName: s.subjectName,
// 				subjectCode: s.subjectCode,
// 				credits: s.credits,
// 				grade,
// 				gradePoints: gp,
// 				marks: typeof s.marks === 'number' ? s.marks : undefined,
// 			});

// 			semTotalCredits += s.credits;
// 			totalPoints += gp * s.credits;

// 			if (gp > 0) earnedCredits += s.credits;
// 			if (['F', 'Ab'].includes(grade)) backlogs++;
// 		}

// 		const sgpa = semTotalCredits > 0 ? Number((totalPoints / semTotalCredits).toFixed(2)) : 0;

// 		// Remove old record for this semester (if exists)
// 		student.academics = student.academics.filter((a) => a.semester !== semester);

// 		// Push new semester record
// 		student.academics.push({
// 			semester,
// 			subjects: processedSubjects,
// 			sgpa,
// 			totalCredits: semTotalCredits,
// 			earnedCredits,
// 			backlogsThisSem: backlogs,
// 		});

// 		// Recalculate derived fields by saving (pre-save hook will handle CGPA/backlogs/risk)
// 		await student.save();

// 		return res.json({
// 			success: true,
// 			message: 'Marks uploaded & CGPA updated',
// 			data: {
// 				student: student.name,
// 				semester,
// 				sgpa,
// 				cgpa: student.cgpa,
// 				backlogsThisSem: backlogs,
// 				currentBacklogs: student.currentBacklogs,
// 				riskScore: student.riskScore,
// 				riskLevel: student.riskLevel,
// 			},
// 		});
// 	} catch (err) {
// 		console.error('Marks upload error:', err);
// 		return res.status(500).json({ success: false, message: 'Server error' });
// 	}
// });

router.post('/upload', protect, authorize('Teacher', 'HOD'), async (req, res) => {
	const { rollNo, semester, subjects } = req.body;

	if (!rollNo || !semester || !Array.isArray(subjects) || subjects.length === 0) {
		return res.status(400).json({ success: false, message: 'rollNo, semester and subjects are required' });
	}

	try {
		// Fetch student BY roll number instead of ObjectId
		const student = await Student.findOne({ rollNo });
		if (!student) {
			return res.status(404).json({ success: false, message: 'Student not found' });
		}

		const processedSubjects = [];
		let semTotalCredits = 0;
		let totalPoints = 0;
		let backlogs = 0;
		let earnedCredits = 0;

		for (const s of subjects) {
			if (!s.subjectName || !s.subjectCode || typeof s.credits !== 'number') {
				return res.status(400).json({
					success: false,
					message: 'Each subject must have subjectName, subjectCode and numeric credits',
				});
			}

			const grade = s.grade || null;
			const gp = grade && gradeToPoints.hasOwnProperty(grade) ? gradeToPoints[grade] : 0;

			processedSubjects.push({
				subjectName: s.subjectName,
				subjectCode: s.subjectCode,
				credits: s.credits,
				grade,
				gradePoints: gp,
				marks: typeof s.marks === 'number' ? s.marks : undefined,
			});

			semTotalCredits += s.credits;
			totalPoints += gp * s.credits;

			if (gp > 0) earnedCredits += s.credits;
			if (['F', 'Ab'].includes(grade)) backlogs++;
		}

		const sgpa = semTotalCredits > 0 ? Number((totalPoints / semTotalCredits).toFixed(2)) : 0;

		// Remove old semester record
		student.academics = student.academics.filter(
			(a) => a.semester !== semester
		);

		// Push new semester result
		student.academics.push({
			semester,
			subjects: processedSubjects,
			sgpa,
			totalCredits: semTotalCredits,
			earnedCredits,
			backlogsThisSem: backlogs,
		});

		await student.save(); // pre-save hook updates CGPA etc.

		return res.json({
			success: true,
			message: 'Marks uploaded & CGPA updated',
			data: {
				student: student.name,
				semester,
				sgpa,
				cgpa: student.cgpa,
				backlogsThisSem: backlogs,
				currentBacklogs: student.currentBackloads,
				riskScore: student.riskScore,
				riskLevel: student.riskLevel,
			},
		});
	} catch (err) {
		console.error('Marks upload error:', err);
		return res.status(500).json({ success: false, message: 'Server error' });
	}
});

// returns the logged-in student's academic records (student role)
router.get('/me', protect, authorize('student'), async (req, res) => {
	try {
		const student = await Student.findById(req.user.id).select('name rollNo semester cgpa academics attendancePercentage currentBacklogs warnings feePending').populate('warnings.givenBy', 'name'); // optional
		if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

		res.json({ success: true, student });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

// GET /api/marks/:studentId
// Teachers/HOD/Admin can fetch any student's academic records
router.get('/:studentId', protect, authorize('Teacher', 'HOD', 'Admin'), async (req, res) => {
	try {
		const student = await Student.findById(req.params.studentId).select('name rollNo semester cgpa academics attendancePercentage currentBacklogs warnings feePending registeredBy').populate('warnings.givenBy', 'name');
		if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

		res.json({ success: true, student });
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});
module.exports = router;
