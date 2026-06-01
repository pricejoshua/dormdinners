CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_anon_all"
  ON app_settings FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "app_settings_authenticated_all"
  ON app_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO app_settings (key, value)
VALUES ('dietary_restrictions', '')
ON CONFLICT (key) DO NOTHING;
