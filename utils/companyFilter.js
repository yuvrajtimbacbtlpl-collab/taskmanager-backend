/**
 * Utility: Build a MongoDB company filter for admin queries.
 *
 * company param from frontend:
 *   "global"        → { company: null }           (only global/shared records)
 *   "<objectId>"    → { $or: [{ company: id }, { company: null }] }  (company's + global)
 *   undefined/null  → {}                           (no filter = all records)
 *
 * For non-admin users, always scoped to their own company + global.
 */
const mongoose = require("mongoose");

/**
 * @param {object} reqUser  - req.user from authMiddleware
 * @param {string} queryCompany - req.query.company value
 * @returns {object} MongoDB query fragment for the company field
 */
function buildCompanyQuery(reqUser, queryCompany) {
  const roleName = (reqUser?.role?.name || reqUser?.role || "").toUpperCase();
  const isAdmin = roleName === "ADMIN";
 
  if (isAdmin) {
    if (queryCompany === "global") {
      // ✅ Show only global records (company: null)
      return { company: null };
    }
    if (queryCompany && mongoose.Types.ObjectId.isValid(queryCompany)) {
      // ✅ Show this company's records + global records
      return { $or: [{ company: queryCompany }, { company: null }] };
    }
    // No filter — show everything (for admin overview pages)
    return {};
  }

  // Non-admin: always scoped to their company + global
  const userCompany = reqUser?.company;
  if (userCompany) {
    return { $or: [{ company: userCompany }, { company: null }] };
  }
  return { company: null }; // fallback: global only
}

/**
 * Resolve company ID to store when creating a record.
 * "global" → null (visible to all companies)
 * "<objectId>" → that ObjectId
 * null/undefined → null
 */
function resolveCompanyForCreate(reqUser, bodyCompany) {
  const roleName = (reqUser?.role?.name || reqUser?.role || "").toUpperCase();
  const isAdmin = roleName === "ADMIN";

  if (isAdmin) {
    if (bodyCompany === "global" || bodyCompany === null || bodyCompany === undefined) {
      return null; // global record
    }
    if (mongoose.Types.ObjectId.isValid(bodyCompany)) {
      return bodyCompany;
    }
    return null;
  }

  return reqUser?.company || null;
}

module.exports = { buildCompanyQuery, resolveCompanyForCreate };
