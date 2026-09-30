import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import "./App.css";
import CitizenPage from "./pages/CitizenPage";
import DriverPage from "./pages/DriverPage";
import AdminPage from "./pages/AdminPage";

function NavBar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition ${
      isActive ? "bg-emerald-900 shadow" : "hover:bg-emerald-600"
    }`;

  return (
    <header className="bg-emerald-700 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center">
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-bold tracking-tight">♻️ EcoTrack</span>
          <span className="text-xs bg-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
            Live System
          </span>
        </div>
        <nav className="flex space-x-2 mt-2 sm:mt-0">
          <NavLink to="/" end className={linkClass}>Citizen Panel</NavLink>
          <NavLink to="/driver" className={linkClass}>Driver Panel</NavLink>
          <NavLink to="/admin" className={linkClass}>Admin Panel</NavLink>
        </nav>
      </div>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
        <NavBar />
        <main className="max-w-7xl mx-auto p-4 md:p-6">
          <Routes>
            <Route path="/" element={<CitizenPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
