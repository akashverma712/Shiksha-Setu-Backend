// models/Teacher.js
const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
	{
		// Core Identification
		employeeId: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			uppercase: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		password: {
			type: String,
			required: true,
			select: false,
		},

		// Professional Info
		department: {
			type: String,
			required: true,
			enum: ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Mathematics', 'Physics', 'Chemistry', 'English', 'Management'],
		},
		designation: {
			type: String,
			enum: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'HOD'],
			default: 'Assistant Professor',
		},
		role: {
			type: String,
			enum: ['Teacher', 'HOD'],
			default: 'Teacher',
		},

		// Contact & Personal
		phone: {
			type: String,
			sparse: true,
		},
		profileImage: {
			type: String,
			default: 'https://ui-avatars.com/api/?name=Teacher&background=6366f1&color=fff',
		},

		// Subjects & Classes (Critical for Marks Upload)
		subjects: [
			{
				subjectCode: { type: String, required: true },
				subjectName: { type: String, required: true },
				semester: { type: Number, required: true, min: 1, max: 8 },
				section: { type: String, required: true, uppercase: true }, // A, B, C
				batch: { type: String, required: true }, // 2023-2027
				program: { type: String, default: 'B.Tech' }, // B.Tech, MCA, etc.
				totalStudents: { type: Number, default: 0 },
			},
		],

		// Work & Permissions
		isActive: {
			type: Boolean,
			default: true,
		},
		canUploadMarks: {
			type: Boolean,
			default: true,
		},
		canTakeAttendance: {
			type: Boolean,
			default: true,
		},

		// Risk & Alerts
		atRiskStudentsCount: {
			type: Number,
			default: 0,
		},

		// Metadata
		registeredBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin',
			required: true,
		},
		lastLogin: {
			type: Date,
		},
		loginCount: {
			type: Number,
			default: 0,
		},
	},
	{
		timestamps: true,
	}
);

// Indexes for fast queries
teacherSchema.index({ employeeId: 1 });
teacherSchema.index({ email: 1 });
teacherSchema.index({ department: 1 });
teacherSchema.index({ 'subjects.subjectCode': 1 });
teacherSchema.index({ 'subjects.semester': 1, 'subjects.section': 1 });

module.exports = mongoose.model('Teacher', teacherSchema);
