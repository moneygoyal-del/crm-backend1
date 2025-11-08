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

  // --- 1. NEW STATE for the dropdown lists ---
  const [cities, setCities] = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<string[]>([]);
  const [isHospitalLoading, setIsHospitalLoading] = useState(false);
  // --- END NEW STATE ---

  const [formData, setFormData] = useState({
    booking_reference: generateLeadId(),
    patient_name: "",
    patient_phone: "",
    referee_name: "",
    refree_phone_no: "",
    hospital_name: "", // This will now be a select
    medical_condition: "",
    city: "", // This will now be a select
    age: "",
    gender: "",
    panel: "",
    appointment_date: getTodayDate(),
    appointment_time: getCurrentTime(),
    current_disposition: "opd_booked",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');

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

  // --- 2. NEW useEffect to fetch all cities ONCE on page load ---
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
  }, []); // Empty array means run only once

  // --- 3. NEW useEffect to fetch hospitals WHEN city changes ---
  useEffect(() => {
    // Clear hospital list if no city is selected
    if (!formData.city) {
      setHospitals([]);
      return;
    }

    const fetchHospitals = async () => {
      setIsHospitalLoading(true);
      setHospitals([]); // Clear old hospital list
      try {
        const res = await api.get(`/hospitals/by-city/${formData.city}`);
        setHospitals(res.data.data || []);
      } catch (err) {
        console.error("Failed to fetch hospitals:", err);
      }
      setIsHospitalLoading(false);
    };
    fetchHospitals();
  }, [formData.city]); // This hook runs every time formData.city changes

  // --- 4. UPDATE handleChange to reset hospital when city changes ---
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      // Start with the new state
      const newState = {
        ...prev,
        [name]: value,
      };

      // If the user changed the city, THEN reset the hospital
      if (name === "city") {
        newState.hospital_name = "";
      }

      return newState;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    // Added city to validation
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
      setLoading(false);
      return;
    }

    const payload = { ...formData, age: formData.age || "N/A" };

    try {
      const res = await api.post("/patientLeads/create-web", payload);
      setSuccess(
        `✅ Booking ${res.data.data.booking_reference} created successfully.`
      );

      setTimeout(() => setSuccess(""), 5000);

      setFormData({
        booking_reference: generateLeadId(),
        patient_name: "",
        patient_phone: "",
        referee_name: "",
        refree_phone_no: "",
        hospital_name: "",
        medical_condition: "",
        city: "", // Reset city
        age: "",
        gender: "",
        panel: "",
        appointment_date: getTodayDate(),
        appointment_time: getCurrentTime(),
        current_disposition: "opd_booked",
      });
      setHospitals([]); // Clear hospital list
    } catch (err: unknown) {
      // Use 'unknown' type
      if (axios.isAxiosError(err)) {
        // Check if it's an Axios error
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
        setError("Unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

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
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
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
                {/* --- CITY DROPDOWN (MOVED HERE) --- */}
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
                  >
                    <option value="">Select city...</option>
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                {/* --- HOSPITAL DROPDOWN (MOVED HERE) --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Hospital Name <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="hospital_name"
                    value={formData.hospital_name}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    disabled={!formData.city || isHospitalLoading} // Disable if no city or loading
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

                {/* (Referee fields) */}
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
                    placeholder="Doctor name (for sheet)"
                  />
                </div>
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
                  />
                </div>

                {/* (Medical Condition and Panel) */}
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
