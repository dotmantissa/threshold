export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.THRESHOLD_CURL_TRANSPORT==='1')await import('../scripts/proxy.mjs');
}
