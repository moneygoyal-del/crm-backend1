import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import axios from "axios";

const DISPOSITION_OPTIONS = [
  "Admitted",
  "Already Updated",
  "Budget Issue",
  "Card Issue",
  "Deceased",
  "Duplicate Lead",
  "UP CM File Submitted",
  "Medicine Subscribed",
  "Treatment Not Covered under Ayushman",
  "OPD Revisit",
  "OPD Missed",
  "Refer To Higher Center",
  "Treatment taken somewhere else",
  "UPCM File Rejected"
];

// Interface for our dropdown items
interface HospitalOption {
    name: string;
    id: string;
}

export default function PatientDispositionUpdate() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');

  // State
  const [bookingRef, setBookingRef] = useState("");
  const [isFetched, setIsFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetched Data
  const [patientDetails, setPatientDetails] = useState({
    patient_name: "",
    current_disposition: "",
    hospital_name: "", 
  });

  // Form Data for Update
  const [selectedHospitalId, setSelectedHospitalId] = useState(""); // Store ID, not Name
  const [newDisposition, setNewDisposition] = useState("");
  const [comments, setComments] = useState("");
  
  // Lists
  const [hospitalsList, setHospitalsList] = useState<HospitalOption[]>([]);
  
  // --- 1. Fetch Patient Details ---
  const handleFetchPatient = async () => {
    if (!bookingRef) {
      setError("Please enter a Patient Unique ID.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    setIsFetched(false);
    setHospitalsList([]); 
    setSelectedHospitalId("");

    try {
      const res = await api.get(`/patientLeads/get-details/${bookingRef}`);
      const data = res.data.data;
      
      setPatientDetails({
        patient_name: data.patient_name,
        current_disposition: data.current_disposition || "N/A",
        hospital_name: data.hospital_name || "N/A"
      });

      // --- Parse names AND IDs ---
      if (data.hospital_name) {
          const names = data.hospital_name.split(',').map((h: string) => h.trim());
          // IDs come as an array from the backend (ensure backend sends this!)
          const ids = data.hospital_ids || [];

          // Map them together. 
          const combinedList = names.map((name: string, index: number) => ({
              name: name,
              id: ids[index] || "" 
          })).filter((h: HospitalOption) => h.id !== ""); // Filter out ones without IDs

          setHospitalsList(combinedList);
          
          // Pre-select the first one by default if available
          if (combinedList.length > 0) {
              setSelectedHospitalId(combinedList[0].id);
          }
      }

      setNewDisposition(""); 
      setIsFetched(true);
      setSuccess("Patient details fetched.");

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

  // --- 3. Submit Update ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!newDisposition) {
        setError("Please select a new disposition.");
        setLoading(false);
        return;
    }

    // Find the name corresponding to the selected ID to send both
    const selectedHospitalObj = hospitalsList.find(h => h.id === selectedHospitalId);
    
    const payload = {
      booking_reference: bookingRef,
      hospital_name: selectedHospitalObj ? selectedHospitalObj.name : null,
      hospital_id: selectedHospitalId || null, // Send the ID
      new_disposition: newDisposition, 
      comments: comments 
    };

    try {
      await api.post("/patientLeads/update-disposition", payload);
      
      setSuccess(`✅ Disposition updated & logged for ${patientDetails.patient_name}`);
      
      // Reset UI
      setTimeout(() => {
          setBookingRef("");
          setIsFetched(false);
          setComments("");
          setNewDisposition("");
          setSuccess("");
          setPatientDetails({ patient_name: "", current_disposition: "", hospital_name: "" });
          setHospitalsList([]);
          setSelectedHospitalId("");
      }, 3000);

    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to update.");
      } else {
        setError("An error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Styles
  const inputStyles = "w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all";
  const labelStyles = "block text-sm font-medium text-gray-300 mb-2";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
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

      <main className="max-w-4xl w-full h-full mx-auto px-2 md:px-6 lg:px-8 py-8">
        <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-6">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl font-bold text-white">Patient Disposition Update</h1>
              </div>
            </div>
          </div>

          <div className="px-6 pt-6">
            {error && <div className="mb-2 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm animate-shake">{error}</div>}
            {success && <div className="mb-2 p-4 bg-green-900/50 border border-green-500 rounded-lg text-green-200 text-sm">{success}</div>}
          </div>

          <div className="p-6 space-y-6">
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
                      className="h-[46px] px-6 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50"
                    >
                      {loading ? "..." : "Fetch"}
                    </button>
                </div>
              </div>
            </div>

            {isFetched && (
              <form onSubmit={handleSubmit} className="space-y-6 pt-6 border-t border-gray-700 animate-fade-in">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-700/30 p-4 rounded-lg">
                    <div>
                        <span className="block text-xs text-gray-400 uppercase">Patient Name</span>
                        <span className="text-white font-medium">{patientDetails.patient_name}</span>
                    </div>
                    <div>
                        <span className="block text-xs text-gray-400 uppercase">Current Status</span>
                        <span className="text-white font-medium">{patientDetails.current_disposition}</span>
                    </div>
                    <div className="md:col-span-2">
                        <span className="block text-xs text-gray-400 uppercase">Booked Hospitals</span>
                        <span className="text-white font-medium break-words">{patientDetails.hospital_name}</span>
                    </div>
                </div>

                <div>
                  <label className={labelStyles}>Select Outcome Hospital</label>
                  <select
                    value={selectedHospitalId}
                    onChange={(e) => setSelectedHospitalId(e.target.value)}
                    className={inputStyles}
                    disabled={loading}
                  >
                    <option value="" disabled>Select Hospital</option>
                    {hospitalsList.length === 0 ? (
                        <option disabled>No hospitals available</option>
                    ) : (
                        hospitalsList.map((h) => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                        ))
                    )}
                  </select>
                </div>

                <div>
                  <label className={labelStyles}>New Disposition <span className="text-red-400">*</span></label>
                  <select
                    value={newDisposition}
                    onChange={(e) => setNewDisposition(e.target.value)}
                    className={inputStyles}
                    disabled={loading}
                    required
                  >
                     <option value="">Select Disposition</option>
                     {DISPOSITION_OPTIONS.map(opt => (
                         <option key={opt} value={opt}>{opt}</option>
                     ))}
                  </select>
                </div>

                <div>
                  <label className={labelStyles}>Comments</label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className={inputStyles}
                    rows={3}
                    placeholder="Add any notes about this update..."
                    disabled={loading}
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50"
                  >
                    {loading ? "Updating..." : "Submit Update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFetched(false);
                      setBookingRef("");
                      setComments("");
                      setHospitalsList([]);
                      setSelectedHospitalId("");
                    }}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>

              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}