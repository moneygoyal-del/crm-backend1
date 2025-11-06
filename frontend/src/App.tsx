import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./Pages/home";
import LoginPage from "./Pages/LoginPage";
import BookOpdPage from "./Pages/BookOpdPage"; // <-- 1. IMPORT
import LogMeetingPage from "./Pages/LogMeetingPage"; // <-- 2. IMPORT

// ... (your ProtectedRoute function)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('authToken');
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={<ProtectedRoute><Home /></ProtectedRoute>} 
        />
        {/* --- 3. ADD NEW ROUTES --- */}
        <Route 
          path="/book-opd" 
          element={<ProtectedRoute><BookOpdPage /></ProtectedRoute>} 
        />
        <Route 
          path="/log-meeting" 
          element={<ProtectedRoute><LogMeetingPage /></ProtectedRoute>} 
        />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;