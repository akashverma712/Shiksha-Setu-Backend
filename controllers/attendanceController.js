// controllers/assignmentController.js
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const path = require('path');
const fs = require('fs');

/**
 * Upload a new assignment (Teacher only)
 */
exports.createAssignment = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const {
      title,
      description,
      subjectCode,
      subjectName,
      semester,
      section,
      batch,
      department,
      totalMarks,
      dueDate,
      instructions,
      tags,
      allowedFormats
    } = req.body;

    // Validate required fields
    if (!title || !subjectCode || !subjectName || !semester || !section || !batch || !department || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, subjectCode, subjectName, semester, section, batch, department, dueDate'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Assignment file is required'
      });
    }

    // Get teacher info to verify they teach this subject
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Verify teacher teaches this subject (optional but recommended)
    const teachesSubject = teacher.subjects.some(subject =>
      subject.subjectCode === subjectCode &&
      subject.semester === parseInt(semester) &&
      subject.section === section &&
      subject.batch === batch
    );

    if (!teachesSubject) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to teach this subject/section'
      });
    }

    // Count students in this class
    const studentCount = await Student.countDocuments({
      department,
      semester: parseInt(semester),
      section,
      batch
    });

    // Create assignment
    const assignment = await Assignment.create({
      title,
      description: description || '',
      subjectCode,
      subjectName,
      semester: parseInt(semester),
      section,
      batch,
      department,
      createdBy: teacherId,
      fileUrl: `/uploads/assignments/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      totalMarks: totalMarks || 100,
      dueDate: new Date(dueDate),
      instructions: instructions || '',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      allowedFormats: allowedFormats ? allowedFormats.split(',').map(format => format.trim()) : ['pdf', 'doc', 'docx'],
      totalStudents: studentCount
    });

    // Update teacher's assignments count
    await Teacher.findByIdAndUpdate(teacherId, {
      $inc: { assignmentsCreated: 1 },
      $push: {
        uploadedFiles: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: req.file.path,
          subjectCode,
          semester: parseInt(semester),
          section,
          batch,
          uploadedAt: new Date(),
          processed: false
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      data: {
        assignment: {
          id: assignment._id,
          title: assignment.title,
          subjectCode: assignment.subjectCode,
          subjectName: assignment.subjectName,
          semester: assignment.semester,
          section: assignment.section,
          dueDate: assignment.dueDate,
          totalMarks: assignment.totalMarks,
          fileUrl: assignment.fileUrl,
          totalStudents: assignment.totalStudents
        }
      }
    });

  } catch (err) {
    console.error('Create assignment error:', err);

    // Delete uploaded file if there was an error
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete file:', unlinkErr);
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};

/**
 * Get assignments for a teacher
 */
exports.getTeacherAssignments = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { status, subjectCode, semester, page = 1, limit = 10 } = req.query;

    const query = { createdBy: teacherId };

    if (status) query.status = status;
    if (subjectCode) query.subjectCode = subjectCode;
    if (semester) query.semester = parseInt(semester);

    const assignments = await Assignment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('createdBy', 'name employeeId')
      .lean();

    const total = await Assignment.countDocuments(query);

    res.json({
      success: true,
      data: {
        assignments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (err) {
    console.error('Get teacher assignments error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get assignments for a student
 */
exports.getStudentAssignments = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { status, subjectCode, page = 1, limit = 10 } = req.query;

    // Get student details
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Build query based on student's class
    const query = {
      department: student.department,
      semester: student.semester,
      section: student.section,
      batch: student.batch,
      status: 'active'
    };

    if (subjectCode) query.subjectCode = subjectCode;

    const assignments = await Assignment.find(query)
      .sort({ dueDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('createdBy', 'name employeeId')
      .lean();

    // Check submission status for each assignment
    const assignmentsWithStatus = await Promise.all(
      assignments.map(async (assignment) => {
        const submission = await AssignmentSubmission.findOne({
          assignment: assignment._id,
          student: studentId
        });

        return {
          ...assignment,
          submissionStatus: submission ? submission.status : 'pending',
          submittedAt: submission ? submission.submittedAt : null,
          marksObtained: submission ? submission.marksObtained : null,
          dueStatus: new Date() > new Date(assignment.dueDate) ? 'overdue' : 'pending'
        };
      })
    );

    const total = await Assignment.countDocuments(query);

    res.json({
      success: true,
      data: {
        student: {
          name: student.name,
          rollNo: student.rollNo,
          department: student.department,
          semester: student.semester,
          section: student.section
        },
        assignments: assignmentsWithStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (err) {
    console.error('Get student assignments error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Submit assignment (Student)
 */
exports.submitAssignment = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { assignmentId, studentNotes } = req.body;

    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        message: 'Assignment ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Submission file is required'
      });
    }

    // Check if assignment exists
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Check if student belongs to this assignment's class
    const student = await Student.findById(studentId);
    if (!student ||
        student.department !== assignment.department ||
        student.semester !== assignment.semester ||
        student.section !== assignment.section ||
        student.batch !== assignment.batch) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this class'
      });
    }

    // Check if already submitted
    const existingSubmission = await AssignmentSubmission.findOne({
      assignment: assignmentId,
      student: studentId
    });

    const submittedAt = new Date();
    const isLate = submittedAt > assignment.dueDate;
    const status = isLate ? 'late' : 'submitted';

    if (existingSubmission) {
      // Update existing submission (re-submission)
      const previousVersion = {
        fileUrl: existingSubmission.fileUrl,
        fileName: existingSubmission.fileName,
        submittedAt: existingSubmission.submittedAt
      };

      existingSubmission.fileUrl = `/uploads/submissions/${req.file.filename}`;
      existingSubmission.fileName = req.file.originalname;
      existingSubmission.fileSize = req.file.size;
      existingSubmission.fileType = req.file.mimetype;
      existingSubmission.submittedAt = submittedAt;
      existingSubmission.status = status;
      existingSubmission.resubmissionCount += 1;
      existingSubmission.studentNotes = studentNotes || '';
      existingSubmission.previousVersions.push(previousVersion);

      await existingSubmission.save();
    } else {
      // Create new submission
      await AssignmentSubmission.create({
        assignment: assignmentId,
        student: studentId,
        fileUrl: `/uploads/submissions/${req.file.filename}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        submittedAt: submittedAt,
        status: status,
        studentNotes: studentNotes || '',
        totalMarks: assignment.totalMarks
      });

      // Update assignment submission count
      await Assignment.findByIdAndUpdate(assignmentId, {
        $inc: { submissionsCount: 1 }
      });
    }

    // Update student's assignments array
    await Student.findByIdAndUpdate(studentId, {
      $addToSet: {
        assignments: {
          assignment: assignmentId,
          status: status,
          submittedAt: submittedAt
        }
      }
    });

    res.json({
      success: true,
      message: isLate ? 'Assignment submitted (late)' : 'Assignment submitted successfully',
      data: {
        submissionId: existingSubmission ? existingSubmission._id : null,
        submittedAt,
        isLate,
        dueDate: assignment.dueDate
      }
    });

  } catch (err) {
    console.error('Submit assignment error:', err);

    // Delete uploaded file if there was an error
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete file:', unlinkErr);
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get submissions for an assignment (Teacher)
 */
exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { assignmentId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Verify teacher owns this assignment
    const assignment = await Assignment.findOne({
      _id: assignmentId,
      createdBy: teacherId
    });

    if (!assignment) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view submissions for this assignment'
      });
    }

    const query = { assignment: assignmentId };
    if (status) query.status = status;

    const submissions = await AssignmentSubmission.find(query)
      .populate('student', 'name rollNo email')
      .populate('gradedBy', 'name employeeId')
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await AssignmentSubmission.countDocuments(query);

    // Calculate statistics
    const gradedSubmissions = submissions.filter(s => s.marksObtained);
    const averageMarks = gradedSubmissions.length > 0
      ? gradedSubmissions.reduce((sum, s) => sum + s.marksObtained, 0) / gradedSubmissions.length
      : 0;

    res.json({
      success: true,
      data: {
        assignment: {
          id: assignment._id,
          title: assignment.title,
          subjectCode: assignment.subjectCode,
          totalMarks: assignment.totalMarks,
          dueDate: assignment.dueDate,
          totalStudents: assignment.totalStudents
        },
        submissions,
        statistics: {
          totalSubmissions: total,
          gradedCount: gradedSubmissions.length,
          pendingCount: total - gradedSubmissions.length,
          averageMarks: Math.round(averageMarks * 100) / 100,
          highestMarks: gradedSubmissions.length > 0 ? Math.max(...gradedSubmissions.map(s => s.marksObtained)) : 0,
          lowestMarks: gradedSubmissions.length > 0 ? Math.min(...gradedSubmissions.map(s => s.marksObtained)) : 0
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (err) {
    console.error('Get assignment submissions error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Grade a submission (Teacher)
 */
exports.gradeSubmission = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { submissionId } = req.params;
    const { marksObtained, feedback, grade } = req.body;

    if (!marksObtained) {
      return res.status(400).json({
        success: false,
        message: 'Marks are required'
      });
    }

    // Get submission with assignment details
    const submission = await AssignmentSubmission.findById(submissionId)
      .populate('assignment');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify teacher owns this assignment
    if (submission.assignment.createdBy.toString() !== teacherId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to grade this submission'
      });
    }

    // Verify marks don't exceed total
    if (marksObtained > submission.assignment.totalMarks) {
      return res.status(400).json({
        success: false,
        message: `Marks cannot exceed ${submission.assignment.totalMarks}`
      });
    }

    // Update submission
    submission.marksObtained = marksObtained;
    submission.feedback = feedback || '';
    submission.grade = grade || '';
    submission.gradedBy = teacherId;
    submission.gradedAt = new Date();
    submission.status = 'graded';

    await submission.save();

    // Update student's assignment record
    await Student.updateOne(
      { _id: submission.student, 'assignments.assignment': submission.assignment._id },
      {
        $set: {
          'assignments.$.status': 'graded',
          'assignments.$.marksObtained': marksObtained,
          'assignments.$.feedback': feedback
        }
      }
    );

    // Update assignment statistics
    await updateAssignmentStatistics(submission.assignment._id);

    res.json({
      success: true,
      message: 'Submission graded successfully',
      data: {
        submission: {
          id: submission._id,
          marksObtained: submission.marksObtained,
          totalMarks: submission.assignment.totalMarks,
          grade: submission.grade,
          gradedAt: submission.gradedAt
        }
      }
    });

  } catch (err) {
    console.error('Grade submission error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Download assignment or submission file
 */
exports.downloadFile = async (req, res) => {
  try {
    const { type, id } = req.params;

    let filePath;

    if (type === 'assignment') {
      const assignment = await Assignment.findById(id);
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }
      filePath = path.join(__dirname, '..', assignment.fileUrl);
    } else if (type === 'submission') {
      const submission = await AssignmentSubmission.findById(id);
      if (!submission) {
        return res.status(404).json({
          success: false,
          message: 'Submission not found'
        });
      }
      filePath = path.join(__dirname, '..', submission.fileUrl);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type'
      });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const fileName = type === 'assignment'
      ? `assignment-${id}-${path.basename(filePath)}`
      : `submission-${id}-${path.basename(filePath)}`;

    res.download(filePath, fileName);

  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Helper function to update assignment statistics
 */
async function updateAssignmentStatistics(assignmentId) {
  try {
    const submissions = await AssignmentSubmission.find({
      assignment: assignmentId,
      status: 'graded'
    });

    if (submissions.length > 0) {
      const marks = submissions.map(s => s.marksObtained);
      const average = marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
      const highest = Math.max(...marks);
      const lowest = Math.min(...marks);

      await Assignment.findByIdAndUpdate(assignmentId, {
        averageMarks: Math.round(average * 100) / 100,
        highestMarks: highest,
        lowestMarks: lowest,
        gradedCount: submissions.length
      });
    }
  } catch (err) {
    console.error('Update statistics error:', err);
  }
}
