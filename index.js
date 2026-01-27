import "dotenv/config";
import express from "express";
import cors from "cors";

import dialpadAuthRouter from "./routes/dialpadAuth.js";
import webhooksRouter from "./routes/webhooks.js";

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
// Capture raw body for webhook signature verification while still parsing JSON.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "CTI Server is running" });
});

// Dialpad OAuth routes
app.use("/auth/dialpad", dialpadAuthRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
