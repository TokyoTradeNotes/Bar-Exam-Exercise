-- Run this entire file in: Supabase Dashboard → SQL Editor → New query

create table questions (
  id               text primary key,
  year             text,
  law              text,
  subject          text,
  topic            text,
  source           text,
  question         text not null,
  suggested_answer text,
  created_at       timestamptz default now()
);

create table exam_sessions (
  id               text primary key,
  law_filter       text,
  subject_filter   text,
  time_used        integer,
  duration         integer,
  total_questions  integer,
  answered_count   integer,
  created_at       timestamptz default now()
);

create table exam_answers (
  id               text primary key,
  session_id       text references exam_sessions(id) on delete cascade,
  question_order   integer,
  question_text    text,
  suggested_answer text,
  user_answer      text,
  year             text,
  law              text,
  subject          text,
  topic            text,
  ai_score         text,
  ai_verdict       text,
  ai_feedback      text
);

-- Allow public read/write (no login required — access is by URL only)
alter table questions     enable row level security;
alter table exam_sessions enable row level security;
alter table exam_answers  enable row level security;

create policy "public_all" on questions     for all to anon using (true) with check (true);
create policy "public_all" on exam_sessions for all to anon using (true) with check (true);
create policy "public_all" on exam_answers  for all to anon using (true) with check (true);
