const net = require('node:net');
const path = require('node:path');
const excluded = new net.BlockList();
for (const [base,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) excluded.addSubnet(base,bits,'ipv4');
for (const [base,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]]) excluded.addSubnet(base,bits,'ipv6');
function normaliseIp(ip) {
  let value=String(ip||'');
  if(value.startsWith('::ffff:')&&net.isIP(value.slice(7))===4)value=value.slice(7);
  return net.isIP(value)?value:null;
}
function isPublicIp(ip) {
  const value=normaliseIp(ip);if(!value)return false;
  return !excluded.check(value,net.isIP(value)===4?'ipv4':'ipv6');
}
const bounded=(v,n=160)=>typeof v==='string'?v.slice(0,n):null;
function locationRecord(ip,data,{source='local MMDB',version='unspecified'}={}) {
  const rawCountry=data?.country?.iso_code;
  const country=/^[A-Z]{2}$/.test(rawCountry||'')?rawCountry:null;
  const continent=/^(AF|AS|EU|NA|OC|SA|AN)$/.test(data?.continent?.code||'')?data.continent.code:null;
  const region=Array.isArray(data?.subdivisions)?data.subdivisions[0]:data?.subdivisions;
  const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
  return {ip_address:normaliseIp(ip),lookup_status:!isPublicIp(ip)?'non_public':country?'located':'not_found',
    continent_code:continent,country_code:country,country_name:bounded(data?.country?.names?.en),
    region_name:bounded(region?.names?.en),city_name:bounded(data?.city?.names?.en),
    latitude:finite(data?.location?.latitude,-90,90),longitude:finite(data?.location?.longitude,-180,180),
    accuracy_radius_km:finite(data?.location?.accuracy_radius,0,20040),
    source_name:bounded(source,100),source_version:bounded(version,100)};
}
function createIpLocation({file=process.env.GEOIP_DB_PATH,source=process.env.GEOIP_SOURCE||'local MMDB',
  version=process.env.GEOIP_DB_VERSION,openReader,logger=console}={}) {
  if(!file){logger.warn?.('IP location enrichment disabled: GEOIP_DB_PATH is not set');return null;}
  file=path.isAbsolute(file)?file:path.resolve(__dirname,file);
  let readerPromise,unavailableUntil=0;
  const identity={source,version:version||path.basename(file)};
  async function lookup(ip) {
    const value=normaliseIp(ip);if(!value)return null;
    if(!isPublicIp(value))return locationRecord(value,null,identity);
    if(Date.now()<unavailableUntil)return null;
    try {
      readerPromise??=openReader?Promise.resolve(openReader(file)):require('maxmind').open(file,{cache:{max:2000}});
      const reader=await readerPromise;
      return locationRecord(value,reader.get(value),identity);
    }catch(error){unavailableUntil=Date.now()+60000;readerPromise=null;logger.error('Local IP location database unavailable',{code:error.code||'GEOIP_LOOKUP_ERROR',file});return null;}
  }
  return {lookup,source:identity.source,version:identity.version};
}
let defaultLocation;
function getDefaultIpLocation(){if(defaultLocation===undefined)defaultLocation=createIpLocation();return defaultLocation;}
module.exports={normaliseIp,isPublicIp,locationRecord,createIpLocation,getDefaultIpLocation};
