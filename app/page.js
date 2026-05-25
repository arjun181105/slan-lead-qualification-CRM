import { cookies } from 'next/headers';
import LoginScreen from './LoginScreen';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const c = await cookies();
  const authed = c.get('slan_auth')?.value === process.env.CRM_PASSWORD;
  if (!authed) return <LoginScreen />;
  return <Dashboard />;
}
