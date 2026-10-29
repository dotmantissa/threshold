import './proxy.mjs';
import fs from 'node:fs';
// Prefer the project dependency; the CLI fallback supports bootstrapping before npm finishes.
let sdk, chains;
try { sdk = await import('genlayer-js'); chains = await import('genlayer-js/chains'); }
catch { sdk = await import('/home/dotmantissa/.local/lib/node_modules/genlayer/node_modules/genlayer-js/dist/index.js'); chains = await import('/home/dotmantissa/.local/lib/node_modules/genlayer/node_modules/genlayer-js/dist/chains/index.js'); }
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const client = sdk.createClient({chain:chains.studionet,account:sdk.createAccount(env.GENLAYER_PRIVATE_KEY)});
const file = 'docs/image-probe.json';
let record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {network:'studionet', signer:client.account.address};
const save=()=>fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
if (!record.deployTx) { record.deployTx = await client.deployContract({code:fs.readFileSync('contracts/probes/image_probe.py'),args:[]}); save(); console.log('Probe deploy submitted',record.deployTx); }
if (!record.address) { const receipt=await client.waitForTransactionReceipt({hash:record.deployTx,status:'ACCEPTED',interval:5000,retries:36}); fs.mkdirSync('.storage/receipts',{recursive:true}); fs.writeFileSync('.storage/receipts/probe-deploy.json',JSON.stringify(receipt,null,2)); console.log('Deploy status',receipt.status,'execution',receipt.result); record.address = receipt.data?.contract_address || receipt.contract_address; save(); if(!record.address) throw Error('Probe deploy has no contract address; inspect receipt'); }
const url='https://images.unsplash.com/photo-1484154218962-a197022b5858?w=640&q=80';
const hash='9859c860f4db44c5b46035bc9236e20d48c6f50415346617ec517c21f21fb1da';
if (!record.compareTx) { record.compareTx=await client.writeContract({address:record.address,functionName:'compare',args:[url,url,hash,hash]});save();console.log('Image comparison submitted',record.compareTx); }
const receipt=await client.waitForTransactionReceipt({hash:record.compareTx,status:'ACCEPTED',interval:5000,retries:36});fs.writeFileSync('.storage/receipts/probe-compare.json',JSON.stringify(receipt,null,2)); console.log('Compare status',receipt.status,'execution',receipt.result);
record.result=await client.readContract({address:record.address,functionName:'get_result',args:[]});record.status=receipt.status;save();console.log(record);
