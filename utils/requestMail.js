// server/utils/requestMail.js

const nodemailer = require("nodemailer");

const sendRequestMail = async (to, subject, text) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });

    console.log("Mail sent successfully");
  } catch (error) {
    console.error("Mail error:", error);
  }
};

module.exports = sendRequestMail;  