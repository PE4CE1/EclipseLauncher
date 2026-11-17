const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0))
export async function sha256(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
export async function authenticate(request:Request,project:string):Promise<string>{
  const value=request.headers.get('Authorization')||''
  if(!/^Bearer [\w.-]{10,8192}$/.test(value))throw new Error('Unauthorized')
  const parts=value.slice(7).split('.');if(parts.length!==3)throw new Error('Unauthorized')
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))) as Record<string,unknown>,claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Record<string,unknown>,now=Date.now()/1000
  if(!header||!claims||header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128||claims.aud!==project||claims.iss!=='https://securetoken.google.com/'+project||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128||typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||claims.exp<=now||typeof claims.iat!=='number'||!Number.isFinite(claims.iat)||claims.iat>now+60||typeof claims.auth_time!=='number'||!Number.isFinite(claims.auth_time)||claims.auth_time>now+60)throw new Error('Unauthorized')
  const response=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{cf:{cacheEverything:true,cacheTtl:3600},signal:AbortSignal.timeout(5000)})
  if(!response.ok)throw new Error('Authentication unavailable')
  if(!response.body)throw new Error('Authentication unavailable')
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>64000){await reader.cancel();throw new Error('Authentication unavailable')}chunks.push(value)}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}
  const text=new TextDecoder().decode(buffer)
  const data=JSON.parse(text) as {keys:(JsonWebKey&{kid?:string})[]},jwk=data.keys.find(key=>key.kid===header.kid&&key.kty==='RSA')
  if(!jwk)throw new Error('Unauthorized')
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw new Error('Unauthorized')
  return sha256(claims.sub)
}
