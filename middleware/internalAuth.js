/**
 * Internal API Authentication Middleware
 *
 * Protects sensitive internal endpoints (/internal/*) with a shared secret
 * configured via INTERNAL_API_SECRET environment variable.
 *
 * Usage:
 *   router.use(internalAuth);  // Protect all routes on this router
 *
 * Client request:
 *   Authorization: Bearer <your-internal-secret>
 *
 * Example:
 *   curl -X POST http://localhost:4000/internal/apps/123/api-key \
 *     -H "Authorization: Bearer your-secret-here"
 */

export async function internalAuth(req, res, next) {
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!internalSecret) {
    console.error("[InternalAuth] INTERNAL_API_SECRET not configured");
    return res.status(500).json({
      error: "Internal authentication not configured",
      message: "INTERNAL_API_SECRET environment variable is missing",
    });
  }

  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message:
        "Missing or invalid Authorization header. Use: Authorization: Bearer <secret>",
    });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  if (token !== internalSecret) {
    console.warn(`[InternalAuth] Invalid token attempt from ${req.ip}`);
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid authentication token",
    });
  }

  // Token is valid, proceed
  req.authenticated = true;
  next();
}
