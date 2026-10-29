import type {Metadata,Viewport} from 'next';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/500.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import {Providers} from '@/components/providers';
export const metadata:Metadata={metadataBase:new URL(process.env.APP_URL||'http://localhost:3000'),title:'Threshold | A fairer goodbye',description:'A shared record of your home, from the day you arrive to the day you leave. Protect your deposit with committed photos and a neutral verdict.',icons:{icon:'/icon.svg',apple:'/apple-icon.png'},openGraph:{title:'Threshold | Keep the photos. Keep the peace.',description:'Record the arrival. Compare the departure. Let the evidence speak.',images:['/opengraph-image']}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#17211C'};
const themeScript="try{document.documentElement.dataset.theme=localStorage.getItem('threshold-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><Providers>{children}</Providers></body></html>}
