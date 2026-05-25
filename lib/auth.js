import { cookies } from 'next/headers';

export async function isAuthed() {
  const c = await cookies();
  const v = c.get('slan_auth')?.value;
  return v === process.env.CRM_PASSWORD;
}
