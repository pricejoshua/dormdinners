import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import type { MealUpdate } from '@/types/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const update: MealUpdate = {};
  const raw = body as Record<string, unknown>;

  if ('title' in raw) {
    if (typeof raw.title !== 'string') {
      return NextResponse.json({ error: 'title must be a string' }, { status: 400 });
    }
    update.title = raw.title;
  }

  if ('headcount' in raw) {
    if (raw.headcount !== null && typeof raw.headcount !== 'number') {
      return NextResponse.json({ error: 'headcount must be a number or null' }, { status: 400 });
    }
    update.headcount = raw.headcount as number | null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient
    .from('meals')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
