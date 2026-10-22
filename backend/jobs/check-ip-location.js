'use strict';
// Run from backend: node jobs/check-ip-location.js
require('dotenv').config({path:require('node:path').join(__dirname,'..','.env')});
const fs=require('node:fs'),path=require('node:path');
const {createIpLocation}=require('../ipLocation');
(async()=>{
 const configured=process.env.GEOIP_DB_PATH;
 if(!configured){console.log('DISABLED: GEOIP_DB_PATH is not set.');process.exitCode=1;return;}
 const file=path.isAbsolute(configured)?configured:path.resolve(__dirname,'..',configured);
 console.log('MMDB path:',file);
 try{fs.accessSync(file,fs.constants.R_OK);}catch(error){console.log('MMDB not readable:',error.code);process.exitCode=1;return;}
 const resolver=createIpLocation({file});
 // Public DNS address tests reader operation; it is not a real visitor address.
 const row=await resolver.lookup('8.8.8.8');
 if(!row){console.log('LOOKUP FAILED. Check maxmind installation and MMDB format.');process.exitCode=1;return;}
 console.log(JSON.stringify({lookup_status:row.lookup_status,country_code:row.country_code,country_name:row.country_name,source:row.source_name,version:row.source_version},null,2));
 console.log('Local request status:',(await resolver.lookup('127.0.0.1')).lookup_status);
 console.log('No database writes or historical backfill performed.');
})().catch(error=>{console.error({code:error.code,message:error.message});process.exitCode=1;});
