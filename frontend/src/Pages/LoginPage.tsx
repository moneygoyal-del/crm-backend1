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

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const validatePhone = (phone: string) => /^\d{10}$/.test(phone);
  const validateOtp = (otp: string) => /^\d{4,6}$/.test(otp);

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

  // --- NEW RESPONSIVE JSX ---
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-900">
      
      {/* 1. Left "Brand" Column (Shows on desktop, hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8 flex-col justify-center items-center text-center">
        <div className="w-24 h-24 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg mb-6">
          <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-5xl font-bold text-white mb-3">Medpho</h1>
        <p className="text-2xl text-gray-300">Healthcare Operations Portal</p>
      </div>

      {/* 2. Right "Form" Column (Takes full width on mobile) */}
      <div className="w-full md:w-1/2 min-h-screen flex items-center justify-center bg-gray-800 p-4">
        <div 
          className={`w-full max-w-md transition-all duration-400 ${
            isExiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="bg-gray-800 rounded-2xl md:shadow-2xl md:overflow-hidden md:border md:border-gray-700">
            {/* Header (Shows on mobile, hidden on desktop) */}
            <div className="md:hidden bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-8 text-center rounded-t-2xl">
              <div className="w-16 h-16 bg-white rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-10 h-10 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-white">Medpho CRM</h2>
              <p className="text-cyan-100 mt-2">Healthcare Operations Portal</p>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm animate-shake">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                </div>
              )}

              {success && (
                <div className="mb-6 p-4 bg-green-900/50 border border-green-500 rounded-lg text-green-200 text-sm">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {success}
                  </div>
                </div>
              )}

              {!showOtpInput ? (
                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Mobile Number
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter 10-digit phone number"
                        className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                        maxLength={10}
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resendLoading}
                    className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {resendLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending OTP...
                      </span>
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Enter OTP
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Enter 6-digit OTP"
                        className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all tracking-widest text-center text-lg font-semibold"
                        maxLength={6}
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      disabled={countdown > 0 || resendLoading}
                      className="text-sm text-cyan-400 hover:text-cyan-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors font-medium"
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
                    className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verifying...
                      </span>
                    ) : (
                      "Login"
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 text-center text-sm text-gray-500 border-t border-gray-700 md:border-none">
              <p>© 2025 Medpho Healthcare. All rights reserved.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}