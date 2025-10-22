export default {
  entryPoints: ["src/index.mts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/index.mjs",
  packages: "external"
};
