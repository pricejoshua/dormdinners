import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import type { OptimizationSuggestionRow } from '@/types/database';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    typeof (body as Record<string, unknown>).status !== 'string'
  ) {
    return NextResponse.json({ error: 'Body must include { status: string }.' }, { status: 400 });
  }

  const { status } = body as { status: string };

  if (status !== 'accepted' && status !== 'dismissed') {
    return NextResponse.json(
      { error: 'status must be "accepted" or "dismissed".' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseServerClient
    .from('optimization_suggestions')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as OptimizationSuggestionRow);
}
