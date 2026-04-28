// utils/encrypt.js
// AES-256-CBC encryption utility for sensitive fields (dueDate, document content)
// Uses Node.js built-in crypto — NO extra npm packages needed

const crypto = require("crypto");

const ALGO = "aes-256-cbc";

// KEY is read lazily inside each function so dotenv has time to load first
function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error("ENCRYPTION_KEY is not set in .env file");
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a plain text string.
 * Returns a string in the format: ivHex:ciphertextHex
 * A random IV is generated per encryption for security.
 */
function encrypt(text) {
  if (!text) return null;
  const KEY = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(text), "utf8"),
    cipher.final(),
  ]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Returns the original plain text string.
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  // Guard: if the value was never encrypted (no colon), return as-is
  if (!encryptedText.includes(":")) return encryptedText;
  const KEY = getKey();
  const [ivHex, encHex] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedBuffer = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

module.exports = { encrypt, decrypt };