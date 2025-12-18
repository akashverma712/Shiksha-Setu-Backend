// routes/attendance.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance'); // Add this

router.post('/upload', protect, authorize('Teacher', 'HOD'), async (req, res) => {
	const session = await Student.startSession();
	session.startTransaction();

	try {
		const attendanceEntries = req.body;

		if (!Array.isArray(attendanceEntries) || attendanceEntries.length === 0) {
			return res.status(400).json({
				success: false,
				message: 'Request body must be a non-empty array of attendance records',
			});
		}

		const validStatuses = ['present', 'absent', 'late'];
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const studentUpdates = {};
		const attendanceRecordsToInsert = [];

		for (const entry of attendanceEntries) {
			const { studentId, status, subjectCode, subjectName, date: rawDate } = entry;

			if (!studentId || !validStatuses.includes(status)) {
				await session.abortTransaction();
				return res.status(400).json({
					success: false,
					message: `Invalid data: missing studentId or invalid status in entry`,
					invalidEntry: entry,
				});
			}

			const markDate = rawDate ? new Date(rawDate) : today;
			markDate.setHours(0, 0, 0, 0);

			// Initialize update object
			if (!studentUpdates[studentId]) {
				studentUpdates[studentId] = {
					attendedIncrement: 0,
					totalIncrement: 1,
					presentIncrement: 0,
					lateIncrement: 0,
					absentIncrement: 0,
				};
			} else {
				studentUpdates[studentId].totalIncrement += 1;
			}

			// Determine increments based on status
			if (status === 'present' || status === 'late') {
				studentUpdates[studentId].attendedIncrement += 1;
			}
			if (status === 'present') studentUpdates[studentId].presentIncrement += 1;
			if (status === 'late') studentUpdates[studentId].lateIncrement += 1;
			if (status === 'absent') studentUpdates[studentId].absentIncrement += 1;

			attendanceRecordsToInsert.push({
				student: studentId,
				date: markDate,
				status,
				subjectCode: subjectCode || null,
				subjectName: subjectName || null,
				createdBy: req.user.id,
			});
		}

		const bulkOps = Object.entries(studentUpdates).map(([studentId, increments]) => ({
			updateOne: {
				filter: { _id: studentId },
				update: {
					$inc: {
						totalClasses: increments.totalIncrement,
						attendedClasses: increments.attendedIncrement,
						presentCount: increments.presentIncrement,
						lateCount: increments.lateIncrement,
						absentCount: increments.absentIncrement,
					},
				},
			},
		}));

		if (bulkOps.length > 0) {
			await Student.bulkWrite(bulkOps, { session });
		}

		if (attendanceRecordsToInsert.length > 0) {
			await Attendance.insertMany(attendanceRecordsToInsert, { session });
		}

		await session.commitTransaction();

		res.json({
			success: true,
			message: `Attendance marked for ${attendanceEntries.length} student(s)`,
			data: {
				markedCount: attendanceEntries.length,
				date: today.toISOString().split('T')[0],
			},
		});
	} catch (err) {
		await session.abortTransaction();
		console.error('Attendance Upload Error:', err);
		res.status(500).json({
			success: false,
			message: 'Server error during attendance upload',
			error: err.message,
		});
	} finally {
		session.endSession();
	}
});



// GET /api/attendance/my-history
// → Only logged-in student can access their own data
router.get('/my-history', protect, authorize('student'), async (req, res) => {
	try {
		const studentId = req.user._id; // from protect middleware

		// 1. Get summary from Student document (fast!)
		const student = await Student.findById(studentId).select('name rollNo department batch semester section attendedClasses totalClasses attendancePercentage presentCount lateCount absentCount');

		if (!student) {
			return res.status(404).json({
				success: false,
				message: 'Student not found',
			});
		}

		// 2. Get detailed day-wise + subject-wise history
		const attendanceRecords = await Attendance.find({ student: studentId })
			.populate('createdBy', 'name employeeId') // who marked
			.select('date status subjectCode subjectName createdAt')
			.sort({ date: -1 }) // latest first
			.lean();

		// 3. Group by date for easy calendar/heatmap display
		const historyByDate = {};
		let monthlyStats = {};

		attendanceRecords.forEach((record) => {
			const dateKey = record.date.toISOString().split('T')[0]; // YYYY-MM-DD

			if (!historyByDate[dateKey]) {
				historyByDate[dateKey] = {
					date: dateKey,
					total: 0,
					present: 0,
					late: 0,
					absent: 0,
					subjects: [],
				};
			}

			historyByDate[dateKey].total += 1;
			historyByDate[dateKey][record.status] += 1;

			historyByDate[dateKey].subjects.push({
				subjectCode: record.subjectCode || 'General',
				subjectName: record.subjectName || 'N/A',
				status: record.status,
				markedBy: record.createdBy?.name || 'Unknown',
			});

			// Monthly stats (for charts)
			const monthKey = dateKey.slice(0, 7); // YYYY-MM
			if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { present: 0, total: 0 };
			monthlyStats[monthKey].total += 1;
			if (record.status === 'present' || record.status === 'late') {
				monthlyStats[monthKey].present += 1;
			}
		});

		// Convert monthlyStats to array
		const monthlyData = Object.keys(monthlyStats)
			.sort()
			.map((month) => ({
				month,
				percentage: monthlyStats[month].total > 0 ? Math.round((monthlyStats[month].present / monthlyStats[month].total) * 100) : 0,
			}));

		res.json({
			success: true,
			data: {
				summary: {
					name: student.name,
					rollNo: student.rollNo,
					department: student.department,
					batch: student.batch,
					currentSemester: student.semester,
					overall: {
						attendedClasses: student.attendedClasses,
						totalClasses: student.totalClasses,
						attendancePercentage: student.attendancePercentage,
						present: student.presentCount,
						late: student.lateCount,
						absent: student.absentCount,
					},
				},
				monthlyTrend: monthlyData,
				dailyHistory: Object.values(historyByDate).reverse(), // oldest first for timeline
			},
		});
	} catch (err) {
		console.error('My Attendance History Error:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});
module.exports = router;
