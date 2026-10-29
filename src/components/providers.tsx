'use client';
import {PrivyProvider} from '@privy-io/react-auth';
import {studionet} from 'genlayer-js/chains';
export function Providers({children}:{children:React.ReactNode}){
 const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID;
 if(!appId)return <>{children}</>;
 return <PrivyProvider appId={appId} config={{loginMethods:['email'],appearance:{theme:'light',accentColor:'#526A1A',logo:'/icon.svg',showWalletLoginFirst:false,walletChainType:'ethereum-only',landingHeader:'Make yourself at home',loginMessage:'One email. Your tenancy record, safely together.'},embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'},showWalletUIs:false},supportedChains:[studionet],defaultChain:studionet}}>{children}</PrivyProvider>;
}
