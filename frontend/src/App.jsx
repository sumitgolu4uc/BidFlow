import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import AuctionDetailsPage from "./pages/AuctionDetailsPage.jsx";
import CreateRFQPage from "./pages/CreateRFQPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="rfqs/create" element={<CreateRFQPage />} />
          <Route path="rfqs/:id" element={<AuctionDetailsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
