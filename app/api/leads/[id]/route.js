import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '../../../../lib/db';
import { isAuthed } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const body = await req.json();
  const allowed = ['status', 'notes', 'next_retry_at'];
  const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
  if (updates.length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 });

  // Build dynamic UPDATE
  const setParts = [];
  const values = [];
  let i = 1;
  for (const [k, v] of updates) {
    setParts.push(`${k} = $${i}`);
    values.push(v);
    i++;
  }
  values.push(id);
  const query = `UPDATE leads SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
  const { rows } = await sql.query(query, values);
  return NextResponse.json({ lead: rows[0] });
}

// Hard delete a lead and all its call records. Auth-gated.
export async function DELETE(req, { params }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  // Delete calls first (FK), then the lead row
  await sql`DELETE FROM calls WHERE lead_id = ${id}`;
  const { rowCount } = await sql`DELETE FROM leads WHERE id = ${id}`;
  return NextResponse.json({ ok: true, deleted: rowCount });
}
