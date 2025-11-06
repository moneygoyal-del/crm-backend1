import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

// (Styles are unchanged)
const styles = {
    container: { width: '320px', margin: '50px auto', padding: '20px', border: '1px solid #555', borderRadius: '8px', textAlign: 'left' as const, backgroundColor: '#333' },
    header: { padding: '10px', backgroundColor: '#ccc', color: '#242424', fontWeight: 'bold', fontSize: '1.2em', borderRadius: '8px 8px 0 0', margin: '-20px -20px 20px -20px', textAlign: 'center' as const},
    input: { width: '100%', padding: '10px', margin: '5px 0 15px 0', boxSizing: 'border-box' as const, borderRadius: '4px', border: '1px solid #777', backgroundColor: '#fff', color: 'black' },
    button: { width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em' },
    resendButton: { width: 'auto', padding: '5px 10px', marginTop: '5px', backgroundColor: 'transparent', color: '#00c1ff', border: 'none', cursor: 'pointer', fontSize: '0.9em' },
    error: { color: 'red', margin: '10px 0', textAlign: 'center' as const, backgroundColor: '#ffdddd', border: '1px solid red', padding: '10px', borderRadius: '4px' },
    success: { color: 'lightgreen', margin: '10px 0', textAlign: 'center' as const, backgroundColor: '#ddffdd', border: '1px solid green', padding: '10px', borderRadius: '4px' }
};

const CLIENT_COOLDOWN_SECONDS = 60;

export default function LoginPage() {
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [showOtpInput, setShowOtpInput] = useState(false);
    const [loading, setLoading] = useState(false); // For Login button
    const [resendLoading, setResendLoading] = useState(false); // <-- 1. NEW STATE
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const handleSendOtp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault(); 
        
        // --- 2. USE THE NEW STATE ---
        setResendLoading(true); 
        setError('');
        
        try {
            await api.post(`/auth/send-otp`, { phone });
            setShowOtpInput(true);
            setCountdown(CLIENT_COOLDOWN_SECONDS); 
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                if (err.response?.status === 429) {
                    setError(err.response.data.message); 
                } else if (err.response?.status === 404) {
                    setError('User Not Found');
                } else {
                    setError('Failed to send OTP. Please try again.');
                }
            } else {
                setError('An unexpected error occurred.');
            }
        }
        setResendLoading(false); // <-- 2. USE THE NEW STATE ---
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); // <-- This uses the main loading state
        setError('');

        try {
            const response = await api.post(`/auth/verify-otp`, { phone, otp });
            localStorage.setItem('authToken', response.data.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.data.user));
            navigate('/'); 
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                if (err.response?.status === 401) {
                    setError('Invalid OTP');
                } else {
                    setError('Login failed. Please try again.');
                }
            } else {
                setError('An unexpected error occurred.');
            }
        }
        setLoading(false); // <-- This uses the main loading state
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>Medpho Operator</div>
            
            {error && <div style={styles.error}>{error}</div>}

            {!showOtpInput ? (
                // --- Login Screen 1 ---
                <form onSubmit={handleSendOtp}>
                    <h3 style={{ fontWeight: 'normal', textAlign: 'center' as const }}>Login Using Mobile</h3>
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter your phone number"
                        style={styles.input}
                        required
                    />
                    {/* --- 3. UPDATE DISABLED LOGIC --- */}
                    <button type="submit" disabled={resendLoading} style={styles.button}>
                        {resendLoading ? 'Sending...' : 'Send OTP'}
                    </button>
                </form>
            ) : (
                // --- OTP Verification Screen ---
                <form onSubmit={handleLogin}>
                    <h3 style={{ fontWeight: 'normal', textAlign: 'center' as const }}>Login Using Mobile</h3>
                    <input type="tel" value={phone} style={styles.input} disabled />
                    <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Enter OTP"
                        style={styles.input}
                        required
                    />

                    {/* --- 4. UPDATE RESEND BUTTON LOGIC --- */}
                    <div style={{ textAlign: 'right' as const }}>
                        <button 
                            type="button" 
                            onClick={() => handleSendOtp()}
                            disabled={countdown > 0 || resendLoading} // <-- Check both states
                            style={{...styles.resendButton, opacity: (countdown > 0 || resendLoading) ? 0.5 : 1}}
                        >
                            {resendLoading ? "Sending..." : (countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP")}
                        </button>
                    </div>

                    {/* --- 5. UPDATE LOGIN BUTTON LOGIC --- */}
                    <button type="submit" disabled={loading || resendLoading} style={styles.button}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
            )}
        </div>
    );
}