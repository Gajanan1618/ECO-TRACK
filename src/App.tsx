import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import "./App.css";
import CitizenPage from "./pages/CitizenPage";
import DriverPage from "./pages/DriverPage";
import AdminPage from "./pages/AdminPage";

function NavBar() {
  return (
    <nav className="nav-bar">
      <Link to="/">🏠 Citizen</Link>
      <Link to="/driver">🚛 Driver</Link>
      <Link to="/admin">🛰️ Admin</Link>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<CitizenPage />} />
        <Route path="/driver" element={<DriverPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
