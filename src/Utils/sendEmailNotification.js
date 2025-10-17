require("dotenv").config();
const sgMail = require('@sendgrid/mail');

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

class EmailNotificationService {
  constructor() {
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'notifications@healthcareapp.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'Healthcare App';
  }

  /**
   * Validate email address
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
    return email.trim().toLowerCase();
  }

  /**
   * Send email notification
   */
  async sendEmail(toEmail, subject, message, htmlContent = null, options = {}) {
    try {
      console.log("📧 SendGrid - Preparing email...");

      // Validate inputs
      const validatedEmail = this.validateEmail(toEmail);
      
      if (!subject || !message) {
        throw new Error("Subject and message are required");
      }

      console.log("Sending email to:", validatedEmail);
      console.log("Subject:", subject);

      const msg = {
        to: validatedEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: subject,
        text: message,
        html: htmlContent || this.formatHTML(message, subject),
        ...options
      };

      const response = await sgMail.send(msg);
      
      console.log("✅ Email sent successfully!");
      console.log("Status:", response[0].statusCode);
      
      return {
        success: true,
        message: "Email notification sent successfully",
        messageId: response[0].headers['x-message-id'],
        statusCode: response[0].statusCode
      };

    } catch (error) {
      console.error("❌ SendGrid Error:", error.message);
      
      if (error.response) {
        console.error("SendGrid Response Body:", error.response.body);
      }
      
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  /**
   * Format basic HTML template
   */
  formatHTML(message, subject) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 20px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${subject}</h2>
            </div>
            <div class="content">
              <p>${message.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="footer">
              <p>Healthcare App Notification System</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Send appointment notification template
   */
  async sendAppointmentNotification(toEmail, appointmentData) {
    const { patientName, appointmentDate, status, notes } = appointmentData;
    
    const subject = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    const htmlContent = `
      <div class="container">
        <div class="header">
          <h2>Appointment Update</h2>
        </div>
        <div class="content">
          <p>Dear ${patientName},</p>
          <p>Your appointment has been <strong>${status}</strong>.</p>
          <p><strong>Date & Time:</strong> ${new Date(appointmentDate).toLocaleString()}</p>
          ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
          <p>Thank you for choosing our healthcare services.</p>
        </div>
      </div>
    `;

    const textContent = `Appointment ${status} for ${patientName} on ${new Date(appointmentDate).toLocaleString()}. ${notes ? `Notes: ${notes}` : ''}`;

    return this.sendEmail(toEmail, subject, textContent, htmlContent);
  }
}

// Create singleton instance
const emailService = new EmailNotificationService();

module.exports = emailService;