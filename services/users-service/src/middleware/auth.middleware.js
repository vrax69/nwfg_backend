import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  // Usamos el JWT_SECRET que está en env/users.env
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("❌ JWT Verification Failed:", err.message);
      return res.sendStatus(401); // <--- Este es el 401 que reporta el upload-service
    }
    req.user = user;
    next();
  });
};