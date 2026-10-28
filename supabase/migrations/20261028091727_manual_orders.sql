create sequence public.manual_order_number_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  no cycle;

create table public.manual_orders (
  id uuid primary key default gen_random_uuid(),
  manual_order_number text not null unique default (
    'MO-' || lpad(nextval('public.manual_order_number_seq'::regclass)::text, 6, '0')
  ),
  source text not null check (source in ('whatsapp', 'instagram', 'facebook', 'phone', 'walk_in', 'other')),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 150),
  customer_phone text not null check (char_length(btrim(customer_phone)) between 7 and 32),
  customer_email text check (customer_email is null or customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  shipping_address text not null check (char_length(btrim(shipping_address)) between 1 and 2000),
  customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
  external_reference text check (external_reference is null or char_length(external_reference) <= 200),
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0 and discount_amount <= subtotal + delivery_fee),
  total numeric(14,2) not null default 0 check (total = subtotal + delivery_fee - discount_amount),
  payment_method text not null check (payment_method in ('cod', 'bank_transfer', 'card', 'cash', 'other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid')),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total),
  order_status text not null default 'pending' check (order_status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (payment_status = 'unpaid' and paid_amount = 0)
    or (payment_status = 'partially_paid' and paid_amount > 0 and paid_amount < total)
    or (payment_status = 'paid' and paid_amount = total)
  )
);

create table public.manual_order_items (
  id uuid primary key default gen_random_uuid(),
  manual_order_id uuid not null references public.manual_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  seller_id uuid references public.seller_profiles(id) on delete set null,
  product_name_snapshot text not null check (char_length(btrim(product_name_snapshot)) between 1 and 200),
  seller_name_snapshot text check (seller_name_snapshot is null or char_length(seller_name_snapshot) <= 150),
  sku_snapshot text check (sku_snapshot is null or char_length(sku_snapshot) <= 100),
  variant_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(variant_snapshot) = 'object'),
  quantity integer not null check (quantity between 1 and 999),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create index manual_orders_created_at_idx on public.manual_orders (created_at desc);
create index manual_orders_status_idx on public.manual_orders (order_status, created_at desc);
create index manual_orders_payment_idx on public.manual_orders (payment_status, created_at desc);
create index manual_orders_source_idx on public.manual_orders (source, created_at desc);
create index manual_order_items_order_idx on public.manual_order_items (manual_order_id, created_at);

alter table public.manual_orders enable row level security;
alter table public.manual_order_items enable row level security;

revoke all on public.manual_orders, public.manual_order_items from anon, authenticated;
grant select on public.manual_orders, public.manual_order_items to authenticated;

create policy manual_orders_admin_read on public.manual_orders
  for select to authenticated using ((select private.has_role('admin'::public.app_role)));
create policy manual_order_items_admin_read on public.manual_order_items
  for select to authenticated using ((select private.has_role('admin'::public.app_role)));

create or replace function public.admin_save_manual_order(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb
)
returns table(id uuid, manual_order_number text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_number text;
  v_subtotal numeric(14,2);
  v_delivery numeric(14,2);
  v_discount numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_payment_status text;
  v_source text;
  v_payment_method text;
  v_order_status text;
begin
  if v_user_id is null or not (select private.has_role('admin'::public.app_role)) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_order is null or jsonb_typeof(p_order) <> 'object' or p_items is null
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'A manual order must contain between 1 and 100 items.';
  end if;

  v_source := p_order ->> 'source';
  v_payment_method := p_order ->> 'payment_method';
  v_order_status := coalesce(nullif(p_order ->> 'order_status', ''), 'pending');
  if v_source not in ('whatsapp', 'instagram', 'facebook', 'phone', 'walk_in', 'other')
     or v_payment_method not in ('cod', 'bank_transfer', 'card', 'cash', 'other')
     or v_order_status not in ('pending', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception using errcode = '22023', message = 'Choose a valid order source, payment method, and order status.';
  end if;
  if nullif(btrim(p_order ->> 'customer_name'), '') is null
     or nullif(btrim(p_order ->> 'customer_phone'), '') is null
     or nullif(btrim(p_order ->> 'shipping_address'), '') is null then
    raise exception using errcode = '22023', message = 'Customer name, phone, and delivery address are required.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(
      product_name_snapshot text, seller_name_snapshot text, sku_snapshot text,
      variant_snapshot jsonb, quantity integer, unit_price numeric, product_id uuid, seller_id uuid
    )
    where nullif(btrim(product_name_snapshot), '') is null
       or quantity is null or quantity not between 1 and 999
       or unit_price is null or unit_price < 0
       or (variant_snapshot is not null and jsonb_typeof(variant_snapshot) <> 'object')
  ) then
    raise exception using errcode = '22023', message = 'Each item needs a name, positive quantity, and non-negative price.';
  end if;

  select coalesce(sum(item.quantity::numeric * item.unit_price), 0)::numeric(14,2)
    into v_subtotal
  from jsonb_to_recordset(p_items) as item(quantity integer, unit_price numeric);
  v_delivery := coalesce(nullif(p_order ->> 'delivery_fee', '')::numeric, 0);
  v_discount := coalesce(nullif(p_order ->> 'discount_amount', '')::numeric, 0);
  if v_delivery < 0 or v_discount < 0 or v_discount > v_subtotal + v_delivery then
    raise exception using errcode = '22023', message = 'Delivery and discount amounts are invalid.';
  end if;
  v_total := v_subtotal + v_delivery - v_discount;
  v_paid := coalesce(nullif(p_order ->> 'paid_amount', '')::numeric, 0);
  if v_paid < 0 or v_paid > v_total then
    raise exception using errcode = '22023', message = 'The paid amount must be between zero and the order total.';
  end if;
  v_payment_status := case when v_paid = 0 then 'unpaid' when v_paid = v_total then 'paid' else 'partially_paid' end;

  if p_order_id is null then
    insert into public.manual_orders (
      source, customer_name, customer_phone, customer_email, shipping_address,
      customer_note, external_reference, currency, subtotal, delivery_fee,
      discount_amount, total, payment_method, payment_status, paid_amount,
      order_status, created_by
    ) values (
      v_source, btrim(p_order ->> 'customer_name'), btrim(p_order ->> 'customer_phone'),
      nullif(btrim(coalesce(p_order ->> 'customer_email', '')), ''), btrim(p_order ->> 'shipping_address'),
      nullif(btrim(coalesce(p_order ->> 'customer_note', '')), ''),
      nullif(btrim(coalesce(p_order ->> 'external_reference', '')), ''),
      'PKR', v_subtotal, v_delivery, v_discount, v_total, v_payment_method,
      v_payment_status, v_paid, v_order_status, v_user_id
    ) returning manual_orders.id, manual_orders.manual_order_number into v_id, v_number;
  else
    update public.manual_orders as mo set
      source = v_source,
      customer_name = btrim(p_order ->> 'customer_name'),
      customer_phone = btrim(p_order ->> 'customer_phone'),
      customer_email = nullif(btrim(coalesce(p_order ->> 'customer_email', '')), ''),
      shipping_address = btrim(p_order ->> 'shipping_address'),
      customer_note = nullif(btrim(coalesce(p_order ->> 'customer_note', '')), ''),
      external_reference = nullif(btrim(coalesce(p_order ->> 'external_reference', '')), ''),
      subtotal = v_subtotal, delivery_fee = v_delivery, discount_amount = v_discount,
      total = v_total, payment_method = v_payment_method,
      payment_status = v_payment_status, paid_amount = v_paid,
      order_status = v_order_status, updated_at = now()
    where mo.id = p_order_id
    returning mo.id, mo.manual_order_number into v_id, v_number;
    if v_id is null then
      raise exception using errcode = 'P0002', message = 'Manual order not found.';
    end if;
    delete from public.manual_order_items as moi where moi.manual_order_id = v_id;
  end if;

  insert into public.manual_order_items (
    manual_order_id, product_id, seller_id, product_name_snapshot,
    seller_name_snapshot, sku_snapshot, variant_snapshot, quantity, unit_price
  )
  select v_id, item.product_id, item.seller_id, btrim(item.product_name_snapshot),
    nullif(btrim(coalesce(item.seller_name_snapshot, '')), ''),
    nullif(btrim(coalesce(item.sku_snapshot, '')), ''), coalesce(item.variant_snapshot, '{}'::jsonb),
    item.quantity, item.unit_price
  from jsonb_to_recordset(p_items) as item(
    product_name_snapshot text, seller_name_snapshot text, sku_snapshot text,
    variant_snapshot jsonb, quantity integer, unit_price numeric, product_id uuid, seller_id uuid
  );

  return query select v_id, v_number;
end;
$function$;

create or replace function public.admin_manual_order_metrics()
returns table(total_orders bigint, pending_orders bigint, sales_total numeric, unpaid_balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not (select private.has_role('admin'::public.app_role)) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  return query
  select count(*)::bigint,
    count(*) filter (where mo.order_status in ('pending', 'processing'))::bigint,
    coalesce(sum(mo.total) filter (where mo.order_status <> 'cancelled'), 0),
    coalesce(sum(mo.total - mo.paid_amount) filter (where mo.order_status <> 'cancelled'), 0)
  from public.manual_orders as mo;
end;
$function$;

revoke all on function public.admin_save_manual_order(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.admin_manual_order_metrics() from public, anon;
grant execute on function public.admin_save_manual_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_manual_order_metrics() to authenticated;

notify pgrst, 'reload schema';
