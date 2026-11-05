export async function register() {
    // Runs once when the Node.js server starts: bring the database schema up to date.
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { runMigrations } = await import("./lib/db/migrate");
        await runMigrations();
    }
}
