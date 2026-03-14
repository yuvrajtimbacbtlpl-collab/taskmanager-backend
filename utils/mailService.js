const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // Use your provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendProjectEmail = async (user, project, type = "create") => {
  const isUpdate = type === "update";
  
  const mailOptions = {
    from: `"Project Management" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: isUpdate ? `Update: Project "${project.name}"` : `New Project Assigned: "${project.name}"`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px; overflow: hidden;">
        <div style="background-color: ${isUpdate ? '#f59e0b' : '#2563eb'}; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Project Notification</h1>
        </div>
        <div style="padding: 20px; color: #333;">
          <p>Hello <strong>${user.username}</strong>,</p>
          <p>You have been ${isUpdate ? 'updated on' : 'assigned to'} a project in the Management Dashboard.</p>
          
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Project Name:</strong> ${project.name}</p>
            <p style="margin: 5px 0;"><strong>Type:</strong> ${project.type}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ${project.isActive ? 'Active' : 'Inactive'}</p>
          </div>

          <p>Please log in to your dashboard to view the full details and start collaborating.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/projects" 
               style="background-color: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
               View Project
            </a>
          </div>
        </div>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${user.email}`);
  } catch (error) {
    console.error("Email send failed:", error);
  }
};