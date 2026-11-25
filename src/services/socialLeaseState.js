export const HTTP_BINDING=Symbol('private-http-proxy-session');
export function bindHttpState(state,binding){if(state&&binding)Object.defineProperty(state,HTTP_BINDING,{value:binding,enumerable:false,configurable:true});}
export async function disposeReadState(state){await state?.[HTTP_BINDING]?.dispose?.();}
// The manager retains the old proxy's API cooldown. Only the detached session is reset.
// Global/scope cooldowns are still enforced by manager.acquire/permit on the next lease.
export async function rotateReadStateProxy(state){
 const binding=state?.[HTTP_BINDING];
 if(binding?.terminal)return false;
 if(binding){await binding.dispose?.();binding.blockedUntil=0;}
 return true;
}
