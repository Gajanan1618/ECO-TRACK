import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import CitizenPage from "./pages/CitizenPage";
import DriverPage from "./pages/DriverPage";
import OfficerPage from "./pages/OfficerPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/citizen" element={<CitizenPage />} />
        <Route path="/driver" element={<DriverPage />} />
        <Route path="/officer" element={<OfficerPage />} />
        <Route path="/admin" element={<Navigate to="/officer" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
