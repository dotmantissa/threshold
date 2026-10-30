import deployment from '../../../../deployment.json';
export async function GET(){return Response.json({network:'studionet',chain_id:61999,contracts:deployment.contracts,verified_at:('verified_at' in deployment?deployment.verified_at:null),storage:process.env.STORAGE_DRIVER||'local'},{headers:{'Cache-Control':'public, max-age=60'}})}
