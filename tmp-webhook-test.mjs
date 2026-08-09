import { readFileSync } from "node:fs";

const line = readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("SCHEDULER_HOOK_SECRET="));

if (!line) {
  console.log("NO_SECRET_IN_ENV");
  process.exit(1);
}

const secret = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

// Test 1: sin secreto → esperado 401
try {
  const r1 = await fetch("http://localhost:3000/api/public/hooks/produce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slot: "viral" }),
  });
  console.log("SIN_SECRETO:", r1.status, await r1.text());
} catch (e) {
  console.log("SIN_SECRETO_ERR:", e.message);
}

// Test 2: con secreto → dispara la corrida (puede tardar)
try {
  const r2 = await fetch("http://localhost:3000/api/public/hooks/produce", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scheduler-secret": secret,
    },
    body: JSON.stringify({ slot: "viral" }),
  });
  const body = await r2.text();
  console.log("CON_SECRETO:", r2.status, body.slice(0, 500));
} catch (e) {
  console.log("CON_SECRETO_ERR:", e.message);
}
