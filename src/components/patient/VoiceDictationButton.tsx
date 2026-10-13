import React from 'react';

interface Props{
 value:string;
 onApply:(draft:string)=>void;
 disabled?:boolean;
 fieldLabel?:string;
 patientId?:string;
 fieldId?:string;
}
// Release v2.0.0 (no-AI): voice recording removed entirely (deferred to a
// future advanced version). The stub keeps every call site compiling while
// rendering nothing — text fields simply fill their row.
export const VoiceDictationButton: React.FC<Props> = () => null;
void React;
