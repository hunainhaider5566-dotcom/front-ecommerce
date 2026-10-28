create or replace function public.generate_manual_order_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_sequence bigint;
begin
  v_sequence := nextval('public.manual_order_number_seq'::regclass);
  return 'MO-' || lpad(v_sequence::text, greatest(6, pg_catalog.char_length(v_sequence::text)), '0');
end;
$function$;

revoke all on function public.generate_manual_order_number() from public, anon, authenticated;

alter table public.manual_orders
  alter column manual_order_number set default public.generate_manual_order_number();

notify pgrst, 'reload schema';
