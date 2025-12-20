create table if not exists word_conversation_cache (
  word text primary key,
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table word_conversation_cache enable row level security;

create policy "Enable read access for all users" on word_conversation_cache
  for select using (true);

create policy "Enable insert access for authenticated users" on word_conversation_cache
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update access for authenticated users" on word_conversation_cache
  for update using (auth.role() = 'authenticated');
