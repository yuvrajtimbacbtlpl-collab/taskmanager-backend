// controllers/aiTaskAssistantController.js
// AI-POWERED TASK ASSISTANT: Auto-generates subtasks, suggests deadlines, predicts priority
// Uses Anthropic Claude API (claude-sonnet) for intelligent suggestions

const axios = require("axios");
const Task = require("../models/Task");
const Company = require("../models/Company");
const { encrypt } = require("../utils/encrypt");

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

if (!CLAUDE_API_KEY) {
  console.warn(
    "⚠️  ANTHROPIC_API_KEY not set. AI Task Assistant will not work."
  );
}

/**
 * POST /tasks/ai-suggest
 * 
 * Request body:
 * {
 *   "title": "Build user authentication system",
 *   "description": "Implement JWT-based auth with email verification",
 *   "estimatedHours": 16,
 *   "companyId": "...",
 *   "projectId": "...",
 *   "additionalContext": "Must integrate with existing DB schema"  // optional
 * }
 * 
 * Returns:
 * {
 *   "subtasks": [{ "title": "...", "estimatedHours": ... }, ...],
 *   "suggestedDeadline": "2025-04-20",
 *   "suggestedPriority": "High",
 *   "reasoning": "...",
 *   "aiSuggestions": { full Claude response },
 * }
 */
exports.generateAISuggestions = async (req, res) => {
  try {
    const {
      title,
      description,
      estimatedHours,
      companyId,
      projectId,
      additionalContext,
    } = req.body;

    if (!title || !companyId) {
      return res.status(400).json({
        message: "title and companyId are required",
      });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({
        message:
          "AI Task Assistant is not configured. Please set ANTHROPIC_API_KEY environment variable.",
      });
    }

    // Get company info (for working hours context)
    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Build a detailed prompt for Claude
    const systemPrompt = `You are an expert project manager and task breakdown specialist.
Your job is to help teams decompose complex tasks into manageable subtasks, estimate work, and predict priority.

When analyzing a task, you must:
1. Break it into 3-7 logical subtasks
2. Estimate hours for each subtask (realistic, accounting for meetings, QA, code review)
3. Suggest an appropriate priority level (Critical, High, Normal, Low)
4. Recommend a deadline based on estimated total hours + team capacity
5. Provide reasoning for your suggestions

Output ONLY valid JSON (no markdown, no code blocks, no preamble).`;

    const userPrompt = `
Task Title: "${title}"
Description: "${description || "No description provided"}"
Estimated Total Hours: ${estimatedHours || "Not specified"}
Additional Context: ${additionalContext || "None"}

Company Name: ${company.name || "Unknown"}
Working Hours Config: ${
      company.workingHours
        ? JSON.stringify(company.workingHours).substring(0, 200)
        : "Standard 9-5"
    }

Provide:
1. A JSON array called "subtasks" with objects: { "title": "...", "estimatedHours": ..., "description": "..." }
2. A "suggestedPriority" string: one of ["Critical", "High", "Normal", "Low"]
3. A "suggestedDeadlineOffsetDays" number: days from today
4. A "reasoning" string explaining the breakdown and priority

Example format:
{
  "subtasks": [
    { "title": "Design API schema", "estimatedHours": 4, "description": "Design REST endpoints and DB schema" },
    { "title": "Implement backend", "estimatedHours": 8, "description": "Code endpoints, add validation" }
  ],
  "suggestedPriority": "High",
  "suggestedDeadlineOffsetDays": 7,
  "reasoning": "This task requires careful planning before implementation. Estimated 12 hours of work..."
}`;

    // Call Claude API
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    // Extract Claude's response
    const claudeResponse =
      response.data.content[0].type === "text"
        ? response.data.content[0].text
        : "";

    if (!claudeResponse) {
      return res.status(500).json({
        message: "Claude API returned empty response",
      });
    }

    // Parse JSON from Claude (may have markdown formatting)
    let suggestions;
    try {
      // Try to extract JSON if wrapped in markdown code blocks
      const jsonMatch = claudeResponse.match(/```json\n?([\s\S]*?)\n?```/) ||
        claudeResponse.match(/```\n?([\s\S]*?)\n?```/) || [null, claudeResponse];

      const jsonString = jsonMatch[1] || claudeResponse;
      suggestions = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", claudeResponse);
      return res.status(500).json({
        message: "Failed to parse AI suggestions",
        rawResponse: claudeResponse,
      });
    }

    // Validate and sanitize the suggestions
    if (!suggestions.subtasks || !Array.isArray(suggestions.subtasks)) {
      suggestions.subtasks = [];
    }

    if (!suggestions.suggestedPriority) {
      suggestions.suggestedPriority = "Normal";
    }

    if (
      !["Critical", "High", "Normal", "Low"].includes(
        suggestions.suggestedPriority
      )
    ) {
      suggestions.suggestedPriority = "Normal";
    }

    // Calculate suggested deadline
    let suggestedDeadline = null;
    if (suggestions.suggestedDeadlineOffsetDays) {
      const today = new Date();
      suggestedDeadline = new Date(
        today.getTime() + suggestions.suggestedDeadlineOffsetDays * 24 * 60 * 60 * 1000
      );
      suggestedDeadline = suggestedDeadline.toISOString().split("T")[0]; // YYYY-MM-DD
    }

    // Return structured response
    return res.status(200).json({
      success: true,
      aiSuggestions: {
        subtasks: suggestions.subtasks || [],
        suggestedPriority: suggestions.suggestedPriority || "Normal",
        suggestedDeadline,
        suggestedDeadlineOffsetDays: suggestions.suggestedDeadlineOffsetDays || 7,
        reasoning: suggestions.reasoning || "",
      },
      message: "AI suggestions generated successfully",
    });
  } catch (error) {
    console.error("AI Suggestion Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Failed to generate AI suggestions",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

/**
 * POST /tasks/ai-enhance-description
 * 
 * Use Claude to write a professional, detailed task description
 * from a brief title/notes
 */
exports.enhanceTaskDescription = async (req, res) => {
  try {
    const { title, briefDescription, context, companyId } = req.body;

    if (!title || !companyId) {
      return res.status(400).json({
        message: "title and companyId are required",
      });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({
        message: "AI Task Assistant is not configured",
      });
    }

    const userPrompt = `
You are a professional project manager writing task descriptions.

Write a clear, detailed task description for:
Title: "${title}"
Brief Notes: "${briefDescription || "None provided"}"
Context: "${context || "General task"}"

Requirements:
- Be concise but comprehensive (3-5 sentences)
- Include acceptance criteria if applicable
- Mention dependencies or prerequisites
- Use professional language
- Do NOT use markdown formatting
- Output ONLY the description text, nothing else`;

    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    const enhancedDescription =
      response.data.content[0].type === "text"
        ? response.data.content[0].text
        : "";

    return res.status(200).json({
      success: true,
      enhancedDescription: enhancedDescription.trim(),
      message: "Description enhanced successfully",
    });
  } catch (error) {
    console.error("Enhanced Description Error:", error.message);
    return res.status(500).json({
      message: "Failed to enhance description",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

/**
 * POST /tasks/ai-predict-priority
 * 
 * Intelligent priority prediction based on task content, complexity, dependencies
 */
exports.predictTaskPriority = async (req, res) => {
  try {
    const { title, description, estimatedHours, context, companyId } = req.body;

    if (!title || !companyId) {
      return res.status(400).json({
        message: "title and companyId are required",
      });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({
        message: "AI Task Assistant is not configured",
      });
    }

    const userPrompt = `
You are an expert at prioritizing tasks based on urgency, complexity, and business impact.

Analyze this task and predict its priority:

Title: "${title}"
Description: "${description || "No description"}"
Estimated Hours: ${estimatedHours || "Unknown"}
Context: "${context || "General work"}"

Based on:
- Keywords that suggest urgency (blocking, critical, security, customer-facing, etc.)
- Complexity (hours, technical depth, dependencies)
- Business impact

Return ONLY a JSON object with:
{
  "priority": "one of: Critical, High, Normal, Low",
  "confidence": "0-100 (confidence in this prediction)",
  "reasoning": "brief explanation in 1-2 sentences"
}`;

    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: CLAUDE_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    const claudeText =
      response.data.content[0].type === "text"
        ? response.data.content[0].text
        : "";

    let prediction;
    try {
      const jsonMatch = claudeText.match(/```json\n?([\s\S]*?)\n?```/) || [
        null,
        claudeText,
      ];
      const jsonString = jsonMatch[1] || claudeText;
      prediction = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse priority prediction:", claudeText);
      return res.status(500).json({
        message: "Failed to parse priority prediction",
      });
    }

    if (!["Critical", "High", "Normal", "Low"].includes(prediction.priority)) {
      prediction.priority = "Normal";
    }

    return res.status(200).json({
      success: true,
      prediction: {
        priority: prediction.priority || "Normal",
        confidence: Math.min(
          100,
          Math.max(0, prediction.confidence || 75)
        ),
        reasoning: prediction.reasoning || "Priority assessed automatically",
      },
      message: "Priority prediction completed",
    });
  } catch (error) {
    console.error("Priority Prediction Error:", error.message);
    return res.status(500).json({
      message: "Failed to predict priority",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};