// bew-routes.js
import express from "express";
import multer from "multer";
import { HttpError } from "./bew-store.js";

function sendError(res, err) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      details: err.details || undefined,
    });
  }
  console.error("[bew] unhandled:", err);
  return res.status(500).json({ error: "Internal server error", code: "internal_error" });
}

export function registerBewRoutes(app, store) {
  const router = express.Router();

  // JSON parsing (if not already set globally)
  // app.use(express.json({ limit: "2mb" }))

  // Multipart for evidence attachments
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: store.attachmentMaxBytes },
  });

  /* ------------------------------ health ------------------------------ */

  router.get("/health", (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  /* ------------------------------ casefiles ------------------------------ */

  router.get("/casefiles", async (req, res) => {
    try {
      const out = await store.listCasefiles({
        limit: req.query.limit,
        offset: req.query.offset,
        q: req.query.q,
        sort: req.query.sort,
      });
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles", async (req, res) => {
    try {
      const created = await store.createCasefile(req.body);
      res.status(201).json(created);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId", async (req, res) => {
    try {
      const out = await store.getCasefile(req.params.casefileId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.patch("/casefiles/:casefileId", async (req, res) => {
    try {
      const out = await store.updateCasefile(req.params.casefileId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.delete("/casefiles/:casefileId", async (req, res) => {
    try {
      await store.deleteCasefile(req.params.casefileId);
      res.status(204).end();
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId:duplicate", async (req, res) => {
    try {
      const out = await store.duplicateCasefile(req.params.casefileId, req.body || {});
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles:import", async (req, res) => {
    try {
      const out = await store.importCasefileBundle(req.body || {}, { rewriteIds: req.body?.rewriteIds !== false });
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId:export", async (req, res) => {
    try {
      const out = await store.exportCasefileBundle(req.params.casefileId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  /* ------------------------------ evidence ------------------------------ */

  router.get("/casefiles/:casefileId/evidence", async (req, res) => {
    try {
      const out = await store.listEvidence(req.params.casefileId, {
        limit: req.query.limit,
        offset: req.query.offset,
        type: req.query.type,
        tag: req.query.tag,
      });
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/evidence", async (req, res) => {
    try {
      const out = await store.createEvidence(req.params.casefileId, req.body);
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId/evidence/:evidenceId", async (req, res) => {
    try {
      const out = await store.getEvidence(req.params.casefileId, req.params.evidenceId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.patch("/casefiles/:casefileId/evidence/:evidenceId", async (req, res) => {
    try {
      const out = await store.updateEvidence(req.params.casefileId, req.params.evidenceId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.delete("/casefiles/:casefileId/evidence/:evidenceId", async (req, res) => {
    try {
      await store.deleteEvidence(req.params.casefileId, req.params.evidenceId);
      res.status(204).end();
    } catch (e) { sendError(res, e); }
  });

  router.post(
    "/casefiles/:casefileId/evidence/:evidenceId/attachment",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) throw new HttpError(400, "file is required (multipart field name 'file').", "bad_request");
        const out = await store.uploadEvidenceAttachment(req.params.casefileId, req.params.evidenceId, {
          filename: req.file.originalname,
          mime: req.file.mimetype,
          buffer: req.file.buffer,
        });
        res.json(out);
      } catch (e) { sendError(res, e); }
    },
  );

  router.get("/casefiles/:casefileId/evidence/:evidenceId/attachment", async (req, res) => {
    try {
      const { meta, buffer } = await store.downloadEvidenceAttachment(req.params.casefileId, req.params.evidenceId);
      res.setHeader("Content-Type", meta.mime || "application/octet-stream");
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Content-Disposition", `attachment; filename="${String(meta.name || "attachment.bin").replace(/"/g, "")}"`);
      res.status(200).send(buffer);
    } catch (e) { sendError(res, e); }
  });

  router.delete("/casefiles/:casefileId/evidence/:evidenceId/attachment", async (req, res) => {
    try {
      await store.deleteEvidenceAttachment(req.params.casefileId, req.params.evidenceId);
      res.status(204).end();
    } catch (e) { sendError(res, e); }
  });

  /* ------------------------------ extractions ------------------------------ */

  router.get("/casefiles/:casefileId/extractions", async (req, res) => {
    try {
      const out = await store.listExtractions(req.params.casefileId, {
        limit: req.query.limit,
        offset: req.query.offset,
        include: req.query.include,
        evidenceId: req.query.evidenceId,
      });
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/extractions", async (req, res) => {
    try {
      const out = await store.createExtraction(req.params.casefileId, req.body);
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/extractions:extractFromText", async (req, res) => {
    try {
      const out = await store.extractFromText(req.params.casefileId, req.body);
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/extractions:reorder", async (req, res) => {
    try {
      const out = await store.reorderExtractions(req.params.casefileId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId/extractions/:extractionId", async (req, res) => {
    try {
      const out = await store.getExtraction(req.params.casefileId, req.params.extractionId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.patch("/casefiles/:casefileId/extractions/:extractionId", async (req, res) => {
    try {
      const out = await store.updateExtraction(req.params.casefileId, req.params.extractionId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.delete("/casefiles/:casefileId/extractions/:extractionId", async (req, res) => {
    try {
      await store.deleteExtraction(req.params.casefileId, req.params.extractionId);
      res.status(204).end();
    } catch (e) { sendError(res, e); }
  });

  /* ------------------------------ corners + candidates ------------------------------ */

  router.get("/casefiles/:casefileId/corners", async (req, res) => {
    try {
      const out = await store.listCorners(req.params.casefileId, {
        limit: req.query.limit,
        offset: req.query.offset,
        status: req.query.status,
      });
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/corners", async (req, res) => {
    try {
      const out = await store.createCorner(req.params.casefileId, req.body);
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId/corners/:cornerId", async (req, res) => {
    try {
      const out = await store.getCorner(req.params.casefileId, req.params.cornerId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.patch("/casefiles/:casefileId/corners/:cornerId", async (req, res) => {
    try {
      const out = await store.updateCorner(req.params.casefileId, req.params.cornerId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.delete("/casefiles/:casefileId/corners/:cornerId", async (req, res) => {
    try {
      await store.deleteCorner(req.params.casefileId, req.params.cornerId);
      res.status(204).end();
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId/corners/:cornerId/candidates", async (req, res) => {
    try {
      const out = await store.listCandidates(req.params.casefileId, req.params.cornerId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/corners/:cornerId/candidates", async (req, res) => {
    try {
      const out = await store.createCandidate(req.params.casefileId, req.params.cornerId, req.body);
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId/corners/:cornerId/candidates/:candidateId", async (req, res) => {
    try {
      const out = await store.getCandidate(req.params.casefileId, req.params.cornerId, req.params.candidateId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.patch("/casefiles/:casefileId/corners/:cornerId/candidates/:candidateId", async (req, res) => {
    try {
      const out = await store.updateCandidate(req.params.casefileId, req.params.cornerId, req.params.candidateId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.delete("/casefiles/:casefileId/corners/:cornerId/candidates/:candidateId", async (req, res) => {
    try {
      await store.deleteCandidate(req.params.casefileId, req.params.cornerId, req.params.candidateId);
      res.status(204).end();
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/corners/:cornerId/candidates/:candidateId:choose", async (req, res) => {
    try {
      const out = await store.chooseCandidate(req.params.casefileId, req.params.cornerId, req.params.candidateId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/corners/:cornerId/candidates/:candidateId:unchoose", async (req, res) => {
    try {
      const out = await store.unchooseCandidate(req.params.casefileId, req.params.cornerId, req.params.candidateId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/corners/:cornerId:saveDecision", async (req, res) => {
    try {
      const out = await store.saveCornerDecision(req.params.casefileId, req.params.cornerId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  /* ------------------------------ decisions ------------------------------ */

  router.get("/casefiles/:casefileId/decisions", async (req, res) => {
    try {
      const out = await store.listDecisions(req.params.casefileId, {
        limit: req.query.limit,
        offset: req.query.offset,
        cornerId: req.query.cornerId,
      });
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/decisions", async (req, res) => {
    try {
      const out = await store.appendDecision(req.params.casefileId, req.body);
      res.status(201).json(out);
    } catch (e) { sendError(res, e); }
  });

  /* ------------------------------ traverse ------------------------------ */

  router.get("/casefiles/:casefileId/traverse", async (req, res) => {
    try {
      const out = await store.getTraverseConfig(req.params.casefileId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.patch("/casefiles/:casefileId/traverse", async (req, res) => {
    try {
      const out = await store.updateTraverseConfig(req.params.casefileId, req.body);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/traverse:syncIncludedCalls", async (req, res) => {
    try {
      const out = await store.syncIncludedCallsFromIncludedExtractions(req.params.casefileId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.post("/casefiles/:casefileId/traverse:run", async (req, res) => {
    try {
      const out = await store.runTraverse(req.params.casefileId, req.body || {});
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  router.get("/casefiles/:casefileId/traverse/results", async (req, res) => {
    try {
      const out = await store.getTraverseResults(req.params.casefileId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  /* ------------------------------ outputs ------------------------------ */

  router.get("/casefiles/:casefileId/outputs/package", async (req, res) => {
    try {
      const out = await store.getPrintablePackage(req.params.casefileId);
      res.json(out);
    } catch (e) { sendError(res, e); }
  });

  app.use(router);

  return router;
}
