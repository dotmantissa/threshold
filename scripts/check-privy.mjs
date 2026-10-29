import './proxy.mjs';
import {config} from 'dotenv';
import {PrivyClient} from '@privy-io/node';
import fs from 'node:fs';
config({path:'.env.local',quiet:true});
const client=new PrivyClient({appId:process.env.PRIVY_APP_ID,appSecret:process.env.PRIVY_APP_SECRET});
try{
 const settings=await client.apps().getSettings();
 fs.writeFileSync('.secrets/privy-settings.json',JSON.stringify(settings,null,2),{mode:0o600});
 console.log('Privy configuration verified.');
 console.log('Email:',settings.email_auth,'Allowed origins:',settings.allowed_origins,'Embedded config present:',Boolean(settings.embedded_wallet_config));
}catch(error){console.log('Privy check failed:',error.status||error.name);process.exitCode=1}
