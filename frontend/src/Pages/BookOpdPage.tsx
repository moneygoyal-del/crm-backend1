import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import axios from "axios";

// --- Helper Functions ---
const generateLeadId = () => {
  return Math.random().toString(36).substring(2, 9);
};
const getTodayDate = () => new Date().toISOString().split("T")[0];
const getCurrentTime = () =>
  new Date().toTimeString().split(" ")[0].substring(0, 5);

export default function BookOpdPage() {
  const navigate = useNavigate();

  // --- 1. State for dropdown lists ---
  const [cities, setCities] = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<string[]>([]);
  const [isHospitalLoading, setIsHospitalLoading] = useState(false);

  // --- 2. State for the form data ---
  const [formData, setFormData] = useState({
    booking_reference: generateLeadId(),
    patient_name: "",
    patient_phone: "",
    referee_name: "",
    refree_phone_no: "",
    hospital_name: "",
    medical_condition: "",
    city: "",
    age: "",
    gender: "",
    panel: "",
    appointment_date: getTodayDate(),
    appointment_time: getCurrentTime(),
    current_disposition: "opd_booked",
  });

  // --- 3. State for UI and errors ---
  const [loading, setLoading] = useState(false); // Controls the ENTIRE submit process
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --- 4. State for doctor name lookup ---
  const [isFetchingDoctor, setIsFetchingDoctor] = useState(false);
  const [doctorError, setDoctorError] = useState("");

  // --- 5. State for file objects ---
  const [aadharFile, setAadharFile] = useState<File | null>(null);
  const [pmjayFile, setPmjayFile] = useState<File | null>(null);

  const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');

  // --- 6. Memos and Effects for date/time logic ---
  const minTime = useMemo(() => {
    const today = getTodayDate();
    return formData.appointment_date === today ? getCurrentTime() : "00:00";
  }, [formData.appointment_date]);

  useEffect(() => {
    if (formData.appointment_date === getTodayDate()) {
      const now = getCurrentTime();
      if (formData.appointment_time < now) {
        setFormData((prev) => ({ ...prev, appointment_time: now }));
      }
    }
  }, [formData.appointment_date, formData.appointment_time]);

  // --- 7. Effects for fetching cities and hospitals ---
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const res = await api.get("/hospitals/cities");
        setCities(res.data.data || []);
      } catch (err) {
        console.error("Failed to fetch cities:", err);
      }
    };
    fetchCities();
  }, []);

  useEffect(() => {
    if (!formData.city) {
      setHospitals([]);
      return;
    }
    const fetchHospitals = async () => {
      setIsHospitalLoading(true);
      setHospitals([]);
      try {
        const res = await api.get(`/hospitals/by-city/${formData.city}`);
        setHospitals(res.data.data || []);
      } catch (err) {
        console.error("Failed to fetch hospitals:", err);
      }
      setIsHospitalLoading(false);
    };
    fetchHospitals();
  }, [formData.city]);

  // --- 8. Form field change handler ---
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newState = { ...prev, [name]: value };
      if (name === "city") {
        newState.hospital_name = "";
      }
      return newState;
    });
  };

  // --- 9. File change handler (just saves file to state) ---
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: 'aadhar' | 'pmjay'
  ) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (docType === 'aadhar') {
      setAadharFile(file);
    }
    if (docType === 'pmjay') {
      setPmjayFile(file);
    }
  };
  
  // --- 10. File remove handler ---
  const handleFileRemove = (docType: 'aadhar' | 'pmjay') => {
    if (docType === 'aadhar') {
      setAadharFile(null);
      const aadharInput = document.getElementById('aadhar-upload') as HTMLInputElement;
      if (aadharInput) aadharInput.value = "";
    }
    if (docType === 'pmjay') {
      setPmjayFile(null);
      const pmjayInput = document.getElementById('pmjay-upload') as HTMLInputElement;
      if (pmjayInput) pmjayInput.value = "";
    }
  };

  // --- 11. Function to fetch doctor name by phone ---
  const fetchDoctorName = async () => {
    const phone = formData.refree_phone_no;
    
    if (phone.length !== 10) {
      setDoctorError("");
      setFormData((prev) => ({ ...prev, referee_name: "" }));
      return;
    }

    setIsFetchingDoctor(true);
    setDoctorError("");

    try {
      const res = await api.get(`/doctors/get-by-phone/${phone}`);
      const doctorName = res.data.data.name;
      setFormData((prev) => ({ ...prev, referee_name: doctorName }));
    } catch (err) {
      console.error("Failed to fetch doctor:", err);
      setDoctorError("Doctor not found.");
      setFormData((prev) => ({ ...prev, referee_name: "" }));
    } finally {
      setIsFetchingDoctor(false);
    }
  };
  
  // --- 12. REMOVED uploadFileToDrive helper function ---

// --- 13. Form submit handler (MODIFIED to use FormData) ---
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setSuccess("");

  // --- Basic field validation ---
  if (
    !formData.patient_name ||
    !formData.patient_phone ||
    !formData.refree_phone_no ||
    !formData.hospital_name ||
    !formData.medical_condition ||
    !formData.appointment_date ||
    !formData.appointment_time ||
    !formData.city
  ) {
    setError("Please fill in all required (*) fields.");
    return;
  }

  // --- MANDATORY AADHAR CHECK ---
  if (!aadharFile) {
    setError("Aadhar Card Photo is a mandatory field.");
    return;
  }

  // --- Start loading ---
  setLoading(true);

  try {
    // --- 1. Create FormData and append all data ---
    const submissionFormData = new FormData();
    
    // Append all text data
    Object.keys(formData).forEach(key => {
      // --- THIS IS THE FIX ---
      // We cast the key to keyof typeof formData
      const typedKey = key as keyof typeof formData;
      submissionFormData.append(key, formData[typedKey]);
      // --- END OF FIX ---
    });
    
    // Append files
    if (aadharFile) { // Check if aadharFile is not null before appending
      submissionFormData.append('aadhar_document', aadharFile); // Use the key name from backend route
    }
    if (pmjayFile) {
      submissionFormData.append('pmjay_document', pmjayFile); // Use the key name from backend route
    }

    // --- 2. Submit main form (text + files) in ONE request ---
    const res = await api.post(
      "/patientLeads/create-web", 
      submissionFormData, 
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    setSuccess(
      `✅ Booking ${res.data.data.booking_reference} created successfully.`
    );

    setTimeout(() => setSuccess(""), 5000);

    // --- 3. Reset entire form ---
    setFormData({
      booking_reference: generateLeadId(),
      patient_name: "",
      patient_phone: "",
      referee_name: "",
      refree_phone_no: "",
      hospital_name: "",
      medical_condition: "",
      city: "",
      age: "",
      gender: "",
      panel: "",
      appointment_date: getTodayDate(),
      appointment_time: getCurrentTime(),
      current_disposition: "opd_booked",
    });
    setHospitals([]);
    
    // Reset file state
    setAadharFile(null);
    setPmjayFile(null);

    // Reset file input elements
    const aadharInput = document.getElementById('aadhar-upload') as HTMLInputElement;
    if (aadharInput) aadharInput.value = "";
    const pmjayInput = document.getElementById('pmjay-upload') as HTMLInputElement;
    if (pmjayInput) pmjayInput.value = "";
    
  } catch (err: unknown) {
    // Handle errors from the form submission
    if (axios.isAxiosError(err)) {
      if (err.response?.data?.message?.includes("duplicate key")) {
        setError(
          "A booking with this ID already exists. Please submit again."
        );
        setFormData((prev) => ({
          ...prev,
          booking_reference: generateLeadId(),
        }));
      } else {
        setError(err.response?.data?.message || "An error occurred.");
      }
    } else {
      console.error("Non-Axios error during submit:", err);
      setError("Unexpected error occurred.");
    }
  } finally {
    // --- Stop loading ---
    setLoading(false);
  }
};

  // --- 14. JSX (No changes needed from previous step) ---
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
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>{user.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl w-full h-full mx-auto px-2 md:px-6 lg:px-8 py-8">
        <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          {/* Page Header */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Book OPD Appointment
                </h1>
                <p className="text-blue-100 text-sm">
                  Schedule a new patient appointment
                </p>
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div className="px-6 pt-6">
            {error && (
              <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm animate-shake">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 mr-2 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {error}
                </div>
              </div>
            )}
            {success && (
              <div className="mb-6 p-4 bg-green-900/50 border border-green-500 rounded-lg text-green-200 text-sm">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 mr-2 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {success}
                </div>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Patient Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-cyan-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Patient Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Patient Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="patient_name"
                    value={formData.patient_name}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="Enter patient name"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Patient Phone <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="patient_phone"
                    maxLength={10}
                    value={formData.patient_phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="10-digit phone"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Age
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="Enter age"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Gender
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    disabled={loading}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* --- UPDATED AADHAR INPUT --- */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Aadhar Card Photo <span className="text-red-400">*</span>
                  </label>
                  
                  {!aadharFile && (
                    <input
                      id="aadhar-upload"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleFileChange(e, 'aadhar')}
                      disabled={loading}
                      className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30 disabled:opacity-50"
                    />
                  )}
                  
                  {aadharFile && (
                    <div className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                      <p className="text-sm text-green-400 truncate w-4/5" title={aadharFile.name}>
                        {aadharFile.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleFileRemove('aadhar')}
                        disabled={loading}
                        className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* --- UPDATED PMJAY INPUT --- */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    PMJAY Card Photo
                  </label>
                  
                  {!pmjayFile && (
                    <input
                      id="pmjay-upload"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleFileChange(e, 'pmjay')}
                      disabled={loading}
                      className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30 disabled:opacity-50"
                    />
                  )}
                  
                  {pmjayFile && (
                    <div className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                      <p className="text-sm text-green-400 truncate w-4/5" title={pmjayFile.name}>
                        {pmjayFile.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleFileRemove('pmjay')}
                        disabled={loading}
                        className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                {/* --- END UPDATED FILE INPUTS --- */}

              </div>
            </div>

            {/* Referral Details */}
            <div className="space-y-4 pt-6 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Referral & Case Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    City <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    required
                    disabled={loading}
                  >
                    <option value="">Select city...</option>
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Hospital Name <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="hospital_name"
                    value={formData.hospital_name}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    disabled={!formData.city || isHospitalLoading || loading}
                    required
                  >
                    <option value="">
                      {isHospitalLoading
                        ? "Loading..."
                        : formData.city
                        ? "Select hospital..."
                        : "Select city first"}
                    </option>
                    {hospitals.map((hospital) => (
                      <option key={hospital} value={hospital}>
                        {hospital}
                      </option>
                    ))}
                  </select>
                </div>

                {/* --- MODIFIED FIELDS FOR DOCTOR LOOKUP --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Referee Doctor's Phone{" "}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="refree_phone_no"
                    maxLength={10}
                    value={formData.refree_phone_no}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="10-digit phone"
                    required
                    onBlur={fetchDoctorName}
                    disabled={loading}
                  />
                  {isFetchingDoctor && <p className="text-xs text-yellow-400 mt-1">Searching for doctor...</p>}
                  {doctorError && <p className="text-xs text-red-400 mt-1">{doctorError}</p>}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Referee Name
                  </label>
                  <input
                    type="text"
                    name="referee_name"
                    value={formData.referee_name}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="Auto-filled from phone"
                    readOnly
                    disabled={loading}
                  />
                </div>
                {/* --- END MODIFIED FIELDS --- */}


                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Medical Condition <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="medical_condition"
                    value={formData.medical_condition}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="Describe the medical condition"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Payment Mode (Panel)
                  </label>
                  <select
                    name="panel"
                    value={formData.panel}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    disabled={loading}
                  >
                    <option value="">Select payment mode</option>
                    <option value="Cash">Cash</option>
                    <option value="Ayushman">Ayushman</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Appointment Details */}
            <div className="space-y-4 pt-6 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Appointment Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Appointment Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    name="appointment_date"
                    value={formData.appointment_date}
                    onChange={handleChange}
                    min={getTodayDate()}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Appointment Time <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="time"
                    name="appointment_time"
                    value={formData.appointment_time}
                    onChange={handleChange}
                    min={minTime}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-6">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  "Submit OPD Booking"
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}