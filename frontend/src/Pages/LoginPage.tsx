import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios'; // <-- 1. ADD THIS IMPORT

// Simple CSS-in-JS for styling
const styles = {
    container: {
        width: '320px',
        margin: '50px auto',
        padding: '20px',
        border: '1px solid #555',
        borderRadius: '8px',
        textAlign: 'center' as const,
        backgroundColor: '#333'
    },
    header: {
        padding: '10px',
        backgroundColor: '#ccc',
        color: '#242424',
        fontWeight: 'bold',
        fontSize: '1.2em',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        margin: '-20px -20px 20px -20px'
    },
    input: {
        width: '100%',
        padding: '10px',
        margin: '5px 0',
        boxSizing: 'border-box' as const,
        borderRadius: '4px',
        border: '1px solid #777',
        backgroundColor: '#fff',
        color: 'black'
    },
    button: {
        width: '100%',
        padding: '10px',
        marginTop: '10px',
        backgroundColor: '#008CBA', // Blue from your design
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    error: {
        color: 'red',
        backgroundColor: '#ffdddd',
        border: '1px solid red',
        padding: '10px',
        borderRadius: '4px',
        margin: '10px 0'
    }
};

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await api.post(`/auth/send-otp`, { phone });
      setShowOtpInput(true);
    } catch (err: unknown) { // <-- 2. CATCH AS 'unknown'

      // 3. SAFELY CHECK THE ERROR TYPE
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          setError('User Not Found');
        } else {
          setError('Failed to send OTP. Please try again.');
        }
      } else {
        // Handle non-Axios errors (e.g., network down)
        console.error("An unexpected error occurred", err);
        setError('An unexpected error occurred.');
      }
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post(`/auth/verify-otp`, { phone, otp });
      
      // Save session token (JWT) and user data
      localStorage.setItem('authToken', response.data.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.data.user));

      // Redirect to the main page
      navigate('/'); 
    } catch (err: unknown) { // <-- 4. REPEAT FIX HERE

      // 5. SAFELY CHECK THE ERROR TYPE HERE TOO
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setError('Invalid OTP');
        } else {
          setError('Login failed. Please try again.');
        }
      } else {
        console.error("An unexpected error occurred", err);
        setError('An unexpected error occurred.');
      }
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>Medpho Operator</div>
      
      {/* Error Message */}
      {error && <div style={styles.error}>{error}</div>}

      {!showOtpInput ? (
        // --- Login Screen 1 ---
        <form onSubmit={handleSendOtp}>
          <h3 style={{ fontWeight: 'normal' }}>Login Using Mobile</h3>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter your phone number"
            style={styles.input}
            required
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
      ) : (
        // --- OTP Verification Screen ---
        <form onSubmit={handleLogin}>
          <h3 style={{ fontWeight: 'normal' }}>Login Using Mobile</h3>
          <input
            type="tel"
            value={phone}
            style={styles.input}
            disabled
          />
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter OTP"
            style={styles.input}
            required
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      )}
    </div>
  );
}