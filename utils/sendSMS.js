// utils/sendSMS.js
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendSMS = async (message) => {
  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,   // +12186950036
      to: process.env.ADMIN_NUMBER,            // +917479676602 ← ONLY YOUR NUMBER
    });

    console.log('SMS Sent →', msg.sid);
    return { success: true, sid: msg.sid };
  } catch (error) {
    console.error('Twilio Error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = sendSMS;
