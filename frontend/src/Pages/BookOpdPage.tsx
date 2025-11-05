import { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Now we use this
import api from '../api';
import axios from 'axios';

// (styles are unchanged)
const styles = {
    container: { width: '320px', margin: '50px auto', padding: '20px', border: '1px solid #555', borderRadius: '8px', textAlign: 'left' as const, backgroundColor: '#333' },
    header: { padding: '10px', backgroundColor: '#ccc', color: '#242424', fontWeight: 'bold', fontSize: '1.2em', borderRadius: '8px 8px 0 0', margin: '-20px -20px 20px -20px', textAlign: 'center' as const},
    input: { width: '100%', padding: '10px', margin: '5px 0 15px 0', boxSizing: 'border-box' as const, borderRadius: '4px', border: '1px solid #777', backgroundColor: '#fff', color: 'black' },
    button: { width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em' },
    label: { fontWeight: 'bold', fontSize: '0.9em' },
    error: { color: 'red', margin: '10px 0' },
    success: { color: 'lightgreen', margin: '10px 0' },
    backLink: { color: 'cyan', cursor: 'pointer', textAlign: 'center' as const, display: 'block', marginTop: '15px' } // Style for back link
};

export default function BookOpdPage() {
    const navigate = useNavigate(); // <-- This is now used
    const [formData, setFormData] = useState({
        booking_reference: `WEB-${Date.now()}`,
        patient_name: '',
        patient_phone: '',
        refree_phone_no: '',
        hospital_name: '',
        medical_condition: '',
        age: '',
        gender: '',
        panel: '',
        tentative_visit_date: '',
        current_disposition: 'opd_booked'
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

        if (!formData.patient_name || !formData.patient_phone || !formData.refree_phone_no || !formData.hospital_name || !formData.medical_condition) {
            setError("Please fill in all required fields.");
            setLoading(false);
            return;
        }
        
        const date = formData.tentative_visit_date ? new Date(formData.tentative_visit_date) : null;
        const formattedDate = date ? `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} 00:00:00` : null;

        const payload = {
            ...formData,
            tentative_visit_date: formattedDate,
            age: formData.age || 'N/A'
        };

        try {
            const response = await api.post('/patientLeads/create-web', payload);
            setSuccess(`Success! Booking ${response.data.data.booking_reference} created.`);
            setFormData({
                booking_reference: `WEB-${Date.now()}`,
                patient_name: '', patient_phone: '', refree_phone_no: '',
                hospital_name: '', medical_condition: '', age: '',
                gender: '', panel: '', tentative_visit_date: '',
                current_disposition: 'opd_booked'
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
            <div style={styles.header}>Book New OPD</div>
            <p style={{ textAlign: 'center', marginTop: '-10px', marginBottom: '20px' }}>
                Logging as: <strong>{user.name}</strong>
            </p>

            {error && <div style={styles.error}>{error}</div>}
            {success && <div style={styles.success}>{success}</div>}

            <form onSubmit={handleSubmit}>
                {/* ... (all your form inputs) ... */}
                <label style={styles.label}>Patient Name*</label>
                <input style={styles.input} type="text" name="patient_name" value={formData.patient_name} onChange={handleChange} />
                
                <label style={styles.label}>Patient Phone*</label>
                <input style={styles.input} type="tel" name="patient_phone" value={formData.patient_phone} onChange={handleChange} />
                
                <label style={styles.label}>Referring Doctor's Phone*</label>
                <input style={styles.input} type="tel" name="refree_phone_no" value={formData.refree_phone_no} onChange={handleChange} />

                <label style={styles.label}>Hospital Name*</label>
                <input style={styles.input} type="text" name="hospital_name" value={formData.hospital_name} onChange={handleChange} />

                <label style={styles.label}>Medical Condition*</label>
                <input style={styles.input} type="text" name="medical_condition" value={formData.medical_condition} onChange={handleChange} />

                <label style={styles.label}>Tentative Visit Date</label>
                <input style={styles.input} type="date" name="tentative_visit_date" value={formData.tentative_visit_date} onChange={handleChange} />

                <label style={styles.label}>Age</label>
                <input style={styles.input} type="number" name="age" value={formData.age} onChange={handleChange} />

                <label style={styles.label}>Gender</label>
                <select style={styles.input} name="gender" value={formData.gender} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                </select>

                <label style={styles.label}>Panel (Payment Mode)</label>
                <input style={styles.input} type="text" name="panel" value={formData.panel} onChange={handleChange} placeholder="e.g., Cash, Insurance" />

                <button style={styles.button} type="submit" disabled={loading}>
                    {loading ? "Submitting..." : "Submit OPD Booking"}
                </button>

                {/* --- ADD THIS LINK --- */}
                <a onClick={() => navigate(-1)} style={styles.backLink}>
                    &larr; Go Back
                </a>
            </form>
        </div>
    );
}