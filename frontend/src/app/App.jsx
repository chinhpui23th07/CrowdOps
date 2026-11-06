import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { WalletProvider } from "../features/wallet/WalletContext";
import Header from "./Header";
import ExplorerPage from "../pages/ExplorerPage";
import CampaignPage from "../pages/CampaignPage";
import CreateCampaignPage from "../pages/CreateCampaignPage";
import AboutPage from "../pages/AboutPage";
import { DEPLOYMENT } from "../shared/config";

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Header />
        <main className="container main">
          <Routes>
            <Route path="/" element={<ExplorerPage />} />
            <Route path="/create" element={<CreateCampaignPage />} />
            <Route path="/campaign/:id" element={<CampaignPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route
              path="*"
              element={
                <p>
                  Không tìm thấy trang. <Link to="/">Về trang chủ</Link>
                </p>
              }
            />
          </Routes>
        </main>
        <footer className="footer container muted">
          <span>Crowd Ops - đồ án môn Blockchain · chỉ dùng ETH thử nghiệm trên testnet</span>
          {DEPLOYMENT && (
            <span>
              Contract CrowdOps: <code className="mono">{DEPLOYMENT.crowdOps}</code>
            </span>
          )}
        </footer>
      </BrowserRouter>
    </WalletProvider>
  );
}
