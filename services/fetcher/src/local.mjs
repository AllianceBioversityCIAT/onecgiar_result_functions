/**
 * Punto de entrada para ejecutar el servidor en local.
 * Carga las variables de .env y arranca Express en el puerto indicado.
 */
import "dotenv/config";
import app from "./server.mjs";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);

app.listen(PORT, () => {
  console.log(`Normalizer API local: http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Docs:    http://localhost:${PORT}/docs`);
});
