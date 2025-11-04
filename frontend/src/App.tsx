import "./App.css";
import { BrowserRouter,Routes,Route } from "react-router";
import Home from "./Pages/home";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Home/>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
