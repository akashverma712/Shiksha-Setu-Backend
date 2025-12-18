exports.getMyMentor = async (req, res) => {
  const student = await Student.findById(req.user.id);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found"
    });
  }

  res.json({
    success: true,
    mentor: student.mentor
  });
};
