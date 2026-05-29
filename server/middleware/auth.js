// server/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Teamlead-only guard
module.exports.tlOnly = function tlOnly(req, res, next) {
  if (req.user?.role !== 'teamlead') {
    return res.status(403).json({ error: 'Teamlead only' });
  }
  next();
};
