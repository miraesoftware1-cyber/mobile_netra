import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _netraPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._netraPool) {
    global._netraPool = new Pool({
      host: process.env.PDM_DB_HOST ?? "58.229.132.163",
      port: Number(process.env.PDM_DB_PORT ?? 33734),
      database: process.env.PDM_DB_NAME ?? "PDM",
      user: process.env.PDM_DB_USER ?? "postgres",
      password: process.env.PDM_DB_PASSWORD ?? "",
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return global._netraPool;
}

export function query<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) {
  return getPool().query<T>(sql, params);
}
