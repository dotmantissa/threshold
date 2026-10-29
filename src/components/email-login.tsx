'use client';
import {useState} from 'react';
import {useLoginWithEmail} from '@privy-io/react-auth';
import {Mail,Check,LoaderCircle} from 'lucide-react';
import {Dialog} from './dialog';
export function EmailLogin({onClose}:{onClose:()=>void}){
 const [email,setEmail]=useState('');const [code,setCode]=useState('');const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const {sendCode,loginWithCode}=useLoginWithEmail();
 async function submit(event:React.FormEvent){event.preventDefault();setError('');setBusy(true);try{
  if(sent){await loginWithCode({code});onClose()}else{await sendCode({email});setSent(true)}
 }catch{setError(sent?'That code did not work. Check the latest email and try again.':'We could not send your code. Check the email address and try again.')}finally{setBusy(false)}}
 return <Dialog title={sent?'Check your inbox':'Make yourself at home'} onClose={onClose}><div className="login-symbol"><Mail size={30}/></div><p className="dialog-intro">{sent?<>We sent a code to <strong>{email}</strong>. A small key to your whole record.</>:'One email is all you need. No password to forget, no wallet to figure out.'}</p><form onSubmit={submit} className="stack"><label>{sent?'Your email code':'Email address'}<input autoFocus key={sent?'code':'email'} type={sent?'text':'email'} inputMode={sent?'numeric':'email'} autoComplete={sent?'one-time-code':'email'} value={sent?code:email} onChange={event=>sent?setCode(event.target.value):setEmail(event.target.value)} placeholder={sent?'123456':'you@example.com'} required maxLength={sent?8:254}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:sent?<Check size={18}/>:<Mail size={18}/>} {sent?'Open my record':'Send my code'}</button>{sent&&<button type="button" className="text-button" onClick={()=>{setSent(false);setCode('');setError('')}}>Use a different email</button>}</form><p className="quiet small">Signing in also creates your secure account. You stay in control of every action.</p></Dialog>;
}
