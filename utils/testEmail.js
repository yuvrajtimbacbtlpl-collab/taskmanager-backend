// Run this from your backend folder: node testMail.js
require("dotenv").config();
const nodemailer = require("nodemailer");

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

console.log("📧 EMAIL_USER:", EMAIL_USER);
console.log("🔑 EMAIL_PASS:", EMAIL_PASS ? `${EMAIL_PASS.slice(0,4)}****` : "NOT SET");

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error("❌ EMAIL_USER or EMAIL_PASS is missing from .env!");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

async function test() {
  try {
    console.log("\n🔄 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified!");

    console.log("\n🔄 Sending test email...");
    const info = await transporter.sendMail({
      from: `"Task Manager" <${EMAIL_USER}>`,
      to: EMAIL_USER, // sends to yourself as a test
      subject: "✅ Test Email from Task Manager",
      html: `
        <h2>Mail is working!</h2>
        <p>If you see this, your email setup is correct.</p>
      `,
    });

    console.log("✅ Email sent! Message ID:", info.messageId);
  } catch (err) {
    console.error("\n❌ FAILED:", err.message);
    if (err.responseCode) console.error("📛 SMTP Code:", err.responseCode);
    if (err.response)    console.error("📛 SMTP Response:", err.response);
    console.log("\n💡 Common fixes:");
    console.log("   1. Make sure EMAIL_USER is your full Gmail: yourname@gmail.com");
    console.log("   2. EMAIL_PASS must be a 16-char App Password (no spaces)");
    console.log("   3. App Password requires 2FA to be ON on your Google account");
    console.log("   4. Generate App Password at: https://myaccount.google.com/apppasswords");
  }
}

test();