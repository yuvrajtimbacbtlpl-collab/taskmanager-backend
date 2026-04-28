const nodemailer = require("nodemailer");

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!to) {
      console.log("⚠️ No recipient email provided");
      return;
    }

    // ✅ Debug: confirm env vars are loaded
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("❌ EMAIL_USER or EMAIL_PASS missing from .env");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // ✅ Verify connection before sending
    await transporter.verify();

    await transporter.sendMail({
      from: `"Task Manager" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log("✅ Email sent to:", to);

  } catch (err) {
    console.error("❌ Mail Error:", err.message);
    // ✅ Log the response code so you know exactly why it failed
    if (err.responseCode) {
      console.error("❌ SMTP Response Code:", err.responseCode);
    }
    if (err.response) {
      console.error("❌ SMTP Response:", err.response);
    }
  }
};

module.exports = sendMail;