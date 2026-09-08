import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _netraPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._netraPool) {
    global._netraPool = new Pool({
      host: process.env.NETRA_DB_HOST ?? "58.229.132.163",
      port: Number(process.env.NETRA_DB_PORT ?? 33734),
      database: process.env.NETRA_DB_NAME ?? "PDM",
      user: process.env.NETRA_DB_USER ?? "postgres",
      password: process.env.NETRA_DB_PASSWORD ?? "",
      max: 2,                      // 서버리스: 인스턴스당 최대 연결 수 최소화
      idleTimeoutMillis: 10000,    // 유휴 연결 빠르게 반환
      connectionTimeoutMillis: 5000,
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
