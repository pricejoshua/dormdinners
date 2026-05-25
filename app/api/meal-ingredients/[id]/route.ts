import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import type { MealIngredientUpdate } from '@/types/database';

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

  const update: MealIngredientUpdate = {};
  const raw = body as Record<string, unknown>;

  if ('name' in raw) {
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    update.name = raw.name.trim();
  }

  if ('quantity' in raw) {
    if (raw.quantity !== null && typeof raw.quantity !== 'string') {
      return NextResponse.json({ error: 'quantity must be a string or null' }, { status: 400 });
    }
    update.quantity = raw.quantity as string | null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient
    .from('meal_ingredients')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;

  const { error } = await supabaseServerClient
    .from('meal_ingredients')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
