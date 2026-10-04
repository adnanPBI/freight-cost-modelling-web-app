import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
export async function AuthGate(){const session=await getSession();if(!session)redirect('/login');return session;}
