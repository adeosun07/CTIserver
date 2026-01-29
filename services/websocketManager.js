/**
 * WebSocket server for real-time call and voicemail updates
 *
 * Features:
 * - Per-app isolated rooms/channels
 * - Authentication via x-app-api-key
 * - Event broadcasting for call and voicemail lifecycle
 * - Graceful disconnect handling
 * - Per-connection event emitter
 */

import { WebSocketServer } from "ws";
import pool from "../db.js";

// In-memory store of active connections per app
const appConnections = new Map(); // Map<app_id, Set<WebSocket>>

/**
 * Initialize WebSocket server attached to HTTP server
 * @param {http.Server} httpServer - Express HTTP server instance
 * @returns {WebSocketServer} - WebSocket server instance
 */
export function initializeWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    clientTracking: false, // We manage connections per-app manually
  });

  // Handle HTTP upgrade requests
  httpServer.on("upgrade", async (request, socket, head) => {
    // Only upgrade /ws paths
    if (!request.url.startsWith("/ws")) {
      socket.destroy();
      return;
    }

    try {
      // Extract and validate API key from query params or headers
      const urlParams = new URL(request.url, `http://${request.headers.host}`);
      const apiKey =
        urlParams.searchParams.get("api_key") ||
        request.headers["x-app-api-key"];

      if (!apiKey) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Validate API key and get app_id
      const appResult = await pool.query(
        "SELECT id, name, is_active FROM apps WHERE api_key = $1 LIMIT 1",
        [apiKey],
      );

      if (appResult.rowCount === 0 || !appResult.rows[0].is_active) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      const app_id = appResult.rows[0].id;

      // Complete WebSocket handshake with error handling
      wss.handleUpgrade(request, socket, head, (ws) => {
        try {
          // Attach app_id to WebSocket object
          ws.app_id = app_id;
          ws.app_name = appResult.rows[0].name;
          ws.isAlive = true;

          // Add to app's connection set
          if (!appConnections.has(app_id)) {
            appConnections.set(app_id, new Set());
          }
          appConnections.get(app_id).add(ws);

          console.log(
            `[WS] App "${ws.app_name}" (${app_id}) connected. Total connections: ${appConnections.get(app_id).size}`,
          );

          // Handle incoming messages (echo back or reserved for future use)
          ws.on("message", (data) => {
            try {
              const message = JSON.parse(data);
              // Reserved for future: subscriptions, filters, etc.
              console.log(`[WS] Message from ${ws.app_name}:`, message);
            } catch (err) {
              console.error("[WS] Invalid message format:", err.message);
            }
          });

          // Handle pings for keep-alive
          ws.on("pong", () => {
            ws.isAlive = true;
          });

          // Handle disconnect
          ws.on("close", () => {
            const connections = appConnections.get(app_id);
            if (connections) {
              connections.delete(ws);
              console.log(
                `[WS] App "${ws.app_name}" disconnected. Remaining: ${connections.size}`,
              );

              // Clean up empty sets
              if (connections.size === 0) {
                appConnections.delete(app_id);
              }
            }
          });

          // Handle errors
          ws.on("error", (err) => {
            console.error(`[WS] Error on app ${ws.app_name}:`, err.message);
          });
        } catch (err) {
          // If there's an error during WebSocket setup, close the connection
          console.error("[WS] Error during connection setup:", err.message);
          ws.close(1011, "Server error during setup");
        }
      });
    } catch (err) {
      console.error("[WS] Upgrade error:", err);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  // Heartbeat interval to detect dead connections
  const heartbeatInterval = setInterval(() => {
    appConnections.forEach((connections, app_id) => {
      connections.forEach((ws) => {
        if (!ws.isAlive) {
          console.log(`[WS] Terminating dead connection for app ${app_id}`);
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    });
  }, 30000); // Every 30 seconds

  return { wss, heartbeatInterval, appConnections };
}

/**
 * Broadcast an event to all WebSocket clients connected to an app
 * @param {string} app_id - Application ID
 * @param {object} eventPayload - Event data to broadcast
 */
export function broadcastToApp(app_id, eventPayload) {
  const connections = appConnections.get(app_id);

  if (!connections || connections.size === 0) {
    console.log(`[WS] No active connections for app ${app_id}`);
    return;
  }

  const message = JSON.stringify(eventPayload);
  let successCount = 0;
  let failureCount = 0;

  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, (err) => {
        if (err) {
          console.error(`[WS] Send error to ${app_id}:`, err.message);
          failureCount++;
        } else {
          successCount++;
        }
      });
    }
  });

  if (successCount > 0) {
    console.log(
      `[WS] Broadcasted event to ${successCount} clients for app ${app_id}`,
    );
  }
  if (failureCount > 0) {
    console.warn(
      `[WS] Failed to send to ${failureCount} clients for app ${app_id}`,
    );
  }
}

/**
 * Broadcast event to specific user within an app (if mapping exists)
 * @param {string} app_id - Application ID
 * @param {number} dialpad_user_id - Dialpad user ID
 * @param {object} eventPayload - Event data
 */
export async function broadcastToUser(app_id, dialpad_user_id, eventPayload) {
  try {
    // Get the CRM user ID from mapping
    const mappingResult = await pool.query(
      `SELECT crm_user_id FROM dialpad_user_mappings 
       WHERE app_id = $1 AND dialpad_user_id = $2 LIMIT 1`,
      [app_id, dialpad_user_id],
    );

    if (mappingResult.rowCount === 0) {
      console.log(`[WS] No user mapping for Dialpad user ${dialpad_user_id}`);
      // Fall back to app-wide broadcast
      broadcastToApp(app_id, eventPayload);
      return;
    }

    const crm_user_id = mappingResult.rows[0].crm_user_id;

    // For now, broadcast to entire app (filtering by user could be done client-side)
    // In the future, you could implement per-user message delivery with metadata
    const enrichedPayload = {
      ...eventPayload,
      target_crm_user: crm_user_id,
    };

    broadcastToApp(app_id, enrichedPayload);
  } catch (err) {
    console.error("[WS] Error in broadcastToUser:", err);
    // Fallback to app broadcast
    broadcastToApp(app_id, eventPayload);
  }
}

/**
 * Get connection count for an app (for monitoring)
 * @param {string} app_id - Application ID
 * @returns {number} - Number of active connections
 */
export function getAppConnectionCount(app_id) {
  const connections = appConnections.get(app_id);
  return connections ? connections.size : 0;
}

/**
 * Get total connection count across all apps
 * @returns {number} - Total active connections
 */
export function getTotalConnectionCount() {
  let total = 0;
  appConnections.forEach((connections) => {
    total += connections.size;
  });
  return total;
}
