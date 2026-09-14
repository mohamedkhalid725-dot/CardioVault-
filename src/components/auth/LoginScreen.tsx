import React, { useState } from 'react';
import { Mail, Fingerprint, Lock, ArrowRight, Shield, UserPlus } from 'lucide-react';
import { CardioLogo } from '../CardioLogo';
import { useApp } from '../../context/AppContext';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { StorageService, INITIAL_BEDS, INITIAL_UNITS } from '../../services/storage';
import { loadCurrentUserFromCloud, saveCurrentUserToCloud } from '../../services/cloudSyncBridge';

const accountKey=(email:string)=>`cardiovault_account_v1_${encodeURIComponent(email.trim().toLowerCase())}`;
const emptyBeds=()=>INITIAL_BEDS.map(b=>({...b,patientId:undefined,status:'Empty' as const}));

function switchLocalAccount(email:string){
  const target=email.trim().toLowerCase();
  if(!target)return;
  try{
    const current=StorageService.getAuth();
    const currentEmail=String(current?.userEmail||'').trim().toLowerCase();
    if(currentEmail&&currentEmail!==target){
      localStorage.setItem(accountKey(currentEmail),JSON.stringify({units:StorageService.getUnits(),beds:StorageService.getBeds(),patients:StorageService.getPatients()}));
    }
    const saved=localStorage.getItem(accountKey(target));
    if(saved){
      const data=JSON.parse(saved);
      if(Array.isArray(data.units)&&Array.isArray(data.beds)&&Array.isArray(data.patients)){
        StorageService.saveUnits(data.units);StorageService.saveBeds(data.beds);StorageService.savePatients(data.patients);return;
      }
    }
    const units=INITIAL_UNITS.map(u=>({...u}));
    const beds=emptyBeds();
    StorageService.saveUnits(units);StorageService.saveBeds(beds);StorageService.savePatients([]);
    localStorage.setItem(accountKey(target),JSON.stringify({units,beds,patients:[]}));
  }catch(error){console.error('Account data isolation error:',error);}
}

async function waitForNativeGoogleUser():Promise<any|null>{
  for(let attempt=0;attempt<12;attempt+=1){
    try{const pending=await FirebaseAuthentication.getPendingAuthResult();if(pending?.user?.email)return pending.user;}catch(error){console.debug('Pending Google auth not available yet:',error);}
    try{const current=await FirebaseAuthentication.getCurrentUser();if(current?.user?.email)return current.user;}catch(error){console.debug('Current Firebase user not available yet:',error);}
    await new Promise(resolve=>window.setTimeout(resolve,500));
  }
  return null;
}

export const LoginScreen:React.FC=()=>{
  const{loginWithGoogle,loginWithEmail,unlockWithPin,auth,showToast}=useApp();
  const[mode,setMode]=useState<'options'|'email'|'create'|'pin'>('options');
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[confirmPassword,setConfirmPassword]=useState('');
  const[pin,setPin]=useState('');const[pinError,setPinError]=useState(false);const[busy,setBusy]=useState(false);

  const finishLocalAccountLogin=(userEmail:string)=>{switchLocalAccount(userEmail);loginWithEmail(userEmail);};

  const finishFirebaseAccount=async(user:any,successMessage:string)=>{
    if(!user?.email||!user?.uid)throw new Error('Firebase returned no user account.');
    localStorage.removeItem('cardiovault_google_uid');
    localStorage.setItem('cardiovault_google_uid',user.uid);

    // Load the cloud snapshot before entering the app. Never reload the WebView here:
    // a native Firebase login has already completed and a forced reload can leave the
    // Capacitor WebView on a blank screen or restore a stale lock state.
    try{
      const cloud=await Promise.race([
        loadCurrentUserFromCloud(),
        new Promise<null>(resolve=>window.setTimeout(()=>resolve(null),7000))
      ]);
      if(cloud?.found){
        showToast('Cloud data restored successfully.','success');
      }else{
        await saveCurrentUserToCloud();
      }
    }catch(error){
      console.warn('Initial cloud sync failed; local account remains active.',error);
      showToast(`${successMessage} Cloud sync will retry from the Sync button.`,'warning');
    }

    // Persist an unlocked local session only after Firebase authentication succeeds.
    // This keeps Google, Email and PIN flows on the same account state.
    finishLocalAccountLogin(user.email);
    if(!auth.isLocked)showToast(successMessage,'success');
  };

  const handleGoogleLogin=async()=>{
    if(!Capacitor.isNativePlatform()){loginWithGoogle();return;}
    setBusy(true);
    try{
      showToast('Opening Google account…','info');
      // Keep Credential Manager disabled because this project previously hit the
      // Android Credential Manager issue; the native Google flow itself is working.
      const signInPromise=FirebaseAuthentication.signInWithGoogle({useCredentialManager:false})
        .then(result=>result?.user||null)
        .catch(error=>{console.warn('Direct Google sign-in result delayed/failed:',error);return null;});
      let googleUser=await Promise.race([signInPromise,waitForNativeGoogleUser()]);
      if(!googleUser?.email)googleUser=await waitForNativeGoogleUser();
      if(!googleUser?.email){showToast('Google account selection did not complete. Please try again.','error');return;}
      await finishFirebaseAccount(googleUser,'Signed in with Google and Cloud Sync enabled.');
    }catch(error:any){
      console.error('Native Google Sign-In error:',error);
      showToast(`Google Sign-In failed: ${String(error?.message||error?.code||'Unknown error')}`,'error');
    }finally{setBusy(false);}
  };

  const handleEmailAuth=async(e:React.FormEvent)=>{
    e.preventDefault();const cleanEmail=email.trim().toLowerCase();
    if(!cleanEmail||!password){showToast('Enter your email and password.','error');return;}
    if(password.length<6){showToast('Password must be at least 6 characters.','error');return;}
    if(mode==='create'&&password!==confirmPassword){showToast('Password confirmation does not match.','error');return;}
    setBusy(true);
    try{
      const result=mode==='create'
        ?await FirebaseAuthentication.createUserWithEmailAndPassword({email:cleanEmail,password})
        :await FirebaseAuthentication.signInWithEmailAndPassword({email:cleanEmail,password});
      await finishFirebaseAccount(result.user,mode==='create'?'Account created successfully.':'Signed in successfully.');
    }catch(error:any){
      console.error('Email authentication error:',error);const code=String(error?.code||'');
      const message=code.includes('email-already-in-use')?'This email already has an account. Use Sign In instead.'
        :code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('invalid-login-credentials')?'Incorrect email or password.'
        :code.includes('user-not-found')?'No account exists for this email. Choose Create Account first.'
        :code.includes('operation-not-allowed')?'Email/Password sign-in is not enabled in Firebase yet. Enable Email/Password in Firebase Authentication → Sign-in method.'
        :String(error?.message||'Unable to authenticate with email.');
      showToast(message,'error');
    }finally{setBusy(false);}
  };

  const handlePinDigit=(digit:string)=>{
    if(pin.length<4){const next=pin+digit;setPin(next);if(next.length===4)setTimeout(()=>{const success=unlockWithPin(next);if(!success){setPinError(true);setPin('');}},150);}
  };

  return <div className="min-h-screen bg-[#070B13] flex flex-col items-center justify-center p-4 relative overflow-hidden text-slate-100">
    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"/>
    <div className="absolute bottom-10 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"/>
    <div className="w-full max-w-sm sm:max-w-md bg-[#0F172A]/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center text-center">
      <div className="mb-6"><CardioLogo size="xl" showText={false}/></div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">Cardio<span className="text-cyan-400">Vault</span></h1>
      <p className="text-xs font-semibold tracking-wider text-cyan-400/90 uppercase mb-2">Your Clinical Companion</p>
      <div className="flex items-center gap-1.5 text-[10px] tracking-widest text-slate-400 font-mono mb-6 uppercase"><span>PLAN</span> • <span>DOCUMENT</span> • <span>CALCULATE</span> • <span>CARE</span></div>

      {auth.isLocked?<div className="w-full space-y-5">
        <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-2xl p-4 text-center"><div className="w-10 h-10 mx-auto rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-2"><Lock className="w-5 h-5"/></div><h2 className="text-base font-semibold text-white">Notebook Locked</h2><p className="text-xs text-slate-400 mt-1">Enter your 4-digit PIN to access patient files</p></div>
        <div className="flex justify-center gap-3 py-2">{[0,1,2,3].map(i=><div key={i} className={`w-3.5 h-3.5 rounded-full border ${pin.length>i?'bg-cyan-400 border-cyan-300 scale-110':'border-slate-600 bg-slate-800'}`}/>)}</div>{pinError&&<p className="text-xs text-rose-400">Incorrect PIN.</p>}
        <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">{['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k=><button key={k} type="button" onClick={()=>{if(k==='C'){setPin('');setPinError(false)}else if(k==='⌫'){setPin(p=>p.slice(0,-1));setPinError(false)}else handlePinDigit(k)}} className="h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white font-semibold text-lg border border-slate-700/60">{k}</button>)}</div>
      </div>:mode==='options'?<div className="w-full space-y-4">
        <div className="text-center mb-5"><h2 className="text-xl font-bold text-white">Welcome Back</h2><p className="text-xs text-slate-400 mt-0.5">Sign in or create your CardioVault account</p></div>
        <button disabled={busy} onClick={handleGoogleLogin} className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 disabled:opacity-50"><svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74-3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>{busy?'Connecting…':'Sign in with Google'}</button>
        <button onClick={()=>{setMode('email');setPassword('');setConfirmPassword('')}} className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-3 border border-slate-700/80"><Mail className="w-4 h-4"/>Sign in with Email</button>
        <button onClick={()=>{setMode('create');setPassword('');setConfirmPassword('')}} className="w-full py-3 px-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 border border-cyan-800/60"><UserPlus className="w-4 h-4"/>Create Account</button>
        <div className="flex items-center my-2"><div className="flex-1 border-t border-slate-800"/><span className="px-3 text-[11px] text-slate-500 uppercase">or</span><div className="flex-1 border-t border-slate-800"/></div>
        <button onClick={()=>setMode('pin')} className="w-full py-3 px-4 bg-[#111C2E] hover:bg-[#16253D] text-cyan-400 rounded-xl font-medium text-sm flex items-center justify-center gap-3 border border-cyan-900/50"><Fingerprint className="w-5 h-5"/>Use PIN or Biometrics</button>
      </div>:mode==='pin'?<div className="w-full space-y-4"><h2 className="text-lg font-bold text-white">Enter Security PIN</h2><p className="text-xs text-slate-400">Use your saved 4-digit PIN.</p><div className="flex justify-center gap-3 py-2">{[0,1,2,3].map(i=><div key={i} className={`w-3.5 h-3.5 rounded-full border ${pin.length>i?'bg-cyan-400 border-cyan-300':'border-slate-600 bg-slate-800'}`}/>)}</div><div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">{['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k=><button key={k} type="button" onClick={()=>k==='C'?setPin(''):k==='⌫'?setPin(p=>p.slice(0,-1)):handlePinDigit(k)} className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-lg border border-slate-700">{k}</button>)}</div><button type="button" onClick={()=>setMode('options')} className="text-xs text-slate-400 hover:text-white">← Back to options</button></div>:<form onSubmit={handleEmailAuth} className="w-full space-y-4 text-left">
        <h2 className="text-lg font-bold text-white text-center">{mode==='create'?'Create CardioVault Account':'Physician Sign-In'}</h2>
        <div><label className="block text-xs text-slate-400 mb-1">Email</label><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="doctor@example.com" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"/></div>
        <div><label className="block text-xs text-slate-400 mb-1">Password</label><input type="password" required minLength={6} autoComplete={mode==='create'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"/></div>
        {mode==='create'&&<div><label className="block text-xs text-slate-400 mb-1">Confirm Password</label><input type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repeat password" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"/></div>}
        <button disabled={busy} type="submit" className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">{busy?'Please wait…':mode==='create'?'Create Account':'Enter CardioVault'} <ArrowRight className="w-4 h-4"/></button>
        <button type="button" onClick={()=>setMode('options')} className="w-full text-center text-xs text-slate-400 hover:text-white">← Back to options</button>
      </form>}
      <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500"><Shield className="w-3.5 h-3.5 text-cyan-500"/><span>AES-256 Local Encrypted • Offline First</span></div>
    </div>
  </div>;
};
