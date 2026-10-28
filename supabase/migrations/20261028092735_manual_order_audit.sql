create or replace function public.audit_manual_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.admin_audit_logs (actor_id, action, entity, entity_id, details)
  values (
    coalesce((select auth.uid()), new.created_by),
    tg_op,
    'manual_orders',
    new.id::text,
    jsonb_build_object(
      'manual_order_number', new.manual_order_number,
      'source', new.source,
      'order_status', new.order_status,
      'payment_status', new.payment_status,
      'total', new.total,
      'paid_amount', new.paid_amount
    )
  );
  return new;
end;
$function$;

revoke all on function public.audit_manual_order_change() from public, anon, authenticated;

create trigger manual_orders_audit_after_change
  after insert or update on public.manual_orders
  for each row execute function public.audit_manual_order_change();
