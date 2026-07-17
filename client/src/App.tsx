import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Host from "./pages/Host/Host";
import Player from "./pages/Player/Player";
import Audience from "./pages/Audience/Audience";
import Monitor from "./pages/Monitor/Monitor";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/host" element={<Host />} />
        <Route path="/player" element={<Player />} />
        <Route path="/audience" element={<Audience />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="*" element={<Navigate to="/player" replace />} />
      </Routes>
    </BrowserRouter>
  );
}