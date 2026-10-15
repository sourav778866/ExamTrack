-- Run this entire script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization text not null,
  title text not null,
  category text not null default 'Other',
  recruitment_no text,
  qualification text,
  category_eligibility text,
  location text,
  salary text,
  application_start date,
  application_deadline date,
  exam_date date,
  admit_card_date date,
  result_date date,
  application_status text not null default 'Not applied'
    check (application_status in ('Not applied','Applied','Admit card available','Exam completed','Result declared','Not eligible','Rejected')),
  application_number text,
  applied_on date,
  application_fee text,
  official_url text,
  apply_url text,
  syllabus_url text,
  notes text,
  reminder_days integer[] not null default array[7,3,1],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exams_user_deadline_idx on public.exams(user_id, application_deadline);
create index if not exists exams_user_exam_date_idx on public.exams(user_id, exam_date);
create index if not exists exams_user_status_idx on public.exams(user_id, application_status);

alter table public.exams enable row level security;
drop policy if exists "Users can read their own exams" on public.exams;
create policy "Users can read their own exams" on public.exams for select using (auth.uid() = user_id);
drop policy if exists "Users can insert their own exams" on public.exams;
create policy "Users can insert their own exams" on public.exams for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own exams" on public.exams;
create policy "Users can update their own exams" on public.exams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own exams" on public.exams;
create policy "Users can delete their own exams" on public.exams for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists exams_updated_at on public.exams;
create trigger exams_updated_at before update on public.exams
for each row execute function public.set_updated_at();


-- Private document metadata: each file belongs to one exam and one user.
create table if not exists public.exam_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  document_type text not null default 'Other'
    check (document_type in ('Application form','Registration receipt','Payment receipt','Admit card','Scorecard / result','Other')),
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists exam_documents_user_exam_idx
  on public.exam_documents(user_id, exam_id, created_at desc);

alter table public.exam_documents enable row level security;
drop policy if exists "Users can read their own exam documents" on public.exam_documents;
create policy "Users can read their own exam documents" on public.exam_documents
  for select using (auth.uid() = user_id);
drop policy if exists "Users can add their own exam documents" on public.exam_documents;
create policy "Users can add their own exam documents" on public.exam_documents
  for insert with check (
    auth.uid() = user_id and exists (
      select 1 from public.exams e where e.id = exam_id and e.user_id = auth.uid()
    )
  );
drop policy if exists "Users can delete their own exam documents" on public.exam_documents;
create policy "Users can delete their own exam documents" on public.exam_documents
  for delete using (auth.uid() = user_id);

-- Create a private bucket for application records and supporting documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exam-documents',
  'exam-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

-- File path format: <authenticated-user-uuid>/<exam-uuid>/<unique-file-name>
drop policy if exists "Users can read their own exam files" on storage.objects;
create policy "Users can read their own exam files" on storage.objects
  for select to authenticated using (
    bucket_id = 'exam-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "Users can upload their own exam files" on storage.objects;
create policy "Users can upload their own exam files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'exam-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "Users can delete their own exam files" on storage.objects;
create policy "Users can delete their own exam files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'exam-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
