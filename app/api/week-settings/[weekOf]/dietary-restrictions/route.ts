import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { isMondayISO } from '@/app/_lib/weekOf';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { weekOf: string } };

export async function GET(_req: Request, { params }: RouteContext): Promise<NextResponse> {
  const { weekOf } = params;
  if (!isMondayISO(weekOf)) {
    return NextResponse.json({ error: 'weekOf must be a Monday YYYY-MM-DD' }, { status: 400 });
  }

  const [settingsResult, weekResult] = await Promise.all([
    supabaseServerClient
      .from('app_settings')
      .select('value')
      .eq('key', 'dietary_restrictions')
      .maybeSingle(),
    supabaseServerClient
      .from('week_settings')
      .select('dietary_restrictions')
      .eq('week_of', weekOf)
      .maybeSingle(),
  ]);

  const standing = settingsResult.data?.value ?? '';
  const weekOverride = weekResult.data ? weekResult.data.dietary_restrictions : null;
  const effective = weekOverride !== null ? weekOverride : standing;

  return NextResponse.json({ standing, weekOverride, effective });
}

export async function PUT(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const { weekOf } = params;
  if (!isMondayISO(weekOf)) {
    return NextResponse.json({ error: 'weekOf must be a Monday YYYY-MM-DD' }, { status: 400 });
  }

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
    .from('week_settings')
    .upsert({ week_of: weekOf, dietary_restrictions: value });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ weekOf, value });
}

export async function DELETE(_req: Request, { params }: RouteContext): Promise<NextResponse> {
  const { weekOf } = params;
  if (!isMondayISO(weekOf)) {
    return NextResponse.json({ error: 'weekOf must be a Monday YYYY-MM-DD' }, { status: 400 });
  }

  const { error } = await supabaseServerClient
    .from('week_settings')
    .delete()
    .eq('week_of', weekOf);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
