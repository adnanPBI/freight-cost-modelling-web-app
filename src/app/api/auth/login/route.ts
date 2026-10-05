import { authenticate, createSession } from '@/lib/auth';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    const form=await req.formData();
    const email=String(form.get('email')||'').trim();
    const password=String(form.get('password')||'');
    const user=await authenticate(email,password);
    if(!user) return redirect303('/login?error=1');
    await createSession(user);
    return redirect303('/dashboard');
  }catch(error){
    console.error('Login unavailable',error);
    return redirect303('/login?error=service');
  }
}
