import React from 'react';
import { AddPatientModal } from './AddPatientModal';
import { useApp } from '../../context/AppContext';
export const AddPatientPage:React.FC=()=>{const {setCurrentView}=useApp();return <AddPatientModal isOpen={true} onClose={()=>setCurrentView('home')}/>;};
