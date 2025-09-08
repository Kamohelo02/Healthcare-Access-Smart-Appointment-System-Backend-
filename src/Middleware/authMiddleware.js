const jwt = require('jsonwebtoken');

exports.verifyStaffToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.staff = {
      user_id: decoded.user_id,
      role: decoded.role
    };

    if (decoded.role !== 'staff' && decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: not staff' });
    }

    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};
