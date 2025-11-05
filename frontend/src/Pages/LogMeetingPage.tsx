import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

// (Re-using the same styles as BookOpdPage)
const styles = {
    container: { width: '320px', margin: '50px auto', padding: '20px', border: '1px solid #555', borderRadius: '8px', textAlign: 'left' as const, backgroundColor: '#333' },
    header: { padding: '10px', backgroundColor: '#ccc', color: '#242424', fontWeight: 'bold', fontSize: '1.2em', borderRadius: '8px 8px 0 0', margin: '-20px -20px 20px -20px', textAlign: 'center' as const},
    input: { width: '100%', padding: '10px', margin: '5px 0 15px 0', boxSizing: 'border-box' as const, borderRadius: '4px', border: '1px solid #777', backgroundColor: '#fff', color: 'black' },
    button: { width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em' },
    label: { fontWeight: 'bold', fontSize: '0.9em' },
    error: { color: 'red', margin: '10px 0' },
    success: { color: 'lightgreen', margin: '10px 0' },
    backLink: { color: 'cyan', cursor: 'pointer', textAlign: 'center' as const, display: 'block', marginTop: '15px' }
};

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
        timestamp_of_the_meeting: new Date().toISOString().split('T')[0] // Default to today
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const userString = localStorage.getItem('user');
    const user = userString ? JSON.parse(userString) : { name: "User" };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

        // Format date for the backend (must match processTimeStamp)
        const date = new Date(formData.timestamp_of_the_meeting);
        const formattedTimestamp = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.toTimeString().split(' ')[0]}`;

        const payload = {
            ...formData,
            timestamp_of_the_meeting: formattedTimestamp,
            // ndm_name is now handled by the backend!
        };

        try {
            const response = await api.post('/doctors/create-web', payload);
            setSuccess(`Success! Meeting with ${response.data.data.doctor_name} logged.`);
            // Clear form
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
        <div style={styles.container}>
            <div style={styles.header}>Log Doctor Meeting</div>
            <p style={{ textAlign: 'center', marginTop: '-10px', marginBottom: '20px' }}>
                Logging as: <strong>{user.name}</strong>
            </p>

            {error && <div style={styles.error}>{error}</div>}
            {success && <div style={styles.success}>{success}</div>}

            <form onSubmit={handleSubmit}>
                <label style={styles.label}>Doctor's Name*</label>
                <input style={styles.input} type="text" name="doctor_name" value={formData.doctor_name} onChange={handleChange} />
                
                <label style={styles.label}>Doctor's Phone*</label>
                <input style={styles.input} type="tel" name="doctor_phone_number" value={formData.doctor_phone_number} onChange={handleChange} />
                
                <label style={styles.label}>Locality</label>
                <input style={styles.input} type="text" name="locality" value={formData.locality} onChange={handleChange} />

                <label style={styles.label}>Date of Meeting</label>
                <input style={styles.input} type="date" name="timestamp_of_the_meeting" value={formData.timestamp_of_the_meeting} onChange={handleChange} />

                <label style={styles.label}>Duration (minutes)</label>
                <input style={styles.input} type="number" name="duration_of_meeting" value={formData.duration_of_meeting} onChange={handleChange} />

                <label style={styles.label}>Doctor's Queries</label>
                <input style={styles.input} type="text" name="queries_by_the_doctor" value={formData.queries_by_the_doctor} onChange={handleChange} />

                <label style={styles.label}>Chances of Leads</label>
                <select style={styles.input} name="chances_of_getting_leads" value={formData.chances_of_getting_leads} onChange={handleChange}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>

                <button style={styles.button} type="submit" disabled={loading}>
                    {loading ? "Submitting..." : "Log Meeting"}
                </button>

                <a onClick={() => navigate(-1)} style={styles.backLink}>
                    &larr; Go Back
                </a>
            </form>
        </div>
    );
}