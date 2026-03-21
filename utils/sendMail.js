const nodemailer = require("nodemailer");

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!to) {
      console.log("⚠️ No recipient email provided");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Task Manager" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html, // ✅ use html instead of text
    });

    console.log("✅ Email sent to:", to);

  } catch (err) {
    console.error("❌ Mail Error:", err.message);
  }
};

module.exports = sendMail;