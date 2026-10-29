'use client';
import {RefreshCcw} from 'lucide-react';
export default function Error({reset}:{reset:()=>void}){return <main className="standalone-state"><RefreshCcw size={40}/><h1>A little interruption.</h1><p>We couldn’t open this page. Your committed record stays safe on the network.</p><button className="button primary" onClick={reset}>Try again</button></main>}
