-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  xp integer default 0,
  streak integer default 0,
  level integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CAPTURES TABLE
create table captures (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  image_url text not null,
  geo_lat double precision,
  geo_lng double precision,
  ocr_data jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- VOCABULARY ITEMS TABLE
create table vocabulary_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  capture_id uuid references captures(id) on delete set null,
  kanji_word text not null,
  reading_kana text,
  meaning_en text,
  context_sentence_jp text,
  context_sentence_en text,
  srs_level integer default 0,
  next_review_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS POLICIES (Row Level Security)
alter table profiles enable row level security;
alter table captures enable row level security;
alter table vocabulary_items enable row level security;

-- Profiles: Users can see and update their own profile
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Captures: Users can only see/edit their own captures
create policy "Users can CRUD own captures" on captures for all using (auth.uid() = user_id);

-- Vocabulary: Users can only see/edit their own vocab
create policy "Users can CRUD own vocabulary" on vocabulary_items for all using (auth.uid() = user_id);

-- STORAGE SETUP
-- You will need to create a bucket named 'captures' in the Storage dashboard manually or via policy.
create policy "Authenticated users can upload captures" on storage.objects for insert with check (bucket_id = 'captures' and auth.role() = 'authenticated');
create policy "Authenticated users can view captures" on storage.objects for select using (bucket_id = 'captures' and auth.role() = 'authenticated');
create policy "Authenticated users can update captures" on storage.objects for update using (bucket_id = 'captures' and auth.role() = 'authenticated');

-- FUNCTIONS
-- Auto-create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
