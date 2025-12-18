// start.js — BRAND NEW FILE
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// DEBUG ROUTE — THIS WILL WORK
app.get('/debug', (req, res) => {
  res.json({
    message: "DEBUG ROUTE WORKING! SERVER IS ALIVE!",
    time: new Date().toISOString()
  });
});

// TEST STUDENT ROUTE
app.get('/api/students/all', (req, res) => {
  res.json({
    success: true,
    message: "STUDENT ROUTE IS WORKING! YOU WIN!",
    students: ["Niraj", "Praveen", "Aarav"]
  });
});

app.get('/', (req, res) => res.send('SERVER IS RUNNING'));

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`FRESH SERVER RUNNING AT http://localhost:${PORT}/debug`);
});
