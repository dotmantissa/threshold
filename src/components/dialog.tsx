'use client';
import {useEffect,useRef,useId} from 'react';
import {X} from 'lucide-react';
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const titleId=useId();
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[]);
 return <dialog aria-labelledby={titleId} ref={ref} className={'dialog'+(wide?' dialog-wide':'')} onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===ref.current)onClose()}}><div className="dialog-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={22}/></button></div>{children}</dialog>;
}
