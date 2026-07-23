import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const buildId = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf-8").trim();
    return Response.json({ buildId });
  } catch {
    return Response.json({ buildId: "dev" });
  }
}
