-- Read-only look at the old Supabase database before the import (DEPLOY_RUNBOOK.md, Phase 0).
-- Run it against the SUPABASE database. A throwaway container supplies psql, so nothing needs
-- to be installed and the new stack does not have to exist yet:
--
--   read -rs SUPABASE_DB_URL
--   docker run --rm -i -e U="$SUPABASE_DB_URL" postgres:16-alpine sh -c 'psql "$U" -X -f -' < deploy/supabase-baseline.sql
--
-- It changes nothing. Keep the counts to compare with deploy/verify.sh --expect-* after the import.

\echo '== Row counts =='
select
    (select count(*) from auth.users where deleted_at is null)                                   as users,
    (select count(*) from auth.users where deleted_at is null
        and coalesce(encrypted_password, '') = '')                                               as users_without_password,
    (select count(*) from public.vocabulary_items)                                               as words,
    (select count(*) from public.captures)                                                       as captures;

\echo '== What the import will bring over (only users who have a password) =='
with importable as (
    select id from auth.users
     where deleted_at is null and coalesce(encrypted_password, '') <> '' and coalesce(email, '') <> ''
)
select
    (select count(*) from importable)                                                            as users,
    (select count(distinct (v.user_id, btrim(v.kanji_word)))
       from public.vocabulary_items v join importable i on i.id = v.user_id
      where coalesce(btrim(v.kanji_word), '') <> '')                                             as words,
    (select count(*) from public.captures c join importable i on i.id = c.user_id)               as captures_before_dedup;

\echo '== Columns the import reads; any row here means the schema differs from what it expects =='
with expected(tbl_schema, tbl, col) as (values
    ('auth',   'users',            'id'),
    ('auth',   'users',            'email'),
    ('auth',   'users',            'encrypted_password'),
    ('auth',   'users',            'deleted_at'),
    ('public', 'vocabulary_items', 'id'),
    ('public', 'vocabulary_items', 'user_id'),
    ('public', 'vocabulary_items', 'kanji_word'),
    ('public', 'vocabulary_items', 'reading_kana'),
    ('public', 'vocabulary_items', 'meaning_en'),
    ('public', 'vocabulary_items', 'srs_level'),
    ('public', 'vocabulary_items', 'next_review_at'),
    ('public', 'captures',         'id'),
    ('public', 'captures',         'user_id'),
    ('public', 'captures',         'image_url'),
    ('public', 'captures',         'ocr_data')
)
select e.tbl_schema || '.' || e.tbl as missing_from, e.col as missing_column
  from expected e
 where not exists (
        select 1 from information_schema.columns c
         where c.table_schema = e.tbl_schema and c.table_name = e.tbl and c.column_name = e.col);

\echo '== Where the photos are downloaded from (--with-images fetches these URLs) =='
select split_part(split_part(image_url, '://', 2), '/', 1) as host, count(*) as photos
  from public.captures
 group by 1
 order by 2 desc;

\echo '== Words by old review level =='
select coalesce(srs_level, 0) as srs_level, count(*) as words
  from public.vocabulary_items
 group by 1
 order by 1;
