import { useNavigate } from 'react-router-dom';

// Simple CSS-in-JS for styling
const styles = {
    container: {
        width: '320px',
        margin: '50px auto',
        padding: '20px',
        border: '1px solid #555',
        borderRadius: '8px',
        textAlign: 'center' as const, // <-- FIX 3
        backgroundColor: '#333'
    },
    header: {
        padding: '10px',
        backgroundColor: '#ccc',
        color: '#242424',
        fontWeight: 'bold',
        fontSize: '1.2em',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        margin: '-20px -20px 20px -20px'
    },
    button: {
        width: '100%',
        padding: '12px',
        marginTop: '15px',
        backgroundColor: '#008CBA', // Blue from your design
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '1em'
    },
    welcomeText: {
        fontSize: '1.1em',
        margin: '30px 0'
    }
};

function Home() {
  const navigate = useNavigate();

  // Get user data saved during login
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : { name: "User" };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>Medpho Operator</div>
      
      <div style={styles.welcomeText}>
        Welcome <strong>{user.name}</strong>
      </div>
      
      <button style={styles.button}>
        Book OPD
      </button>
      
      <button style={styles.button}>
        Log Doctor Meeting
      </button>

      <button onClick={handleLogout} style={{ ...styles.button, backgroundColor: '#f44336', marginTop: '30px' }}>
        Logout
      </button>
    </div>
  )
}

export default Home;