const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...headers}});
const bytes=s=>new TextEncoder().encode(s);
const b64=s=>btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
async function hmac(secret,message){const key=await crypto.subtle.importKey("raw",bytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,bytes(message)));}
async function verifyToken(req,secret){const match=(req.headers.get("Cookie")||"").match(/(?:^|;\s*)venus_session=([^;]+)/);if(!match)return false;const [body,sig]=match[1].split(".");if(!body||!sig||sig!==await hmac(secret,body))return false;try{const obj=JSON.parse(new TextDecoder().decode(unb64(body)));return obj.exp>Date.now()&&obj.sub==="admin"}catch{return false}}
function cookie(value,maxAge){return `venus_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${maxAge}`;}
export async function onRequest({request,env}) {
 if(!env.DB||!env.ADMIN_PASSWORD||!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return json({error:"Server not configured: DB, ADMIN_PASSWORD, SESSION_SECRET required"},503);
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/?/,""),method=request.method;
 if(route==="login"&&method==="POST"){
  let input;try{input=await request.json()}catch{return json({error:"Invalid JSON"},400)}
  if(typeof input.password!=="string"||input.password.length>256)return json({error:"Invalid credentials"},401);
  const a=bytes(input.password),b=bytes(env.ADMIN_PASSWORD);let mismatch=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a[i]||0)^(b[i]||0);
  if(mismatch)return json({error:"Invalid credentials"},401);
  const body=b64(bytes(JSON.stringify({sub:"admin",exp:Date.now()+8*60*60*1000})));
  return json({ok:true},200,{"Set-Cookie":cookie(body+"."+await hmac(env.SESSION_SECRET,body),8*60*60)});
 }
 if(route==="logout"&&method==="POST")return json({ok:true},200,{"Set-Cookie":cookie("",0)});
 if(!await verifyToken(request,env.SESSION_SECRET))return json({error:"Unauthorized"},401);
 if(route==="session"&&method==="GET")return json({ok:true});
 if(route==="state"&&method==="GET"){
  const row=await env.DB.prepare("SELECT revision,payload FROM app_state WHERE id=1").first();
  return json(row?{revision:row.revision,state:JSON.parse(row.payload)}:{revision:0,state:null});
 }
 if(route==="state"&&method==="PUT"){
  const raw=await request.text();if(raw.length>4_000_000)return json({error:"Payload too large"},413);
  let data;try{data=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
  if(!Number.isSafeInteger(data.revision)||data.revision<0||!data.state||!Array.isArray(data.state.c)||!Array.isArray(data.state.l)||!data.state.cfg)return json({error:"Invalid state"},400);
  const payload=JSON.stringify(data.state);
  if(payload.length>3_500_000)return json({error:"State too large"},413);
  const statements=[
   env.DB.prepare("INSERT INTO app_state(id,revision,payload) SELECT 1,1,? WHERE NOT EXISTS (SELECT 1 FROM app_state WHERE id=1) AND ?=0").bind(payload,data.revision),
   env.DB.prepare("UPDATE app_state SET revision=revision+1,payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=? AND ? > 0").bind(payload,data.revision,data.revision),
  ];
  // Sequential conditional writes: the INSERT succeeds only for initial revision 0.
  const result=data.revision===0?await statements[0].run():await statements[1].run();
  if(result.meta.changes!==1)return json({error:"Conflict: another device updated the database. Reload before editing."},409);
  const revision=data.revision+1;
  await env.DB.prepare("INSERT INTO audit_log(action,revision,actor) VALUES('state_write',?,'admin')").bind(revision).run();
  return json({ok:true,revision});
 }
 return json({error:"Not found"},404);
}
