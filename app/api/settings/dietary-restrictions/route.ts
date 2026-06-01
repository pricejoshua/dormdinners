import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabaseServerClient
    .from('app_settings')
    .select('value')
    .eq('key', 'dietary_restrictions')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value: data?.value ?? '' });
}

export async function PUT(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof (body as Record<string, unknown>)?.value !== 'string') {
    return NextResponse.json({ error: 'value must be a string' }, { status: 400 });
  }

  const value = ((body as Record<string, unknown>).value as string).trim();

  const { error } = await supabaseServerClient
    .from('app_settings')
    .upsert({ key: 'dietary_restrictions', value });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value });
}
