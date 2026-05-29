import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { isMondayISO } from '@/app/_lib/weekOf';
import type { MealInsert } from '@/types/database';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.week_of !== 'string' || !isMondayISO(raw.week_of)) {
    return NextResponse.json(
      { error: 'week_of must be a Monday in YYYY-MM-DD form' },
      { status: 400 },
    );
  }

  const title = typeof raw.title === 'string' ? raw.title : '';

  let headcount: number | null;
  if (raw.headcount === null || raw.headcount === undefined) {
    headcount = null;
  } else if (typeof raw.headcount === 'number') {
    headcount = raw.headcount;
  } else {
    return NextResponse.json(
      { error: 'headcount must be a number or null' },
      { status: 400 },
    );
  }

  let day_of_week: number | null = null;
  if (raw.day_of_week !== null && raw.day_of_week !== undefined) {
    if (typeof raw.day_of_week !== 'number' || !Number.isInteger(raw.day_of_week) || raw.day_of_week < 0 || raw.day_of_week > 6) {
      return NextResponse.json(
        { error: 'day_of_week must be an integer 0–6 or null' },
        { status: 400 },
      );
    }
    day_of_week = raw.day_of_week;
  }

  const insert: MealInsert = { title, week_of: raw.week_of, day_of_week, headcount };

  const { data, error } = await supabaseServerClient
    .from('meals')
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
