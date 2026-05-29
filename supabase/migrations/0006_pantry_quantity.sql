alter table pantry_items
  add column if not exists quantity_amount numeric,
  add column if not exists quantity_unit   text;
