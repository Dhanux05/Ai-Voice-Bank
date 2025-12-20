import React, { useState } from 'react';
import api from '../api';
import './NeonBox.css';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await api.post('/auth/login', { email, password });
      alert(`Welcome ${res.data.name}`);
      navigate('/dashboard');
    } catch (err) {
      alert(err.response.data.message);
    }
  };

  return (
    <div className="neon-box">
      <h2>Tech Login</h2>
      <input type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Log In</button>
      <p>Don't have an account? <span onClick={() => navigate('/signup')} style={{color:'#00fff6',cursor:'pointer'}}>Sign Up</span></p>
    </div>
  );
}
