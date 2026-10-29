import {AppShell} from '@/components/app-shell';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AppShell tenancyId={id}/>}
