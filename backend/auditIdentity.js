const {createHmac}=require('node:crypto');
const net=require('node:net');
const {normaliseIp,isPublicIp}=require('./ipLocation');
// Cloudflare ranges are used only to reject proxy endpoints, never to trust a header.
const cloudflare=new net.BlockList();
for(const cidr of ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32']){
 const [ip,bits]=cidr.split('/');cloudflare.addSubnet(ip,Number(bits),net.isIP(ip)===4?'ipv4':'ipv6');
}
function canonicalIp(value){const ip=normaliseIp(value);if(!ip)return null;return net.isIP(ip)===6?new URL(`http://[${ip}]/`).hostname.slice(1,-1):ip;}
function proxyIp(ip){return ip&&cloudflare.check(ip,net.isIP(ip)===4?'ipv4':'ipv6');}
function createAuditIdentity({secret=process.env.AUDIT_ID_SECRET,now=()=>Date.now(),ipLocation=null}={}){
 if(!/^[a-f0-9]{64,}$/i.test(secret||''))throw new Error('AUDIT_ID_SECRET must be a random hex secret of at least 32 bytes');
 const key=Buffer.from(secret,'hex');
 return async req=>{
  // req.ip uses the application's existing Express trust policy. Do not trust browser-supplied headers here.
  const ip=canonicalIp(req.ip||req.socket?.remoteAddress);
  const period=String(Math.floor(now()/(7*86400000)));
  const status=!ip?'unavailable':proxyIp(ip)?'proxy_unresolved':!isPublicIp(ip)?'non_public':null;
  const location=!status&&ipLocation?await ipLocation.lookup(ip):null;
  // Local and unresolved proxy endpoints must not be counted as visitors.
  const token=!status?createHmac('sha256',key).update(`caal-audit:v1:${period}:${ip}`).digest('hex'):null;
  const user=req.session?.appSession?.user;
  return {visitor_id:token,visitor_period:token?period:null,
   country_code:location?.country_code||null,country_name:location?.country_name||null,
   continent_code:location?.continent_code||null,location_status:status||location?.lookup_status||'not_enriched',
   location_source:location?.source_name||null,location_source_version:location?.source_version||null,
   user_agent:String(req.get?.('user-agent')||'').slice(0,1024),
   user_id:user?.user_id||null,username:user?.username||null,workspace_code:user?.workspace_code||null};
 };
}
module.exports={createAuditIdentity,canonicalIp,proxyIp};
