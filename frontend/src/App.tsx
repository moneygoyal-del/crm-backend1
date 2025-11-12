import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./Pages/home";
import LoginPage from "./Pages/LoginPage";
import BookOpdPage from "./Pages/BookOpdPage"; 
import LogMeetingPage from "./Pages/LogMeetingPage"; 
import UpdatePhonePage from "./Pages/UpdatePhonePage";


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
       
        <Route 
          path="/book-opd" 
          element={<ProtectedRoute><BookOpdPage /></ProtectedRoute>} 
        />
        <Route 
          path="/log-meeting" 
          element={<ProtectedRoute><LogMeetingPage /></ProtectedRoute>} 
        />
        <Route 
          path="/update-patient-phone" 
          element={<ProtectedRoute><UpdatePhonePage /></ProtectedRoute>} 
        />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;