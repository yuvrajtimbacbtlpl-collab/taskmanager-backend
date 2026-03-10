const sendEmail = require("./");

sendEmail({
  to: "your_email@example.com",
  subject: "Test Task Email",
  html: "<h1>Hello!</h1><p>This is a test email from Task Manager.</p>",
});