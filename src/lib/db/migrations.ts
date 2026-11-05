/**
 * Database schema, applied in order at server start (see src/instrumentation.ts).
 * Migrations are embedded as strings so they ship inside the standalone build.
 * Never edit a migration that has shipped; append a new one instead.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
    {
        id: "0001_initial",
        sql: `
CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash   text NOT NULL,
    xp              integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
    streak          integer NOT NULL DEFAULT 0 CHECK (streak >= 0),
    last_active_on  date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Session tokens are stored only as SHA-256 hashes; the raw token lives in an httpOnly cookie.
CREATE TABLE sessions (
    id          text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE captures (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name    text NOT NULL,
    mime_type    text NOT NULL,
    byte_size    integer NOT NULL,
    image_hash   text NOT NULL,
    ocr_data     jsonb,
    translation  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, image_hash)
);
CREATE INDEX captures_user_created_idx ON captures (user_id, created_at DESC);

CREATE TABLE vocabulary_items (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capture_id           uuid REFERENCES captures(id) ON DELETE SET NULL,
    kanji_word           text NOT NULL,
    reading_kana         text,
    meaning_en           text,
    context_sentence_jp  text,
    context_sentence_en  text,
    detailed_data        jsonb,
    status               text NOT NULL DEFAULT 'ready'
                         CHECK (status IN ('pending', 'ready', 'needs_input')),
    source               text NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('scan', 'manual', 'starter', 'related', 'import')),
    srs_level            integer NOT NULL DEFAULT 0 CHECK (srs_level >= 0),
    next_review_at       timestamptz NOT NULL DEFAULT now(),
    correct_count        integer NOT NULL DEFAULT 0,
    wrong_count          integer NOT NULL DEFAULT 0,
    last_reviewed_at     timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, kanji_word)
);
CREATE INDEX vocabulary_items_user_due_idx ON vocabulary_items (user_id, next_review_at);

-- A round is issued by the server so results can only be submitted once, for the
-- items that were actually dealt, by the user they were dealt to.
CREATE TABLE review_rounds (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_ids      uuid[] NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    completed_at  timestamptz,
    xp_awarded    integer NOT NULL DEFAULT 0
);
CREATE INDEX review_rounds_user_idx ON review_rounds (user_id, created_at DESC);
`,
    },
];
