import { Plugin } from "vite";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Dev only: the weakspot data lives in the browser's localStorage. After each
// test the page posts it here and it's written to frontend/.weakspot/, so it
// can be analysed from disk (scripts/weakspot-report.ts) without the browser.
// Git-ignored; never leaves this machine.

const dataDir = fileURLToPath(new URL("../.weakspot", import.meta.url));
const maxBodyBytes = 20 * 1024 * 1024;

export function weakspotSync(): Plugin {
  return {
    name: "weakspot-sync",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__weakspot/sync", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBodyBytes) {
            res.statusCode = 413;
            res.end();
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => {
          if (res.writableEnded) return;
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            JSON.parse(body); // reject anything that isn't JSON
            mkdirSync(dataDir, { recursive: true });
            // write then rename, so a reader never sees a half-written file
            const target = path.join(dataDir, "data.json");
            writeFileSync(`${target}.tmp`, body);
            renameSync(`${target}.tmp`, target);
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}
