-- Add day_of_week to meals (0 = Monday … 4 = Friday).
-- Nullable so existing rows aren't broken; unique per week once set.
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS day_of_week int
    CHECK (day_of_week BETWEEN 0 AND 6);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_week_day
  ON meals (week_of, day_of_week)
  WHERE day_of_week IS NOT NULL;
