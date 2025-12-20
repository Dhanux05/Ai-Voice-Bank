import React, { useState } from 'react';
import api from '../api';
import './NeonBox.css';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const [form, setForm] = useState({ name: '', accountNumber: '', email: '', password: '' });
  const navigate = useNavigate();

  const handleSignup = async () => {
    try {
      await api.post('/auth/signup', form);
      alert('Signup Successful!');
      navigate('/');
    } catch (err) {
      alert(err.response.data.message);
    }
  };

  return (
    <div className="neon-box">
      <h2>Sign Up</h2>
      <input type="text" placeholder="Name" onChange={e => setForm({...form, name: e.target.value})}/>
      <input type="text" placeholder="Account Number" onChange={e => setForm({...form, accountNumber: e.target.value})}/>
      <input type="email" placeholder="Email" onChange={e => setForm({...form, email: e.target.value})}/>
      <input type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})}/>
      <button onClick={handleSignup}>Sign Up</button>
    </div>
  );
}
