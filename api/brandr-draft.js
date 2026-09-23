const SUPABASE_URL='https://cajerxgiwbgevfjzkkoy.supabase.co';
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const FORMAT_MAP={'growth-cards':'growth_cards','growth-envelopes':'growth_envelopes','monthly-customer-kits':'customer_bags'};
module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!SERVICE_KEY)return res.status(500).json({error:'Missing SUPABASE_SERVICE_ROLE_KEY'});
  try{
    let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{b={}}}
    const sessionToken=String(b.sessionToken||'').slice(0,200);
    if(!sessionToken)return res.status(400).json({error:'Missing sessionToken'});
    const format=FORMAT_MAP[b.kit]||'custom';
    const payload={
      session_token:sessionToken,
      email:b.email?String(b.email).slice(0,320):null,
      format,
      quantity:Number.isFinite(Number(b.quantity))?Number(b.quantity):null,
      selected_components:{components:Array.isArray(b.components)?b.components:[],extras:Array.isArray(b.extras)?b.extras:[]},
      brand_info:(b.brandInfo&&typeof b.brandInfo==='object')?b.brandInfo:{},
      pricing_snapshot:(b.pricing&&typeof b.pricing==='object')?b.pricing:null,
      status:'draft',
      updated_at:new Date().toISOString()
    };
    const r=await fetch(SUPABASE_URL+'/rest/v1/brandr_draft_builders?on_conflict=session_token',{
      method:'POST',
      headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){const t=await r.text();console.error('draft save failed',t);return res.status(500).json({error:'Could not save draft'})}
    return res.status(200).json({ok:true});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Draft save failed'});
  }
};
