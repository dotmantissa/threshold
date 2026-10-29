import {firefox} from '@playwright/test';
import fs from 'node:fs';
const auth=JSON.parse(fs.readFileSync('.secrets/auth-response.json','utf8'));
const browser=await firefox.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('response',r=>{if(r.url().includes('/api/tenancies'))console.log('Tenancy request HTTP',r.status())});
const base=process.env.REVIEW_URL||'http://localhost:3001';
await page.addInitScript(({token,refresh,pat})=>{
 localStorage.setItem('privy:token',JSON.stringify(token));localStorage.setItem('privy:refresh_token',JSON.stringify(refresh));if(pat)localStorage.setItem('privy:pat',JSON.stringify(pat));
}, {token:auth.token,refresh:auth.refresh_token,pat:auth.privy_access_token});
await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3000);
await page.getByRole('button',{name:'Create your first tenancy'}).waitFor({timeout:90000}).catch(()=>undefined);
console.log('Authenticated account visible',await page.getByRole('button',{name:'Sign out'}).count()>0);
console.log('Account ready',await page.getByRole('button',{name:'Create your first tenancy'}).count()>0);
await page.screenshot({path:'.storage/review/dashboard.png',fullPage:true});
await browser.close();
