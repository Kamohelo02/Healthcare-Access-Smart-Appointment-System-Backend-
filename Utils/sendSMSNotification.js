const twilio = require("twilio");

// Load Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Initialize client
const client = twilio(accountSid, authToken);

/**
 * Send SMS notification
 * @param {string} phoneNumber - Recipient phone number (e.g. +1234567890)
 * @param {string} message - Message content
 */
const sendSMSNotification = async (phoneNumber, message) => {
  try {
    if (!phoneNumber || !message) {
      console.log("SMS skipped: Missing phone number or message");
      return;
    }

    // ✅ Ensure phone number has + prefix
    const formattedPhone = phoneNumber.startsWith("+") 
      ? phoneNumber 
      : `+${phoneNumber}`;

    // ✅ Send SMS via Twilio
    await client.messages.create({
      body: message,
      to: formattedPhone,
      from: twilioPhone
    });

    console.log(`📩 SMS sent to ${formattedPhone}`);
  } catch (error) {
    console.error("❌ Twilio SMS error:", error.message);
    // Do not throw error — prevents SMS failures from breaking app
  }
};

module.exports = sendSMSNotification;


