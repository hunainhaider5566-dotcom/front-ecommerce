create or replace function public.enforce_contact_format()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  arg text;
  field_name text;
  field_kind text;
  raw_value text;
  normalized_value text;
  row_data jsonb;
begin
  row_data := to_jsonb(new);
  foreach arg in array tg_argv loop
    field_kind := split_part(arg, ':', 1);
    field_name := split_part(arg, ':', 2);
    raw_value := row_data ->> field_name;
    if raw_value is null or btrim(raw_value) = '' then continue; end if;

    if field_kind = 'phone' then
      if raw_value !~ '^(03[0-9]{9}|\+923[0-9]{9})$' then
        raise exception 'Invalid Pakistani mobile number. Use exactly 03001234567 or +923001234567.' using errcode = '22023';
      end if;
      normalized_value := case when left(raw_value, 2) = '03' then '+92' || substring(raw_value from 2) else raw_value end;
      row_data := jsonb_set(row_data, array[field_name], to_jsonb(normalized_value), true);
    elsif field_kind = 'email' then
      if length(raw_value) > 254 or raw_value !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9]([A-Z0-9-]{0,61}[A-Z0-9])?([.][A-Z0-9]([A-Z0-9-]{0,61}[A-Z0-9])?)+$' then
        raise exception 'Invalid email address format.' using errcode = '22023';
      end if;
    else
      raise exception 'Unsupported contact field validator: %', field_kind;
    end if;
  end loop;
  new := jsonb_populate_record(new, row_data);
  return new;
end;
$$;

drop trigger if exists validate_profiles_contact on public.profiles;
create trigger validate_profiles_contact before insert or update of phone on public.profiles
for each row execute function public.enforce_contact_format('phone:phone');

drop trigger if exists validate_customer_addresses_contact on public.customer_addresses;
create trigger validate_customer_addresses_contact before insert or update of phone on public.customer_addresses
for each row execute function public.enforce_contact_format('phone:phone');

drop trigger if exists validate_orders_contact on public.orders;
create trigger validate_orders_contact before insert or update of customer_phone, customer_email on public.orders
for each row execute function public.enforce_contact_format('phone:customer_phone', 'email:customer_email');

drop trigger if exists validate_manual_orders_contact on public.manual_orders;
create trigger validate_manual_orders_contact before insert or update of customer_phone, customer_email on public.manual_orders
for each row execute function public.enforce_contact_format('phone:customer_phone', 'email:customer_email');

drop trigger if exists validate_seller_profiles_contact on public.seller_profiles;
create trigger validate_seller_profiles_contact before insert or update of phone, contact_email on public.seller_profiles
for each row execute function public.enforce_contact_format('phone:phone', 'email:contact_email');

drop trigger if exists validate_store_settings_contact on public.store_settings;
create trigger validate_store_settings_contact before insert or update of support_phone, support_whatsapp, support_email on public.store_settings
for each row execute function public.enforce_contact_format('phone:support_phone', 'phone:support_whatsapp', 'email:support_email');
