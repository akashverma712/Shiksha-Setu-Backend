const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/marks', require('./routes/marks'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/student'));
// app.use('/api/students', require('./routes/attendance'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/teachers', require('./routes/teacher'));
// app.get('/api/students/all', (req, res) => {
// 	res.json({
// 		success: true,
// 		message: 'STUDENT ROUTE IS WORKING! YOU WIN!',
// 		students: ['Niraj', 'Praveen', 'Aarav'],
// 	});
// });
app.get('/', (req, res) => res.send('API Running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
