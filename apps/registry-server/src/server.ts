import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

const app = await buildApp();

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error({ err }, "Failed to start server");
  process.exit(1);
});
