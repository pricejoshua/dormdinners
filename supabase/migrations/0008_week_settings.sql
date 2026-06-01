CREATE TABLE IF NOT EXISTS week_settings (
  week_of              date PRIMARY KEY,
  dietary_restrictions text NOT NULL DEFAULT ''
);

ALTER TABLE week_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "week_settings_anon_all"
  ON week_settings FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "week_settings_authenticated_all"
  ON week_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
