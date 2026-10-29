import Link from 'next/link';
import {DoorClosed} from 'lucide-react';
export default function NotFound(){return <main className="standalone-state"><DoorClosed size={48} strokeWidth={1.3}/><h1>This door leads nowhere.</h1><p>The page may have moved. Your tenancy records are still at home.</p><Link href="/" className="button primary">Back to Threshold</Link></main>}
