import {ImageResponse} from 'next/og';
export const alt='Threshold. Keep the photos. Keep the peace.';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function Image(){return new ImageResponse(<div style={{background:'#17211C',color:'#F4F5ED',height:'100%',width:'100%',display:'flex',padding:'75px',flexDirection:'column',justifyContent:'space-between'}}><div style={{display:'flex',fontSize:36}}>threshold<span style={{color:'#D6F15B'}}>.</span></div><div style={{display:'flex',alignItems:'center',gap:50}}><div style={{display:'flex',fontSize:78,lineHeight:1.04,maxWidth:790}}>Keep the photos. Keep the peace.</div><div style={{height:290,width:8,background:'#D6F15B'}}/></div><div style={{display:'flex',fontSize:24,color:'#A8B3AA'}}>A fairer goodbye starts on arrival.</div></div>,size)}
