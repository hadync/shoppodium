const SUPABASE_URL='https://cajerxgiwbgevfjzkkoy.supabase.co';

async function sb(path, options={}){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  const headers=Object.assign({apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},options.headers||{});
  return fetch(SUPABASE_URL+'/rest/v1/'+path,Object.assign({},options,{headers}));
}

module.exports=async(req,res)=>{
  try{
    const slug=String((req.query&&req.query.slug)||'').trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9-_]{1,62}$/.test(slug)) return res.redirect(302,'/brandr-home.html');

    const cr=await sb('brandr_creators?code=eq.'+encodeURIComponent(slug)+'&status=eq.active&select=id,code,display_name,commission_rate&limit=1');
    const rows=await cr.json();
    const creator=Array.isArray(rows)?rows[0]:null;
    if(!creator) return res.redirect(302,'/brandr-home.html');

    await sb('brandr_creator_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
      creator_id:creator.id,
      event_type:'click',
      path:req.url||null,
      referrer:req.headers.referer||null,
      user_agent:req.headers['user-agent']||null
    })});

    const maxAge=60*60*24*30;
    res.setHeader('Set-Cookie','brandr_ref='+encodeURIComponent(slug)+'; Path=/; Max-Age='+maxAge+'; SameSite=Lax; Secure');
    return res.redirect(302,'/volt.html?ref='+encodeURIComponent(slug));
  }catch(err){
    console.error('creator-ref',err);
    return res.redirect(302,'/brandr-home.html');
  }
};
