import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import type { MealIngredientInsert } from '@/types/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id: meal_id } = await context.params;
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

  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    return NextResponse.json({ error: 'name is required and must be a non-empty string' }, { status: 400 });
  }

  const insert: MealIngredientInsert = {
    meal_id,
    name: raw.name.trim(),
    quantity: typeof raw.quantity === 'string' ? raw.quantity : null,
  };

  const { data, error } = await supabaseServerClient
    .from('meal_ingredients')
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
