module.exports = (requiredPermission) => {
  return (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ msg: "Unauthorized" });
      }

      // ADMIN bypass
      if (user.role?.name?.toUpperCase() === "ADMIN") {
        return next();
      }

      const permissions = user.role?.permissions || [];

      const hasAccess = permissions.some((perm) => {
        if (typeof perm === "string") return perm === requiredPermission;

        if (typeof perm === "object") {
          return (
            perm.value === requiredPermission ||
            perm.name === requiredPermission
          );
        }

        return false;
      });

      if (!hasAccess) {
        return res.status(403).json({
          msg: `Forbidden: Missing permission ${requiredPermission}`,
        });
      }

      next();

    } catch (err) {
      return res.status(500).json({ msg: "Permission check failed" });
    }
  };
};
