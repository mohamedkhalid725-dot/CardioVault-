import React,{useState}from'react';
import {Mail,ArrowRight,UserPlus}from'lucide-react';
import {CardioLogo}from'../CardioLogo';
import {useApp}from'../../context/AppContext';
import {Capacitor}from'@capacitor/core';
import {FirebaseAuthentication}from'@capacitor-firebase/authentication';
import {loadCurrentUserFromCloud}from'../../services/cloudSyncBridge';
import {webEmailSignIn,webEmailCreate}from'../../services/webFirebase';
import {isMasterAccount,ensureOwnerWorkspace} from '../../services/workspaceAccess';

async function waitForNativeGoogleUser():Promise<any|null>{for(let attempt=0;attempt<12;attempt+=1){try{const pending=await FirebaseAuthentication.getPendingAuthResult();if(pending?.user?.email)return pending.user;}catch{}try{const current=await FirebaseAuthentication.getCurrentUser();if(current?.user?.email)return current.user;}catch{}await new Promise(resolve=>window.setTimeout(resolve,350));}return null;}

export const LoginScreen:React.FC=()=>{const{loginWithGoogle,loginWithEmail,showToast}=useApp();const[mode,setMode]=useState<'options'|'email'|'create'>('options');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[confirmPassword,setConfirmPassword]=useState('');const[busy,setBusy]=useState(false);
 const finishFirebaseAccount=async(user:any,successMessage:string)=>{if(!user?.email||!user?.uid)throw new Error('Firebase returned no user account.');localStorage.setItem('cardiovault_google_uid',user.uid);loginWithEmail(user.email);showToast(successMessage,'success');try{if(await isMasterAccount()){await ensureOwnerWorkspace();window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}}catch(error){console.warn('Master workspace bootstrap after sign-in failed:',error);}
   // Authentication must not wait for Firestore/cloud restoration. Open the app immediately;
   // cloud restoration continues in the background and the boot/session layer will retry it.
   void (async()=>{try{const cloud=await Promise.race([loadCurrentUserFromCloud(),new Promise<'timeout'>(resolve=>window.setTimeout(()=>resolve('timeout'),8000))]);if(cloud==='timeout'){showToast('Signed in. Cloud restore is still pending.','info');return;}if(cloud?.found){window.dispatchEvent(new CustomEvent('cardiovault-data-restored'));showToast('Cloud data restored successfully.','success');}else if(cloud?.access){window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));showToast('Cloud workspace ready.','success');}}catch(error){console.warn('Background cloud restore failed:',error);showToast('Signed in. Cloud sync will retry automatically.','warning');}})();
 };
  const handleGoogleLogin=async()=>{
    setBusy(true);
    try{
      showToast('Opening Google account…','info');
      if(!Capacitor.isNativePlatform()){
        try {
          await loginWithGoogle();
          return;
        } catch(webErr: any) {
          throw webErr;
        }
      }
      let googleUser:any=null;
      try {
        const result=await FirebaseAuthentication.signInWithGoogle({useCredentialManager:true});
        googleUser=result?.user||null;
      } catch (error) {
        console.warn('Credential Manager Google sign-in failed:',error);
        try {
          const fallback=await FirebaseAuthentication.signInWithGoogle({useCredentialManager:false});
          googleUser=fallback?.user||null;
        } catch (fallbackError) {
          console.warn('Legacy Google sign-in fallback failed:',fallbackError);
        }
      }
      if(!googleUser?.email)googleUser=await waitForNativeGoogleUser();
      if(!googleUser?.email){showToast('Google account selection did not complete. Please try again.','error');return;}
      await finishFirebaseAccount(googleUser,'Signed in with Google.');
    }catch(error:any){
      console.error('Google Sign-In error:',error);
      showToast(`Google Sign-In failed: ${String(error?.message||error?.code||'Unknown error')}`,'error');
    }finally{
      setBusy(false);
    }
  };
  const handleEmailAuth=async(e:React.FormEvent)=>{
    e.preventDefault();
    const cleanEmail=email.trim().toLowerCase();
    if(!cleanEmail||!password){showToast('Enter your email and password.','error');return;}
    if(password.length<6){showToast('Password must be at least 6 characters.','error');return;}
    if(mode==='create'&&password!==confirmPassword){showToast('Password confirmation does not match.','error');return;}
    setBusy(true);
    try{
      const result=Capacitor.isNativePlatform()
        ?(mode==='create'?await FirebaseAuthentication.createUserWithEmailAndPassword({email:cleanEmail,password}):await FirebaseAuthentication.signInWithEmailAndPassword({email:cleanEmail,password}))
        :{user:mode==='create'?await webEmailCreate(cleanEmail,password):await webEmailSignIn(cleanEmail,password)};
      await finishFirebaseAccount(result.user,mode==='create'?'Account created successfully.':'Signed in successfully.');
    }catch(error:any){
      console.error('Email authentication error:',error);
      const code=String(error?.code||'');
      const message=code.includes('email-already-in-use')?'This email already has an account. Use Sign In instead.':code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('invalid-login-credentials')?'Incorrect email or password.':code.includes('user-not-found')?'No account exists for this email. Choose Create Account first.':code.includes('operation-not-allowed')?'Email/Password sign-in is not enabled in Firebase yet.':code.includes('weak-password')?'Password is too weak. Use at least 6 characters.':String(error?.message||'Unable to authenticate with email.');
      showToast(message,'error');
    }finally{
      setBusy(false);
    }
  };
 return <div className="min-h-screen bg-[#070B13] flex flex-col items-center justify-center p-4 relative overflow-hidden text-slate-100"><div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"/><div className="absolute bottom-10 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"/><div className="w-full max-w-sm sm:max-w-md bg-[#0F172A]/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center text-center"><div className="mb-6"><CardioLogo size="xl" showText={false}/></div><h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">Cardio<span className="text-cyan-400">Vault</span></h1><p className="text-xs font-semibold tracking-wider text-cyan-400/90 uppercase mb-2">Your Clinical Companion</p><div className="flex items-center gap-1.5 text-[10px] tracking-widest text-slate-400 font-mono mb-6 uppercase"><span>PLAN</span> • <span>DOCUMENT</span> • <span>CALCULATE</span> • <span>CARE</span></div>{mode==='options'?<div className="w-full space-y-3.5"><div className="text-center mb-4"><h2 className="text-xl font-bold text-white">Welcome Back</h2><p className="text-xs text-slate-400 mt-0.5">Sign in to CardioVault Cloud</p></div><button disabled={busy} onClick={handleGoogleLogin} className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 disabled:opacity-50"><svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74-3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98-.66-2.23-1.93-3.31-1.93v2.77h3.57c2.08-1.92 2.04-4.74-3.28-8.09z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>{busy?'Connecting…':'Sign in with Google'}</button><button onClick={()=>{setMode('email');setPassword('');setConfirmPassword('')}} className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-3 border border-slate-700/80"><Mail className="w-4 h-4"/>Sign in with Email</button><button onClick={()=>{setMode('create');setPassword('');setConfirmPassword('')}} className="w-full py-2.5 px-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 border border-cyan-800/60"><UserPlus className="w-4 h-4"/>Create Account</button><div className="pt-2 text-[10px] text-slate-500">Cloud-only mode • Internet connection required</div></div>:<form onSubmit={handleEmailAuth} className="w-full space-y-4 text-left"><h2 className="text-lg font-bold text-white text-center">{mode==='create'?'Create CardioVault Account':'Physician Sign-In'}</h2><div><label className="block text-xs text-slate-400 mb-1">Email</label><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="doctor@example.com" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"/></div><div><label className="block text-xs text-slate-400 mb-1">Password</label><input type="password" required minLength={6} autoComplete={mode==='create'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"/></div>{mode==='create'&&<div><label className="block text-xs text-slate-400 mb-1">Confirm Password</label><input type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repeat password" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"/></div>}<button disabled={busy} type="submit" className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"><ArrowRight className="w-4 h-4"/>{busy?'Connecting…':mode==='create'?'Create Account':'Sign In'}</button><button type="button" onClick={()=>setMode('options')} className="w-full text-xs text-slate-400 hover:text-white">← Back</button></form>}</div></div>;
};
