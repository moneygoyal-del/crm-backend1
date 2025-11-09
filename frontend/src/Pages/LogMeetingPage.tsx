import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

// --- NEW: Helper to get today's date for the form ---
const getTodayDate = () => new Date().toISOString().split("T")[0];

export default function LogMeetingPage() {
    const navigate = useNavigate();
    
    // --- 1. UPDATED State for ALL form fields ---
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
        timestamp_of_the_meeting: getTodayDate() // Use helper
    });

    // --- 2. NEW State for file/GPS uploads ---
    const [clinicImageLink, setClinicImageLink] = useState<string | null>(null);
    const [selfieImageLink, setSelfieImageLink] = useState<string | null>(null);
    const [isUploadingClinic, setIsUploadingClinic] = useState(false);
    const [isUploadingSelfie, setIsUploadingSelfie] = useState(false);
    
    const [gpsLocation, setGpsLocation] = useState<{lat: number, lon: number} | null>(null);
    const [gpsError, setGpsError] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const userString = localStorage.getItem('user');
    const user = userString ? JSON.parse(userString) : { name: "User" };

    // --- 3. NEW Effect to get GPS on page load ---
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
                    setGpsError('GPS permission denied. Please enable it.');
                    console.error("GPS Error:", err.message);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setGpsError("GPS is not supported by this browser.");
        }
    }, []); // Runs once on page load

    // --- 4. Form field change handlers ---
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

    // --- 5. NEW: File upload/remove handlers ---
    const handleFileUpload = async (
        file: File,
        docType: 'clinic' | 'selfie'
    ) => {
        if (!file) return;

        if (docType === 'clinic') setIsUploadingClinic(true);
        if (docType === 'selfie') setIsUploadingSelfie(true);
        setError('');

        const fileFormData = new FormData();
        fileFormData.append('document', file);

        try {
            const res = await api.post('/doctors/upload-meeting-photo', fileFormData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const driveUrl = res.data.data.url;
            if (docType === 'clinic') setClinicImageLink(driveUrl);
            if (docType === 'selfie') setSelfieImageLink(driveUrl);
        } catch (err) {
            console.error("File upload failed:", err);
            setError(`Failed to upload ${docType} photo. Please try again.`);
        } finally {
            if (docType === 'clinic') setIsUploadingClinic(false);
            if (docType === 'selfie') setIsUploadingSelfie(false);
        }
    };

    const handleFileRemove = (docType: 'clinic' | 'selfie') => {
        if (docType === 'clinic') {
            setClinicImageLink(null);
            const input = document.getElementById('clinic-upload') as HTMLInputElement;
            if (input) input.value = "";
        }
        if (docType === 'selfie') {
            setSelfieImageLink(null);
            const input = document.getElementById('selfie-upload') as HTMLInputElement;
            if (input) input.value = "";
        }
    };

    // --- 6. UPDATED: Form submit handler ---
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

        if (!clinicImageLink || !selfieImageLink) {
            setError("Please upload both Clinic Photo and Selfie.");
            setLoading(false);
            return;
        }
        
        if (!gpsLocation) {
             setError("GPS location is required. Please enable location services and reload.");
             setLoading(false);
             return;
        }

        // Format timestamp as "dd/mm/yyyy HH:MM:SS"
        const date = new Date(formData.timestamp_of_the_meeting.replace(/-/g, '/'));
        const localTime = new Date().toTimeString().split(' ')[0];
        const formattedTimestamp = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${localTime}`;
        
        const gpsLink = `https://www.google.com/maps?q=${gpsLocation.lat},${gpsLocation.lon}`;

        const payload = {
            ...formData,
            timestamp_of_the_meeting: formattedTimestamp,
            clinic_image_link: clinicImageLink,
            selfie_image_link: selfieImageLink,
            latitude: gpsLocation.lat,
            longitude: gpsLocation.lon,
            gps_location_of_the_clinic: gpsLink,
            facilities: formData.facilities.join(', '), // Convert array to string
        };

        try {
            const response = await api.post('/doctors/create-web', payload);
            setSuccess(`Success! Meeting with Dr. ${response.data.data.doctor_name} logged.`);
            
            // Reset form
            setFormData({
                doctor_name: '', doctor_phone_number: '', locality: '',
                opd_count: '', duration_of_meeting: '15', numPatientsDuringMeeting: '0',
                rating: '3', queries_by_the_doctor: '', comments_by_ndm: '',
                chances_of_getting_leads: 'medium', facilities: [],
                timestamp_of_the_meeting: getTodayDate()
            });
            setClinicImageLink(null);
            setSelfieImageLink(null);
            (document.getElementById('clinic-upload') as HTMLInputElement).value = "";
            (document.getElementById('selfie-upload') as HTMLInputElement).value = "";
            
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Header */}
            <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
                {/* ... (Header JSX is unchanged) ... */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <button onClick={() => navigate(-1)} className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="font-medium">Back</span>
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
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                    {/* Page Header */}
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-6">
                        {/* ... (Page Header JSX is unchanged) ... */}
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Log Doctor Meeting</h1>
                                <p className="text-blue-100 text-sm">Record healthcare provider interactions</p>
                            </div>
                        </div>
                    </div>

                    {/* Alerts (including new GPS error) */}
                    <div className="px-6 pt-6">
                        {error && (
                            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm animate-shake">
                                {/* ... (Error SVG and message) ... */}
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="mb-6 p-4 bg-green-900/50 border border-green-500 rounded-lg text-green-200 text-sm">
                                {/* ... (Success SVG and message) ... */}
                                {success}
                            </div>
                        )}
                        {gpsError && (
                             <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-500 rounded-lg text-yellow-200 text-sm">
                                {gpsError}
                            </div>
                        )}
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Doctor Details */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white">Doctor Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Doctor's Name <span className="text-red-400">*</span>
                                    </label>
                                    <input type="text" name="doctor_name" value={formData.doctor_name} onChange={handleChange} className="w-full" placeholder="Enter doctor's full name" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Doctor's Phone <span className="text-red-400">*</span>
                                    </label>
                                    <input type="tel" name="doctor_phone_number" value={formData.doctor_phone_number} onChange={handleChange} maxLength={10} className="w-full" placeholder="10-digit phone" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Locality</label>
                                    <input type="text" name="locality" value={formData.locality} onChange={handleChange} className="w-full" placeholder="Enter locality/area" />
                                </div>
                            </div>
                        </div>

                        {/* Meeting Details */}
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                            <h3 className="text-lg font-semibold text-white">Meeting Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Date of Meeting</label>
                                    <input type="date" name="timestamp_of_the_meeting" value={formData.timestamp_of_the_meeting} onChange={handleChange} max={getTodayDate()} className="w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Duration (minutes)</label>
                                    <input type="number" name="duration_of_meeting" value={formData.duration_of_meeting} onChange={handleChange} min="1" className="w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Avg. OPD Count (Daily)</label>
                                    <input type="number" name="opd_count" value={formData.opd_count} onChange={handleChange} min="0" className="w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Patients During Meeting</label>
                                    <input type="number" name="numPatientsDuringMeeting" value={formData.numPatientsDuringMeeting} onChange={handleChange} min="0" className="w-full" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Doctor's Queries</label>
                                    <textarea name="queries_by_the_doctor" value={formData.queries_by_the_doctor} onChange={handleChange} rows={3} className="w-full" placeholder="What did the doctor ask or discuss?" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Comments/Notes</label>
                                    <textarea name="comments_by_ndm" value={formData.comments_by_ndm} onChange={handleChange} rows={3} className="w-full" placeholder="Additional comments or observations" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Rating (1-5)</label>
                                    <input type="number" name="rating" value={formData.rating} onChange={handleChange} min="1" max="5" className="w-full" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Chances of Getting Leads</label>
                                    {/* ... (Radio buttons for high/medium/low) ... */}
                                    <select name="chances_of_getting_leads" value={formData.chances_of_getting_leads} onChange={handleChange} className="w-full">
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Facilities Available</label>
                                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                                        {['Medicines', 'Sugar', 'Blood Pressure', 'IPD/Injections'].map(facility => (
                                            <label key={facility} className="flex items-center space-x-2">
                                                <input type="checkbox" name="facilities" value={facility} checked={formData.facilities.includes(facility)} onChange={handleCheckboxChange} />
                                                <span>{facility}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Photo Uploads */}
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                            <h3 className="text-lg font-semibold text-white">Photos</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Clinic Photo */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Clinic Photo <span className="text-red-400">*</span>
                                    </label>
                                    {!clinicImageLink && !isUploadingClinic && (
                                        <input id="clinic-upload" type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0], 'clinic')} disabled={loading || isUploadingClinic || isUploadingSelfie} className="w-full" />
                                    )}
                                    {isUploadingClinic && <p className="text-xs text-yellow-400 mt-1">Uploading...</p>}
                                    {clinicImageLink && !isUploadingClinic && (
                                        <div className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                                            <p className="text-sm text-green-400">Clinic Photo Uploaded ✓</p>
                                            <button type="button" onClick={() => handleFileRemove('clinic')} disabled={loading} className="text-xs font-medium text-red-400 hover:text-red-300">
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* Selfie Photo */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Selfie with Clinic <span className="text-red-400">*</span>
                                    </label>
                                    {!selfieImageLink && !isUploadingSelfie && (
                                        <input id="selfie-upload" type="file" accept="image/*" capture="user" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0], 'selfie')} disabled={loading || isUploadingClinic || isUploadingSelfie} className="w-full" />
                                    )}
                                    {isUploadingSelfie && <p className="text-xs text-yellow-400 mt-1">Uploading...</p>}
                                    {selfieImageLink && !isUploadingSelfie && (
                                        <div className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                                            <p className="text-sm text-green-400">Selfie Uploaded ✓</p>
                                            <button type="button" onClick={() => handleFileRemove('selfie')} disabled={loading} className="text-xs font-medium text-red-400 hover:text-red-300">
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-6">
                            <button type="submit" disabled={loading || isUploadingClinic || isUploadingSelfie || !!gpsError} className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-lg">
                                {loading ? "Submitting..." : "Log Meeting"}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}