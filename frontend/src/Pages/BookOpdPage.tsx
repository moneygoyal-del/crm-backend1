import { useState, useMemo, useEffect, useRef } from "react";
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

// --- Interfaces ---
interface Hospital {
  id: string;
  hospital_name: string;
}


interface OpdFormData {
  booking_reference: string;
  patient_name: string;
  patient_phone: string;
  referee_name: string;
  refree_phone_no: string;
  hospital_name: string[]; // For display/search
  hospital_ids: string[];  // For backend logic
  medical_condition: string;
  city: string;
  age: string;
  gender: string;
  panel: string;
  appointment_date: string;
  appointment_time: string;
  current_disposition: string;
}

export default function BookOpdPage() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [cities, setCities] = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]); 
  const [isHospitalLoading, setIsHospitalLoading] = useState(false);


  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");


  const [formData, setFormData] = useState<OpdFormData>({
    booking_reference: generateLeadId(),
    patient_name: "",
    patient_phone: "",
    referee_name: "",
    refree_phone_no: "",
    hospital_name: [], 
    hospital_ids: [], 
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // NEW: State for Success Modal Data
  const [successData, setSuccessData] = useState<{ref: string, name: string} | null>(null);

  // --- 4. State for doctor name lookup ---
  const [isFetchingDoctor, setIsFetchingDoctor] = useState(false);
  const [doctorError, setDoctorError] = useState("");

  // --- 5. State for file objects ---
  const [aadharFile, setAadharFile] = useState<File | null>(null);
  const [pmjayFile, setPmjayFile] = useState<File | null>(null);

  const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');

  // --- 6. Memos ---
  const minTime = useMemo(() => {
    const today = getTodayDate();
    return formData.appointment_date === today ? getCurrentTime() : "00:00";
  }, [formData.appointment_date]);

  // Filter hospitals based on search term
  const filteredHospitals = useMemo(() => {
    return hospitals.filter(h => 
      h.hospital_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [hospitals, searchTerm]);

  // --- 7. Effects ---
  useEffect(() => {
    if (formData.appointment_date === getTodayDate()) {
      const now = getCurrentTime();
      if (formData.appointment_time < now) {
        setFormData((prev) => ({ ...prev, appointment_time: now }));
      }
    }
  }, [formData.appointment_date, formData.appointment_time]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

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

  // --- 8. Handlers ---
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newState = { ...prev, [name]: value };
      if (name === "city") {
        newState.hospital_name = [];
        newState.hospital_ids = []; // Reset IDs when city changes
        setSearchTerm("");
      }
      return newState;
    });
  };

  // Toggle a single hospital
  const toggleHospital = (hospital: Hospital) => {
    setFormData((prev) => {
      const currentNames = prev.hospital_name;
      const currentIds = prev.hospital_ids;

      if (currentNames.includes(hospital.hospital_name)) {
        // Remove
        return { 
          ...prev, 
          hospital_name: currentNames.filter(h => h !== hospital.hospital_name),
          hospital_ids: currentIds.filter(id => id !== hospital.id)
        };
      } else {
        // Add
        return { 
          ...prev, 
          hospital_name: [...currentNames, hospital.hospital_name],
          hospital_ids: [...currentIds, hospital.id]
        };
      }
    });
  };

  // Remove a tag
  const removeHospitalTag = (e: React.MouseEvent, hospitalName: string) => {
    e.stopPropagation();
    const hospObj = hospitals.find(h => h.hospital_name === hospitalName);
    if (hospObj) toggleHospital(hospObj);
  };

  // Select/Deselect All Filtered
  const handleSelectAll = () => {
    const allFilteredSelected = filteredHospitals.every(h => formData.hospital_name.includes(h.hospital_name));
    
    setFormData(prev => {
      const newNames = new Set(prev.hospital_name);
      const newIds = new Set(prev.hospital_ids);

      if (allFilteredSelected) {
        // Deselect all filtered
        filteredHospitals.forEach(h => {
            newNames.delete(h.hospital_name);
            newIds.delete(h.id);
        });
      } else {
        // Select all filtered
        filteredHospitals.forEach(h => {
            newNames.add(h.hospital_name);
            newIds.add(h.id);
        });
      }
      return { 
          ...prev, 
          hospital_name: Array.from(newNames),
          hospital_ids: Array.from(newIds)
      };
    });
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: 'aadhar' | 'pmjay'
  ) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (docType === 'aadhar') setAadharFile(file);
    if (docType === 'pmjay') setPmjayFile(file);
  };
  
  const handleFileRemove = (docType: 'aadhar' | 'pmjay') => {
    if (docType === 'aadhar') {
      setAadharFile(null);
      const el = document.getElementById('aadhar-upload') as HTMLInputElement;
      if (el) el.value = "";
    }
    if (docType === 'pmjay') {
      setPmjayFile(null);
      const el = document.getElementById('pmjay-upload') as HTMLInputElement;
      if (el) el.value = "";
    }
  };

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
      setFormData((prev) => ({ ...prev, referee_name: res.data.data.name }));
    } catch { 
      setDoctorError("Doctor not found.");
      setFormData((prev) => ({ ...prev, referee_name: "" }));
    } finally {
      setIsFetchingDoctor(false);
    }
  };

  // --- Helper to Reset Form ---
  const resetForm = () => {
    setFormData({
      booking_reference: generateLeadId(),
      patient_name: "",
      patient_phone: "",
      referee_name: "",
      refree_phone_no: "",
      hospital_name: [],
      hospital_ids: [],
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
    setSearchTerm("");
    setAadharFile(null);
    setPmjayFile(null);

    const aadharInput = document.getElementById('aadhar-upload') as HTMLInputElement;
    if (aadharInput) aadharInput.value = "";
    const pmjayInput = document.getElementById('pmjay-upload') as HTMLInputElement;
    if (pmjayInput) pmjayInput.value = "";
  };
  
  // --- Submit Handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessData(null);

    if (
      !formData.patient_name ||
      !formData.patient_phone ||
      !formData.refree_phone_no ||
      formData.hospital_name.length === 0 || 
      !formData.medical_condition ||
      !formData.appointment_date ||
      !formData.appointment_time ||
      !formData.city
    ) {
      setError("Please fill in all required (*) fields.");
      return;
    }

    if (!aadharFile) {
      setError("Aadhar Card Photo is a mandatory field.");
      return;
    }

    setLoading(true);

    try {
      const submissionFormData = new FormData();
      
      (Object.keys(formData) as Array<keyof OpdFormData>).forEach(key => {
        if (key === 'hospital_name') {
             submissionFormData.append(key, formData.hospital_name.join(', '));
        } 
        else if (key === 'hospital_ids') {
             formData.hospital_ids.forEach((id) => {
                 submissionFormData.append('hospital_ids', id);
             });
        } 
        else {
             submissionFormData.append(key, formData[key] as string);
        }
      });
      
      if (aadharFile) submissionFormData.append('aadhar_document', aadharFile);
      if (pmjayFile) submissionFormData.append('pmjay_document', pmjayFile);

      const res = await api.post("/patientLeads/create-web", submissionFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      
      setSuccessData({
        ref: res.data.data.booking_reference,
        name: formData.patient_name
      });
      
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.message?.includes("duplicate key")) {
          setError("A booking with this ID already exists. Please submit again.");
          setFormData((prev) => ({ ...prev, booking_reference: generateLeadId() }));
        } else {
          setError(err.response?.data?.message || "An error occurred.");
        }
      } else {
        setError("Unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative">
      
      {/* --- SUCCESS MODAL --- */}
      {successData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-gray-800 border border-gray-600 p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl transform scale-100 transition-all">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-900/30 mb-6">
              <svg className="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-2">Booking Confirmed!</h3>
            <p className="text-gray-400 mb-6">Patient <span className="text-white font-medium">{successData.name}</span> has been successfully registered.</p>
            
            <div className="bg-gray-700/50 rounded-lg p-4 mb-6 border border-gray-600 border-dashed">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Booking Reference</p>
              <p className="text-3xl font-mono font-bold text-cyan-400 select-all">{successData.ref}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-transparent hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 transition-colors font-medium cursor-pointer"
              >
                Go Home
              </button>
              <button 
                onClick={() => {
                  setSuccessData(null);
                  resetForm();
                }}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg shadow-lg transition-all cursor-pointer"
              >
                New Booking
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-6">
            <h1 className="text-2xl font-bold text-white">Book OPD Appointment</h1>
          </div>

          <div className="px-6 pt-6">
            {error && <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">{error}</div>}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Patient Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <svg className="w-5 h-5 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Patient Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Patient Name <span className="text-red-400">*</span></label>
                  <input type="text" name="patient_name" value={formData.patient_name} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" placeholder="Enter patient name" required disabled={loading} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Patient Phone <span className="text-red-400">*</span></label>
                  <input type="tel" name="patient_phone" maxLength={10} value={formData.patient_phone} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" placeholder="10-digit phone" required disabled={loading} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Age</label>
                  <input type="number" name="age" value={formData.age} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" placeholder="Enter age" disabled={loading} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleChange} className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" disabled={loading}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* File Inputs */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Aadhar Card Photo <span className="text-red-400">*</span></label>
                  {!aadharFile && <input id="aadhar-upload" type="file" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'aadhar')} disabled={loading} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-500/20 file:text-blue-300" />}
                  {aadharFile && <div className="flex items-center justify-between p-2 bg-gray-700 rounded-lg"><p className="text-sm text-green-400 truncate w-4/5">{aadharFile.name}</p><button type="button" onClick={() => handleFileRemove('aadhar')} disabled={loading} className="text-xs font-medium text-red-400 hover:text-red-300">Remove</button></div>}
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">PMJAY Card Photo</label>
                  {!pmjayFile && <input id="pmjay-upload" type="file" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'pmjay')} disabled={loading} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-500/20 file:text-blue-300" />}
                  {pmjayFile && <div className="flex items-center justify-between p-2 bg-gray-700 rounded-lg"><p className="text-sm text-green-400 truncate w-4/5">{pmjayFile.name}</p><button type="button" onClick={() => handleFileRemove('pmjay')} disabled={loading} className="text-xs font-medium text-red-400 hover:text-red-300">Remove</button></div>}
                </div>
              </div>
            </div>

            {/* Referral & Case Details */}
            <div className="space-y-4 pt-6 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                Referral & Case Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">City <span className="text-red-400">*</span></label>
                  <select name="city" value={formData.city} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" required disabled={loading}>
                    <option value="">Select city...</option>
                    {cities.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </div>

                {/* --- ENHANCED MULTI-SELECT DROPDOWN --- */}
                <div className="md:col-span-1 relative" ref={dropdownRef}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Hospitals <span className="text-red-400">*</span>
                  </label>
                  
                  {/* Trigger / Display Area */}
                  <div 
                    onClick={() => !isHospitalLoading && !(!formData.city) && setIsDropdownOpen(!isDropdownOpen)}
                    className={`w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white min-h-[46px] cursor-pointer focus-within:ring-2 focus-within:ring-cyan-500 transition-all ${(!formData.city || isHospitalLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex flex-wrap gap-2">
                      {formData.hospital_name.length === 0 ? (
                        <span className="text-gray-400">
                           {isHospitalLoading ? "Loading..." : (!formData.city ? "Select city first" : "Select hospitals...")}
                        </span>
                      ) : (
                        formData.hospital_name.map(h => (
                          <span key={h} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-900 text-cyan-200 border border-cyan-700">
                            {h}
                            <button type="button" onClick={(e) => removeHospitalTag(e, h)} className="ml-1 text-cyan-400 hover:text-cyan-100 focus:outline-none">
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && hospitals.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
                      {/* Search & Actions */}
                      <div className="p-2 bg-gray-900 border-b border-gray-700 sticky top-0">
                        <input
                          type="text"
                          className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 mb-2"
                          placeholder="Search..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          autoFocus
                        />
                        <div className="flex justify-between text-xs text-gray-400 px-1">
                           <button type="button" onClick={handleSelectAll} className="hover:text-cyan-400 cursor-pointer">
                             {filteredHospitals.every(h => formData.hospital_name.includes(h.hospital_name)) ? "Deselect All" : "Select All"}
                           </button>
                           <span>{filteredHospitals.length} results</span>
                        </div>
                      </div>
                      
                      {/* List */}
                      <div className="max-h-60 overflow-y-auto p-2">
                        {filteredHospitals.length > 0 ? (
                          filteredHospitals.map((hospital) => (
                            <label key={hospital.id} className="flex items-center space-x-3 p-2 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={formData.hospital_name.includes(hospital.hospital_name)}
                                onChange={() => toggleHospital(hospital)}
                                className="w-4 h-4 text-cyan-600 bg-gray-900 border-gray-500 rounded focus:ring-cyan-500 focus:ring-offset-gray-800"
                              />
                              <span className="text-sm text-gray-200 select-none">{hospital.hospital_name}</span>
                            </label>
                          ))
                        ) : (
                          <div className="p-4 text-center text-sm text-gray-500">No match found</div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {formData.city && !isHospitalLoading && hospitals.length === 0 && (
                    <p className="text-red-400 text-xs mt-1">No hospitals found in {formData.city}.</p>
                  )}
                </div>
                {/* --- END ENHANCED MULTI-SELECT --- */}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Referee Doctor's Phone <span className="text-red-400">*</span></label>
                  <input type="tel" name="refree_phone_no" maxLength={10} value={formData.refree_phone_no} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500" placeholder="10-digit phone" required onBlur={fetchDoctorName} disabled={loading} />
                  {isFetchingDoctor && <p className="text-xs text-yellow-400 mt-1">Searching...</p>}
                  {doctorError && <p className="text-xs text-red-400 mt-1">{doctorError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Referee Name</label>
                  <input type="text" name="referee_name" value={formData.referee_name} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400" placeholder="Auto-filled" readOnly disabled={loading} />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Medical Condition <span className="text-red-400">*</span></label>
                  <input type="text" name="medical_condition" value={formData.medical_condition} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500" placeholder="Describe condition" required disabled={loading} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Payment Mode</label>
                  <select name="panel" value={formData.panel} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" disabled={loading}>
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
                <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Appointment Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Appointment Date <span className="text-red-400">*</span></label>
                  <input type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} min={getTodayDate()} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" required disabled={loading} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Appointment Time <span className="text-red-400">*</span></label>
                  <input type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} min={minTime} className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500" required disabled={loading} />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-6">
              <button type="submit" disabled={loading} className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Submitting...
                  </span>
                ) : "Submit OPD Booking"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}