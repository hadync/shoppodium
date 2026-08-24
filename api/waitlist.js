const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhamVyeGdpd2JnZXZmanpra295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY0NDcsImV4cCI6MjA5NjAyMjQ0N30.8dCTpfeWkdUIjmKGgfnrOqlBa1jIwDt_yqg3Dlt1a0M';
const clean=(v,max=320)=>String(v||'').trim().slice(0,max);
module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}}
    const shopName=clean(body.shop_name,200),ownerName=clean(body.owner_name,200),instagram=clean(body.instagram,120).replace(/^@+/,''),contact=clean(body.contact,320).toLowerCase(),shopType=clean(body.shop_type,80);
    if(!shopName||!ownerName||!contact||!shopType)return res.status(400).json({error:'Please complete all required fields.'});
    if(contact.length<3)return res.status(400).json({error:'Enter a valid email or phone number.'});
    const row={shop_name:shopName,owner_name:ownerName,instagram:instagram||null,contact,shop_type:shopType,source:clean(body.source,120)||null,utm_source:clean(body.utm_source,120)||null,utm_medium:clean(body.utm_medium,120)||null,utm_campaign:clean(body.utm_campaign,180)||null,utm_content:clean(body.utm_content,180)||null,landing_path:clean(body.landing_path,500)||null,user_agent:clean(req.headers['user-agent'],500)||null};
    const r=await fetch(SUPABASE_URL+'/rest/v1/brandr_waitlist',{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)});
    if(r.status===409)return res.status(200).json({ok:true,already_joined:true});
    if(!r.ok){console.error('waitlist insert failed',r.status,await r.text());return res.status(500).json({error:'Could not join the waitlist. Please try again.'})}
    return res.status(200).json({ok:true});
  }catch(err){console.error('waitlist endpoint error',err);return res.status(500).json({error:'Could not join the waitlist. Please try again.'})}
};