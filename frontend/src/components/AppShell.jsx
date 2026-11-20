import { useState } from "react";
import {
  Activity,
  LayoutDashboard,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  function closeNavigation() {
    setNavigationOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navigationOpen ? "sidebar-open" : ""}`}>
        <NavLink
          className="brand"
          to="/"
          aria-label="BidFlow dashboard"
          onClick={closeNavigation}
        >
          <span className="brand-mark">
            <Activity size={21} strokeWidth={2.5} />
          </span>
          <span className="brand-name">
            BidFlow
            <small>PROCUREMENT</small>
          </span>
        </NavLink>

        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
            }
            onClick={closeNavigation}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </NavLink>
          <NavLink
            to="/rfqs/create"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
            }
            onClick={closeNavigation}
          >
            <Plus size={18} />
            <span>Create RFQ</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <span className="connection-indicator" />
          <span>Procurement workspace</span>
        </div>
        <button
          type="button"
          className="sidebar-mobile-close"
          aria-label="Close navigation"
          onClick={closeNavigation}
        >
          <X size={20} />
        </button>
      </aside>

      <button
        type="button"
        className={`sidebar-backdrop ${navigationOpen ? "backdrop-visible" : ""}`}
        aria-label="Dismiss navigation backdrop"
        onClick={closeNavigation}
        tabIndex={navigationOpen ? 0 : -1}
      />

      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Open navigation"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="topbar-context">
            <span className="topbar-context-dot" />
            RFQ &amp; reverse auction management
          </div>
          <div className="topbar-meta">
            <span className="topbar-date">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </span>
            <span className="workspace-avatar" aria-hidden="true">
              BF
            </span>
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
