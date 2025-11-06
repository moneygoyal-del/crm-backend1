import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

export default function LogMeetingPage() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        doctor_name: '',
        doctor_phone_number: '',
        locality: '',
        duration_of_meeting: '15',
        queries_by_the_doctor: '',
        comments_by_ndm: '',
        chances_of_getting_leads: 'medium',
        timestamp_of_the_meeting: new Date().toISOString().split('T')[0]
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const userString = localStorage.getItem('user');
    const user = userString ? JSON.parse(userString) : { name: "User" };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

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

        const localDateStr = formData.timestamp_of_the_meeting.replace(/-/g, '/');
        const date = new Date(localDateStr);
        const localTime = new Date().toTimeString().split(' ')[0];
        const formattedTimestamp = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${localTime}`;

        const payload = {
            ...formData,
            timestamp_of_the_meeting: formattedTimestamp,
        };

        try {
            const response = await api.post('/doctors/create-web', payload);
            setSuccess(`Success! Meeting with Dr. ${response.data.data.doctor_name} logged.`);
            setFormData({
                doctor_name: '', doctor_phone_number: '', locality: '',
                duration_of_meeting: '15', queries_by_the_doctor: '', comments_by_ndm: '',
                chances_of_getting_leads: 'medium',
                timestamp_of_the_meeting: new Date().toISOString().split('T')[0]
            });
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

                    {/* Alerts */}
                    <div className="px-6 pt-6">
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
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Doctor Details */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center">
                                <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Doctor Information
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Doctor's Name <span className="text-red-400">*</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        name="doctor_name" 
                                        value={formData.doctor_name} 
                                        onChange={handleChange} 
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                        placeholder="Enter doctor's full name"
                                        required 
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Doctor's Phone <span className="text-red-400">*</span>
                                    </label>
                                    <input 
                                        type="tel" 
                                        name="doctor_phone_number" 
                                        value={formData.doctor_phone_number} 
                                        onChange={handleChange} 
                                        maxLength={10}
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                        placeholder="10-digit phone"
                                        required 
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Locality</label>
                                    <input 
                                        type="text" 
                                        name="locality" 
                                        value={formData.locality} 
                                        onChange={handleChange} 
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                        placeholder="Enter locality/area"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Meeting Details */}
                        <div className="space-y-4 pt-6 border-t border-gray-700">
                            <h3 className="text-lg font-semibold text-white flex items-center">
                                <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Meeting Details
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Date of Meeting</label>
                                    <input 
                                        type="date" 
                                        name="timestamp_of_the_meeting" 
                                        value={formData.timestamp_of_the_meeting} 
                                        onChange={handleChange} 
                                        max={new Date().toISOString().split('T')[0]}
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Duration (minutes)</label>
                                    <input 
                                        type="number" 
                                        name="duration_of_meeting" 
                                        value={formData.duration_of_meeting} 
                                        onChange={handleChange}
                                        min="1"
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                        placeholder="Meeting duration"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Doctor's Queries</label>
                                    <textarea 
                                        name="queries_by_the_doctor" 
                                        value={formData.queries_by_the_doctor} 
                                        onChange={handleChange} 
                                        rows={3}
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none" 
                                        placeholder="What did the doctor ask or discuss?"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Comments/Notes</label>
                                    <textarea 
                                        name="comments_by_ndm" 
                                        value={formData.comments_by_ndm} 
                                        onChange={handleChange} 
                                        rows={3}
                                        className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none" 
                                        placeholder="Additional comments or observations"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Chances of Getting Leads</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, chances_of_getting_leads: 'high' }))}
                                            className={`py-3 px-4 rounded-lg font-medium transition-all ${
                                                formData.chances_of_getting_leads === 'high'
                                                    ? 'bg-green-500 text-white ring-2 ring-green-400'
                                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                        >
                                            High
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, chances_of_getting_leads: 'medium' }))}
                                            className={`py-3 px-4 rounded-lg font-medium transition-all ${
                                                formData.chances_of_getting_leads === 'medium'
                                                    ? 'bg-yellow-500 text-white ring-2 ring-yellow-400'
                                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                        >
                                            Medium
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, chances_of_getting_leads: 'low' }))}
                                            className={`py-3 px-4 rounded-lg font-medium transition-all ${
                                                formData.chances_of_getting_leads === 'low'
                                                    ? 'bg-red-500 text-white ring-2 ring-red-400'
                                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                        >
                                            Low
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-6">
                            <button 
                                type="submit" 
                                disabled={loading} 
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