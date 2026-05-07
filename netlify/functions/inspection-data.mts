import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type StoredInspectionState = {
  inspections: Record<string, unknown>;
  updatedAt: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function store() {
  return getStore({ name: "unit-ready-check", consistency: "strong" });
}

export default async (req: Request, _context: Context) => {
  const dataStore = store();
  const key = "shared-inspections";

  if (req.method === "GET") {
    const saved = await dataStore.get(key, { type: "json" }) as StoredInspectionState | null;
    return json(saved || { inspections: {}, updatedAt: null });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as Partial<StoredInspectionState> | null;
    if (!body || typeof body !== "object" || !body.inspections || typeof body.inspections !== "object") {
      return json({ error: "Invalid inspection payload" }, 400);
    }

    const saved: StoredInspectionState = {
      inspections: body.inspections,
      updatedAt: new Date().toISOString(),
    };

    await dataStore.setJSON(key, saved);
    return json(saved);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/inspection-data",
};
