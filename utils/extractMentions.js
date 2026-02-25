// Detect @username in description and return user IDs
const extractMentions = (text, users) => {
  const regex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const user = users.find(u => u.username === match[1]);
    if (user) mentions.push(user._id);
  }
  return mentions;
};

module.exports = extractMentions;