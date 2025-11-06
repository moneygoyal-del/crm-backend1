import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import axios from "axios";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const navigate = useNavigate();

  // Countdown effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // --- Validation ---
  const validatePhone = (phone: string) => /^\d{10}$/.test(phone);
  const validateOtp = (otp: string) => /^\d{4,6}$/.test(otp);

  // --- Send OTP Handler ---
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    setSuccess("");

    if (!validatePhone(phone)) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    setResendLoading(true);
    try {
      await api.post(`/auth/send-otp`, { phone });
      setShowOtpInput(true);
      setSuccess("OTP sent successfully!");
      setCountdown(60);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to send OTP. Try again.");
      } else {
        setError("Unexpected error occurred.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  // --- Login Handler ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!validateOtp(otp)) {
      setError("Please enter a valid OTP.");
      setLoading(false);
      return;
    }

    try {
      const response = await api.post(`/auth/verify-otp`, { phone, otp });
      localStorage.setItem("authToken", response.data.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.data.user));

      setSuccess("Login successful!");
      setIsExiting(true);

      // Smooth fade before redirect
      setTimeout(() => navigate("/"), 400);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setError("Invalid OTP.");
        } else {
          setError("Login failed. Please try again.");
        }
      } else {
        setError("Unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Styles ---
  const containerStyle: React.CSSProperties = {
    width: "360px",
    margin: "60px auto",
    padding: "30px",
    borderRadius: "12px",
    backgroundColor: "#1e1e1e",
    color: "#f5f5f5",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.4)",
    fontFamily: "Inter, sans-serif",
    transition: "opacity 0.4s ease, transform 0.4s ease",
    opacity: isExiting ? 0 : 1,
    transform: isExiting ? "translateY(-10px)" : "translateY(0)",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    backgroundColor: "#00b4d8",
    border: "none",
    borderRadius: "6px",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    marginBottom: "18px",
    borderRadius: "6px",
    border: "1px solid #666",
    backgroundColor: "#2a2a2a",
    color: "#f5f5f5",
    outline: "none",
    fontSize: "0.95rem",
  };

  const messageStyle = (type: "error" | "success"): React.CSSProperties => ({
    padding: "10px",
    borderRadius: "6px",
    textAlign: "center",
    marginBottom: "15px",
    backgroundColor: type === "error" ? "#ffdddd" : "#ddffdd",
    color: type === "error" ? "#a10000" : "#007500",
    border: type === "error" ? "1px solid #a10000" : "1px solid #007500",
  });

  return (
    <div style={containerStyle}>
      <h2 style={{ textAlign: "center", color: "#00b4d8", marginBottom: "25px" }}>Medpho Operator</h2>

      {error && <div style={messageStyle("error")}>{error}</div>}
      {success && <div style={messageStyle("success")}>{success}</div>}

      {!showOtpInput ? (
        <form onSubmit={handleSendOtp}>
          <label style={{ display: "block", marginBottom: "6px" }}>Mobile Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter your 10-digit phone"
            style={inputStyle}
            maxLength={10}
            autoFocus
            required
          />
          <button
            type="submit"
            disabled={resendLoading}
            style={{
              ...buttonStyle,
              opacity: resendLoading ? 0.6 : 1,
              cursor: resendLoading ? "not-allowed" : "pointer",
            }}
          >
            {resendLoading ? "Sending..." : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleLogin}>
          <label style={{ display: "block", marginBottom: "6px" }}>Phone Number</label>
          <input type="tel" value={phone} style={inputStyle} disabled />

          <label style={{ display: "block", marginBottom: "6px" }}>Enter OTP</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter the OTP"
            style={inputStyle}
            maxLength={6}
            autoFocus
            required
          />

          <div style={{ textAlign: "right", marginBottom: "10px" }}>
            <button
              type="button"
              onClick={() => handleSendOtp()}
              disabled={countdown > 0 || resendLoading}
              style={{
                background: "none",
                color: "#00b4d8",
                border: "none",
                fontSize: "0.9rem",
                cursor: countdown > 0 || resendLoading ? "not-allowed" : "pointer",
                opacity: countdown > 0 || resendLoading ? 0.6 : 1,
              }}
            >
              {resendLoading
                ? "Sending..."
                : countdown > 0
                ? `Resend OTP in ${countdown}s`
                : "Resend OTP"}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || resendLoading}
            style={{
              ...buttonStyle,
              opacity: loading || resendLoading ? 0.6 : 1,
              cursor: loading || resendLoading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Verifying..." : "Login"}
          </button>
        </form>
      )}
    </div>
  );
}
