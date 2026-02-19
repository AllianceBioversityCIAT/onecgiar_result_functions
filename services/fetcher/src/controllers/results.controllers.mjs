import express from "express";
import { getResult, getResultByCode } from "../services/results.service.mjs";

const router = express.Router();

router.get("/", async (req, res) => {
  const page = Number(req.query.page);
  const size = Number(req.query.size);
  const results = await getResult(page, size);
  res.status(results.statusCode).json(results.results);
});
router.get("/:code", async (req, res) => {
  const resultCode = req.params.code;
  const result = await getResultByCode(resultCode);
  res.status(result.statusCode).json(result.results);
});

export default router;
