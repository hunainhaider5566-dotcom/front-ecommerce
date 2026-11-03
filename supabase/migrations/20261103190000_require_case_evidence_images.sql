-- Require an uploaded product photo for new complaints and return requests.
-- Refund-only cases may still be submitted without an image.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complaint-evidence',
  'complaint-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.enforce_marketplace_case_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason is null or length(btrim(new.reason)) < 3 then
    raise exception 'A case reason of at least 3 characters is required.' using errcode = '22023';
  end if;

  if new.case_type::text in ('complaint', 'return') and nullif(btrim(new.evidence_path), '') is null then
    raise exception 'A product evidence image is required for complaints and returns.' using errcode = '22023';
  end if;

  if nullif(btrim(new.evidence_path), '') is not null then
    if new.evidence_path !~ ('^' || new.buyer_id::text || '/' || new.order_id::text || '-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|avif)$') then
      raise exception 'Evidence image path must belong to the buyer and order.' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'complaint-evidence'
        and o.name = new.evidence_path
    ) then
      raise exception 'The evidence image must be uploaded before submitting the case.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_marketplace_case_evidence on public.marketplace_cases;
create trigger enforce_marketplace_case_evidence
before insert or update of order_id, buyer_id, case_type, reason, evidence_path
on public.marketplace_cases
for each row execute function public.enforce_marketplace_case_evidence();

-- Evidence remains private. Customers can read only their own uploads; administrators
-- can generate short-lived signed URLs from the admin dashboard.
drop policy if exists complaint_evidence_read_own_or_admin on storage.objects;
create policy complaint_evidence_read_own_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'complaint-evidence'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.current_user_is_admin())
  )
);

drop policy if exists complaint_evidence_insert_own on storage.objects;
create policy complaint_evidence_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'complaint-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
);
