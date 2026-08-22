// Creator referral stats + tracked creator-link redirect + payout ledger summary.
// GET /api/affiliate-stats?ref=CODE
// GET /api/affiliate-stats?ref=CODE&redirect=1
const SUPABASE_URL='https://cajerxgiwbgevfjzkkoy.supabase.co';

function sbHeaders(){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) return null;
  return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
}

async function getCreator(ref){
  const h=sbHeaders();
  if(!h) return null;
  const r=await fetch(SUPABASE_URL+'/rest/v1/brandr_creators?code=eq.'+encodeURIComponent(ref.toLowerCase())+'&status=eq.active&select=id,code,display_name,commission_rate,stripe_account_id&limit=1',{headers:h});
  const rows=await r.json();
  return Array.isArray(rows)?rows[0]:null;
}

async function trackCreatorClick(ref,req){
  const h=sbHeaders();
  if(!h) return;
  try{
    const creator=await getCreator(ref);
    if(!creator) return;
    await fetch(SUPABASE_URL+'/rest/v1/brandr_creator_events',{method:'POST',headers:Object.assign({},h,{Prefer:'return=minimal'}),body:JSON.stringify({creator_id:creator.id,event_type:'click',path:req.url||null,referrer:req.headers.referer||null,user_agent:req.headers['user-agent']||null})});
  }catch(e){console.error('creator click tracking failed',e)}
}

async function payoutSummary(creator){
  const h=sbHeaders();
  if(!h||!creator) return {pending:0,available:0,paid:0};
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/brandr_creator_commissions?creator_id=eq.'+creator.id+'&select=commission_cents,status',{headers:h});
    const rows=await r.json();
    const sums={pending:0,available:0,paid:0};
    if(Array.isArray(rows)) rows.forEach(x=>{
      const cents=Number(x.commission_cents)||0;
      if(x.status==='paid') sums.paid+=cents;
      else if(x.status==='available') sums.available+=cents;
      else sums.pending+=cents;
    });
    return {pending:sums.pending/100,available:sums.available/100,paid:sums.paid/100};
  }catch(e){return {pending:0,available:0,paid:0}}
}

async function connectStatus(accountId,stripeKey){
  if(!accountId) return {connected:false,status:'not_connected'};
  try{
    const r=await fetch('https://api.stripe.com/v1/accounts/'+encodeURIComponent(accountId),{headers:{Authorization:'Bearer '+stripeKey}});
    const a=await r.json();
    if(a.error) return {connected:true,status:'needs_attention'};
    if(a.payouts_enabled) return {connected:true,status:'ready'};
    if(a.details_submitted) return {connected:true,status:'pending'};
    return {connected:true,status:'incomplete'};
  }catch(e){return {connected:true,status:'needs_attention'}}
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
    const creator=await getCreator(ref);
    if(!creator) return res.status(404).json({error:'Creator not found'});

    const RATE=Number(creator.commission_rate)||0.25,FREE_AT=5;
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
    const payouts=await payoutSummary(creator);
    const payoutAccount=await connectStatus(creator.stripe_account_id,key);
    return res.status(200).json({
      ref,
      creatorName:creator.display_name||ref,
      referredCount,
      totalReferred:mine.length,
      monthlyRecurring:monthly,
      yourMonthlyCut:yourCut,
      rate:RATE,
      bagFree:referredCount>=FREE_AT,
      referralsToFreeBag:Math.max(0,FREE_AT-referredCount),
      payouts,
      payoutAccount
    });
  }catch(err){return res.status(500).json({error:err.message})}
};
