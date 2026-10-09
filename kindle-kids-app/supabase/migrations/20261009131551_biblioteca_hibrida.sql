create table public.cuentitos_books (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  title text not null check (length(title) between 1 and 500),
  author text,
  pages integer not null check (pages > 0),
  cover text not null check (length(cover) <= 2000000),
  accent text not null,
  bytes bigint not null check (bytes > 0 and bytes <= 52428800),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key(user_id,id)
);
alter table public.cuentitos_books enable row level security;
revoke all on public.cuentitos_books from anon, authenticated;
grant select, insert on public.cuentitos_books to authenticated;
grant update(deleted_at) on public.cuentitos_books to authenticated;
create policy own_books_read on public.cuentitos_books for select to authenticated using ((select auth.uid())=user_id);
create policy own_books_insert on public.cuentitos_books for insert to authenticated with check ((select auth.uid())=user_id and deleted_at is null);
create policy own_books_delete on public.cuentitos_books for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and deleted_at is not null);

create table public.cuentitos_progress (
 user_id uuid not null,
 book_id text not null,
 page integer not null check(page > 0),
 completed boolean not null default false,
 read_at timestamptz not null,
 primary key(user_id,book_id),
 foreign key(user_id,book_id) references public.cuentitos_books(user_id,id) on delete cascade
);
alter table public.cuentitos_progress enable row level security;
revoke all on public.cuentitos_progress from anon,authenticated;
grant select,insert,update on public.cuentitos_progress to authenticated;
create policy own_progress_read on public.cuentitos_progress for select to authenticated using ((select auth.uid())=user_id);
create policy own_progress_insert on public.cuentitos_progress for insert to authenticated with check ((select auth.uid())=user_id and exists(select 1 from public.cuentitos_books b where b.user_id=(select auth.uid()) and b.id=book_id and b.deleted_at is null));
create policy own_progress_update on public.cuentitos_progress for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and exists(select 1 from public.cuentitos_books b where b.user_id=(select auth.uid()) and b.id=book_id and b.deleted_at is null));

-- Serialize conflicting reads in Postgres. Completion remains earned when rereading.
create function public.cuentitos_merge_progress(p_book_id text,p_page integer,p_completed boolean,p_read_at timestamptz)
returns setof public.cuentitos_progress language sql security invoker set search_path='' as $$
 insert into public.cuentitos_progress(user_id,book_id,page,completed,read_at)
 select auth.uid(), p_book_id, least(greatest(p_page,1),b.pages), p_completed,
 least(p_read_at,now())
 from public.cuentitos_books b where b.user_id=auth.uid() and b.id=p_book_id and b.deleted_at is null
 on conflict(user_id,book_id) do update set
 page=case when excluded.read_at >= public.cuentitos_progress.read_at then excluded.page else public.cuentitos_progress.page end,
 completed=public.cuentitos_progress.completed or excluded.completed,
 read_at=greatest(public.cuentitos_progress.read_at,excluded.read_at)
 returning *;
$$;
revoke execute on function public.cuentitos_merge_progress(text,integer,boolean,timestamptz) from public,anon;
grant execute on function public.cuentitos_merge_progress(text,integer,boolean,timestamptz) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cuentitos-books','cuentitos-books',false,52428800,array['application/pdf']);
create policy cuentitos_files_select on storage.objects for select to authenticated using(bucket_id='cuentitos-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cuentitos_files_insert on storage.objects for insert to authenticated with check(bucket_id='cuentitos-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cuentitos_files_update on storage.objects for update to authenticated using(bucket_id='cuentitos-books' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='cuentitos-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cuentitos_files_delete on storage.objects for delete to authenticated using(bucket_id='cuentitos-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
