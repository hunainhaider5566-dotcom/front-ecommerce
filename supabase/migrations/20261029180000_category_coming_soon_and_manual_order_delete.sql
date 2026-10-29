-- Admin-only category availability flag. Inactive categories stay hidden;
-- coming-soon categories can remain visible but disabled in the storefront.
alter table public.categories
  add column if not exists is_coming_soon boolean not null default false;

create or replace function public.admin_delete_manual_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (select private.has_role('admin'::public.app_role)) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'Manual order ID is required.';
  end if;
  delete from public.manual_orders where id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Manual order was not found.';
  end if;
  return true;
end;
$function$;

revoke all on function public.admin_delete_manual_order(uuid) from public, anon;
grant execute on function public.admin_delete_manual_order(uuid) to authenticated;
