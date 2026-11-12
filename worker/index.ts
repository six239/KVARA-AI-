export interface Env {
  DB: D1Database;
  AI: Ai;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  REPLICATE_API_TOKEN?: string;
  REPLICATE_VIDEO_MODEL_VERSION?: string;
  TAVILY_API_KEY?: string;
}
type User = { id: string; email: string };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const bytes = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("");
async function digest(s: string) { return hex(await crypto.subtle.digest("SHA-256", bytes(s))); }
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", bytes(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt:bytes(salt), iterations:210000, hash:"SHA-256" }, key, 256);
  return hex(bits);
}
function cookie(req: Request, name: string) {
  return (req.headers.get("Cookie") || "").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1);
}
async function auth(req: Request, env: Env): Promise<User|null> {
  const token = cookie(req,"kvara_session"); if (!token) return null;
  const row = await env.DB.prepare("SELECT users.id, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at > ?").bind(await digest(token),new Date().toISOString()).first<User>();
  return row || null;
}
function sessionCookie(token: string, maxAge: number) { return `kvara_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }
async function body(req: Request) { try { return await req.json() as Record<string, any>; } catch { return {}; } }
function id() { return crypto.randomUUID(); }
async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url), path = url.pathname, method = req.method;
  if (path === "/api/health") return json({ ok:true, service:"KVARA AI" });
  if (path === "/api/auth/register" && method==="POST") {
    const b=await body(req), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<10) return json({error:"Use a valid email and a password with at least 10 characters."},400);

    let stage = "password_hash";
    try {
      const salt=crypto.randomUUID();
      const hash=await passwordHash(password,salt);
      const userId=id();
      const token=crypto.randomUUID()+crypto.randomUUID();
      const tokenHash=await digest(token);
      const expires=new Date(Date.now()+30*864e5).toISOString();

      stage = "database_insert";
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users(id,email,password_hash) VALUES(?,?,?)").bind(userId,email,salt+":"+hash),
        env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(tokenHash,userId,expires)
      ]);

      return new Response(JSON.stringify({user:{id:userId,email}}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":sessionCookie(token,30*86400)}});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("KVARA registration failed", { stage, error: message });
      if (message.includes("UNIQUE constraint failed") && message.toLowerCase().includes("users.email")) {
        return json({error:"An account with this email already exists."},409);
      }
      return json({error:"Registration failed. Please try again later.",stage,diagnostic:message.slice(0,240)},500);
    }
  }
  if (path === "/api/auth/login" && method==="POST") {
    const b=await body(req), email=String(b.email||"").trim().toLowerCase(), password=String(b.password||"");
    const user=await env.DB.prepare("SELECT id,email,password_hash FROM users WHERE email=?").bind(email).first<{id:string,email:string,password_hash:string}>();
    if (!user) return json({error:"Email or password is incorrect."},401);
    const [salt,stored]=user.password_hash.split(":");
    if (await passwordHash(password,salt)!==stored) return json({error:"Email or password is incorrect."},401);
    const token=crypto.randomUUID()+crypto.randomUUID(), expires=new Date(Date.now()+30*864e5).toISOString();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await digest(token),user.id,expires).run();
    return new Response(JSON.stringify({user:{id:user.id,email:user.email}}),{headers:{"content-type":"application/json","set-cookie":sessionCookie(token,30*86400)}});
  }
  if (path === "/api/auth/logout" && method==="POST") {
    const token=cookie(req,"kvara_session"); if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await digest(token)).run();
    return new Response("{}",{headers:{"content-type":"application/json","Set-Cookie":sessionCookie("",0)}});
  }
  if (path === "/api/auth/me") { const user=await auth(req,env); return json({user}); }
  const user=await auth(req,env);
  if (path.startsWith("/api/") && !user) return json({error:"Please sign in first."},401);
  if (path==="/api/chats" && method==="GET") {
    const {results}=await env.DB.prepare("SELECT id,title,created_at,updated_at FROM chats WHERE user_id=? ORDER BY updated_at DESC").bind(user!.id).all();
    return json({chats:results});
  }
  if (path==="/api/chats" && method==="POST") {
    const chatId=id(); await env.DB.prepare("INSERT INTO chats(id,user_id,title) VALUES(?,?,?)").bind(chatId,user!.id,"New chat").run();
    return json({id:chatId,title:"New chat"});
  }
  const chatMatch=path.match(/^\/api\/chats\/([^/]+)$/);
  if(chatMatch) {
    const chatId=chatMatch[1], owned=await env.DB.prepare("SELECT id,title FROM chats WHERE id=? AND user_id=?").bind(chatId,user!.id).first<{id:string,title:string}>();
    if(!owned) return json({error:"Chat not found."},404);
    if(method==="GET") { const {results}=await env.DB.prepare("SELECT id,role,content,created_at FROM messages WHERE chat_id=? ORDER BY created_at").bind(chatId).all(); return json({chat:owned,messages:results}); }
    if(method==="PATCH") { const b=await body(req); await env.DB.prepare("UPDATE chats SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(String(b.title||"New chat").slice(0,80),chatId,user!.id).run(); return json({ok:true}); }
    if(method==="DELETE") { await env.DB.prepare("DELETE FROM chats WHERE id=? AND user_id=?").bind(chatId,user!.id).run(); return json({ok:true}); }
  }
  if(path==="/api/chat" && method==="POST") {
    const b=await body(req), chatId=String(b.chatId||""), prompt=String(b.message||"").slice(0,16000);
    if(!prompt) return json({error:"Message is empty."},400);
    const owned=await env.DB.prepare("SELECT id FROM chats WHERE id=? AND user_id=?").bind(chatId,user!.id).first();
    if(!owned) return json({error:"Chat not found."},404);
    await env.DB.prepare("INSERT INTO messages(id,chat_id,role,content) VALUES(?,?,?,?)").bind(id(),chatId,"user",prompt).run();
    const {results}=await env.DB.prepare("SELECT role,content FROM messages WHERE chat_id=? ORDER BY created_at DESC LIMIT 16").bind(chatId).all<{role:string,content:string}>();
    const messages=results.reverse().map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content}));
    try {
      const out=await env.AI.run("@cf/zai-org/glm-4.7-flash",{messages,max_tokens:1800});
      const answer=String((out as any).response || (out as any).choices?.[0]?.message?.content || "I couldn't generate a response.");
      await env.DB.prepare("INSERT INTO messages(id,chat_id,role,content) VALUES(?,?,?,?)").bind(id(),chatId,"assistant",answer).run();
      await env.DB.prepare("UPDATE chats SET updated_at=CURRENT_TIMESTAMP, title=CASE WHEN title='New chat' THEN ? ELSE title END WHERE id=?").bind(prompt.slice(0,48),chatId).run();
      return json({answer});
    } catch(e) { return json({error:"AI provider error: "+String(e)},502); }
  }
  if(path==="/api/image" && method==="POST") {
    const b=await body(req), prompt=String(b.prompt||"").slice(0,1500); if(!prompt) return json({error:"Enter an image prompt."},400);
    try {
      const result=await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{prompt});
      const data=(result as any).image; if(!data) return json({error:"Image provider returned no image."},502);
      const key="generated/"+user!.id+"/"+id()+".png";
      await env.FILES.put(key,Uint8Array.from(atob(data),c=>c.charCodeAt(0)),{httpMetadata:{contentType:"image/png"}});
      return json({url:"/api/files/"+encodeURIComponent(key)});
    } catch(e) { return json({error:"Image generation failed: "+String(e)},502); }
  }
  if(path.startsWith("/api/files/") && method==="GET") {
    const key=decodeURIComponent(path.slice("/api/files/".length)), obj=await env.FILES.get(key);
    if(!obj || !key.includes("/"+user!.id+"/")) return json({error:"File not found."},404);
    return new Response(obj.body,{headers:{"content-type":obj.httpMetadata?.contentType||"application/octet-stream","cache-control":"private, max-age=3600"}});
  }
  if(path==="/api/search" && method==="POST") {
    if(!env.TAVILY_API_KEY) return json({error:"Web search is not configured. Add TAVILY_API_KEY in Worker secrets."},503);
    const b=await body(req), query=String(b.query||"").slice(0,500);
    const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({api_key:env.TAVILY_API_KEY,query,search_depth:"basic",max_results:5})});
    return new Response(await r.text(),{headers:{"content-type":"application/json"}});
  }
  if(path==="/api/video" && method==="POST") {
    if(!env.REPLICATE_API_TOKEN || !env.REPLICATE_VIDEO_MODEL_VERSION) return json({error:"Video generation needs REPLICATE_API_TOKEN and REPLICATE_VIDEO_MODEL_VERSION secrets."},503);
    const b=await body(req);
    const r=await fetch("https://api.replicate.com/v1/predictions",{method:"POST",headers:{Authorization:"Bearer "+env.REPLICATE_API_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({version:env.REPLICATE_VIDEO_MODEL_VERSION,input:{prompt:String(b.prompt||"").slice(0,1000)}})});
    return new Response(await r.text(),{status:r.status,headers:{"content-type":"application/json"}});
  }
  if(path.startsWith("/api/video/") && method==="GET") {
    if(!env.REPLICATE_API_TOKEN) return json({error:"Video provider is not configured."},503);
    const r=await fetch("https://api.replicate.com/v1/predictions/"+encodeURIComponent(path.split("/").pop()!),{headers:{Authorization:"Bearer "+env.REPLICATE_API_TOKEN}});
    return new Response(await r.text(),{status:r.status,headers:{"content-type":"application/json"}});
  }
  return env.ASSETS.fetch(req);
}
export default { async fetch(req:Request,env:Env):Promise<Response> {
  const url=new URL(req.url);
  if (url.pathname.startsWith("/api/")) console.log("KVARA request", req.method, url.pathname);
  if(url.pathname.startsWith("/api/")) {
    const requestOrigin=req.headers.get("Origin");
    if(requestOrigin && requestOrigin !== url.origin) return json({error:"Cross-origin requests are not allowed."},403);
    const cors=new Headers({"Access-Control-Allow-Origin":url.origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Vary":"Origin"});
    if(req.method==="OPTIONS") return new Response(null,{headers:cors});
    let response: Response;
    try {
      response=await route(req,env);
    } catch (err) {
      console.error("KVARA unhandled API error", req.method, url.pathname, err instanceof Error ? err.stack || err.message : String(err));
      response=json({error:"Internal server error."},500);
    }
    const headers=new Headers(response.headers); cors.forEach((v,k)=>headers.set(k,v));
    return new Response(response.body,{status:response.status,headers});
  }
  return env.ASSETS.fetch(req);
} };