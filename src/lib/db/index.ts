import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
    // Reuse the pool across hot reloads in development.
    var __kanjilensPool: Pool | undefined;
}

export function getPool(): Pool {
    if (!globalThis.__kanjilensPool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL is not set. See .env.example.");
        }
        globalThis.__kanjilensPool = new Pool({
            connectionString,
            max: Number(process.env.DATABASE_POOL_MAX ?? 10),
            idleTimeoutMillis: 30_000,
        });
    }
    return globalThis.__kanjilensPool;
}

/** Run a parameterized query and return all rows. Never interpolate user input into `text`. */
export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = []
): Promise<T[]> {
    const result = await getPool().query<T>(text, params);
    return result.rows;
}

/** Run a parameterized query and return the first row, or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = []
): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows[0] ?? null;
}

/** Run `fn` inside a transaction. Rolls back if it throws. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}
