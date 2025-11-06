import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

// (Styles are updated for the new layout)
const styles = {
    container: { width: '340px', margin: '40px auto', padding: '20px', border: '1px solid #555', borderRadius: '8px', textAlign: 'left' as const, backgroundColor: '#333' },
    header: { padding: '10px', backgroundColor: '#ccc', color: '#242424', fontWeight: 'bold', fontSize: '1.2em', borderRadius: '8px 8px 0 0', margin: '-20px -20px 20px -20px', textAlign: 'center' as const},
    input: { width: '100%', padding: '10px', margin: '5px 0 15px 0', boxSizing: 'border-box' as const, borderRadius: '4px', border: '1px solid #777', backgroundColor: '#fff', color: 'black' },
    button: { width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em' },
    label: { fontWeight: 'bold', fontSize: '0.9em' },
    error: { color: 'red', margin: '10px 0', textAlign: 'center' as const },
    success: { color: 'lightgreen', margin: '10px 0', textAlign: 'center' as const },
    backLink: { color: 'cyan', cursor: 'pointer', textAlign: 'center' as const, display: 'block', marginTop: '15px' },
    // New style for splitting date/time
    splitRow: { display: 'flex', gap: '10px' },
    splitCol: { flex: 1 }
};

export default function BookOpdPage() {
    const navigate = useNavigate();
    
    // Get current date and time for defaults
    const now = new Date();
    const defaultDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const defaultTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

    const [formData, setFormData] = useState({
        booking_reference: `WEB-${Date.now()}`,
        patient_name: '',
        patient_phone: '',
        referee_name: '', // <-- NEW FIELD FOR GOOGLE SHEET
        refree_phone_no: '',
        hospital_name: '',
        medical_condition: '',
        city: '', // <-- NEW FIELD FOR GOOGLE SHEET
        age: '',
        gender: '', // Will be a select
        panel: '', // Will be a select
        appointment_date: defaultDate, // <-- UPDATED FIELD
        appointment_time: defaultTime, // <-- NEW FIELD
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

        // Updated validation
        if (!formData.patient_name || !formData.patient_phone || !formData.refree_phone_no ||
            !formData.hospital_name || !formData.medical_condition || !formData.appointment_date || !formData.appointment_time) {
            setError("Please fill in all required (*) fields.");
            setLoading(false);
            return;
        }

        // Payload is now the full form data
        const payload = {
            ...formData,
            age: formData.age || 'N/A' // Send N/A if empty
        };

        try {
            const response = await api.post('/patientLeads/create-web', payload);
            setSuccess(`Success! Booking ${response.data.data.booking_reference} created.`);
            // Clear form (but keep defaults)
            setFormData({
                booking_reference: `WEB-${Date.now()}`,
                patient_name: '', patient_phone: '', referee_name: '', refree_phone_no: '',
                hospital_name: '', medical_condition: '', city: '', age: '',
                gender: '', panel: '',
                appointment_date: defaultDate,
                appointment_time: defaultTime,
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
                <label style={styles.label}>Patient Name*</label>
                <input style={styles.input} type="text" name="patient_name" value={formData.patient_name} onChange={handleChange} />
                
                <label style={styles.label}>Patient Phone*</label>
                <input style={styles.input} type="tel" name="patient_phone" value={formData.patient_phone} onChange={handleChange} />
                
                {/* --- NEW FIELDS FOR GOOGLE SHEET --- */}
                <label style={styles.label}>Referee Name (for Sheet)</label>
                <input style={styles.input} type="text" name="referee_name" value={formData.referee_name} onChange={handleChange} />

                <label style={styles.label}>Referee Doctor's Phone* (for DB)</label>
                <input style={styles.input} type="tel" name="refree_phone_no" value={formData.refree_phone_no} onChange={handleChange} />
                
                <label style={styles.label}>Hospital Name*</label>
                <input style={styles.input} type="text" name="hospital_name" value={formData.hospital_name} onChange={handleChange} />

                <label style={styles.label}>Patient City (for Sheet)</label>
                <input style={styles.input} type="text" name="city" value={formData.city} onChange={handleChange} />
                {/* --- END NEW FIELDS --- */}

                <label style={styles.label}>Medical Condition*</label>
                <input style={styles.input} type="text" name="medical_condition" value={formData.medical_condition} onChange={handleChange} />

                {/* --- ENHANCED DATE/TIME INPUTS --- */}
                <div style={styles.splitRow}>
                    <div style={styles.splitCol}>
                        <label style={styles.label}>Appointment Date*</label>
                        <input style={styles.input} type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} />
                    </div>
                    <div style={styles.splitCol}>
                        <label style={styles.label}>Appointment Time*</label>
                        <input style={styles.input} type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} />
                    </div>
                </div>
                {/* --- END ENHANCED INPUTS --- */}

                <div style={styles.splitRow}>
                    <div style={styles.splitCol}>
                        <label style={styles.label}>Age</label>
                        <input style={styles.input} type="number" name="age" value={formData.age} onChange={handleChange} />
                    </div>
                    {/* --- PROFESSIONAL SELECT --- */}
                    <div style={styles.splitCol}>
                        <label style={styles.label}>Gender</label>
                        <select style={styles.input} name="gender" value={formData.gender} onChange={handleChange}>
                            <option value="">Select...</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    {/* --- END SELECT --- */}
                </div>

                <label style={styles.label}>Payment Mode (Panel)</label>
                {/* --- PROFESSIONAL SELECT --- */}
                <select style={styles.input} name="panel" value={formData.panel} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="Cash">Cash</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Card">Card</option>
                    <option value="UPI">UPI</option>
                    <option value="PMJAY">PMJAY</option>
                    <option value="CMRelief Fund">CM Relief Fund</option>
                    <option value="TPA">TPA</option>
                    <option value="Mixed">Mixed</option>
                </select>
                {/* --- END SELECT --- */}

                <button style={styles.button} type="submit" disabled={loading}>
                    {loading ? "Submitting..." : "Submit OPD Booking"}
                </button>

                <a onClick={() => navigate(-1)} style={styles.backLink}>
                    &larr; Go Back
                </a>
            </form>
        </div>
    );
}