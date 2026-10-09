import { getChatGPTUser } from '../../chatgpt-auth';
import { ensureState } from '../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicie sesión para consultar.'},{status:401});
 try{const state=await ensureState(user);const actor=state.users.find(x=>x.id===user.userId&&x.is_active);if(!actor)return Response.json({error:'Tu cuenta está autenticada. Solicita al administrador que habilite tu acceso.',authenticated_id:user.userId},{status:403,headers:{'Cache-Control':'no-store'}});return Response.json({state,actor},{headers:{'Cache-Control':'no-store'}});}catch(e){console.error('State unavailable',e);return Response.json({error:'No se pudo cargar la base de datos. Vuelva a intentar.'},{status:503});}
}
