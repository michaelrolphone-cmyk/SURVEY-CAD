const express = require("express");
const multer = require("multer");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { extractBasisFromPdf } = require("./extractor");

const app = express();
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  dest: path.join(os.tmpdir(), "ros_uploads"),
  limits: { fileSize: 35 * 1024 * 1024 } // adjust as needed
});

app.get("/", (_req, res) => {
  res.type("text").send("ROS Basis Extractor is running. POST /extract with form-data field 'pdf'.");
});

app.post("/extract", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file field 'pdf'." });

  const pdfPath = req.file.path;
  try {
    const result = await extractBasisFromPdf(pdfPath, {
      maxPages: Number(req.query.maxPages || 2),
      dpi: Number(req.query.dpi || 300),
      debug: String(req.query.debug || "0") === "1"
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e), stack: e?.stack });
  } finally {
    // cleanup upload
    try { await fs.unlink(pdfPath); } catch {}
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on :${port}`));
