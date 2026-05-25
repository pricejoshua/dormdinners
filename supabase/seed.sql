-- seed.sql — Sample pantry items for first-run experience
-- Run after 0001_init.sql: supabase db seed

INSERT INTO pantry_items (name, notes, updated_by) VALUES
  ('Olive oil',      '~1/3 bottle remaining',   'Seed data'),
  ('Salt',           'Full container',           'Seed data'),
  ('Black pepper',   'About half left',          'Seed data'),
  ('Garlic',         '1 full bulb',              'Seed data'),
  ('Soy sauce',      'Almost full bottle',       'Seed data'),
  ('Rice',           '2kg bag, mostly full',     'Seed data'),
  ('Pasta',          '500g box, unopened',       'Seed data'),
  ('Canned tomatoes','3 cans',                   'Seed data'),
  ('Onions',         '3 medium onions',          'Seed data'),
  ('Butter',         '1 stick remaining',        'Seed data');
