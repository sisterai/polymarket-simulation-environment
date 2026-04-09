import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { buildRouter } from "./api/routes.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = loadConfig();
const app = express();
app.use(cors());
app.use("/api", buildRouter(config));
const publicDir = path.join(__dirname, "..", "public");
app.use("/", express.static(publicDir));
app.listen(config.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${config.PORT}`);
});
//# sourceMappingURL=index.js.map