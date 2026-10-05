import { destroySession } from '@/lib/auth';
import { apiError, requireApiSession } from '@/lib/http';
import { redirect303 } from '@/lib/public-url';

export async function POST(req:Request){
  try{
    await requireApiSession(req,true);
    await destroySession();
    return redirect303('/login');
  }catch(error){return apiError(error);}
}
