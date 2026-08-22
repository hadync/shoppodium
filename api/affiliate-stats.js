// Creator referral stats + tracked creator-link redirect.
// GET /api/affiliate-stats?ref=CODE
// GET /api/affiliate-stats?ref=CODE&redirect=1
const SUPABASE_URL='https://cajerxgiwbgevfjzkkoy.supabase.co';

async function trackCreatorClick(ref, req){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) return;
  try{
    const h={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
    const cr=await fetch(SUPABASE_URL+'/rest/v1/brandr_creators?code=eq.'+encodeURIComponent(ref.toLowerCase())+'&status=eq.active&select=id&limit=1',{headers:h});
    const rows=await cr.json();
    const creator=Array.isArray(rows)?rows[0]:null;
    if(!creator) return;
    await fetch(SUPABASE_URL+'/rest/v1/brandr_creator_events',{method:'POST',headers:Object.assign({},h,{Prefer:'return=minimal'}),body:JSON.stringify({creator_id:creator.id,event_type:'click',path:req.url||null,referrer:req.headers.referer||null,user_agent:req.headers['user-agent']||null})});
  }catch(e){ console.error('creator click tracking failed',e); }
}

module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const ref=(req.query&&req.query.ref?String(req.query.ref):'').trim();
    if(!ref) return res.status(400).json({error:'Missing ref'});

    if(req.query&&String(req.query.redirect||'')==='1'){
      await trackCreatorClick(ref,req);
      const code=ref.toLowerCase();
      res.setHeader('Set-Cookie','brandr_ref='+encodeURIComponent(code)+'; Path=/; Max-Age=2592000; SameSite=Lax; Secure');
      return res.redirect(302,'/brandr-home.html?ref='+encodeURIComponent(code));
    }

    const key=process.env.STRIPE_SECRET_KEY;
    if(!key) return res.status(500).json({error:'Missing STRIPE_SECRET_KEY'});
    const RATE=0.25,FREE_AT=5;
    let subs=[],starting_after=null;
    for(let i=0;i<5;i++){
      let url='https://api.stripe.com/v1/subscriptions?limit=100&status=all';
      if(starting_after) url+='&starting_after='+starting_after;
      const r=await fetch(url,{headers:{Authorization:'Bearer '+key}}),data=await r.json();
      if(data.error) return res.status(400).json({error:data.error.message});
      subs=subs.concat(data.data||[]);
      if(!data.has_more||!data.data.length) break;
      starting_after=data.data[data.data.length-1].id;
    }
    const mine=subs.filter(s=>s.metadata&&s.metadata.ref&&s.metadata.ref.toLowerCase()===ref.toLowerCase());
    const active=mine.filter(s=>s.status==='active'||s.status==='trialing');
    let monthly=0;
    active.forEach(s=>(s.items&&s.items.data||[]).forEach(it=>{const amt=it.price&&it.price.unit_amount?it.price.unit_amount:0;monthly+=amt*(it.quantity||1)}));
    monthly/=100;
    const referredCount=active.length,yourCut=Math.round(monthly*RATE*100)/100;
    return res.status(200).json({ref,referredCount,totalReferred:mine.length,monthlyRecurring:monthly,yourMonthlyCut:yourCut,rate:RATE,bagFree:referredCount>=FREE_AT,referralsToFreeBag:Math.max(0,FREE_AT-referredCount)});
  }catch(err){return res.status(500).json({error:err.message})}
};
