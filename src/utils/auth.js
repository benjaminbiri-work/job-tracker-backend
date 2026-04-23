import jwt from "jsonwebtoken";
export function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });
}
export function readToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}
