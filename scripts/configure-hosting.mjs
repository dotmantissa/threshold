import {config} from 'dotenv';
import {spawn} from 'node:child_process';
config({path:'.env.local',quiet:true});
const values={NEXT_PUBLIC_PRIVY_APP_ID:process.env.NEXT_PUBLIC_PRIVY_APP_ID,PRIVY_APP_ID:process.env.PRIVY_APP_ID,PRIVY_APP_SECRET:process.env.PRIVY_APP_SECRET,DATABASE_URL:process.env.DATABASE_URL,STORAGE_DRIVER:'vercel',APP_URL:'https://threshold-peace.vercel.app'};
for(const [key,value] of Object.entries(values)){
 if(!value)throw Error('Missing configuration: '+key);
 const code=await new Promise((resolve,reject)=>{
  const child=spawn('vercel',['env','add',key,'production',...(key.startsWith('NEXT_PUBLIC_')||['STORAGE_DRIVER','APP_URL'].includes(key)?[]:['--sensitive'])],{stdio:['pipe','pipe','pipe']});
  child.stdin.end(value);child.on('error',reject);child.on('close',resolve);
 });
 console.log(key,code===0?'configured':'configuration failed');
 if(code!==0)process.exit(1);
}
