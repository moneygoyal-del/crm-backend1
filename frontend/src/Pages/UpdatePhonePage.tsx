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

  // --- (You can copy the JSX structure from BookOpdPage.tsx or LogMeetingPage.tsx for styling) ---
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header (copy from other pages) */}
      <header /* ... */ >
        <button onClick={() => navigate(-1)}>Back</button>
        <span>{user.name}</span>
      </header>
      
      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-8">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-6">
          <h1 className="text-2xl font-bold text-white mb-6">Update Patient Phone Number</h1>
          
          {error && <div className="mb-4 text-red-300">{error}</div>}
          {success && <div className="mb-4 text-green-300">{success}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Fetch Form */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter Patient Unique ID: <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 rounded-lg text-white"
                  placeholder="Enter Booking Reference"
                  disabled={isFetched}
                />
                <button
                  type="button"
                  onClick={handleFetchPatient}
                  disabled={loading || isFetched}
                  className="py-2.5 px-6 bg-cyan-600 rounded-lg text-white font-semibold disabled:opacity-50"
                >
                  {loading ? "..." : "Fetch"}
                </button>
              </div>
            </div>

            {/* Step 2: Update Form (shows after fetch) */}
            {isFetched && (
              <div className="space-y-4 pt-6 border-t border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Current Phone Number
                  </label>
                  <input
                    type="text"
                    value={currentPhone}
                    className="w-full px-4 py-2.5 bg-gray-700 rounded-lg text-gray-400"
                    disabled
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    New Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-700 rounded-lg text-white"
                    placeholder="Enter 10-digit new phone"
                    maxLength={10}
                    autoFocus
                  />
                </div>
                
                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 rounded-lg text-white font-semibold disabled:opacity-50"
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
                    className="py-3 px-6 bg-gray-600 rounded-lg text-white font-semibold"
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