-- Book shop: the school sells books, uniform and stationery to its own families.
-- Staff list items with a price and stock; parents (or students) order for a child,
-- pay at the office in cash or by JazzCash / Easypaisa with a transaction ID,
-- and the office confirms the payment and hands the items over.

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null default app.my_campus() references public.campuses(id) on delete cascade,
  category text not null check (category in ('books', 'uniform', 'stationery', 'other')),
  name text not null check (length(trim(name)) between 1 and 120),
  class_label text,              -- e.g. "Class 5"; empty = any class
  size text,                     -- uniform size, or edition
  price_paisa bigint not null check (price_paisa >= 0),
  stock integer check (stock >= 0), -- null = not counted
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists shop_items_campus on public.shop_items (campus_id, category, name);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid', 'delivered', 'cancelled')),
  pay_mode text not null check (pay_mode in ('cash', 'jazzcash', 'easypaisa')),
  txn_id text check (txn_id is null or length(trim(txn_id)) between 4 and 40),
  total_paisa bigint not null check (total_paisa >= 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null default app.me(),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_campus on public.shop_orders (campus_id, status, created_at desc);

create table if not exists public.shop_order_lines (
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  item_id uuid references public.shop_items(id) on delete set null,
  name text not null,
  qty integer not null check (qty between 1 and 50),
  price_paisa bigint not null check (price_paisa >= 0)
);
create index if not exists shop_order_lines_order on public.shop_order_lines (order_id);

alter table public.shop_items enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_lines enable row level security;

drop policy if exists "campus reads shop items" on public.shop_items;
create policy "campus reads shop items" on public.shop_items for select to authenticated
  using (campus_id = app.my_campus());
drop policy if exists "office manages shop items" on public.shop_items;
create policy "office manages shop items" on public.shop_items for all to authenticated
  using (campus_id = app.my_campus() and app.is_accounts())
  with check (campus_id = app.my_campus() and app.is_accounts());

drop policy if exists "families read own shop orders" on public.shop_orders;
create policy "families read own shop orders" on public.shop_orders for select to authenticated
  using (student_id in (select app.my_students()));
drop policy if exists "office reads shop orders" on public.shop_orders;
create policy "office reads shop orders" on public.shop_orders for select to authenticated
  using (campus_id = app.my_campus() and app.is_accounts());

drop policy if exists "read shop order lines" on public.shop_order_lines;
create policy "read shop order lines" on public.shop_order_lines for select to authenticated
  using (order_id in (select id from public.shop_orders)); -- rows the orders policies already allow

revoke all on public.shop_items, public.shop_orders, public.shop_order_lines from anon;
-- orders and lines change only through the functions below
revoke insert, update, delete on public.shop_orders, public.shop_order_lines from authenticated;

-- A parent or student orders for one child. Prices and stock come from the shop, never the browser.
create or replace function public.place_shop_order(p_student uuid, p_lines jsonb, p_mode text, p_txn text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_campus uuid; v_order uuid; v_total bigint := 0; l jsonb; it public.shop_items; q int;
begin
  if p_student is null or p_student not in (select app.my_students()) then raise exception 'Choose your child.'; end if;
  select campus_id into v_campus from students where id = p_student;
  if p_mode not in ('cash', 'jazzcash', 'easypaisa') then raise exception 'Pay with cash, JazzCash or Easypaisa.'; end if;
  if p_mode <> 'cash' and (p_txn is null or length(trim(p_txn)) not between 4 and 40) then
    raise exception 'Enter the transaction ID from your JazzCash or Easypaisa message.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose at least one item.'; end if;
  insert into shop_orders (campus_id, student_id, pay_mode, txn_id, total_paisa, note)
    values (v_campus, p_student, p_mode, nullif(trim(coalesce(p_txn, '')), ''), 0, nullif(trim(coalesce(p_note, '')), ''))
    returning id into v_order;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := coalesce((l->>'qty')::int, 0);
    if q < 1 or q > 50 then raise exception 'Quantity must be 1 to 50.'; end if;
    select * into it from shop_items where id = (l->>'item_id')::uuid and campus_id = v_campus and active for update;
    if not found then raise exception 'An item is no longer for sale.'; end if;
    if it.stock is not null then
      if it.stock < q then raise exception '% has only % left.', it.name, it.stock; end if;
      update shop_items set stock = stock - q where id = it.id;
    end if;
    insert into shop_order_lines (order_id, item_id, name, qty, price_paisa)
      values (v_order, it.id, it.name || coalesce(' (' || nullif(it.size, '') || ')', ''), q, it.price_paisa);
    v_total := v_total + q * it.price_paisa;
  end loop;
  update shop_orders set total_paisa = v_total where id = v_order;
  return v_order;
end $$;

-- The office moves an order on: paid, delivered, or cancelled (stock goes back on cancel).
create or replace function public.set_shop_order_status(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.shop_orders;
begin
  if not app.is_accounts() then raise exception 'Only the office can do this.'; end if;
  select * into o from shop_orders where id = p_order and campus_id = app.my_campus() for update;
  if not found then raise exception 'Order not found.'; end if;
  if p_status not in ('paid', 'delivered', 'cancelled') then raise exception 'Unknown status.'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'This order is already %.', o.status; end if;
  if p_status = 'cancelled' then
    update shop_items i set stock = i.stock + l.qty from shop_order_lines l
      where l.order_id = o.id and l.item_id = i.id and i.stock is not null;
  end if;
  update shop_orders set status = p_status, decided_by = app.me(), updated_at = now() where id = o.id;
end $$;

-- A family may cancel its own order while it is still waiting.
create or replace function public.cancel_my_shop_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.shop_orders;
begin
  select * into o from shop_orders where id = p_order and student_id in (select app.my_students()) for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status <> 'pending' then raise exception 'Only a waiting order can be cancelled. Please contact the office.'; end if;
  update shop_items i set stock = i.stock + l.qty from shop_order_lines l
    where l.order_id = o.id and l.item_id = i.id and i.stock is not null;
  update shop_orders set status = 'cancelled', updated_at = now() where id = o.id;
end $$;

revoke all on function public.place_shop_order(uuid, jsonb, text, text, text) from public, anon;
revoke all on function public.set_shop_order_status(uuid, text) from public, anon;
revoke all on function public.cancel_my_shop_order(uuid) from public, anon;
grant execute on function public.place_shop_order(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.set_shop_order_status(uuid, text) to authenticated;
grant execute on function public.cancel_my_shop_order(uuid) to authenticated;
