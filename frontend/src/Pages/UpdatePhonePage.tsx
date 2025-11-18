import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import axios from "axios";

export default function UpdatePhonePage() {
  const navigate = useNavigate();
  const [bookingRef, setBookingRef] = useState("");
  const [currentPhone, setCurrentPhone] = useState("");
  const [newPhone, setNewPhone] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');
  const [isFetched, setIsFetched] = useState(false);

  // --- 1. Fetch the current phone number ---
  const handleFetchPatient = async () => {
    if (!bookingRef) {
      setError("Please enter a Patient Unique ID.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    setIsFetched(false);
    
    try {
      // We will create this new endpoint in the backend
      const res = await api.get(`/patientLeads/get-phone/${bookingRef}`);
      setCurrentPhone(res.data.data.patient_phone);
      setIsFetched(true);
      setSuccess(`Fetched patient. Current phone: ${res.data.data.patient_phone}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Patient not found.");
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  // --- 2. Submit the new phone number ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone || newPhone.length !== 10) {
      setError("Please enter a valid 10-digit new phone number.");
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");
    
    const payload = {
      booking_reference: bookingRef,
      patient_phone: newPhone,
    };

    try {
      // Use the existing update endpoint
      const res = await api.put("/patientLeads/update", payload);
      setSuccess(`✅ Phone number updated successfully for ${res.data.data.booking_reference}.`);
      
      // Reset the form
      setIsFetched(false);
      setCurrentPhone("");
      setNewPhone("");
      setBookingRef("");
      
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to update phone number.");
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyles = "w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all";
  const labelStyles = "block text-sm font-medium text-gray-300 mb-2";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{user.name}</span>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-4xl w-full h-full mx-auto px-2 md:px-6 lg:px-8 py-8">
        <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          
          {/* Page Header Banner */}
          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-3 py-6">
              <div className="flex items-center space-x-3">
                  
                  <div>
                      <h1 className="text-2xl font-bold text-white">Update Patient Phone</h1>
                      
                  </div>
              </div>
          </div>
          
          {/* Alerts */}
          <div className="px-6 pt-6">
            {error && (
                <div className="mb-2 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm animate-shake">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                        {error}
                    </div>
                </div>
            )}
            {success && (
                <div className="mb-2 p-4 bg-green-900/50 border border-green-500 rounded-lg text-green-200 text-sm">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        {success}
                    </div>
                </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            
            {/* Step 1: Fetch Form */}
            <div className="space-y-4">
                          
              <div className="flex gap-4">
                <div className="flex-grow">
                    <label className={labelStyles}>Patient Unique ID <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={bookingRef}
                      onChange={(e) => setBookingRef(e.target.value)}
                      className={inputStyles}
                      placeholder="e.g., x7y8z9"
                      disabled={isFetched}
                    />
                </div>
                <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleFetchPatient}
                      disabled={loading || isFetched}
                      className="h-[46px] px-6 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                         <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                      ) : "Fetch"}
                    </button>
                </div>
              </div>
            </div>

            {/* Step 2: Update Form (shows after fetch) */}
            {isFetched && (
              <div className="space-y-6 pt-6 border-t border-gray-700 animate-fade-in">
                <h3 className={labelStyles.replace('mb-2', '') + " text-lg font-semibold text-white flex items-center"}>
                    <svg className="w-5 h-5 mr-2 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Update Details
                </h3>

                <div>
                  <label className={labelStyles}>Current Phone Number</label>
                  <input
                    type="text"
                    value={currentPhone}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-500 cursor-not-allowed"
                    disabled
                  />
                </div>
                
                <div>
                  <label className={labelStyles}>New Phone Number <span className="text-red-400">*</span></label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className={inputStyles}
                    placeholder="Enter 10-digit new phone"
                    maxLength={10}
                    autoFocus
                  />
                </div>
                
                <div className="flex gap-4 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {loading ? "Updating..." : "Submit Update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFetched(false);
                      setBookingRef("");
                      setCurrentPhone("");
                      setNewPhone("");
                      setError("");
                      setSuccess("");
                    }}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}