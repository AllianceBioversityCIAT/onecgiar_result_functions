import express from "express";
import {
  getResult,
  getResultByCode,
  mapSourceFilterLabelsToStored,
} from "../services/results.service.mjs";
import { queryParam } from "../utils/query.mjs";
import { arrayFormat } from "../pipe/arrayFormat.mjs";

const router = express.Router();

router.get("/", async (req, res) => {
  const query = queryParam(req);
  const page = query("page", Number);
  const size = query("size", Number);
  const year = query("year", Number);
  const centerAcronym = query("centerAcronym", (value) =>
    arrayFormat(value).map((item) => item.toUpperCase()),
  );
  const resultCode = query("resultCode", (value) =>
    arrayFormat(value).map((item) => item.toUpperCase()),
  );
  const fundingType = query("fundingType", (value) =>
    arrayFormat(value).map((item) => String(item).trim()),
  );
  const resultType = query("resultType", (value) =>
    arrayFormat(value).map((item) => item.toLowerCase()),
  );
  const statusId = query("statusId", (value) =>
    arrayFormat(value).map(Number).filter((n) => Number.isFinite(n)),
  );
  const sourceLabels = query("source", (value) =>
    arrayFormat(value).map((item) => String(item).trim()),
  );
  const sourceStored = mapSourceFilterLabelsToStored(sourceLabels);
  const filters = {
    centerAcronym,
    resultCode,
    fundingType,
    year,
    resultType,
    statusId,
    ...(sourceStored.length > 0 ? { sourceStored } : {}),
  };

  const results = await getResult(page, size, filters);
  res.status(results.statusCode).json(results.results);
});

router.get("/:code", async (req, res) => {
  const resultCode = req.params.code;
  const result = await getResultByCode(resultCode);
  res.status(result.statusCode).json(result.results);
});

export default router;
