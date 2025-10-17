module.exports = function role(requiredRole) {
  return function (req, res, next) {
    try {
      if (!req.user || req.user.role !== requiredRole) {
        return res.status(403).json({ message: "Access denied" });
      }
      next();
    } catch (err) {
      console.error("Role middleware error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };
};
module.exports = function role(requiredRole) {
  return function (req, res, next) {
    try {
      if (!req.user) {
        return res.status(403).json({ message: "Access denied - no user" });
      }

      const userRole = req.user.role;
      
      // Case 1: requiredRole is an array - check if user has any of the roles
      if (Array.isArray(requiredRole)) {
        if (!requiredRole.includes(userRole)) {
          return res.status(403).json({ 
            message: `Access denied. Required roles: ${requiredRole.join(', ')}` 
          });
        }
      } 
      // Case 2: requiredRole is a string - check exact match
      else if (userRole !== requiredRole) {
        return res.status(403).json({ 
          message: `Access denied. Required role: ${requiredRole}` 
        });
      }

      next();
    } catch (err) {
      console.error("Role middleware error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };
};