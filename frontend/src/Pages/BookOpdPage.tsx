import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import axios from "axios";

// --- Helper functions ---
const getTodayDate = () => new Date().toISOString().split("T")[0];
const getCurrentTime = () => new Date().toTimeString().split(" ")[0].substring(0, 5);

export default function BookOpdPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    booking_reference: `WEB-${Date.now()}`,
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fade, setFade] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || '{"name":"User"}');

  const minTime = useMemo(() => {
    const today = getTodayDate();
    return formData.appointment_date === today ? getCurrentTime() : "00:00";
  }, [formData.appointment_date]);

  // Auto-update time validation
  useEffect(() => {
    if (formData.appointment_date === getTodayDate()) {
      const now = getCurrentTime();
      if (formData.appointment_time < now) {
        setFormData((prev) => ({ ...prev, appointment_time: now }));
      }
    }
  }, [formData.appointment_date, formData.appointment_time]);

  // --- Form change handler ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- Submit handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (
      !formData.patient_name ||
      !formData.patient_phone ||
      !formData.refree_phone_no ||
      !formData.hospital_name ||
      !formData.medical_condition ||
      !formData.appointment_date ||
      !formData.appointment_time
    ) {
      setError("Please fill in all required (*) fields.");
      setLoading(false);
      return;
    }

    const payload = { ...formData, age: formData.age || "N/A" };

    try {
      const res = await api.post("/patientLeads/create-web", payload);
      setSuccess(`✅ Booking ${res.data.data.booking_reference} created successfully.`);
      setFade(true);

      // Reset after fade animation
      setTimeout(() => {
        setFade(false);
        setSuccess("");
      }, 4000);

      setFormData({
        booking_reference: `WEB-${Date.now()}`,
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
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "An error occurred.");
      } else {
        setError("Unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Styles ---
  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: "400px",
      margin: "40px auto",
      padding: "30px",
      borderRadius: "12px",
      backgroundColor: "#1e1e1e",
      color: "#f5f5f5",
      fontFamily: "Inter, sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      transition: "all 0.3s ease",
    },
    header: {
      fontSize: "1.3em",
      fontWeight: 600,
      textAlign: "center",
      marginBottom: "20px",
      color: "#00b4d8",
    },
    fieldset: {
      border: "1px solid #444",
      borderRadius: "8px",
      marginBottom: "20px",
      padding: "15px",
    },
    legend: {
      color: "#00b4d8",
      padding: "0 8px",
      fontWeight: "bold",
    },
    label: { fontWeight: 500, display: "block", marginBottom: "5px" },
    labelRequired: {
      fontWeight: 500,
      display: "block",
      marginBottom: "5px",
      color: "#ff6868",
    },
    input: {
      width: "100%",
      padding: "10px",
      marginBottom: "15px",
      borderRadius: "6px",
      border: "1px solid #666",
      backgroundColor: "#2b2b2b",
      color: "#f5f5f5",
      outline: "none",
      transition: "border-color 0.2s ease",
    },
    splitRow: { display: "flex", gap: "10px" },
    splitCol: { flex: 1 },
    button: {
      width: "100%",
      padding: "12px",
      backgroundColor: "#00b4d8",
      border: "none",
      borderRadius: "6px",
      color: "white",
      fontWeight: 600,
      fontSize: "1em",
      cursor: loading ? "not-allowed" : "pointer",
      opacity: loading ? 0.6 : 1,
      transition: "background-color 0.2s ease",
    },
    backLink: {
      color: "#00b4d8",
      cursor: "pointer",
      textAlign: "center" as const,
      display: "block",
      marginTop: "15px",
      textDecoration: "underline",
      opacity: 0.8,
    },
    message: {
      padding: "12px",
      borderRadius: "8px",
      marginBottom: "15px",
      textAlign: "center" as const,
      fontWeight: 500,
      transition: "opacity 0.4s ease",
      opacity: fade ? 0 : 1,
    },
    error: { background: "#ffdddd", color: "#a10000", border: "1px solid #a10000" },
    success: { background: "#ddffdd", color: "#007500", border: "1px solid #007500" },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>📋 Book New OPD</div>
      <p style={{ textAlign: "center", marginTop: "-10px", marginBottom: "20px" }}>
        Logged in as <strong>{user.name}</strong>
      </p>

      {error && <div style={{ ...styles.message, ...styles.error }}>{error}</div>}
      {success && <div style={{ ...styles.message, ...styles.success }}>{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* --- Patient Details --- */}
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Patient Details</legend>

          <label style={styles.labelRequired}>Patient Name*</label>
          <input style={styles.input} type="text" name="patient_name" value={formData.patient_name} onChange={handleChange} />

          <label style={styles.labelRequired}>Patient Phone*</label>
          <input style={styles.input} type="tel" name="patient_phone" maxLength={10} value={formData.patient_phone} onChange={handleChange} />

          <label style={styles.label}>City</label>
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

        {/* --- Referral & Case Details --- */}
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Referral & Case Details</legend>

          <label style={styles.label}>Referee Name</label>
          <input style={styles.input} type="text" name="referee_name" value={formData.referee_name} onChange={handleChange} />

          <label style={styles.labelRequired}>Referee Doctor's Phone*</label>
          <input style={styles.input} type="tel" name="refree_phone_no" maxLength={10} value={formData.refree_phone_no} onChange={handleChange} />

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

        {/* --- Appointment Details --- */}
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Appointment Details</legend>

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

        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Submitting..." : "Submit OPD Booking"}
        </button>

        <a onClick={() => navigate(-1)} style={styles.backLink}>
          ← Go Back
        </a>
      </form>
    </div>
  );
}
