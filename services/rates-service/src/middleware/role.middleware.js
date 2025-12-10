module.exports = function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
  
      if (!roles.includes(req.user.rol)) {
        return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
      }
  
      next();
    };
  };
  