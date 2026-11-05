import { getPool } from "./index";
import { MIGRATIONS } from "./migrations";

// Arbitrary constant so concurrent app instances don't run migrations at the same time.
const MIGRATION_LOCK_KEY = 4_206_942;

export async function runMigrations(): Promise<void> {
    const client = await getPool().connect();
    try {
        await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id          text PRIMARY KEY,
                applied_at  timestamptz NOT NULL DEFAULT now()
            )
        `);
        const { rows } = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
        const applied = new Set(rows.map((r) => r.id));

        for (const migration of MIGRATIONS) {
            if (applied.has(migration.id)) continue;
            console.log(`[db] applying migration ${migration.id}`);
            await client.query("BEGIN");
            try {
                await client.query(migration.sql);
                await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }

        // Housekeeping: drop expired sessions on every boot.
        await client.query("DELETE FROM sessions WHERE expires_at < now()");
    } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
        client.release();
    }
}
