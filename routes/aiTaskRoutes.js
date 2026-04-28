// routes/aiTaskRoutes.js
// AI Task Assistant Routes
// Endpoints for AI-powered task analysis and suggestions

const express = require("express");
const router = express.Router();
const aiTaskAssistantController = require("../controllers/aiTaskAssistantController");
const authMiddleware = require("../middleware/authMiddleware");

// All AI endpoints require authentication
router.use(authMiddleware);

/**
 * POST /tasks/ai-suggest
 * Generate AI suggestions for subtasks, deadlines, and priority
 * 
 * Body: {
 *   "title": "string (required)",
 *   "description": "string",
 *   "estimatedHours": "number",
 *   "companyId": "string (required)",
 *   "projectId": "string",
 *   "additionalContext": "string"
 * }
 */
router.post("/ai-suggest", aiTaskAssistantController.generateAISuggestions);

/**
 * POST /tasks/ai-enhance-description
 * Use AI to write a professional task description
 * 
 * Body: {
 *   "title": "string (required)",
 *   "briefDescription": "string",
 *   "context": "string",
 *   "companyId": "string (required)"
 * }
 */
router.post(
  "/ai-enhance-description",
  aiTaskAssistantController.enhanceTaskDescription
);

/**
 * POST /tasks/ai-predict-priority
 * Predict task priority based on content analysis
 * 
 * Body: {
 *   "title": "string (required)",
 *   "description": "string",
 *   "estimatedHours": "number",
 *   "context": "string",
 *   "companyId": "string (required)"
 * }
 */
router.post(
  "/ai-predict-priority",
  aiTaskAssistantController.predictTaskPriority
);

module.exports = router;