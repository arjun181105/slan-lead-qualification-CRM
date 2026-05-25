import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  if (password !== process.env.CRM_PASSWORD) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }
  const c = await cookies();
  c.set('slan_auth', password, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const c = await cookies();
  c.delete('slan_auth');
  return NextResponse.json({ ok: true });
}
