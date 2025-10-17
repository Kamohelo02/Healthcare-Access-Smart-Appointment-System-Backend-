require("dotenv").config(); 

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // only for sandbox testing

const https = require("https");
const axios = require("axios");

const httpsAgent = new https.Agent({
  secureProtocol: "TLSv1_2_method",
});

const sendSMSNotification = async (phoneNumber, message, userId = null) => {
  try {
    const username = process.env.AT_USERNAME || "sandbox";
    const apiKey = process.env.AT_API_KEY || "atsk_c1525b1a72a9a17fa3f7eeff811352b8c7b38567a63842897db92c1e69de4c83a4b6203e";

    console.log("🔑 Africa's Talking - Using credentials:");
    console.log("Username:", username);
    console.log("API Key:", apiKey ? "Present" : "Missing");

    if (!username || !apiKey) {
      throw new Error("Missing Africa's Talking credentials");
    }

    if (!phoneNumber || !message) {
      console.log("⚠️ Missing phone number or message, skipping SMS.");
      return { success: false, error: "Missing phone or message" };
    }

    // Use the exact same format as your working test
    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

    console.log("📤 Sending SMS to:", formattedPhone);

    const response = await axios.post(
      "https://api.sandbox.africastalking.com/version1/messaging",
      new URLSearchParams({
        username: username,
        to: formattedPhone,
        message: message,
        bulkSMSMode: 1,
      }),
      {
        headers: {
          apikey: apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent,
      }
    );

    console.log("✅ SMS sent successfully via util!");
    console.log("Response:", response.data);
    
    return { 
      success: true, 
      data: response.data,
      message: "SMS sent successfully"
    };

  } catch (error) {
    console.error("❌ Error in sendSMSNotification:", error.message);
    console.error("Full error:", error.response?.data || error);
    
    throw error;
  }
};

module.exports = sendSMSNotification;