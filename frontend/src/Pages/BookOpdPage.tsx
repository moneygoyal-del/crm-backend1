import { useState, useMemo, useEffect } from 'react'; // <-- 1. Import useEffect
import { useNavigate } from 'react-router-dom';
import api from '../api';
import axios from 'axios';

// --- (Styles are unchanged) ---
const styles = {
    container: { width: '360px', margin: '40px auto', padding: '20px', border: '1px solid #555', borderRadius: '8px', textAlign: 'left' as const, backgroundColor: '#333' },
    header: { padding: '10px', backgroundColor: '#ccc', color: '#242424', fontWeight: 'bold', fontSize: '1.2em', borderRadius: '8px 8px 0 0', margin: '-20px -20px 20px -20px', textAlign: 'center' as const},
    fieldset: { border: '1px solid #555', borderRadius: '4px', marginBottom: '15px' },
    legend: { fontWeight: 'bold', color: '#00c1ff', padding: '0 5px' },
    input: { width: '100%', padding: '10px', margin: '5px 0 10px 0', boxSizing: 'border-box' as const, borderRadius: '4px', border: '1px solid #777', backgroundColor: '#fff', color: 'black' },
    button: { width: '100%', padding: '10px', marginTop: '10px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em' },
    label: { fontWeight: 'bold', fontSize: '0.9em' },
    labelRequired: { fontWeight: 'bold', fontSize: '0.9em', '::after': { content: '" *"', color: 'red' } },
    error: { color: 'red', margin: '10px 0', textAlign: 'center' as const, backgroundColor: '#ffdddd', border: '1px solid red', padding: '10px', borderRadius: '4px' },
    success: { color: 'lightgreen', margin: '10px 0', textAlign: 'center' as const, backgroundColor: '#ddffdd', border: '1px solid green', padding: '10px', borderRadius: '4px' },
    backLink: { color: 'cyan', cursor: 'pointer', textAlign: 'center' as const, display: 'block', marginTop: '15px' },
    splitRow: { display: 'flex', gap: '10px' },
    splitCol: { flex: 1 }
};

// Helper functions (unchanged)
const getTodayDate = () => new Date().toISOString().split('T')[0];
const getCurrentTime = () => new Date().toTimeString().split(' ')[0].substring(0, 5);

export default function BookOpdPage() {
    const navigate = useNavigate();
    
    const [formData, setFormData] = useState({
        booking_reference: `WEB-${Date.now()}`,
        patient_name: '',
        patient_phone: '',
        referee_name: '', // For Sheet
        refree_phone_no: '', // For DB
        hospital_name: '',
        medical_condition: '',
        city: '', // For Sheet
        age: '',
        gender: '',
        panel: '', 
        appointment_date: getTodayDate(), 
        appointment_time: getCurrentTime(),
        current_disposition: 'opd_booked'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const userString = localStorage.getItem('user');
    const user = userString ? JSON.parse(userString) : { name: "User" };

    const minTime = useMemo(() => {
        const today = getTodayDate();
        return formData.appointment_date === today ? getCurrentTime() : '00:00';
    }, [formData.appointment_date]);
    

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // --- 2. THE BUGGY LOGIC IS REMOVED FROM HERE ---
    };

    // --- 3. THE FIX: Add a useEffect hook ---
    // This code now runs *after* the state has updated
    useEffect(() => {
        // If the selected date is today...
        if (formData.appointment_date === getTodayDate()) {
            const now = getCurrentTime();
            // ...and the selected time is in the past, reset it to the current time.
            if (formData.appointment_time < now) {
                setFormData(prev => ({ ...prev, appointment_time: now }));
            }
        }
    }, [formData.appointment_date, formData.appointment_time]); // This hook depends on these two values
    // --- END OF FIX ---


    const handleSubmit = async (e: React.FormEvent) => {
        // ... (This function is unchanged)
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        if (!formData.patient_name || !formData.patient_phone || !formData.refree_phone_no ||
            !formData.hospital_name || !formData.medical_condition || 
            !formData.appointment_date || !formData.appointment_time) {
            setError("Please fill in all required (*) fields.");
            setLoading(false);
            return;
        }

        const payload = {
            ...formData,
            age: formData.age || 'N/A'
        };

        try {
            const response = await api.post('/patientLeads/create-web', payload);
            setSuccess(`Success! Booking ${response.data.data.booking_reference} created.`);
            
            const today = getTodayDate();
            const now = getCurrentTime();
            setFormData({
                booking_reference: `WEB-${Date.now()}`,
                patient_name: '', patient_phone: '', referee_name: '', refree_phone_no: '',
                hospital_name: '', medical_condition: '', city: '', age: '',
                gender: '', panel: '',
                appointment_date: today,
                appointment_time: now,
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
                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>Patient Details</legend>
                    {/* ... (Patient inputs unchanged) ... */}
                    <label style={styles.labelRequired}>Patient Name*</label>
                    <input style={styles.input} type="text" name="patient_name" value={formData.patient_name} onChange={handleChange} />
                    <label style={styles.labelRequired}>Patient Phone*</label>
                    <input style={styles.input} type="tel" name="patient_phone" value={formData.patient_phone} onChange={handleChange} />
                    <label style={styles.label}>Patient City (for Sheet)</label>
                    <input style={styles.input} type="text" name="city" value={formData.city} onChange={handleChange} />
                    <div style={styles.splitRow}>
                        <div style={styles.splitCol}>
                            <label style={styles.label}>Age</label>
                            <input style={styles.input} type="number" name="age" value={formData.age} onChange={handleChange} />
                        </div>
                        <div style={styles.splitCol}>
                            <label style={styles.label}>Gender</label>
                            <select style={styles.input} name="gender" value={formData.gender} onChange={handleChange}>
                                <option value="">Select...</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>
                </fieldset>

                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>Referral & Case Details</legend>
                    {/* ... (Referral inputs unchanged) ... */}
                    <label style={styles.label}>Referee Name (for Sheet)</label>
                    <input style={styles.input} type="text" name="referee_name" value={formData.referee_name} onChange={handleChange} />
                    <label style={styles.labelRequired}>Referee Doctor's Phone* (for DB)</label>
                    <input style={styles.input} type="tel" name="refree_phone_no" value={formData.refree_phone_no} onChange={handleChange} />
                    <label style={styles.labelRequired}>Hospital Name*</label>
                    <input style={styles.input} type="text" name="hospital_name" value={formData.hospital_name} onChange={handleChange} />
                    <label style={styles.labelRequired}>Medical Condition*</label>
                    <input style={styles.input} type="text" name="medical_condition" value={formData.medical_condition} onChange={handleChange} />
                    <label style={styles.label}>Payment Mode (Panel)</label>
                    <select style={styles.input} name="panel" value={formData.panel} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="Cash">Cash</option>
                        <option value="Ayushman">Ayushman</option>
                    </select>
                </fieldset>

                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>Appointment Details</legend>
                    {/* ... (Date/Time inputs unchanged) ... */}
                    <div style={styles.splitRow}>
                        <div style={styles.splitCol}>
                            <label style={styles.labelRequired}>Appointment Date*</label>
                            <input 
                                style={styles.input} 
                                type="date" 
                                name="appointment_date" 
                                value={formData.appointment_date} 
                                onChange={handleChange}
                                min={getTodayDate()} 
                            />
                        </div>
                        <div style={styles.splitCol}>
                            <label style={styles.labelRequired}>Appointment Time*</label>
                            <input 
                                style={styles.input} 
                                type="time" 
                                name="appointment_time" 
                                value={formData.appointment_time} 
                                onChange={handleChange}
                                min={minTime} 
                            />
                        </div>
                    </div>
                </fieldset>

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