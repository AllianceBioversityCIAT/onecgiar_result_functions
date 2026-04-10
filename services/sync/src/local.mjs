/**
 * Punto de entrada para ejecutar el servidor en local.
 * Carga las variables de .env y arranca Express en el puerto indicado.
 */
import "dotenv/config";
import { createApp } from "./server.mjs";

const app = createApp();
const PORT = Number.parseInt(process.env.PORT || "3001", 10);

app.listen(PORT, () => {
  console.log(`Sync API local: http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Docs:    http://localhost:${PORT}/docs`);
});

