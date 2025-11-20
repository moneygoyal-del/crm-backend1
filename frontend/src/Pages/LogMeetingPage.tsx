import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

// --- FIX: Use local system time instead of UTC ---
const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// List of facilities
const FACILITIES_LIST = [
    'Medicines', 
    'Sugar', 
    'Blood Pressure', 
    'IPD/Injections'
];

export default function LogMeetingPage() {
    const navigate = useNavigate();
    
    // --- 1. State for ALL form fields ---
    const [formData, setFormData] = useState({
        doctor_name: '',
        doctor_phone_number: '',
        locality: '',
        opd_count: '',
        duration_of_meeting: '15',
        numPatientsDuringMeeting: '0',
        rating: '3',
        queries_by_the_doctor: '',
        comments_by_ndm: '',
        chances_of_getting_leads: 'medium',
        facilities: [] as string[],
        timestamp_of_the_meeting: getTodayDate() 
    });

    // --- 2. NEW: State for file objects ---
    const [clinicFile, setClinicFile] = useState<File | null>(null);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    
    // --- State for GPS ---
    const [gpsLocation, setGpsLocation] = useState<{lat: number, lon: number} | null>(null);
    const [gpsError, setGpsError] = useState('');

    // --- 3. State for form submission and UI ---
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // --- 4. State for doctor auto-fill ---
    const [isFetchingDoctor, setIsFetchingDoctor] = useState(false);
    const [isDoctorFound, setIsDoctorFound] = useState(false);
    const [doctorError, setDoctorError] = useState('');

    const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');

    // --- 5. Effect to get GPS on page load ---
    useEffect(() => {
        setGpsError('');
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGpsLocation({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                    });
                },
                (err) => {
                    setGpsError('GPS permission denied. Please enable it to submit.');
                    console.error("GPS Error:", err.message);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setGpsError("GPS is not supported. Please use a modern browser.");
        }
    }, []);

    // --- 6. Form field change handlers ---
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value, checked } = e.target;
        setFormData(prev => {
            const facilities = checked
                ? [...prev.facilities, value]
                : prev.facilities.filter(facility => facility !== value);
            return { ...prev, facilities };
        });
    };

    // --- 7. Function to fetch doctor details by phone ---
    const fetchDoctorDetails = async () => {
        const phone = formData.doctor_phone_number;
        
        if (phone.length !== 10) {
            setDoctorError("");
            setIsDoctorFound(false);
            setFormData(prev => ({ ...prev, doctor_name: '', locality: '' }));
            return;
        }

        setIsFetchingDoctor(true);
        setDoctorError("");
        setIsDoctorFound(false);

        try {
            const res = await api.get(`/doctors/get-by-phone/${phone}`);
            const { name, locality } = res.data.data;
            
            setFormData(prev => ({ 
                ...prev, 
                doctor_name: name,
                locality: locality || '' 
            }));
            setIsDoctorFound(true); 

        } catch (err) {
            console.error("Failed to fetch doctor:", err);
            setDoctorError("Doctor not found. Please enter details.");
            setIsDoctorFound(false); 
            setFormData(prev => ({ ...prev, doctor_name: '', locality: '' }));
        } finally {
            setIsFetchingDoctor(false);
        }
    };

    // --- 8. File change and remove handlers ---
    const handleFileChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        docType: 'clinic' | 'selfie'
    ) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (docType === 'clinic') {
            setClinicFile(file);
        } else {
            setSelfieFile(file);
        }
    };

    const handleFileRemove = (docType: 'clinic' | 'selfie') => {
        if (docType === 'clinic') {
            setClinicFile(null);
            const input = document.getElementById('clinic-upload') as HTMLInputElement;
            if (input) input.value = "";
        }
        if (docType === 'selfie') {
            setSelfieFile(null);
            const input = document.getElementById('selfie-upload') as HTMLInputElement;
            if (input) input.value = "";
        }
    };

    // --- 9. Form submit handler ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        if (!formData.doctor_name || !formData.doctor_phone_number) {
            setError("Doctor Name and Phone are required.");
            setLoading(false);
            return;
        }

        if (!clinicFile || !selfieFile) {
            setError("Please upload both Clinic Photo and Selfie.");
            setLoading(false);
            return;
        }
        
        if (!gpsLocation) {
             setError("GPS location is required. Please enable location services and reload.");
             setLoading(false);
             return;
        }

        const date = new Date(formData.timestamp_of_the_meeting.replace(/-/g, '/'));
        const localTime = new Date().toTimeString().split(' ')[0]; // Get current time
        const formattedTimestamp = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${localTime}`;
        
        const gpsLink = `https://maps.google.com/?q=${gpsLocation.lat},${gpsLocation.lon}`;

        const submissionFormData = new FormData();

        Object.keys(formData).forEach(key => {
            const typedKey = key as keyof typeof formData;
            if (typedKey === 'facilities') {
                submissionFormData.append('facilities', formData.facilities.join(', '));
            } else if (typedKey === 'timestamp_of_the_meeting') {
                submissionFormData.append('timestamp_of_the_meeting', formattedTimestamp);
            } else {
                submissionFormData.append(typedKey, formData[typedKey]);
            }
        });

        submissionFormData.append('latitude', String(gpsLocation.lat));
        submissionFormData.append('longitude', String(gpsLocation.lon));
        submissionFormData.append('gps_location_of_the_clinic', gpsLink);
        
        if (clinicFile) {
            submissionFormData.append('clinic_photo', clinicFile);
        }
        if (selfieFile) {
            submissionFormData.append('selfie_photo', selfieFile);
        }

        try {
            const response = await api.post('/doctors/create-web', submissionFormData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setSuccess(`✅ Success! Meeting with Dr. ${response.data.data.doctor_name} logged.`);
            
            setFormData({
                doctor_name: '', doctor_phone_number: '', locality: '',
                opd_count: '', duration_of_meeting: '15', numPatientsDuringMeeting: '0',
                rating: '3', queries_by_the_doctor: '', comments_by_ndm: '',
                chances_of_getting_leads: 'medium', facilities: [],
                timestamp_of_the_meeting: getTodayDate() 
            });
            
            handleFileRemove('clinic');
            handleFileRemove('selfie');
            
            setIsDoctorFound(false);
            setDoctorError('');
            
            setTimeout(() => setSuccess(''), 5000);

        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || "An error occurred.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
        setLoading(false);
    };

    // --- 10. JSX ---
    const inputStyles = "w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";
    const selectStyles = "w-full px-2 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"; 
    const labelStyles = "block text-sm font-medium text-gray-300 mb-2";
    const fileInputStyles = "w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30 disabled:opacity-50";

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
                    {/* Page Header */}
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-6">
                        <div className="flex items-center space-x-3">
                            
                            <div>
                                <h1 className="text-2xl font-bold text-white">Log Doctor Meeting</h1>

                            </div>
                        </div>
                    </div>

                    {/* Alerts */}
                    <div className="px-6 pt-6">
                        {error && (
                            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm animate-shake">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                    {error}
                                </div>
                            </div>
                        )}
                        {success && (
                            <div className="mb-6 p-4 bg-green-900/50 border border-green-500 rounded-lg text-green-200 text-sm">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                    {success}
                                </div>
                            </div>
                        )}
                        {gpsError && !gpsLocation && (
                             <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-500 rounded-lg text-yellow-200 text-sm">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.636-1.182 2.85-1.182 3.486 0l5.58 10.362c.636 1.182-.48 2.539-1.743 2.539H4.42c-1.263 0-2.379-1.357-1.743-2.539l5.58-10.362zM10 12a1 1 0 100-2 1 1 0 000 2zm0 2a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                                    {gpsError}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        
                        {/* Section 1: Doctor Information */}
                        <div className="space-y-4">
                            <h3 className={labelStyles.replace('mb-2', '') + " text-lg font-semibold text-white flex items-center"}>
                                <svg className="w-5 h-5 mr-2 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                Doctor Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className={labelStyles}>Doctor's Phone <span className="text-red-400">*</span></label>
                                    <input 
                                        type="tel" 
                                        name="doctor_phone_number" 
                                        value={formData.doctor_phone_number} 
                                        onChange={handleChange} 
                                        onBlur={fetchDoctorDetails}
                                        maxLength={10} 
                                        className={inputStyles} 
                                        placeholder="10-digit phone (will auto-fill name)" 
                                        required 
                                        disabled={loading}
                                    />
                                    {isFetchingDoctor && <p className="text-xs text-yellow-400 mt-1">Searching for doctor...</p>}
                                    {doctorError && <p className="text-xs text-red-400 mt-1">{doctorError}</p>}
                                </div>

                                <div>
                                    <label className={labelStyles}>Doctor's Name <span className="text-red-400">*</span></label>
                                    <input 
                                        type="text" 
                                        name="doctor_name" 
                                        value={formData.doctor_name} 
                                        onChange={handleChange} 
                                        className={`${inputStyles} ${isDoctorFound ? 'text-gray-400' : 'text-white'}`} 
                                        placeholder={"Enter doctor's full name"}
                                        required 
                                        readOnly={isDoctorFound}
                                        disabled={loading}
                                    />
                                </div>
                                <div>
                                    <label className={labelStyles}>Locality</label>
                                    <input 
                                        type="text" 
                                        name="locality" 
                                        value={formData.locality} 
                                        onChange={handleChange} 
                                        className={`${inputStyles} ${isDoctorFound ? 'text-gray-400' : 'text-white'}`} 
                                        placeholder={"Enter clinic area or locality"}
                                        readOnly={isDoctorFound}
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Meeting Details */}
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                             <h3 className={labelStyles.replace('mb-2', '') + " text-lg font-semibold text-white flex items-center"}>
                                <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Meeting Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelStyles}>Duration (minutes)</label>
                                    <input type="number" name="duration_of_meeting" value={formData.duration_of_meeting} onChange={handleChange} min="1" className={inputStyles} disabled={loading} />
                                </div>
                                <div>
                                    <label className={labelStyles}>Avg. OPD Count (Daily)</label>
                                    <input type="number" name="opd_count" value={formData.opd_count} onChange={handleChange} min="0" className={inputStyles} placeholder="e.g., 25" disabled={loading} />
                                </div>
                                <div>
                                    <label className={labelStyles}>Patients During Meeting</label>
                                    <input type="number" name="numPatientsDuringMeeting" value={formData.numPatientsDuringMeeting} onChange={handleChange} min="0" className={inputStyles} disabled={loading} />
                                </div>
                                
                                <div className="md:col-span-2">
                                    <label className={labelStyles}>Facilities Available</label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm text-gray-200">
                                        {FACILITIES_LIST.map(facility => (
                                            <label key={facility} className="flex items-center space-x-2 p-2 bg-gray-700/50 rounded-lg">
                                                <input 
                                                    type="checkbox" 
                                                    name="facilities" 
                                                    value={facility} 
                                                    checked={formData.facilities.includes(facility)} 
                                                    onChange={handleCheckboxChange}
                                                    className="rounded text-blue-500 bg-gray-800 border-gray-600 focus:ring-blue-500"
                                                    disabled={loading}
                                                />
                                                <span>{facility}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                         {/* Section 3: Notes & Vibe Check */}
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                             <h3 className={labelStyles.replace('mb-2', '') + " text-lg font-semibold text-white flex items-center"}>
                                <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Notes & Vibe Check
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className={labelStyles}>Doctor's Queries</label>
                                    <textarea name="queries_by_the_doctor" value={formData.queries_by_the_doctor} onChange={handleChange} rows={3} className={inputStyles} placeholder="What did the doctor ask or discuss?" disabled={loading} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelStyles}>Your Comments/Notes</label>
                                    <textarea name="comments_by_ndm" value={formData.comments_by_ndm} onChange={handleChange} rows={3} className={inputStyles} placeholder="Additional comments or observations" disabled={loading} />
                                </div>
                                <div>
                                    <label className={labelStyles}>Rating (1-5)</label>
                                    <select name="rating" value={formData.rating} onChange={handleChange} className={selectStyles} disabled={loading}>
                                        <option value="1">1 - Very Poor</option>
                                        <option value="2">2 - Poor</option>
                                        <option value="3">3 - Average</option>
                                        <option value="4">4 - Good</option>
                                        <option value="5">5 - Excellent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyles}>Chances of Getting Leads</label>
                                    <select name="chances_of_getting_leads" value={formData.chances_of_getting_leads} onChange={handleChange} className={selectStyles} disabled={loading}>
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Photo Proof */}
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                            <h3 className={labelStyles.replace('mb-2', '') + " text-lg font-semibold text-white flex items-center"}>
                                <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                Photo Proof
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Clinic Photo */}
                                <div>
                                    <label className={labelStyles}>Clinic Photo <span className="text-red-400">*</span></label>
                                    {!clinicFile && (
                                        <input 
                                            id="clinic-upload" 
                                            type="file" 
                                            accept="image/*" 
                                            capture="environment" 
                                            onChange={(e) => handleFileChange(e, 'clinic')} 
                                            disabled={loading} 
                                            className={fileInputStyles} 
                                        />
                                    )}
                                    {clinicFile && (
                                        <div className="flex items-center justify-between p-2.5 bg-gray-700 rounded-lg">
                                            <p className="text-sm text-green-400 truncate w-4/5" title={clinicFile.name}>
                                                {clinicFile.name}
                                            </p>
                                            <button type="button" onClick={() => handleFileRemove('clinic')} disabled={loading} className="text-xs font-medium text-red-400 hover:text-red-300">
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* Selfie Photo */}
                                <div>
                                    <label className={labelStyles}>Selfie with Clinic <span className="text-red-400">*</span></label>
                                    {!selfieFile && (
                                        <input 
                                            id="selfie-upload" 
                                            type="file" 
                                            accept="image/*" 
                                            capture="user" 
                                            onChange={(e) => handleFileChange(e, 'selfie')} 
                                            disabled={loading} 
                                            className={fileInputStyles} 
                                        />
                                    )}
                                    {selfieFile && (
                                        <div className="flex items-center justify-between p-2.5 bg-gray-700 rounded-lg">
                                            <p className="text-sm text-green-400 truncate w-4/5" title={selfieFile.name}>
                                                {selfieFile.name}
                                            </p>
                                            <button type="button" onClick={() => handleFileRemove('selfie')} disabled={loading} className="text-xs font-medium text-red-400 hover:text-red-300">
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-6 border-t border-gray-700">
                            <button
                                type="submit"
                                disabled={loading || !!gpsError}
                                className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Submitting...
                                    </span>
                                ) : (
                                    "Log Meeting"
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}